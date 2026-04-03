import XmppClient from '../networking/xmppClient';
import { store } from '../roomStore';
import { applyRoomsPreloadBatch } from '../roomStore/roomsSlice';
import { IMessage, IRoom } from '../types/types';

interface HistoryPreloadSchedulerOptions {
  client: XmppClient;
  signal?: AbortSignal;
  concurrency?: number;
  pageSize?: number;
  retryLimit?: number;
  selectedRoomJid?: string | null;
  defaultRoomJids?: string[];
}

interface QueueItem {
  jid: string;
  priority: number;
  attempts: number;
  readyAt: number;
}

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_RETRY_LIMIT = 2;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getMessageTimestamp = (message: IMessage): number => {
  const dateTs = new Date(message?.date as string).getTime();
  if (Number.isFinite(dateTs) && dateTs > 0) return dateTs;

  const numericId = Number(message?.id);
  if (Number.isFinite(numericId) && numericId > 0) return numericId;

  const inlineTimestamp = Number((message as any)?.timestamp);
  if (Number.isFinite(inlineTimestamp) && inlineTimestamp > 0) {
    return inlineTimestamp;
  }

  return 0;
};

const computeUnreadCapped = (
  room: IRoom,
  messages: IMessage[],
  pageSize: number
): boolean => {
  if (!room) return false;
  if (!messages || messages.length < pageSize) return false;
  if (room.historyComplete === true) return false;

  const countable = messages.filter(
    (msg) => !!msg && msg.id !== 'delimiter-new' && !msg.pending
  );

  if (countable.length < pageSize) return false;

  const lastViewed = Number(room.lastViewedTimestamp || 0);
  if (lastViewed <= 0) {
    return true;
  }

  const oldestTs = countable.reduce<number>((minTs, message) => {
    const ts = getMessageTimestamp(message);
    if (!Number.isFinite(ts) || ts <= 0) return minTs;
    return Math.min(minTs, ts);
  }, Number.MAX_SAFE_INTEGER);

  if (!Number.isFinite(oldestTs) || oldestTs === Number.MAX_SAFE_INTEGER) {
    return false;
  }

  return oldestTs > lastViewed;
};

const getRoomPriority = (
  jid: string,
  room: IRoom,
  selectedRoomJid: string | null,
  defaultRoomJids: Set<string>
): number => {
  if (selectedRoomJid && selectedRoomJid === jid) return 2;
  if (defaultRoomJids.has(jid)) return 2;
  if (Number(room?.lastMessageTimestamp || 0) > 0) return 1;
  return 3;
};

const shouldPauseForVisibility = (): boolean => {
  if (typeof document === 'undefined') return false;
  return document.visibilityState === 'hidden';
};

export const runHistoryPreloadScheduler = async (
  options: HistoryPreloadSchedulerOptions
): Promise<void> => {
  const {
    client,
    signal,
    concurrency = DEFAULT_CONCURRENCY,
    pageSize = DEFAULT_PAGE_SIZE,
    retryLimit = DEFAULT_RETRY_LIMIT,
    selectedRoomJid = null,
    defaultRoomJids = [],
  } = options;

  if (signal?.aborted) return;

  const state = store.getState();
  const rooms = (state.rooms.rooms || {}) as Record<string, IRoom>;
  const defaultSet = new Set(defaultRoomJids);

  const queue: QueueItem[] = Object.entries(rooms)
    .map(([jid, room]: [string, IRoom]) => ({
      jid,
      priority: getRoomPriority(jid, room, selectedRoomJid, defaultSet),
      attempts: 0,
      readyAt: Date.now(),
    }))
    .sort((a, b) => a.priority - b.priority);

  const inFlightByRoom = new Map<string, Promise<void>>();
  let consecutiveErrorCount = 0;

  while (queue.length > 0) {
    if (signal?.aborted) {
      return;
    }

    if (shouldPauseForVisibility()) {
      await sleep(250);
      continue;
    }

    const runtimeState = store.getState();
    const activeRoomJID = runtimeState.rooms.activeRoomJID;

    const now = Date.now();
    const readyItems = queue.filter(
      (item) =>
        item.readyAt <= now &&
        !inFlightByRoom.has(item.jid) &&
        item.jid !== activeRoomJID
    );

    if (readyItems.length === 0) {
      await sleep(60);
      continue;
    }

    const batch = readyItems.slice(0, Math.max(1, concurrency));

    store.dispatch(
      applyRoomsPreloadBatch({
        rooms: batch.map((item) => ({
          jid: item.jid,
          historyPreloadState: 'loading',
        })),
      })
    );

    await Promise.all(
      batch.map(async (item) => {
        const queueIndex = queue.findIndex((queued) => queued.jid === item.jid);
        if (queueIndex !== -1) {
          queue.splice(queueIndex, 1);
        }

        const task = (async () => {
          const currentRoom = store.getState().rooms.rooms[item.jid];
          if (!currentRoom || currentRoom.historyPreloadState === 'done') {
            store.dispatch(
              applyRoomsPreloadBatch({
                rooms: [
                  {
                    jid: item.jid,
                    historyPreloadState: 'done',
                  },
                ],
              })
            );
            return;
          }

          try {
            const fetchedMessages = await client.getHistoryStanza(
              item.jid,
              pageSize,
              undefined,
              undefined,
              {
                coalesceRoom: true,
                skipIfPreloaded: true,
              }
            );

            if (signal?.aborted) return;

            if (typeof fetchedMessages === 'undefined') {
              throw new Error('history_timeout');
            }

            const nextRoom = store.getState().rooms.rooms[item.jid];
            const unreadCapped = computeUnreadCapped(
              nextRoom,
              fetchedMessages,
              pageSize
            );

            store.dispatch(
              applyRoomsPreloadBatch({
                rooms: [
                  {
                    jid: item.jid,
                    messages: fetchedMessages,
                    unreadCapped,
                    historyPreloadState: 'done',
                  },
                ],
              })
            );
            consecutiveErrorCount = 0;
          } catch {
            const retries = item.attempts + 1;
            const canRetry = retries <= retryLimit;

            if (canRetry) {
              const jitter = Math.floor(Math.random() * 120);
              const backoff = Math.min(1600, 240 * 2 ** item.attempts) + jitter;
              queue.push({
                ...item,
                attempts: retries,
                readyAt: Date.now() + backoff,
              });
            } else {
              store.dispatch(
                applyRoomsPreloadBatch({
                  rooms: [
                    {
                      jid: item.jid,
                      historyPreloadState: 'error',
                    },
                  ],
                })
              );
            }

            consecutiveErrorCount += 1;
            if (consecutiveErrorCount >= 3) {
              await sleep(300);
              consecutiveErrorCount = 0;
            }
          }
        })();

        inFlightByRoom.set(item.jid, task);

        await task.finally(() => {
          inFlightByRoom.delete(item.jid);
        });
      })
    );

    await new Promise((resolve) => {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        (window as any).requestIdleCallback(() => resolve(null), {
          timeout: 120,
        });
        return;
      }
      setTimeout(resolve, 0);
    });
  }
};

export default runHistoryPreloadScheduler;
