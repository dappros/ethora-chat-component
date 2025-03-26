import { useEffect, useSyncExternalStore } from 'react';
import { IConfig, IRoom } from '../types/types';
import { RootState, store } from '../roomStore';
import { useDispatch, useSelector } from 'react-redux';
import { setUnreadMessages } from '../roomStore/roomsSlice.ts';
import { useXmppClient } from '../context/xmppProvider.tsx';
import { useInitXmmpClient } from './useInitXmmpClient.tsx';

interface UnreadMessagesMap {
  [roomJid: string]: number;
}

interface UnreadMessagesStats {
  hasUnread: boolean;
  totalCount: number;
  unreadByRoom: UnreadMessagesMap;
}

export const useUnreadMessagesCounter = (): UnreadMessagesStats => {
  const subscribe = (callback: () => void) => {
    const unsubscribe = store.subscribe(() => {
      const state: RootState = store.getState();
      const rooms = state.rooms?.rooms;

      if (rooms) {
        Object.entries(rooms).forEach(([roomJid, room]: [string, IRoom]) => {
          if (room.unreadMessages !== undefined) {
            callback();
          }
        });
      }
    });
    return unsubscribe;
  };

  const rooms = useSyncExternalStore(
    subscribe,
    () => store.getState().rooms.rooms
  );

  const unreadByRoom: UnreadMessagesMap = {};
  let totalCount = 0;

  Object.entries(rooms).forEach(([roomJid, room]: [string, IRoom]) => {
    const unreadCount = room.unreadMessages || 0;
    if (unreadCount > 0) {
      unreadByRoom[roomJid] = unreadCount;
      totalCount += unreadCount;
    }
  });

  const reduxConfig = useSelector((state: RootState) => state.chatSettingStore.config);
  const { initXmmpClient } = useInitXmmpClient({ config: reduxConfig });

  useEffect(() => {
    if (reduxConfig) {
      initXmmpClient();
    }
  }, [reduxConfig]);

  return {
    hasUnread: totalCount > 0,
    totalCount,
    unreadByRoom,
  };
};

export { useUnreadMessagesCounter as useUnread };
