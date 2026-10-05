import XmppClient from '../networking/xmppClient';
import { store } from '../roomStore';
import { applyRoomsPreloadBatch } from '../roomStore/roomsSlice';
import { IMessage, IRoom } from '../types/types';
import { getMessageTimestamp, getRoomLastActivityScore } from './roomActivityScore';
import { ethoraLogger } from './ethoraLogger';
import { getTimestampFromUnknown } from './timestamp';
import { isLikelyMucJid } from './isLikelyMucJid';

interface HistoryPreloadSchedulerOptions {
  client: XmppClient;
  signal?: AbortSignal;
  concurrency?: number;
  pageSize?: number;
  retryLimit?: number;
  roomLimit?: number;
  selectedRoomJid?: string | null;
  defaultRoomJids?: string[];
  forceReload?: boolean;
  // State stamped on successfully preloaded rooms. The staged flow's first
  // (teaser) pass uses 'partial' so the second, bigger-page pass still
  // processes those rooms; only 'done' short-circuits future preloads.
  completionState?: 'done' | 'partial';
  // Teaser pass: skip rooms that already have a list preview (loaded
  // messages, or an API `lastMessage` seed from /chats/my). The pass exists
  // only to fill that preview, so for those rooms it would be a wasted MAM
  // query. `roomLimit` then counts the rooms that actually needed one.
  skipApiPreview?: boolean;
}

interface QueueItem {
  jid: string;
  priority: number;
  activityScore: number;
  attempts: number;
  readyAt: number;
}

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_RETRY_LIMIT = 2;
// How many older pages one room may pull when its newest page has rows but
// nothing displayable (reactions only). Bounds the worst case per room.
const MAX_EMPTY_PAGE_FOLLOWS = 4;
const FOLLOW_PAGE_SIZE = 10;

// Marker for "MAM returned an empty page for a room the server hasn't
// declared complete" - retried like a failure, but never terminal.
const EMPTY_PAGE_ERROR = 'history_empty_page';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

  const lastViewed = getTimestampFromUnknown(room.lastViewedTimestamp);
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
  if (selectedRoomJid && selectedRoomJid === jid) return 0;
  if (defaultRoomJids.has(jid)) return 1;
  return 2;
};

// A room list preview that came from /chats/my: a seeded `lastMessage` and no
// loaded messages. Exported for the scheduler's tests.
export const hasApiPreview = (room?: IRoom): boolean =>
  !!room &&
  (room.messages?.length ?? 0) === 0 &&
  !!String(room.lastMessage?.body || '').trim();

// Anything the room list can already render a preview from.
const hasListPreview = (room?: IRoom): boolean =>
  !!room &&
  ((room.messages?.length ?? 0) > 0 ||
    !!String(room.lastMessage?.body || '').trim());

const shouldPauseForVisibility = (): boolean => {
  if (typeof document === 'undefined') return false;
  return document.visibilityState === 'hidden';
};

// Serialized per client: two independent bootstrap paths (xmppProvider's
// initBeforeLoad sweep and useChatWrapperInit's staged sweep) can both start
// a preload for the same connection. Running them concurrently made them
// fetch the same rooms twice, so they are chained instead.
//
// They must be CHAINED, not deduped onto one shared promise: each caller
// carries its own pageSize/completionState (the staged flow's teaser pass vs
// its real pass), so handing a late caller someone else's promise would
// silently skip that caller's work entirely. Chaining keeps every caller's
// own sweep, and the per-room historyPreloadState guard inside the sweep
// makes the follow-up cheap wherever the earlier one already did the job.
const preloadChainByClient = new Map<string, Promise<void>>();

const getClientKey = (client: XmppClient): string =>
  client?.client?.jid?.toString() || (client as any)?.username || 'xmpp-client';

export const runHistoryPreloadScheduler = (
  options: HistoryPreloadSchedulerOptions
): Promise<void> => {
  const clientKey = getClientKey(options.client);
  const previous = preloadChainByClient.get(clientKey) || Promise.resolve();

  const run = previous
    .catch(() => {})
    .then(() => runHistoryPreloadSweep(options));

  const tracked = run.finally(() => {
    if (preloadChainByClient.get(clientKey) === tracked) {
      preloadChainByClient.delete(clientKey);
    }
  });
  preloadChainByClient.set(clientKey, tracked);
  return run;
};

const runHistoryPreloadSweep = async (
  options: HistoryPreloadSchedulerOptions
): Promise<void> => {
  const {
    client,
    signal,
    concurrency = DEFAULT_CONCURRENCY,
    pageSize = DEFAULT_PAGE_SIZE,
    retryLimit = DEFAULT_RETRY_LIMIT,
    roomLimit,
    selectedRoomJid = null,
    defaultRoomJids = [],
    forceReload = false,
    completionState = 'done',
    skipApiPreview = false,
  } = options;

  if (signal?.aborted) return;

  const state = store.getState();
  const rooms = (state.rooms.rooms || {}) as Record<string, IRoom>;
  const defaultSet = new Set(defaultRoomJids);

  const sortedQueue: QueueItem[] = Object.entries(rooms)
    // Skip non-JID entries that can leak into `rooms.rooms` from corrupted/
    // legacy persisted state (root-slice keys like `activeRoomJID`,
    // `usersSet`) - otherwise they queue as fake "rooms", wasting concurrency
    // slots and network round-trips that real rooms are waiting on.
    .filter(([jid]) => isLikelyMucJid(jid))
    .map(([jid, room]: [string, IRoom]) => ({
      jid,
      priority: getRoomPriority(jid, room, selectedRoomJid, defaultSet),
      activityScore: getRoomLastActivityScore(room),
      attempts: 0,
      readyAt: Date.now(),
    }))
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.activityScore !== b.activityScore) {
        return b.activityScore - a.activityScore;
      }
      return a.jid.localeCompare(b.jid);
    });
  // Top-N by recent activity FIRST, then drop what needs no work. Filtering
  // 'done' rooms before the cut would let every reconnect slide the window
  // down the list (the 8 done rooms vanish, the next 8 get preloaded), so the
  // "top N" would quietly grow into "all" over a few reconnects.
  //
  // The teaser pass is the exception: it counts rooms that still LACK a
  // preview, because a room the API gave no `lastMessage` for ranks at the
  // bottom of an activity sort (no signal at all) and would otherwise never
  // get one.
  const needsWork = (item: QueueItem): boolean => {
    const room = rooms[item.jid];
    if (!forceReload && room?.historyPreloadState === 'done') return false;
    if (skipApiPreview && hasListPreview(room)) return false;
    return true;
  };
  const withLimit = (items: QueueItem[]) =>
    roomLimit && roomLimit > 0 ? items.slice(0, roomLimit) : items;
  const queue: QueueItem[] = skipApiPreview
    ? withLimit(sortedQueue.filter(needsWork))
    : withLimit(sortedQueue).filter(needsWork);

  ethoraLogger.log(
    '[HistoryScheduler] history_queue_order',
    queue.map((item) => ({
      jid: item.jid,
      priority: item.priority,
      activityScore: item.activityScore,
    }))
  );

  const inFlightByRoom = new Map<string, Promise<void>>();
  let consecutiveErrorCount = 0;

  // Rooms that no longer need this sweep's work: preloaded by another path
  // (the user opened them, a parallel bootstrap, an earlier sweep) or gone.
  // Checked when an item is PICKED, before the 'loading' flag is written.
  // The old loop flagged the whole batch 'loading' first and only then asked
  // "is it already done?" - which could never be true, so every reconnect or
  // follow-up sweep refetched rooms that were done and flickered them
  // through 'loading'.
  const isSatisfied = (jid: string): boolean => {
    const current = store.getState().rooms.rooms[jid];
    if (!current) return true;
    if (forceReload) return false;
    return current.historyPreloadState === 'done';
  };

  const pickNext = (): QueueItem | null => {
    const now = Date.now();
    const activeJid = store.getState().rooms.activeRoomJID;
    // A room the user opened while the sweep runs jumps the queue (the
    // client's own history queue already serves it at top priority; this
    // keeps the sweep from spending a slot on lower rooms first).
    let best = -1;
    for (let index = 0; index < queue.length; index += 1) {
      const item = queue[index];
      if (item.readyAt > now || inFlightByRoom.has(item.jid)) continue;
      if (best === -1) {
        best = index;
        continue;
      }
      if (activeJid && item.jid === activeJid) {
        best = index;
        break;
      }
    }
    if (best === -1) return null;
    return queue.splice(best, 1)[0];
  };

  const processItem = async (item: QueueItem): Promise<void> => {
    if (isSatisfied(item.jid)) {
      // Nothing to fetch. Leave the state alone: stamping 'done' on a room
      // that is merely missing would resurrect it as a ghost entry.
      return;
    }

    store.dispatch(
      applyRoomsPreloadBatch({
        rooms: [{ jid: item.jid, historyPreloadState: 'loading' }],
      })
    );

    try {
      const fetchPage = (max: number, before?: number) =>
        client.getHistoryStanza(item.jid, max, before, undefined, {
          coalesceRoom: true,
          skipIfPreloaded: !forceReload,
          source: 'background',
        });

      let fetchedMessages = await fetchPage(pageSize);

      if (signal?.aborted) return;

      if (typeof fetchedMessages === 'undefined') {
        throw new Error('history_timeout');
      }

      // A page can hold rows and still yield nothing displayable: a room
      // whose newest archive rows are reactions or receipts parses to an
      // empty list. That page is inconclusive, not a failure. Follow the
      // server's RSM cursor (the fin <first> the client stored as
      // messageStats.firstMessageTimestamp) to the older pages until
      // something displayable turns up, the archive is exhausted or the
      // budget is spent.
      let pagesFetched = 1;
      let followedCursor = false;
      let lastCursor: number | undefined;
      while (
        fetchedMessages.length === 0 &&
        pagesFetched < MAX_EMPTY_PAGE_FOLLOWS + 1
      ) {
        const roomNow = store.getState().rooms.rooms[item.jid];
        if (roomNow?.historyComplete === true) break;
        const cursor = roomNow?.messageStats?.firstMessageTimestamp;
        // No cursor means the server returned no rows at all (not joined /
        // archive not ready): nothing to follow, the retry path handles it.
        if (!cursor || !Number.isFinite(cursor) || cursor === lastCursor) break;
        lastCursor = cursor;
        followedCursor = true;
        const older = await fetchPage(
          Math.max(pageSize, FOLLOW_PAGE_SIZE),
          cursor
        );
        if (signal?.aborted) return;
        if (typeof older === 'undefined') throw new Error('history_timeout');
        pagesFetched += 1;
        fetchedMessages = older;
      }

      const nextRoom = store.getState().rooms.rooms[item.jid];
      const unreadCapped = computeUnreadCapped(
        nextRoom,
        fetchedMessages,
        pageSize
      );

      // An empty page for a room the server hasn't declared complete is
      // almost always "not joined / archive not ready yet", not "this room
      // has no messages". Marking it 'done' froze the room with an empty
      // transcript forever. When we followed the cursor and the budget ran
      // out the archive does have rows (just no displayable ones yet), so
      // that settles as 'partial' straight away instead of retrying the
      // same pages. Without a cursor, retry within this sweep.
      const isInconclusiveEmptyPage =
        fetchedMessages.length === 0 && nextRoom?.historyComplete !== true;

      if (isInconclusiveEmptyPage) {
        if (followedCursor) {
          store.dispatch(
            applyRoomsPreloadBatch({
              rooms: [{ jid: item.jid, historyPreloadState: 'partial' }],
            })
          );
          consecutiveErrorCount = 0;
          return;
        }
        throw new Error(EMPTY_PAGE_ERROR);
      }

      store.dispatch(
        applyRoomsPreloadBatch({
          rooms: [
            {
              jid: item.jid,
              messages: fetchedMessages,
              unreadCapped,
              historyPreloadState: completionState,
            },
          ],
        })
      );
      consecutiveErrorCount = 0;
    } catch (error) {
      const isEmptyPage = (error as Error)?.message === EMPTY_PAGE_ERROR;
      const retries = item.attempts + 1;
      const canRetry = retries <= retryLimit;

      if (canRetry) {
        const jitter = Math.floor(Math.random() * 120);
        const backoff = Math.min(1600, 240 * 2 ** item.attempts) + jitter;
        queue.push({
          ...item,
          attempts: retries,
          readyAt: Date.now() + backoff,
          activityScore: item.activityScore,
        });
      } else {
        store.dispatch(
          applyRoomsPreloadBatch({
            rooms: [
              {
                jid: item.jid,
                // An empty page is inconclusive, not a failure: keep it
                // retryable so a later pass (or opening the room) can still
                // fill it in, and so the sidebar doesn't settle on the
                // "Room created" placeholder.
                historyPreloadState: isEmptyPage ? 'partial' : 'error',
              },
            ],
          })
        );
      }

      // An empty page says nothing about connection health - only real
      // failures should trip the circuit breaker below.
      if (isEmptyPage) return;
      consecutiveErrorCount += 1;
      if (consecutiveErrorCount >= 3) {
        await sleep(300);
        consecutiveErrorCount = 0;
      }
    }
  };

  // A worker pool, not batches: the old loop took `concurrency` rooms,
  // awaited ALL of them, and only then started the next batch, so one slow
  // room (a 10s MAM timeout) idled the other slots and held the whole queue
  // behind it. Each worker now pulls the next room the moment it is free.
  let activeWorkers = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      if (signal?.aborted) return;
      if (queue.length === 0 && activeWorkers === 0) return;

      if (!client.isActiveRoomGateOpen()) {
        await sleep(80);
        continue;
      }

      if (shouldPauseForVisibility()) {
        await sleep(250);
        continue;
      }

      const item = pickNext();
      if (!item) {
        // Queue is empty (another worker may still push a retry) or every
        // remaining item is backing off / in flight.
        if (queue.length === 0 && activeWorkers === 0) return;
        await sleep(60);
        continue;
      }

      activeWorkers += 1;
      const task = processItem(item);
      inFlightByRoom.set(item.jid, task);
      try {
        await task;
      } finally {
        inFlightByRoom.delete(item.jid);
        activeWorkers -= 1;
      }

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

  await Promise.all(
    Array.from({ length: Math.max(1, concurrency) }, () => worker())
  );
};

export default runHistoryPreloadScheduler;
