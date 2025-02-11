import { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { PriorityQueue } from '../utils/PriorityQueue';
import { IRoom } from '../types/types';
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
  loadMessages: (roomJid: string, max: number, before?: number) => Promise<any>
) => {
  const dispatch = useDispatch();
  const [isProcessing, setIsProcessing] = useState(false);
  const messageQueue = useRef<PriorityQueue<QueuedRoom>>(
    new PriorityQueue((a, b) => b.priority - a.priority)
  );
  const processedMessages = useRef<Set<string>>(new Set());

  // Reset queue when active room changes
  useEffect(() => {
    const queue = messageQueue.current;
    queue.clear();

    // Push all non-active rooms to queue with lower priority
    Object.entries(rooms).forEach(([jid, room]) => {
      if (jid !== activeRoomJID) {
        queue.push({
          jid,
          priority: 1,
          lastMessageId: room.messages[0]?.id,
          messageCount: room.messages.length,
        });
      }
    });

    // Push active room with highest priority
    if (rooms[activeRoomJID]) {
      queue.push({
        jid: activeRoomJID,
        priority: 10,
        lastMessageId: rooms[activeRoomJID].messages[0]?.id,
        messageCount: rooms[activeRoomJID].messages.length,
      });
    }
  }, [activeRoomJID, rooms]);

  // Process queue
  useEffect(() => {
    const processQueue = async () => {
      if (isProcessing) return;

      const queue = messageQueue.current;
      if (queue.isEmpty()) return;

      setIsProcessing(true);
      const room = queue.pop();

      try {
        // Load messages in batches of 5 for active room
        if (
          room.jid === activeRoomJID &&
          room.messageCount < 30 &&
          !rooms[room.jid].historyComplete
        ) {
          dispatch(setIsLoading({ chatJID: room.jid, loading: true }));
          console.log('1');
          await loadMessages(room.jid, 5, Number(room.lastMessageId));

          // Re-queue if more messages needed
          if (room.messageCount + 5 < 30) {
            queue.push({
              ...room,
              messageCount: room.messageCount + 5,
            });
          }
        }
        // Load up to 20 messages for other rooms
        else if (room.messageCount < 20 && !rooms[room.jid].historyComplete) {
          console.log('2');
          await loadMessages(room.jid, 20, Number(room.lastMessageId));
        }

        // Clear history if last message missing after 20 loaded
        if (
          room.messageCount >= 20 &&
          !processedMessages.current.has(room.jid)
        ) {
          processedMessages.current.add(room.jid);
          if (rooms[room.jid].messages.length >= 30) {
            rooms[room.jid].messages = rooms[room.jid].messages.slice(-30);
          }
        }
      } catch (error) {
        console.error('Error processing message queue:', error);
        // Re-queue failed room with lower priority
        queue.push({
          ...room,
          priority: room.priority - 1,
        });
      } finally {
        dispatch(setIsLoading({ chatJID: room.jid, loading: false }));
        setIsProcessing(false);
      }
    };

    const interval = setInterval(processQueue, 1000);
    return () => clearInterval(interval);
  }, [isProcessing, activeRoomJID, rooms, loadMessages]);
};
