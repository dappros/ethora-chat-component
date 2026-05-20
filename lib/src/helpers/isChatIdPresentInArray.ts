import { ApiRoom, IRoom } from '../types/types';

export function isChatIdPresentInArray(
  chatIdToFind: string,
  chatList: ApiRoom[] | { [jid: string]: IRoom } | IRoom[] | null | undefined
): boolean {
  if (!chatList || !chatIdToFind) {
    return false;
  }

  const list: Array<ApiRoom | IRoom> = Array.isArray(chatList)
    ? (chatList as Array<ApiRoom | IRoom>)
    : (Object.values(chatList) as IRoom[]);

  if (list.length === 0) {
    return false;
  }

  const fullJid = String(chatIdToFind).trim();
  const localPart = fullJid.split('@')[0].trim();

  for (const chatObject of list) {
    if (!chatObject || typeof chatObject !== 'object') continue;

    // Two shapes flow through this helper:
    //   - ApiRoom (raw /chats/my item): `name` is the room local-part (e.g.
    //     "646cc8dc..._69a637..."), no `jid` field.
    //   - IRoom (post-createRoomFromApi, in redux store): `name` is the
    //     display TITLE (the API's `name` was clobbered), and the actual
    //     local-part lives in `jid` ("local@conference.host").
    // Old logic only checked `chatObject.name === localPart`, which never
    // matches when an IRoom is passed in — the "Connecting…" stuck via
    // enableRoomsRetry (75s retry loop) was that mismatch firing every time.
    const candidateJid =
      typeof (chatObject as IRoom).jid === 'string'
        ? (chatObject as IRoom).jid
        : '';
    if (candidateJid && (candidateJid === fullJid || candidateJid.split('@')[0] === localPart)) {
      return true;
    }

    const candidateName =
      typeof (chatObject as { name?: unknown }).name === 'string'
        ? ((chatObject as { name: string }).name as string)
        : '';
    if (candidateName && candidateName === localPart) {
      return true;
    }
  }

  return false;
}
