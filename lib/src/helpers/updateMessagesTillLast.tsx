import XmppClient from '../networking/xmppClient';
import { store } from '../roomStore';
import {
  getLastMessageTimestamp,
  insertUsers,
  setRoomMessages,
  updateRoom,
} from '../roomStore/roomsSlice';
import { IMessage, IRoom } from '../types/types';
import { checkUniqueUsers } from './checkUniqueUsers';

export const updateMessagesTillLast = async (
  rooms: {
    [jid: string]: IRoom;
  },
  client: XmppClient,
  batchSize = 5,
  maxFetchAttempts = 4,
  messagesPerFetch = 5
) => {
  const roomEntries = Object.keys(rooms);
  if (roomEntries.length > 0) {
    let processedIndex = 0;

    while (processedIndex < roomEntries.length) {
      const currentBatch = roomEntries.slice(
        processedIndex,
        processedIndex + batchSize
      );

      const lastTimestampsByJid = currentBatch.reduce(
        (acc, current: string) => {
          acc[current] = getLastMessageTimestamp(
            store.getState().rooms,
            current
          );
          return acc;
        },
        {}
      );

      await Promise.all(
        currentBatch.map(async (jid, index) => {
          try {
            if (index > 0) await new Promise((res) => setTimeout(res, 125));

            let counter = 0;
            let isMessageFound = false;
            let currentJidNewMessages: IMessage[] = [];

            const lastCachedMessagesTimeStamp = lastTimestampsByJid[jid];
            if (!lastCachedMessagesTimeStamp) {
              const initialMessages = await client.getHistoryStanza(
                jid,
                Math.max(messagesPerFetch * 4, 20),
                undefined,
                undefined,
                { source: 'background' }
              );
              if (initialMessages && initialMessages.length > 0) {
                const fixedUsers = await checkUniqueUsers(initialMessages);
                if (fixedUsers && fixedUsers.length > 0) {
                  store.dispatch(insertUsers({ newUsers: fixedUsers }));
                }
                store.dispatch(
                  setRoomMessages({
                    roomJID: jid,
                    messages: initialMessages,
                  })
                );
              }
              return;
            }

            while (!isMessageFound && counter < maxFetchAttempts) {
              const lastMessageId =
                counter > 0 ? currentJidNewMessages[0]?.id : undefined;

              const fetchedMessages = await client.getHistoryStanza(
                jid,
                messagesPerFetch,
                Number(lastMessageId),
                undefined,
                { source: 'background' }
              );

              if (!fetchedMessages || !fetchedMessages.length) break;

              counter++;

              currentJidNewMessages = [
                ...fetchedMessages,
                ...currentJidNewMessages,
              ];

              isMessageFound = currentJidNewMessages.some(
                (message: IMessage) =>
                  Number(message.id) === Number(lastCachedMessagesTimeStamp)
              );
            }

            if (currentJidNewMessages.length > 0) {
              const fixedUsers = await checkUniqueUsers(currentJidNewMessages);
              if (fixedUsers && fixedUsers.length > 0) {
                store.dispatch(insertUsers({ newUsers: fixedUsers }));
              }

              if (!isMessageFound) {
                // Cached anchor was not found within the fetch window.
                // Reset this room cache only, then hydrate with a fresh snapshot.
                store.dispatch(
                  updateRoom({
                    jid,
                    updates: {
                      messages: [],
                    },
                  })
                );
              }

              store.dispatch(
                setRoomMessages({
                  roomJID: jid,
                  messages: currentJidNewMessages,
                })
              );
            }
          } catch (error) {
            console.error(`Error processing room ${jid}:`, error);
          }
        })
      );

      processedIndex += batchSize;
    }
  }

  console.log('All rooms processed');
};
