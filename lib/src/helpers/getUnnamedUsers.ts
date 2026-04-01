import { getUserByXmppUsername } from '../networking/api-requests/roomMembers.api';
import { store } from '../roomStore';
import { IMessage, IUser, RoomMember } from '../types/types';

function getUniqueUsers(messages: IMessage[]): Set<IUser> {
  const userMap = new Map<string, IUser>();

  messages.forEach(({ user }) => {
    if (!userMap.has(user.id)) {
      userMap.set(user.id, user);
    }
  });

  return new Set(userMap.values());
}

export const getUnnamedUsers = (messages: IMessage[]): IUser[] => {
  const uniqueUsers = getUniqueUsers(messages);

  return [...uniqueUsers].filter((user) => {
    const name = typeof user?.name === 'string' ? user.name.toLowerCase() : '';
    return name.includes('deleted');
  });
};

export const fixUnnamedArrayFromApi = async (
  unnamedUsers: IUser[]
): Promise<RoomMember[]> => {
  const fetchedUsers = await Promise.all(
    unnamedUsers.map(async (user) => {
      const apiUser = await getUserByXmppUsername(
        user.id,
        store.getState().chatSettingStore.user.token
      );
      return apiUser;
    })
  );

  return fetchedUsers;
};
