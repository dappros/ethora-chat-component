import XmppClient from '../networking/xmppClient';
import { store } from '../roomStore';
import { getLastMessageTimestamp } from '../roomStore/roomsSlice';
import { IMessage, IRoom } from '../types/types';

export const updateMessagesTillLast = async (
  rooms: {
    [jid: string]: IRoom;
  },
  client: XmppClient,
  batchSize = 10,
  maxFetchAttempts = 1,
  messagesPerFetch = 6
) => {
  const roomEntries = Object.keys(rooms);
  if (roomEntries.length > 0) {
    let processedIndex = 0;

    while (processedIndex < roomEntries.length) {
      const currentBatch = roomEntries.slice(
        processedIndex,
        processedIndex + batchSize
      );

      await Promise.all(
        currentBatch.map(async (jid, index) => {
          try {
            if (index > 0) await new Promise((res) => setTimeout(res, 500));

            const lastTimeStamp = getLastMessageTimestamp(
              store.getState().rooms,
              jid
            );
            if (!lastTimeStamp) return;

            let counter = 0;
            let isMessageFound = false;

            while (!isMessageFound && counter < maxFetchAttempts) {
              const fetchedMessages = await client.getHistoryStanza(
                jid,
                messagesPerFetch,
                Number(store.getState().rooms.rooms[jid].messages[0].id)
              );

              if (!fetchedMessages.length) break;

              counter++;
              isMessageFound = fetchedMessages.some(
                (message: IMessage) =>
                  Number(message.id) === Number(lastTimeStamp)
              );
            }

            // console.log(`${jid} now updated`);
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
