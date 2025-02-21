import { useEffect, useState, useRef } from 'react';
import { IRoom } from '../types/types';

const useMessageLoaderQueue = (
  roomsList: string[],
  rooms: {
    [jid: string]: IRoom;
  },
  globalLoading: boolean,
  loading: boolean,
  loadMoreMessages: (roomJid: string, max: number) => Promise<any>
) => {
  const [queueActive, setQueueActive] = useState(false);
  const [processedChats, setProcessedChats] = useState<Set<string>>(new Set());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const processQueue = async () => {
      if (
        !globalLoading &&
        !loading &&
        processedChats.size !== roomsList.length
      ) {
        const batchSize = 3;
        const batchedRooms = roomsList.filter(
          (room) => !processedChats.has(room)
        );

        for (let i = 0; i < batchedRooms.length; i += batchSize) {
          const currentBatch = batchedRooms.slice(i, i + batchSize);

          for (const room of currentBatch) {
            if (
              roomHasMoreRooms(rooms[room]) &&
              !rooms[room]?.noMessages &&
              !rooms[room]?.historyComplete
            ) {
              console.log(room);
              try {
                await loadMoreMessages(room, 10);
              } catch (error) {
                console.error(`Error processing room ${room}:`, error);
              }
              await new Promise((res) => setTimeout(res, 200));
            }
            setProcessedChats((prev) => new Set(prev).add(room));
          }
        }
        console.log('Processed queue');
      }
    };

    const startQueue = () => {
      if (!queueActive) {
        setQueueActive(true);
        intervalRef.current = setInterval(processQueue, 1000);
      }
    };

    const stopQueue = () => {
      setQueueActive(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    if (!globalLoading && !loading) {
      startQueue();
    } else {
      stopQueue();
    }

    return () => {
      stopQueue();
    };
  }, [
    roomsList.length,
    globalLoading,
    loadMoreMessages,
    processedChats,
    loading,
  ]);
};

const roomHasMoreRooms = (room: IRoom, max: number = 20) => {
  return room.messages?.length < max;
};

export default useMessageLoaderQueue;
