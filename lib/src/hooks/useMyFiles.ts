import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../roomStore';
import { deleteMyFile, getMyFiles } from '../networking/api-requests/files.api';
import { ApiFile } from '../types/types';

const PAGE_SIZE = 50;

interface FilesCacheEntry {
  items: ApiFile[];
  total: number;
  hasMore: boolean;
}

// Keyed by auth token: /v2/files always lists the caller's own uploads, so
// the token is the whole identity of a cached list. Switching tabs (Files
// panel unmount/remount) reuses the last page set instead of refetching;
// `refresh()` is the only thing that overwrites an entry.
const filesCache = new Map<string, FilesCacheEntry>();

export interface UseMyFilesOptions {
  // Client-side only - the backend has no room filter (see files.api.ts).
  roomName?: string;
}

export interface UseMyFilesResult {
  items: ApiFile[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
  remove: (id: string) => Promise<void>;
}

export function useMyFiles(options?: UseMyFilesOptions): UseMyFilesResult {
  const roomName = options?.roomName;
  const token = useSelector(
    (state: RootState) => state.chatSettingStore.user?.token || ''
  );

  const cached = filesCache.get(token);
  const [items, setItems] = useState<ApiFile[]>(cached?.items || []);
  const [total, setTotal] = useState<number>(cached?.total || 0);
  const [hasMore, setHasMore] = useState<boolean>(cached?.hasMore ?? true);
  const [loading, setLoading] = useState<boolean>(!cached);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const itemsRef = useRef<ApiFile[]>(items);
  itemsRef.current = items;

  const writeCache = useCallback(
    (next: FilesCacheEntry) => {
      filesCache.set(token, next);
    },
    [token]
  );

  const fetchPage = useCallback(
    async (offset: number, replace: boolean) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      // An aborted (superseded) request must not touch state in its finally:
      // it used to clear the loading flags of the request that replaced it,
      // re-enabling loadMore mid-flight.
      const isCurrent = () => abortRef.current === controller;

      if (replace) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      try {
        const result = await getMyFiles({
          limit: PAGE_SIZE,
          offset,
          signal: controller.signal,
        });
        // A superseded request can still resolve before its abort lands;
        // only the current one may write items/cache.
        if (!isCurrent()) return;
        const nextItems = replace
          ? result.items
          : [...itemsRef.current, ...result.items];
        const nextHasMore = nextItems.length < result.total;

        setItems(nextItems);
        setTotal(result.total);
        setHasMore(nextHasMore);
        writeCache({ items: nextItems, total: result.total, hasMore: nextHasMore });
      } catch (err: any) {
        if (err?.name === 'CanceledError' || err?.name === 'AbortError') return;
        if (!isCurrent()) return;
        setError(err?.message || 'Failed to load files');
      } finally {
        if (isCurrent()) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [writeCache]
  );

  useEffect(() => {
    if (!cached) {
      fetchPage(0, true);
    }
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    fetchPage(itemsRef.current.length, false);
  }, [fetchPage, loading, loadingMore, hasMore]);

  const refresh = useCallback(() => {
    filesCache.delete(token);
    fetchPage(0, true);
  }, [fetchPage, token]);

  const remove = useCallback(
    async (id: string) => {
      const previous = itemsRef.current;
      const nextItems = previous.filter((file) => file._id !== id);
      const nextTotal = Math.max(0, total - 1);

      setItems(nextItems);
      setTotal(nextTotal);
      writeCache({ items: nextItems, total: nextTotal, hasMore });

      try {
        await deleteMyFile(id);
      } catch (err: any) {
        // Rollback: put the file back where optimistic removal took it out.
        setItems(previous);
        setTotal(total);
        writeCache({ items: previous, total, hasMore });
        setError(err?.message || 'Failed to delete file');
        throw err;
      }
    },
    [total, hasMore, writeCache]
  );

  const filteredItems = useMemo(() => {
    if (!roomName) return items;
    return items.filter((file) => file.roomName === roomName);
  }, [items, roomName]);

  return {
    items: filteredItems,
    total,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
    remove,
  };
}
