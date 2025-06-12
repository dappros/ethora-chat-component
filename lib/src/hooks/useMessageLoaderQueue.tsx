import { useCallback, useEffect, useRef } from 'react';
import { IRoom } from '../types/types';

const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_POLL_INTERVAL = 1_000;

const roomHasMoreMessages = (room: IRoom, max: number = 20) =>
  (room.messages?.length ?? 0) < max;

const useMessageLoaderQueue = (
  roomsList: string[],
  rooms: Record<string, IRoom>,
  globalLoading: boolean,
  loading: boolean,
  loadMoreMessages: (roomJid: string, max: number) => Promise<unknown>,
  batchSize: number = DEFAULT_BATCH_SIZE,
  pageSize: number = DEFAULT_PAGE_SIZE,
  pollInterval: number = DEFAULT_POLL_INTERVAL
) => {
  const processedChats = useRef<Set<string>>(new Set());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const processQueue = useCallback(async () => {
    if (globalLoading || loading) return;

    const unprocessed = roomsList.filter(
      (jid) => !processedChats.current.has(jid)
    );

    if (!unprocessed.length) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    for (let i = 0; i < unprocessed.length; i += batchSize) {
      const batch = unprocessed.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (jid) => {
          const room = rooms[jid];
          if (
            !!room &&
            roomHasMoreMessages(room) &&
            !room.noMessages &&
            !room.historyComplete
          ) {
            try {
              await loadMoreMessages(jid, pageSize);
            } catch (err) {
              console.error(`Error loading messages for ${jid}`, err);
            }

            await new Promise((res) => setTimeout(res, 200));
          }
          processedChats.current.add(jid);
        })
      );
    }
  }, [
    roomsList?.length,
    globalLoading,
    loading,
    loadMoreMessages,
    batchSize,
    pageSize,
  ]);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    processedChats.current = new Set();

    if (!globalLoading && !loading && !!roomsList.length) {
      intervalRef.current = setInterval(processQueue, pollInterval);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [roomsList?.length, globalLoading, loading]);
};

export default useMessageLoaderQueue;
