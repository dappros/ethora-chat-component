import { useEffect } from 'react';
import { setIsLoading } from '../roomStore/roomsSlice';
import { useXmppClient } from '../context/xmppProvider';
import { IConfig, IRoom } from '../types/types';
import { useDispatch } from 'react-redux';

const countUndefinedText = (arr: { text?: string }[]) =>
  arr.filter((item) => item.text === undefined).length;

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
      const res = await client.getHistoryStanza(activeRoomJID, 30);
      if (res && countUndefinedText(res) > 0) {
        // make it more optimized
        await client.getHistoryStanza(
          activeRoomJID,
          20 + countUndefinedText(res),
          res[0].id
        );
      }
      dispatch(setIsLoading({ loading: false, chatJID: activeRoomJID }));
    };

    const initialPresenceAndHistory = async () => {
      if (!roomsList[activeRoomJID]) {
        // console.log('bug1'); here is bug when deleting last room
        client.presenceInRoomStanza(activeRoomJID);
        await client.getRoomsStanza();
        await getDefaultHistory();
      } else {
        getDefaultHistory();
      }
    };

    if (Object.keys(roomsList)?.length > 0) {
      if (
        activeRoomJID &&
        !roomsList?.[activeRoomJID] &&
        Object.keys(roomsList).length > 0
      ) {
        dispatch(setIsLoading({ loading: true, chatJID: activeRoomJID }));
        initialPresenceAndHistory();
      } else if (
        activeRoomJID &&
        messageLength < 1 &&
        !roomsList?.[activeRoomJID].historyComplete
      ) {
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
