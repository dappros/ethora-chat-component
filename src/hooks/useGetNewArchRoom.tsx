import { useCallback } from 'react';
import { useAppDispatch } from './hooks';
import { useXmppClient } from '../context/xmppProvider';
import { createRoomFromApi } from '../helpers/createRoomFromApi';
import { getRooms } from '../networking/api-requests/rooms.api';
import {
  addRoomViaApi,
  setIsLoading,
  updateUsersSet,
} from '../roomStore/roomsSlice';
import { ApiRoom } from '../types/types';

const useGetNewArchRoom = () => {
  const { client } = useXmppClient();
  const dispatch = useAppDispatch();

  const syncRooms = useCallback(
    async (client: any, config: any): Promise<ApiRoom[]> => {
      const rooms = await getRooms();
      rooms?.items?.forEach((room) => {
        dispatch(
          addRoomViaApi({
            room: createRoomFromApi(room, config?.xmppSettings?.conference),
            xmpp: client,
          })
        );
      });
      dispatch(setIsLoading({ loading: false, loadingText: undefined }));
      dispatch(updateUsersSet({ rooms: rooms.items }));
      return rooms?.items || [];
    },
    [dispatch]
  );

  return syncRooms;
};

export default useGetNewArchRoom;
