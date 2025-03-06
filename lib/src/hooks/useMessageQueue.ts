import { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { PriorityQueue } from '../utils/PriorityQueue';
import { IMessage, IRoom } from '../types/types';
import { setIsLoading } from '../roomStore/roomsSlice';

interface QueuedRoom {
  jid: string;
  priority: number;
  lastMessageId?: string;
  messageCount: number;
  messages: IMessage[];
}

const hasDuplicateMessages = (
  newMessages: IMessage[],
  currentMessages: IMessage[]
) => {
  return newMessages.some((newMsg: IMessage) =>
    currentMessages.some((currMsg: IMessage) => currMsg.id === newMsg.id)
  );
};

const addRoomToProcessed = (
  queueRoom: QueuedRoom,
  processedRooms: React.MutableRefObject<Set<string>>,
  rooms: { [jid: string]: IRoom }
) => {
  if (
    queueRoom.messageCount >= 20 &&
    !processedRooms.current.has(queueRoom.jid)
  ) {
    processedRooms.current.add(queueRoom.jid);
    console.log(`Marking room: ${queueRoom.jid} as processed`);
    if (rooms[queueRoom.jid].messages.length >= 30) {
      console.log(`Trimming messages for room: ${queueRoom.jid}`);
      rooms[queueRoom.jid].messages = rooms[queueRoom.jid].messages.slice(-30);
    }
  }
};

export const useMessageQueue = (
  rooms: { [jid: string]: IRoom },
  activeRoomJID: string,
  loadMessages: (
    roomJid: string,
    max: number,
    before?: number
  ) => Promise<IMessage[]>
) => {
  const dispatch = useDispatch();
  const messageQueue = useRef<PriorityQueue<QueuedRoom>>(
    new PriorityQueue((a, b) => b.priority - a.priority)
  );
  const processedRooms = useRef<Set<string>>(new Set());

  const asyncLoadMessages = async (
    queueRoom: QueuedRoom,
    rooms: { [jid: string]: IRoom }
  ) => {
    try {
      if (
        queueRoom.messageCount < 30 &&
        !rooms[queueRoom.jid].historyComplete
      ) {
        console.log(`Loading messages for room: ${queueRoom.jid}`);
        dispatch(setIsLoading({ chatJID: queueRoom.jid, loading: true }));

        const newMessages = await loadMessages(
          queueRoom.jid,
          5,
          Number(queueRoom.lastMessageId)
        );
        queueRoom.messages = [...queueRoom.messages, ...newMessages];

        if (
          queueRoom.messageCount + queueRoom.messages.length < 30 &&
          !rooms[queueRoom.jid].historyComplete
        ) {
          console.log(`Re-queuing room: ${queueRoom.jid} for more messages`);
          messageQueue.current.push({
            jid: queueRoom.jid,
            priority: queueRoom.priority,
            lastMessageId: queueRoom.lastMessageId,
            messageCount: queueRoom.messageCount + newMessages.length,
            messages: queueRoom.messages,
          });
        }
      }
    } catch (error) {
      console.error(
        `Error processing room: ${queueRoom.jid}, continue to next room`,
        error
      );
    } finally {
      dispatch(setIsLoading({ chatJID: queueRoom.jid, loading: false }));
      dispatch(setIsLoading({ loading: false }));
      console.log(`Finished processing queue: ${queueRoom.jid}`);
    }
  };

  // Process queue
  useEffect(() => {
    const processQueue = async () => {
      const queue = messageQueue.current;
      if (queue.isEmpty()) return;

      const roomsToProcess = queue.pop(5);
      if (roomsToProcess.length === 0) return;

      await Promise.all(
        roomsToProcess.map(async (room) => {
          try {
            if (room.messageCount < 30 && !rooms[room.jid].historyComplete) {
              console.log(`Loading messages for room: ${room.jid}`);
              dispatch(setIsLoading({ chatJID: room.jid, loading: true }));
              await loadMessages(room.jid, 20, Number(room.lastMessageId));

              if (
                room.messageCount + 20 < 30 &&
                !rooms[room.jid].historyComplete
              ) {
                console.log(`Re-queuing room: ${room.jid} for more messages`);
                queue.push({
                  ...room,
                  messageCount: room.messageCount + 6,
                });
              }
            }

            addRoomToProcessed(room, processedRooms, rooms);
          } catch (error) {
            console.error(`Error processing room: ${room.jid}`, error);
            queue.push({ ...room, priority: Math.max(room.priority - 1, 1) });
          } finally {
            dispatch(setIsLoading({ chatJID: room.jid, loading: false }));
            console.log(`Finished processing room: ${room.jid}`);
          }
        })
      );
    };

    const interval = setInterval(processQueue, 250);
    return () => clearInterval(interval);
  }, []);
};
