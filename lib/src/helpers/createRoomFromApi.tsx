import { ApiRoom, IRoom } from '../types/types';

export const createRoomFromApi = (
  room: ApiRoom,
  service: string = 'conference.dev.xmpp.ethoradev.com'
): IRoom => {
  try {
    const roomData: IRoom = {
      jid: `${room?.name}@${service}` || '',
      name: room?.title || '',
      title: room?.title || '',
      usersCnt: Number(room?.members?.length || 0),
      messages: [],
      isLoading: false,
      roomBg: null,
      icon: room?.picture !== 'none' ? room?.picture : null,
      unreadMessages: 0,
      lastViewedTimestamp: 0,
      // ...room,
    };
    return roomData;
  } catch (error) {
    console.log(error);
    return null;
  }
};
