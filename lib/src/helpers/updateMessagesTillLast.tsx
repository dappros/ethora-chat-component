import XmppClient from '../networking/xmppClient';
import { store } from '../roomStore';
import {
  insertUsers,
  replaceRoomMessages,
  setRoomMessages,
  updateRoom,
} from '../roomStore/roomsSlice';
import { IMessage, IRoom } from '../types/types';
import { checkUniqueUsers } from './checkUniqueUsers';
import { ethoraLogger } from './ethoraLogger';
import { getMessageTimestamp, getRoomLastActivityScore } from './roomActivityScore';

export const updateMessagesTillLast = async (
  rooms: {
    [jid: string]: IRoom;
  },
  client: XmppClient,
  batchSize = 3
) => {
  const startupStartedAt = Date.now();
  const activeRoomJID = store.getState().rooms.activeRoomJID;

  const getAnchorFromRoom = (room?: IRoom): IMessage | null => {
    if (!room?.messages?.length) return null;
    for (let i = room.messages.length - 1; i >= 0; i -= 1) {
      const message = room.messages[i];
      if (!message || message.id === 'delimiter-new' || message.pending) continue;
      return message;
    }
    return null;
  };

  const applyMessages = async (jid: string, messages: IMessage[]) => {
    if (!messages?.length) return;
    const fixedUsers = await checkUniqueUsers(messages);
    if (fixedUsers && fixedUsers.length > 0) {
      store.dispatch(insertUsers({ newUsers: fixedUsers }));
    }
    store.dispatch(
      setRoomMessages({
        roomJID: jid,
        messages,
      })
    );
  };

  const replaceMessages = async (jid: string, messages: IMessage[]) => {
    if (!messages?.length) return;
    const fixedUsers = await checkUniqueUsers(messages);
    if (fixedUsers && fixedUsers.length > 0) {
      store.dispatch(insertUsers({ newUsers: fixedUsers }));
    }
    store.dispatch(
      replaceRoomMessages({
        roomJID: jid,
        messages,
      })
    );
  };

  const getMessageStableKey = (message?: IMessage | null): string => {
    if (!message) return '';
    return String((message as any)?.xmppId || message?.id || '').trim();
  };

  const anchorMatches = (anchor: IMessage, candidate: IMessage): boolean => {
    const anchorPrimary = getMessageStableKey(anchor);
    const candidatePrimary = getMessageStableKey(candidate);

    if (anchorPrimary && candidatePrimary && anchorPrimary === candidatePrimary) {
      return true;
    }

    const anchorAlt = String((anchor as any)?.xmppId || '').trim();
    const candidateAlt = String((candidate as any)?.xmppId || '').trim();
    if (anchorAlt && candidateAlt && anchorAlt === candidateAlt) {
      return true;
    }

    const anchorId = String(anchor?.id || '').trim();
    const candidateId = String(candidate?.id || '').trim();
    if (anchorId && candidateId && anchorId === candidateId) {
      return true;
    }

    const anchorTs = getMessageTimestamp(anchor);
    const candidateTs = getMessageTimestamp(candidate);
    return anchorTs > 0 && candidateTs > 0 && anchorTs === candidateTs;
  };

  const roomEntries = Object.keys(rooms);
  if (roomEntries.length > 0) {
    const sortedRoomEntries = roomEntries.sort((a, b) => {
      if (activeRoomJID && a === activeRoomJID) return -1;
      if (activeRoomJID && b === activeRoomJID) return 1;
      const scoreA = getRoomLastActivityScore(rooms[a]);
      const scoreB = getRoomLastActivityScore(rooms[b]);
      if (scoreA !== scoreB) return scoreB - scoreA;
      return a.localeCompare(b);
    });

    ethoraLogger.log(
      '[Catchup] history_queue_order',
      sortedRoomEntries.map((jid) => ({
        jid,
        activityScore: getRoomLastActivityScore(rooms[jid]),
      }))
    );

    let processedIndex = 0;

    while (processedIndex < sortedRoomEntries.length) {
      const currentBatch = sortedRoomEntries.slice(
        processedIndex,
        processedIndex + batchSize
      );

      await Promise.all(
        currentBatch.map(async (jid, index) => {
          try {
            if (index > 0) await new Promise((res) => setTimeout(res, 125));

            const latestRoomState = store.getState().rooms.rooms?.[jid];
            const anchor = getAnchorFromRoom(latestRoomState);
            const latestMessages = await client.getHistoryStanza(
              jid,
              20,
              undefined,
              undefined,
              { source: 'background' }
            );

            if (!latestMessages || latestMessages.length === 0) {
              return;
            }

            if (!anchor) {
              await replaceMessages(jid, latestMessages);
              ethoraLogger.log(`[Catchup] anchor_missing room=${jid} reason=no_anchor_in_cache`);
              return;
            }

            const anchorId = String(anchor.id || '');
            const anchorFound = latestMessages.some(
              (message) => anchorMatches(anchor, message)
            );

            if (anchorFound) {
              ethoraLogger.log(`[Catchup] anchor_found room=${jid} anchor=${anchorId}`);
              const anchorTs = getMessageTimestamp(anchor);
              const deltaMessages = latestMessages.filter((message) => {
                const ts = getMessageTimestamp(message);
                return ts > anchorTs;
              });
              if (deltaMessages.length > 0) {
                await applyMessages(jid, deltaMessages);
              }
              ethoraLogger.log(
                `[Catchup] catchup_apply_count room=${jid} count=${deltaMessages.length}`
              );
              return;
            }

            ethoraLogger.log(`[Catchup] anchor_missing room=${jid} anchor=${anchorId}`);
            client.promoteRoomHistory(jid);
            store.dispatch(
              updateRoom({
                jid,
                updates: {
                  messages: [],
                  historyPreloadState: 'idle',
                },
              })
            );
            ethoraLogger.log(`[Catchup] room_cache_reset room=${jid} reason=anchor_missing`);
            await replaceMessages(jid, latestMessages);
          } catch (error) {
            console.error(`Error processing room ${jid}:`, error);
          }
        })
      );

      processedIndex += batchSize;
    }
  }

  ethoraLogger.log(
    `[Catchup] startup_history_total_ms ${Date.now() - startupStartedAt}ms`
  );
  ethoraLogger.log('All rooms processed');
};
