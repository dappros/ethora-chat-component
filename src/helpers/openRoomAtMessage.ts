import { AppDispatch } from '../roomStore';
import { requestJumpToMessage, setCurrentRoom } from '../roomStore/roomsSlice';

type MaybeId = string | number | null | undefined;

/**
 * Every id a caller may know the target message by, without blanks and
 * duplicates. A notification, a push payload or a link can carry the client
 * (xmpp) message id, the archive stanza id or the stored message id, and the
 * jump matcher checks message.id and message.xmppId, so all of them go in.
 */
export const collectMessageIds = (...candidates: MaybeId[]): string[] => {
  const ids: string[] = [];
  for (const candidate of candidates) {
    const id = candidate === null || candidate === undefined ? '' : String(candidate).trim();
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
};

/**
 * Open a room and, when the caller knows which message it is about, ask the
 * mounted room to land on it (scroll if mounted, widen the window, or page
 * older history; see useJumpToMessage). With no message id this is just
 * "open the room".
 */
export const openRoomAtMessage = (
  dispatch: AppDispatch,
  roomJID: string,
  ...messageIds: MaybeId[]
): void => {
  if (!roomJID) return;
  dispatch(setCurrentRoom({ roomJID }));
  const ids = collectMessageIds(...messageIds);
  if (ids.length > 0) dispatch(requestJumpToMessage({ roomJID, ids }));
};
