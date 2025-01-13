import { useEffect, useState, useRef } from 'react';

const useMessageLoaderQueue = (
  roomsList: string[],
  globalLoading: boolean,
  loading: boolean,
  loadMoreMessages: (roomJid: string, max: number) => Promise<any>
) => {
  const [queueActive, setQueueActive] = useState(false);
  const [processedChats, setProcessedChats] = useState<Set<string>>(new Set());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const processQueue = () => {
      if (!loading && processedChats.size !== roomsList.length) {
        console.log('Processing queue...');
        roomsList.forEach(async (room) => {
          if (!processedChats.has(room)) {
            await loadMoreMessages(room, 5);
            setProcessedChats((prev) => new Set(prev).add(room));
          }
        });
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

export default useMessageLoaderQueue;
