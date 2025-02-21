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
}

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
  const [isProcessing, setIsProcessing] = useState(false);
  const [queueActive, setQueueActive] = useState(true);
  const messageQueue = useRef<PriorityQueue<QueuedRoom>>(
    new PriorityQueue((a, b) => b.priority - a.priority)
  );
  const processedMessages = useRef<Set<string>>(new Set());

  // Reset queue when active room changes
  useEffect(() => {
    console.log('Updating message queue priorities');
    const queue = messageQueue.current;
    const updatedQueue = new PriorityQueue<QueuedRoom>(
      (a, b) => b.priority - a.priority
    );

    queue.toArray().forEach((room) => {
      updatedQueue.push({
        ...room,
        priority: room.jid === activeRoomJID ? 10 : 1,
      });
    });

    Object.entries(rooms).forEach(([jid, room]) => {
      console.log(queue);
      if (
        !processedMessages.current.has(jid) &&
        !queue.contains((queueRoom) => queueRoom.jid === jid)
      ) {
        const priority = jid === activeRoomJID ? 10 : 1;
        const messageLength = room.messages.length;
        console.log(`Adding room: ${jid} to queue with priority: ${priority}`);
        updatedQueue.push({
          jid,
          priority,
          lastMessageId: room.messages[messageLength - 1]?.id,
          messageCount: messageLength,
        });
      }
    });

    messageQueue.current = updatedQueue;
    setQueueActive(true);
  }, [activeRoomJID, Object.keys(rooms).length]);

  // Process queue
  useEffect(() => {
    const processQueue = async () => {
      if (isProcessing || !queueActive) return;

      const queue = messageQueue.current;
      if (queue.isEmpty()) {
        console.log('Message queue is empty, stopping processing');
        setQueueActive(false);
        return;
      }

      setIsProcessing(true);
      const room = queue.pop();
      console.log(
        `Processing room: ${room.jid} with priority: ${room.priority}`
      );

      try {
        if (room.messageCount < 30 && !rooms[room.jid].historyComplete) {
          console.log(`Loading messages for room: ${room.jid}`);
          dispatch(setIsLoading({ chatJID: room.jid, loading: true }));
          await loadMessages(room.jid, 6, Number(room.lastMessageId));

          if (room.messageCount + 6 < 30 && !rooms[room.jid].historyComplete) {
            console.log(`Re-queuing room: ${room.jid} for more messages`);
            queue.push({
              ...room,
              messageCount: room.messageCount + 6,
            });
          }
        }

        if (
          room.messageCount >= 20 &&
          !processedMessages.current.has(room.jid)
        ) {
          processedMessages.current.add(room.jid);
          console.log(`Marking room: ${room.jid} as processed`);
          if (rooms[room.jid].messages.length >= 30) {
            console.log(`Trimming messages for room: ${room.jid}`);
            rooms[room.jid].messages = rooms[room.jid].messages.slice(-30);
          }
        }
      } catch (error) {
        console.error(`Error processing room: ${room.jid}`, error);
        queue.push({
          ...room,
          priority: Math.max(room.priority - 1, 1),
        });
      } finally {
        dispatch(setIsLoading({ chatJID: room.jid, loading: false }));
        console.log(`Finished processing room: ${room.jid}`);
        setIsProcessing(false);
      }
    };

    const interval = setInterval(processQueue, 250);
    return () => clearInterval(interval);
  }, [isProcessing, queueActive, activeRoomJID, Object.keys(rooms).length]);
};
