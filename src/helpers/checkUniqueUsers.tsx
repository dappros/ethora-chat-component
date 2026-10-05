import { IMessage, RoomMember } from '../types/types';
import { getUnnamedUsers } from './getUnnamedUsers';
import { requestUsers } from './userResolver';

export const checkUniqueUsers = (messages: IMessage[]) => {
  const unnamedUsers = getUnnamedUsers(messages);

  if (unnamedUsers.length > 0) {
    // Resolved (debounced, de-duplicated, written to usersSet) by the shared
    // resolver; nothing to hand back to the caller.
    requestUsers(unnamedUsers.map((u) => u.id));
  }
  return undefined;
};

// Fire-and-forget: the shared resolver debounces, de-duplicates and inserts
// the profile into usersSet itself. Kept async/returning null so older
// call sites that await it keep working.
export const checkSingleUser = async (
  usersSet: Record<string, RoomMember>,
  xmppUsername: string
) => {
  if (!xmppUsername) {
    return null;
  }
  if (usersSet[xmppUsername]) return;
  requestUsers([xmppUsername]);
  return null;
};
