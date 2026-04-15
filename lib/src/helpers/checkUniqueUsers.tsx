import { IMessage, RoomMember } from '../types/types';
import { fixUnnamedArrayFromApi, getUnnamedUsers } from './getUnnamedUsers';
import { getUserByXmppUsername } from '../networking/api-requests/roomMembers.api';
import { store } from '../roomStore';

export const checkUniqueUsers = (messages: IMessage[]) => {
  const unnamedUsers = getUnnamedUsers(messages);

  if (unnamedUsers.length > 0) {
    const getApiUsers = async () => {
      const fixedUsers = await fixUnnamedArrayFromApi(unnamedUsers);
      return fixedUsers;
    };
    const newUsers = getApiUsers();
    return newUsers;
  }
};

export const checkSingleUser = async (
  usersSet: Record<string, RoomMember>,
  xmppUsername: string
) => {
  if (!xmppUsername) {
    return null;
  }
  if (usersSet[xmppUsername]) return;

  const fixedUser = await getUserByXmppUsername(
    xmppUsername,
    store.getState().chatSettingStore.user.token
  );

  return fixedUser;
};
