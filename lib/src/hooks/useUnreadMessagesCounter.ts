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
   * True while the unread counts are not trustworthy yet — i.e. until the
   * room list has been populated at least once (from cache or the API), or
   * until the first rooms load cycle finishes for an account with no rooms.
   * Lets consumers show a spinner/skeleton instead of a misleading "0".
   */
  loading: boolean;
  /** Alias of `loading` — matches the React Native SDK field name. */
  isLoading: boolean;
}

type HiddenRoomsConfig = Pick<IConfig, 'hiddenRooms'> | undefined;

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

const buildUnreadSignature = (
  rooms: Record<string, IRoom>,
  hiddenConfig: HiddenRoomsConfig,
  loading: boolean
): string => {
  const entries = Object.entries(rooms || {})
    .map(([jid, room]) => `${jid}:${Number(room?.unreadMessages || 0)}:${room?.unreadCapped ? 1 : 0}`)
    .sort();

  const hiddenKey = JSON.stringify(hiddenConfig?.hiddenRooms ?? null);

  return `${loading ? 1 : 0}#${hiddenKey}#${entries.join('|')}`;
};

export const useUnreadMessagesCounter = (): UnreadMessagesStats => {
  // Latches to true once unread data has been available at least once:
  // either rooms exist in the store (cache rehydration counts), or a full
  // "Loading chats..." cycle completed — even when it produced zero rooms.
  const hasLoadedOnceRef = useRef<boolean>(
    Object.keys(store.getState().rooms.rooms || {}).length > 0
  );
  const prevRoomsLoadingRef = useRef<boolean>(store.getState().rooms.isLoading);

  const computeLoading = (): boolean => {
    const roomsState = store.getState().rooms;
    const hasRooms = Object.keys(roomsState.rooms || {}).length > 0;
    if (hasRooms) {
      hasLoadedOnceRef.current = true;
    } else if (prevRoomsLoadingRef.current && !roomsState.isLoading) {
      hasLoadedOnceRef.current = true;
    }
    prevRoomsLoadingRef.current = roomsState.isLoading;
    return !hasLoadedOnceRef.current;
  };

  const [stats, setStats] = useState<UnreadMessagesStats>(() => {
    const loading = computeLoading();
    return {
      ...buildUnreadStats(store.getState().rooms.rooms, getHiddenRoomsConfig()),
      loading,
      isLoading: loading,
    };
  });
  const signatureRef = useRef<string>(
    buildUnreadSignature(
      store.getState().rooms.rooms,
      getHiddenRoomsConfig(),
      stats.loading
    )
  );

  useEffect(() => {
    const unsubscribe = store.subscribe(() => {
      const rooms = store.getState().rooms.rooms;
      const hiddenConfig = getHiddenRoomsConfig();
      const loading = computeLoading();
      const signature = buildUnreadSignature(rooms, hiddenConfig, loading);

      if (signatureRef.current === signature) {
        return;
      }

      signatureRef.current = signature;
      setStats({
        ...buildUnreadStats(rooms, hiddenConfig),
        loading,
        isLoading: loading,
      });
    });

    return unsubscribe;
  }, []);

  return useMemo(() => stats, [stats]);
};

export { useUnreadMessagesCounter as useUnread };
