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

interface UseUnreadMessagesCounterProps {
  config: IConfig;
}

export const useUnreadMessagesCounter = ({
  config
}: UseUnreadMessagesCounterProps): UnreadMessagesStats => {
  const dispatch = useDispatch();
  const { client, initializeClient, setClient } = useXmppClient();

  const unreadByRoom = useSelector(
    (state: RootState) => state.rooms.unreadMessages.unreadByRoom
  );
  const totalCount = useSelector(
    (state: RootState) => state.rooms.unreadMessages.totalCount
  );
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

  useEffect(() => {
    useInitXmmpClient({ config });
  }, [config]);


  // const unreadByRoom: UnreadMessagesMap = {};
  // let totalCount = 0;

  Object.entries(rooms).forEach(([roomJid, room]: [string, IRoom]) => {
    const unreadCount = room.unreadMessages || 0;
    if (unreadCount > 0) {
      dispatch(setUnreadMessages({ roomJid: roomJid, unreadCount: unreadCount}));
    }
  });

  return {
    hasUnread: totalCount > 0,
    totalCount,
    unreadByRoom,
  };
};

export { useUnreadMessagesCounter as useUnread };
