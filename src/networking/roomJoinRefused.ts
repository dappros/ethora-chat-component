import { Element } from 'ltx';
import { store } from '../roomStore';
import { deleteRoom, setCurrentRoom } from '../roomStore/roomsSlice';
import { getRooms, invalidateRoomsCache } from './api-requests/rooms.api';
import { isLikelyMucJid } from '../helpers/isLikelyMucJid';
import { ethoraLogger } from '../helpers/ethoraLogger';

/**
 * A room the user was removed from while offline.
 *
 * Removal makes the user an `outcast` of the room. When they are in the room
 * at that moment the server's kick presence removes it (onRoomKicked). When
 * they are not, the room stays in the persisted list, every join comes back
 * as a presence error with <forbidden/>, and nothing else removes it.
 *
 * A refused join alone is not enough to drop a room: a member whose MUC
 * affiliation has not been written yet is refused the same way. So the
 * refusal only triggers a fresh, uncached GET /chats/my, and the room is
 * dropped only when the server no longer lists it for this user.
 */

const STANZAS_NS = 'urn:ietf:params:xml:ns:xmpp-stanzas';
// One check per room per window: a room the server still lists keeps being
// refused until its affiliation is fixed, and must not cost a request each time.
const RECHECK_MS = 60_000;

const lastCheck = new Map<string, number>();
const inflight = new Set<string>();

const isForbidden = (stanza: Element): boolean => {
  const error = stanza.getChild('error');
  if (!error) return false;
  return !!(
    error.getChild('forbidden', STANZAS_NS) || error.getChild('forbidden')
  );
};

const dropRoom = (roomJid: string) => {
  const state = store.getState().rooms;
  if (!state.rooms[roomJid]) return;
  store.dispatch(deleteRoom({ jid: roomJid }));
  if (state.activeRoomJID === roomJid) {
    const next = Object.keys(state.rooms).find((jid) => jid !== roomJid) || null;
    store.dispatch(setCurrentRoom({ roomJID: next }));
  }
};

const checkRoom = async (roomJid: string): Promise<void> => {
  if (inflight.has(roomJid)) return;
  const last = lastCheck.get(roomJid);
  if (last && Date.now() - last < RECHECK_MS) return;
  lastCheck.set(roomJid, Date.now());
  inflight.add(roomJid);
  try {
    invalidateRoomsCache();
    const response = await getRooms();
    // A failed or malformed answer says nothing about this room.
    if (response?.failed || !Array.isArray(response?.items)) return;
    const local = roomJid.split('@')[0];
    const listed = response.items.some(
      (item) => String(item?.name || '').split('@')[0] === local
    );
    if (listed) return;
    ethoraLogger.log('[XMPP] room join refused and not listed, dropping', roomJid);
    dropRoom(roomJid);
  } catch (error) {
    ethoraLogger.log('[XMPP] room access check failed', roomJid, error);
  } finally {
    inflight.delete(roomJid);
  }
};

/** Presence handler: a join refused with <forbidden/> starts the check. */
export const onRoomJoinRefused = (stanza: Element): void => {
  if (!stanza?.is?.('presence') || stanza.attrs?.type !== 'error') return;
  const from = typeof stanza.attrs?.from === 'string' ? stanza.attrs.from : '';
  const roomJid = from.split('/')[0];
  if (!roomJid || !isLikelyMucJid(roomJid)) return;
  if (!isForbidden(stanza)) return;
  if (!store.getState().rooms.rooms[roomJid]) return;
  if (!store.getState().chatSettingStore?.user?.token) return;
  void checkRoom(roomJid);
};

/** Test hook: forget the per-room check windows. */
export const resetRoomJoinRefusedState = () => {
  lastCheck.clear();
  inflight.clear();
};
