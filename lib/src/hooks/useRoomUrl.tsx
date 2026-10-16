import { useEffect } from 'react';
import { useDispatch, useStore } from 'react-redux';
import { setCurrentRoom } from '../roomStore/roomsSlice';
import { RootState } from '../roomStore';
import { IConfig } from '../types/types';

export const useRoomUrl = (activeRoomJID: string, config: IConfig) => {
  const dispatch = useDispatch();
  const store = useStore<RootState>();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    // Read at the moment the effect runs; the effect only re-runs on a new
    // activeRoomJID, so the rooms map is not a dependency.
    const roomsList = store.getState().rooms.rooms;

    if (
      config?.setRoomJidInPath &&
      activeRoomJID &&
      typeof activeRoomJID === 'string'
    ) {
      const chatJidUrl = activeRoomJID.split('@')[0];

      const searchParams = new URLSearchParams(window.location.search);
      searchParams.set('chatId', chatJidUrl);

      const newUrl = `${window.location.pathname}?${searchParams.toString()}`;

      window.history.pushState(null, '', newUrl);
    } else if (!activeRoomJID && Object.values(roomsList).length > 0) {
      dispatch(setCurrentRoom({ roomJID: roomsList[0]?.jid }));
    }

    return () => {
      if (config?.setRoomJidInPath && typeof window !== "undefined") {
        const searchParams = new URLSearchParams(window.location.search);
        searchParams.delete('chatId');

        const newUrl = `${window.location.pathname}?${searchParams.toString()}`;
        window.history.pushState(null, '', newUrl);
      }
    };
  }, [activeRoomJID]);
};
