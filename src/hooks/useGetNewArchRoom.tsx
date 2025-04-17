import { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { createRoomFromApi } from '../helpers/createRoomFromApi';
import { getRooms } from '../networking/api-requests/rooms.api';
import { addRoomViaApi, updateUsersSet } from '../roomStore/roomsSlice';

const useGetNewArchRoom = () => {
  const dispatch = useDispatch();

  const syncRooms = useCallback(
    async (client: any, config: any) => {
      const rooms = await getRooms();
      rooms.items.forEach((room) => {
        dispatch(
          addRoomViaApi({
            room: createRoomFromApi(room, config?.xmppSettings?.conference),
            xmpp: client,
          })
        );
      });
      dispatch(updateUsersSet({ rooms: rooms.items }));
    },
    [dispatch]
  );

  return syncRooms;
};

export default useGetNewArchRoom;
