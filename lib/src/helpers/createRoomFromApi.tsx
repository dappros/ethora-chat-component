import { ApiRoom, IRoom, LastMessage, RoomMember } from '../types/types';
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

// `GET /v1/chats/my` embeds a flattened `lastMessage` doc per room (QA
// verified 2026-09-16: all 16 rooms carried one). Prod may not send it at
// all yet - every field here is optional and its absence must change
// nothing. Map it into the same LastMessage shape a live message already
// takes, so LastMessageItem can render either one without knowing which
// it got. This is only ever a SEED for the room-list preview: the caller
// (ChatRoomItem) uses it strictly while the room has no loaded messages
// yet, and stops reading it the moment a real message arrives - so a
// stale API value can never overwrite a newer live one.
const mapApiLastMessage = (
  apiLastMessage: ApiRoom['lastMessage'],
  roomJid: string
): LastMessage | undefined => {
  const body = String(apiLastMessage?.body || '').trim();
  if (!apiLastMessage || !body) return undefined;

  const senderName = `${apiLastMessage.senderFirstName || ''} ${
    apiLastMessage.senderLastName || ''
  }`.trim();

  return {
    id: apiLastMessage.messageId || apiLastMessage.stanzaId || '',
    xmppId: apiLastMessage.stanzaId,
    roomJid,
    body,
    date: apiLastMessage.createdAt,
    isDeleted: false,
    user: {
      id: apiLastMessage.fromUserId || apiLastMessage.from || '',
      name: senderName,
    },
  } as LastMessage;
};

export const createRoomFromApi = (
  room: ApiRoom,
  service: string = VITE_APP_XMPP_CONFERENCE,
  usersArrayLength: number = 0
): IRoom | null => {
  try {
    // A MUC room JID only ever exists as `<localpart>@<conference host>`.
    // `service` resolves to an empty string in this package's own build,
    // and several call sites pass `config?.xmppSettings?.conference` or
    // `client.conference` straight through before the XMPP session is
    // hydrated - both are `undefined` early in the lifecycle. The old
    // default-parameter fallback let that combine with `room.name` into
    // "<name>@", a JID with no domain: it has an '@' so it looks valid
    // enough, but no such room exists on the server. MAM returns nothing
    // and presence never resolves, so it renders forever as a duplicate
    // ghost row with no history and no "N online" line. Refuse to guess a
    // host, the same way toRoomJid() in isLikelyMucJid.ts does.
    if (!room?.name || !service) return null;

    const members = Array.isArray(room?.members) ? room.members : [];
    // Don't fabricate a "1 user" fallback when /chats/my doesn't surface
    // members. Header reads usersCnt directly; injecting 1 lies to the user
    // and races with XMPP's authoritative muc#roominfo_occupants update.
    // 0 means "unknown - wait for XMPP", which the header treats as empty.
    const apiMembersCount = members.length || usersArrayLength;

    const resolvedTitle =
      room?.type === 'private'
        ? derivePrivateTitle(room, members)
        : String(room?.title || '').trim();

    const jid = `${room.name}@${service}`;

    const roomData: IRoom = {
      ...room,
      jid,
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
      lastMessage: mapApiLastMessage(room?.lastMessage, jid),
    };
    return roomData;
  } catch (error) {
    ethoraLogger.log(error);
    return null;
  }
};
