import { ApiRoom, IRoom } from '../types/types';
import { VITE_APP_XMPP_CONFERENCE } from '../config';
import { ethoraLogger } from './ethoraLogger';

export const createRoomFromApi = (
  room: ApiRoom,
  service: string = VITE_APP_XMPP_CONFERENCE,
  usersArrayLength: number = 0
): IRoom => {
  try {
    const members = Array.isArray(room?.members) ? room.members : [];
    // Don't fabricate a "1 user" fallback when /chats/my doesn't surface
    // members. Header reads usersCnt directly; injecting 1 lies to the user
    // and races with XMPP's authoritative muc#roominfo_occupants update.
    // 0 means "unknown — wait for XMPP", which the header treats as empty.
    const apiMembersCount = members.length || usersArrayLength;
    const roomData: IRoom = {
      ...room,
      jid: room?.name ? `${room.name}@${service}` : '',
      name: room?.title || '',
      title: room?.title || '',
      members,
      usersCnt: Number(apiMembersCount),
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
