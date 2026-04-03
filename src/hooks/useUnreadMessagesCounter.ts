import { useEffect, useMemo, useRef, useState } from 'react';
import { IRoom } from '../types/types';
import { store } from '../roomStore';

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
}

const buildUnreadStats = (rooms: Record<string, IRoom>): UnreadMessagesStats => {
  const unreadByRoom: UnreadMessagesMap = {};
  const displayByRoom: UnreadMessagesDisplayMap = {};
  let totalCount = 0;
  let hasCappedUnread = false;

  Object.entries(rooms || {}).forEach(([roomJid, room]) => {
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

const buildUnreadSignature = (rooms: Record<string, IRoom>): string => {
  const entries = Object.entries(rooms || {})
    .map(([jid, room]) => `${jid}:${Number(room?.unreadMessages || 0)}:${room?.unreadCapped ? 1 : 0}`)
    .sort();

  return entries.join('|');
};

export const useUnreadMessagesCounter = (): UnreadMessagesStats => {
  const [stats, setStats] = useState<UnreadMessagesStats>(() =>
    buildUnreadStats(store.getState().rooms.rooms)
  );
  const signatureRef = useRef<string>(
    buildUnreadSignature(store.getState().rooms.rooms)
  );

  useEffect(() => {
    const unsubscribe = store.subscribe(() => {
      const rooms = store.getState().rooms.rooms;
      const signature = buildUnreadSignature(rooms);

      if (signatureRef.current === signature) {
        return;
      }

      signatureRef.current = signature;
      setStats(buildUnreadStats(rooms));
    });

    return unsubscribe;
  }, []);

  return useMemo(() => stats, [stats]);
};

export { useUnreadMessagesCounter as useUnread };
