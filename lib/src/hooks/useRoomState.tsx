import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../roomStore';

const EMPTY_ROOMS: RootState['rooms']['rooms'] = {};
const EMPTY_MESSAGES: RootState['rooms']['rooms'][string]['messages'] = [];

export const useRoomState = (roomJID?: string) => {
  const safeRoomJID = typeof roomJID === 'string' ? roomJID : null;
  const room = useSelector(
    (state: RootState) =>
      safeRoomJID ? state.rooms?.rooms?.[safeRoomJID] : undefined
  );
  const roomsList = useSelector(
    (state: RootState) =>
      state.rooms?.rooms && typeof state.rooms.rooms === 'object'
        ? state.rooms.rooms
        : EMPTY_ROOMS
  );
  const activeRoomJID = useSelector(
    (state: RootState) =>
      typeof state.rooms?.activeRoomJID === 'string'
        ? state.rooms.activeRoomJID
        : null
  );
  const editAction = useSelector((state: RootState) => state.rooms.editAction);
  const globalLoading = useSelector(
    (state: RootState) => state.rooms.isLoading
  );
  const loading = useSelector(
    (state: RootState) =>
      (typeof state.rooms?.activeRoomJID === 'string'
        ? state.rooms?.rooms?.[state.rooms.activeRoomJID]?.isLoading
        : false) || false
  );
  const loadingText = useSelector(
    (state: RootState) => state.rooms.loadingText
  );
  const usersSet = useSelector((state: RootState) => state.rooms.usersSet);

  const roomMessages = useMemo(
    () =>
      activeRoomJID && Array.isArray(roomsList[activeRoomJID]?.messages)
        ? roomsList[activeRoomJID].messages
        : EMPTY_MESSAGES,
    [roomsList, activeRoomJID]
  );

  return {
    room,
    roomsList,
    activeRoomJID,
    editAction,
    globalLoading,
    loadingText,
    loading,
    roomMessages,
    usersSet,
  };
};
