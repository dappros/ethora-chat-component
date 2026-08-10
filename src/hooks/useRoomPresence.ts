import { useSelector } from 'react-redux';
import { RootState } from '../roomStore';

const EMPTY: string[] = [];

/**
 * xmppUsernames currently ONLINE (available MUC presence) in the given room.
 * Populated from the room's presence stanzas: an available presence marks a
 * user online; a `type='unavailable'` presence marks them offline. When you
 * join a room the server sends the presence of everyone already online, so the
 * list is correct from the first render and updates live as users come/go.
 */
export const useRoomPresence = (roomJID?: string): string[] =>
  useSelector((s: RootState) =>
    roomJID ? s.rooms.presenceByRoom?.[roomJID] ?? EMPTY : EMPTY
  );

/** Whether a specific member (by xmppUsername) is currently online in the room. */
export const useIsUserOnline = (
  roomJID?: string,
  xmppUsername?: string
): boolean =>
  useSelector(
    (s: RootState) =>
      !!roomJID &&
      !!xmppUsername &&
      (s.rooms.presenceByRoom?.[roomJID] ?? EMPTY).includes(xmppUsername)
  );
