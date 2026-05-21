import { ApiRoom, IRoom, RoomMember } from '../types/types';
import { VITE_APP_XMPP_CONFERENCE } from '../config';
import { ethoraLogger } from './ethoraLogger';
import { store } from '../roomStore';

// Sentinels we never want to render as a chat title. The backend
// historically falls back to these when peer profile data is missing,
// which surfaces as a chat called "deleted" or "Deleted User" in the
// sidebar even though the other participant exists fine.
const BAD_TITLE_SENTINELS = new Set([
  '',
  'deleted',
  'deleted user',
  'unknown',
  'null',
]);

const formatPeerName = (member: RoomMember | undefined): string => {
  if (!member) return '';
  const first = String(member.firstName || '').trim();
  const last = String(member.lastName || '').trim();
  const composed = `${first} ${last}`.trim();
  if (composed) return composed;
  if (member.name && String(member.name).trim()) return String(member.name).trim();
  return '';
};

// For a 1:1 private chat the only useful "title" is the other party's
// display name. The /chats/private REST endpoint sometimes returns a
// generic / sentinel title (e.g. "deleted") when peer profile data isn't
// fully populated server-side. Derive the title from members[] so the
// sidebar always reads the peer's name.
const derivePrivateTitle = (
  apiRoom: ApiRoom,
  members: RoomMember[]
): string => {
  const apiTitle = String(apiRoom?.title || '').trim();
  if (apiTitle && !BAD_TITLE_SENTINELS.has(apiTitle.toLowerCase())) {
    return apiTitle;
  }

  const myXmpp = String(
    store.getState().chatSettingStore.user?.xmppUsername || ''
  );
  const myLocal = myXmpp.split('@')[0];

  const peer = members.find((member) => {
    const mLocal = String(member?.xmppUsername || '').split('@')[0];
    return mLocal && mLocal !== myLocal;
  });

  const peerName = formatPeerName(peer);
  if (peerName) return peerName;

  // Last-resort label so we never show the empty / sentinel string.
  return apiTitle || 'Private chat';
};

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

    const resolvedTitle =
      room?.type === 'private'
        ? derivePrivateTitle(room, members)
        : String(room?.title || '').trim();

    const roomData: IRoom = {
      ...room,
      jid: room?.name ? `${room.name}@${service}` : '',
      name: resolvedTitle,
      title: resolvedTitle,
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
