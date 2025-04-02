import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../roomStore';

export const useRoomState = (roomJID?: string) => {
  const room = useSelector(
    (state: RootState) => roomJID ? state.rooms.rooms[roomJID] : undefined
  );
  const roomsList = useSelector((state: RootState) => state.rooms.rooms);
  const activeRoomJID = useSelector(
    (state: RootState) => state.rooms.activeRoomJID
  );
  const editAction = useSelector((state: RootState) => state.rooms.editAction);
  const globalLoading = useSelector(
    (state: RootState) => state.rooms.isLoading
  );
  const loading = useSelector(
    (state: RootState) =>
      state.rooms.rooms[state.rooms.activeRoomJID]?.isLoading || false
  );
  const usersSet = useSelector((state: RootState) => state.rooms.usersSet);

  const roomMessages = useMemo(
    () => roomsList[activeRoomJID]?.messages || [],
    [roomsList, activeRoomJID]
  );

  return {
    room,
    roomsList,
    activeRoomJID,
    editAction,
    globalLoading,
    loading,
    roomMessages,
    usersSet,
  };
};
