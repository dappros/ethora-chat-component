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
      // Already there (a Forward to this room, or a deep link): pushing again
      // would stack a second entry for it and Back would seem to do nothing.
      if (searchParams.get('chatId') !== chatJidUrl) {
        searchParams.set('chatId', chatJidUrl);
        const newUrl = `${window.location.pathname}?${searchParams.toString()}`;
        window.history.pushState(null, '', newUrl);
      }
    } else if (!activeRoomJID && Object.values(roomsList).length > 0) {
      dispatch(setCurrentRoom({ roomJID: roomsList[0]?.jid }));
    }

    return () => {
      if (config?.setRoomJidInPath && typeof window !== "undefined") {
        const searchParams = new URLSearchParams(window.location.search);
        searchParams.delete('chatId');

        const newUrl = `${window.location.pathname}?${searchParams.toString()}`;
        // Replace, not push: closing or switching a room must not add a
        // history entry of its own, or Back would land on that entry and look
        // stuck (and an opened room would stack two entries per switch).
        window.history.replaceState(null, '', newUrl);
      }
    };
  }, [activeRoomJID]);
};
