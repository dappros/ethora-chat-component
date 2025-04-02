import { ApiRoom, IRoom } from '../types/types';

export const createRoomFromApi = (
  room: ApiRoom,
  service: string = 'conference.dev.xmpp.ethoradev.com',
  usersArrayLength: number = 0
): IRoom => {
  try {
    const roomData: IRoom = {
      ...room,
      jid: `${room?.name}@${service}` || '',
      name: room?.title || '',
      title: room?.title || '',
      usersCnt: Number(room?.members?.length || usersArrayLength + 1),
      messages: [],
      isLoading: false,
      roomBg: null,
      icon: room?.picture !== 'none' ? room?.picture : null,
      unreadMessages: 0,
      lastViewedTimestamp: 0,
    };
    return roomData;
  } catch (error) {
    console.log(error);
    return null;
  }
};
