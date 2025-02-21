import { useEffect } from 'react';
import { useStoreConsole } from '../helpers/storeConsole';
import { IRoom } from '../types/types';

interface UnreadMessagesMap {
  [roomJid: string]: number;
}

interface UnreadMessagesStats {
  hasUnread: boolean;
  totalCount: number;
  unreadByRoom: UnreadMessagesMap;
}

export const useUnreadMessagesCounter = (): UnreadMessagesStats => {
  const { rooms } = useStoreConsole();
  const roomsData = rooms?.rooms || {};

  const unreadByRoom: UnreadMessagesMap = {};
  let totalCount = 0;

  Object.entries(roomsData).forEach(([roomJid, room]: [string, IRoom]) => {
    const unreadCount = room.unreadMessages || 0;
    if (unreadCount > 0) {
      unreadByRoom[roomJid] = unreadCount;
      totalCount += unreadCount;
    }
  });

  useEffect(() => {}, [rooms.rooms]);

  return {
    hasUnread: totalCount > 0,
    totalCount,
    unreadByRoom,
  };
};
