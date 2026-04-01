import { useSyncExternalStore } from 'react';
import { IRoom } from '../types/types';
import { store } from '../roomStore';

interface UnreadMessagesMap {
  [roomJid: string]: number;
}

interface UnreadMessagesStats {
  hasUnread: boolean;
  totalCount: number;
  unreadByRoom: UnreadMessagesMap;
}

export const useUnreadMessagesCounter = (): UnreadMessagesStats => {
  const subscribe = (callback: () => void) => store.subscribe(callback);
  const getSnapshot = () => store.getState().rooms.rooms;

  const rooms = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot
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
