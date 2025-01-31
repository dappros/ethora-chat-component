import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { setCurrentRoom } from '../roomStore/roomsSlice';
import { IConfig, IRoom } from '../types/types';

export const useRoomUrl = (
  activeRoomJID: string,
  roomsList: Record<string, IRoom>,
  config: IConfig
) => {
  const dispatch = useDispatch();

  useEffect(() => {
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
      if (config?.setRoomJidInPath) {
        const searchParams = new URLSearchParams(window.location.search);
        searchParams.delete('chatId');

        const newUrl = `${window.location.pathname}?${searchParams.toString()}`;
        window.history.pushState(null, '', newUrl);
      }
    };
  }, [activeRoomJID, roomsList?.length]);
};
