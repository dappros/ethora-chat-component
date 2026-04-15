import { ApiRoom, IRoom } from '../types/types';
import { ethoraLogger } from './ethoraLogger';

export const createRoomFromApi = (
  room: ApiRoom,
  service: string = 'conference.dev.xmpp.ethoradev.com',
  usersArrayLength: number = 0
): IRoom => {
  try {
    const members = Array.isArray(room?.members) ? room.members : [];
    const roomData: IRoom = {
      ...room,
      jid: room?.name ? `${room.name}@${service}` : '',
      name: room?.title || '',
      title: room?.title || '',
      members,
      usersCnt: Number(members.length || usersArrayLength + 1),
      messages: [],
      isLoading: false,
      roomBg: null,
      icon: room?.picture !== 'none' ? room?.picture : null,
      unreadMessages: 0,
      unreadCapped: false,
      lastViewedTimestamp: 0,
      historyPreloadState: 'idle',
    };
    return roomData;
  } catch (error) {
    ethoraLogger.log(error);
    return null;
  }
};
