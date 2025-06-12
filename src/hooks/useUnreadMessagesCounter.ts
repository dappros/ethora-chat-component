import { useSyncExternalStore } from 'react';
import { IRoom } from '../types/types';
import { RootState, store } from '../roomStore';

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

  return {
    hasUnread: totalCount > 0,
    totalCount,
    unreadByRoom,
  };
};

export { useUnreadMessagesCounter as useUnread };
