import XmppClient from '../networking/xmppClient';
import { store } from '../roomStore';
import {
  getLastMessageTimestamp,
  setRoomMessages,
} from '../roomStore/roomsSlice';
import { IMessage, IRoom } from '../types/types';

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
            if (!lastCachedMessagesTimeStamp) return;

            while (!isMessageFound && counter < maxFetchAttempts) {
              const lastMessageId =
                counter > 0 ? currentJidNewMessages[0]?.id : undefined;

              const fetchedMessages = await client.getHistoryStanza(
                jid,
                messagesPerFetch,
                Number(lastMessageId)
              );

              if (!fetchedMessages.length) break;

              counter++;

              currentJidNewMessages = [
                ...fetchedMessages,
                ...currentJidNewMessages,
              ];

              isMessageFound = currentJidNewMessages.some(
                (message: IMessage) =>
                  Number(message.id) === Number(lastCachedMessagesTimeStamp)
              );

              if (!isMessageFound && !(counter <= maxFetchAttempts - 1)) {
                store.dispatch(
                  setRoomMessages({
                    roomJID: jid,
                    messages: currentJidNewMessages,
                  })
                );
              }
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
