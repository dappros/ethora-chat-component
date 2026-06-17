import { useEffect, useMemo, useRef, useState } from 'react';
import { IConfig, IRoom } from '../types/types';
import { store } from '../roomStore';
import { isRoomHidden } from '../helpers/hiddenRooms';

interface UnreadMessagesMap {
  [roomJid: string]: number;
}

interface UnreadMessagesDisplayMap {
  [roomJid: string]: string;
}

interface UnreadMessagesStats {
  hasUnread: boolean;
  totalCount: number;
  unreadByRoom: UnreadMessagesMap;
  displayTotal: string;
  displayByRoom: UnreadMessagesDisplayMap;
  /**
   * True while the unread counts are still settling on first load. Instead of
   * surfacing the count as it ramps up (0 → 2 → 3 … as history backfills), the
   * hook keeps `loading` true until the per-room counts have stopped changing
   * for a short window, then latches it to false. After that first settle,
   * live message increments update the counts immediately and never flip
   * `loading` back on — it's a first-load indicator, not a per-update one.
   */
  loading: boolean;
  /** Alias of `loading` — matches the React Native SDK field name. */
  isLoading: boolean;
}

type HiddenRoomsConfig = Pick<IConfig, 'hiddenRooms'> | undefined;

// How long the unread counts must stay unchanged before we consider them
// final and reveal them. Comfortably longer than the gap between history
// backfill batches (which arrive sub-second).
const SETTLE_MS = 1200;

const getHiddenRoomsConfig = (): HiddenRoomsConfig =>
  (store.getState() as { chatSettingStore?: { config?: IConfig } })
    .chatSettingStore?.config;

const buildUnreadStats = (
  rooms: Record<string, IRoom>,
  hiddenConfig: HiddenRoomsConfig
): Omit<UnreadMessagesStats, 'loading' | 'isLoading'> => {
  const unreadByRoom: UnreadMessagesMap = {};
  const displayByRoom: UnreadMessagesDisplayMap = {};
  let totalCount = 0;
  let hasCappedUnread = false;

  Object.entries(rooms || {}).forEach(([roomJid, room]) => {
    if (isRoomHidden(room, hiddenConfig)) {
      return;
    }

    const unreadCount = Number(room?.unreadMessages || 0);
    if (unreadCount <= 0) {
      return;
    }

    unreadByRoom[roomJid] = unreadCount;
    totalCount += unreadCount;

    if (room?.unreadCapped) {
      hasCappedUnread = true;
      displayByRoom[roomJid] = `${Math.max(unreadCount, 10)}+`;
      return;
    }

    displayByRoom[roomJid] = String(unreadCount);
  });

  return {
    hasUnread: totalCount > 0,
    totalCount,
    unreadByRoom,
    displayTotal: hasCappedUnread && totalCount > 0 ? `${totalCount}+` : String(totalCount),
    displayByRoom,
  };
};

// Signature of just the unread COUNTS of visible rooms — used to detect when
// the counts have stopped changing (so we can settle `loading`).
const buildCountsSignature = (
  rooms: Record<string, IRoom>,
  hiddenConfig: HiddenRoomsConfig
): string => {
  const entries = Object.entries(rooms || {})
    .filter(([, room]) => !isRoomHidden(room, hiddenConfig))
    .map(
      ([jid, room]) =>
        `${jid}:${Number(room?.unreadMessages || 0)}:${room?.unreadCapped ? 1 : 0}`
    )
    .sort();
  return `${entries.join('|')}#${JSON.stringify(hiddenConfig?.hiddenRooms ?? null)}`;
};

export const useUnreadMessagesCounter = (): UnreadMessagesStats => {
  // Latches true once the counts have settled; loading stays false forever
  // after, so live increments don't re-trigger the spinner.
  const settledRef = useRef<boolean>(false);
  // True once rooms have appeared (cache/API) or a full "Loading chats…"
  // cycle finished even with zero rooms — we only start the settle timer
  // after this, so the initial empty store doesn't settle prematurely.
  const loadedOnceRef = useRef<boolean>(
    Object.keys(store.getState().rooms.rooms || {}).length > 0
  );
  const prevRoomsLoadingRef = useRef<boolean>(store.getState().rooms.isLoading);
  const lastCountsSigRef = useRef<string>('');
  const lastEmittedRef = useRef<string>('');
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshLoadedOnce = (): boolean => {
    const rs = store.getState().rooms;
    const hasRooms = Object.keys(rs.rooms || {}).length > 0;
    if (hasRooms) {
      loadedOnceRef.current = true;
    } else if (prevRoomsLoadingRef.current && !rs.isLoading) {
      loadedOnceRef.current = true;
    }
    prevRoomsLoadingRef.current = rs.isLoading;
    return loadedOnceRef.current;
  };

  const snapshot = (): UnreadMessagesStats => {
    const rooms = store.getState().rooms.rooms;
    const hidden = getHiddenRoomsConfig();
    const loading = !settledRef.current;
    return { ...buildUnreadStats(rooms, hidden), loading, isLoading: loading };
  };

  const [stats, setStats] = useState<UnreadMessagesStats>(() => snapshot());

  useEffect(() => {
    const emit = () => {
      const next = snapshot();
      const sig = `${next.loading ? 1 : 0}#${buildCountsSignature(
        store.getState().rooms.rooms,
        getHiddenRoomsConfig()
      )}`;
      if (sig === lastEmittedRef.current) return;
      lastEmittedRef.current = sig;
      setStats(next);
    };

    const armSettle = () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      settleTimerRef.current = setTimeout(() => {
        settleTimerRef.current = null;
        settledRef.current = true;
        emit();
      }, SETTLE_MS);
    };

    const onChange = () => {
      const loadedOnce = refreshLoadedOnce();
      const countsSig = buildCountsSignature(
        store.getState().rooms.rooms,
        getHiddenRoomsConfig()
      );

      if (settledRef.current) {
        // Already settled — reflect live count changes immediately.
        if (countsSig !== lastCountsSigRef.current) {
          lastCountsSigRef.current = countsSig;
          emit();
        }
        return;
      }

      if (!loadedOnce) {
        // Room list still loading — keep the spinner, don't start settling.
        emit();
        return;
      }

      // Loaded but not settled: (re)start the settle window whenever the
      // counts change, and arm it the first time we reach this state.
      if (countsSig !== lastCountsSigRef.current || settleTimerRef.current === null) {
        lastCountsSigRef.current = countsSig;
        armSettle();
      }
      emit();
    };

    const unsubscribe = store.subscribe(onChange);
    onChange();

    return () => {
      unsubscribe();
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    };
  }, []);

  return useMemo(() => stats, [stats]);
};

export { useUnreadMessagesCounter as useUnread };
