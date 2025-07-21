import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useXmppClient } from '../../../context/xmppProvider';
import useGetNewArchRoom from '../../../hooks/useGetNewArchRoom';
import { setIsLoading } from '../../../roomStore/roomsSlice';
import { IMessage, IRoom, IConfig } from '../../../types/types';

const countUndefinedText = (arr: IMessage[]) =>
  arr.filter((item) => item?.body === undefined)?.length;

export const useRoomInitialization = (
  activeRoomJID: string,
  roomsList: Record<string, IRoom>,
  config: IConfig,
  messageLength: number
) => {
  const { client } = useXmppClient();
  const dispatch = useDispatch();

  const syncRooms = useGetNewArchRoom();

  useEffect(() => {
    const getDefaultHistory = async () => {
      if (!client) return;
      dispatch(setIsLoading({ loading: true, chatJID: activeRoomJID }));
      const res = await client.getHistoryStanza(activeRoomJID, 30);
      if (res && countUndefinedText(res) > 0) {
        dispatch(setIsLoading({ loading: false, chatJID: activeRoomJID }));
        // make it more optimized
        await client.getHistoryStanza(
          activeRoomJID,
          20 + countUndefinedText(res),
          Number(res[0].id)
        );
      }
      dispatch(
        setIsLoading({
          loading: false,
          chatJID: activeRoomJID,
          loadingText: undefined,
        })
      );
    };

    if (client && config?.defaultRooms) {
      const allExist = config?.defaultRooms.every(
        (room) => roomsList[room.jid] !== undefined
      );
      if (roomsList && !allExist) {
        config?.defaultRooms.map(async (room) => {
          client.presenceInRoomStanza(room.jid);
        });
        if (config?.newArch) {
          // syncRooms(client, config);
        } else {
          client.getRoomsStanza();
        }
      }
    }
  }, [activeRoomJID, Object.keys(roomsList).length]);
};
