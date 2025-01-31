import { useEffect } from 'react';
import { setIsLoading } from '../roomStore/roomsSlice';
import { useXmppClient } from '../context/xmppProvider';
import { IConfig, IRoom } from '../types/types';
import { useDispatch } from 'react-redux';

export const useRoomInitialization = (
  activeRoomJID: string,
  roomsList: Record<string, IRoom>,
  config: IConfig,
  messageLength: number
) => {
  const { client } = useXmppClient();
  const dispatch = useDispatch();

  useEffect(() => {
    const getDefaultHistory = async () => {
      dispatch(setIsLoading({ loading: true, chatJID: activeRoomJID }));
      await client.getHistoryStanza(activeRoomJID, 30);
      dispatch(setIsLoading({ loading: false, chatJID: activeRoomJID }));
    };

    const initialPresenceAndHistory = async () => {
      if (!roomsList[activeRoomJID]) {
        client.presenceInRoomStanza(activeRoomJID);
        await client.getRoomsStanza();
        await getDefaultHistory();
      } else {
        getDefaultHistory();
      }
    };

    dispatch(setIsLoading({ loading: true, chatJID: activeRoomJID }));

    if (Object.keys(roomsList)?.length > 0) {
      if (!roomsList?.[activeRoomJID] && Object.keys(roomsList).length > 0) {
        dispatch(setIsLoading({ loading: true, chatJID: activeRoomJID }));
        initialPresenceAndHistory();
      } else if (messageLength < 15) {
        getDefaultHistory();
      } else {
        dispatch(setIsLoading({ loading: false, chatJID: activeRoomJID }));
      }
    } else if (!roomsList?.[activeRoomJID]) {
      initialPresenceAndHistory();
    }

    if (config?.defaultRooms) {
      config?.defaultRooms.map((room) => {
        client.presenceInRoomStanza(room.jid);
      });
      client.getRoomsStanza();
      getDefaultHistory();
    }
  }, [activeRoomJID, Object.keys(roomsList).length]);
};
