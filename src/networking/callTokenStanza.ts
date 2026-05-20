import { Element } from 'ltx';
import { store } from '../roomStore';
import {
  setIncomingCallToken,
  setOutgoingCallToken,
} from '../roomStore/callSlice';

const MAX_CALL_TOKEN_AGE_MS = 5000;

const extractNumericTimestamp = (value?: string): number | null => {
  const source = String(value || '').trim();
  if (!source) return null;

  const direct = Number(source);
  if (Number.isFinite(direct) && direct > 0) {
    return source.length > 13 ? Number(source.slice(0, 13)) : direct;
  }

  const match = source.match(/\d{13,}/)?.[0];
  if (!match) return null;
  return Number(match.slice(0, 13));
};

const isFreshCallToken = (stanza: Element): boolean => {
  const stanzaId = stanza.getChild('stanza-id')?.attrs?.id;
  const createdTs = extractNumericTimestamp(stanzaId);
  if (!createdTs) return false;
  return Math.abs(Date.now() - createdTs) <= MAX_CALL_TOKEN_AGE_MS;
};

const resolveRoomByStanzaRoom = (roomAttr: string) => {
  const rooms = (store.getState().rooms.rooms || {}) as Record<
    string,
    { jid?: string; name?: string; type?: string; usersCnt?: number }
  >;
  const roomEntries = Object.values(rooms);

  const byName = roomEntries.find((room) => room?.name === roomAttr);
  if (byName) return byName;

  const byJid = rooms[roomAttr];
  if (byJid) return byJid;

  return null;
};

export const onCallTokenMessage = (stanza: Element): boolean => {
  if (!stanza?.is('message') || stanza?.attrs?.type !== 'chat') {
    return false;
  }

  const data = stanza.getChild('data');
  if (!data || data.attrs?.type !== 'call-token') {
    return false;
  }

  const videoCallsConfig = store.getState().chatSettingStore.config?.videoCalls;
  if (videoCallsConfig?.enabled !== true) {
    return true;
  }

  if (!isFreshCallToken(stanza)) {
    return true;
  }

  const token = String(data.attrs?.token || '').trim();
  const stanzaRoom = String(data.attrs?.room || '').trim();
  const stanzaKind = String(data.attrs?.kind || '').toLowerCase();
  const kind: 'audio' | 'video' = stanzaKind === 'audio' ? 'audio' : 'video';
  if (!token || !stanzaRoom) {
    return true;
  }

  const resolvedRoom = resolveRoomByStanzaRoom(stanzaRoom);
  const allowedRoomTypes = videoCallsConfig.allowedRoomTypes || ['private'];
  const usersCnt = Number(resolvedRoom?.usersCnt || 0);
  const isOneToOneLikeRoom = usersCnt > 0 && usersCnt <= 2;
  const isPrivateAllowed = allowedRoomTypes.includes('private');
  if (
    resolvedRoom?.type &&
    resolvedRoom.type !== 'private' &&
    !isOneToOneLikeRoom
  ) {
    return true;
  }

  if (resolvedRoom?.type === 'private' && !isPrivateAllowed) {
    return true;
  }

  if (
    !resolvedRoom?.type &&
    !stanzaRoom.includes('@') &&
    !isOneToOneLikeRoom
  ) {
    return true;
  }

  const roomJid =
    resolvedRoom?.jid || (stanzaRoom.includes('@') ? stanzaRoom : '');
  const roomName = resolvedRoom?.name || stanzaRoom;

  if (!roomJid) {
    return true;
  }

  const state = store.getState().call;
  const isOutgoingRoomMatch =
    state.direction === 'outgoing' &&
    (state.roomJid === roomJid || state.roomName === roomName);

  if (isOutgoingRoomMatch) {
    store.dispatch(setOutgoingCallToken({ roomJid, token }));
    return true;
  }

  store.dispatch(setIncomingCallToken({ roomJid, roomName, token, kind }));
  return true;
};
