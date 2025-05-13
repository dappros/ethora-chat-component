import { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { createRoomFromApi } from '../helpers/createRoomFromApi';
import { getRooms } from '../networking/api-requests/rooms.api';
import {
  addRoomViaApi,
  setIsLoading,
  updateUsersSet,
} from '../roomStore/roomsSlice';

const useGetNewArchRoom = () => {
  const dispatch = useDispatch();

  const syncRooms = useCallback(
    async (client: any, config: any) => {
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
    },
    [dispatch]
  );

  return syncRooms;
};

export default useGetNewArchRoom;
