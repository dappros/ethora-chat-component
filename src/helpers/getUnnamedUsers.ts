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

  return [...uniqueUsers].filter((user) =>
    user?.name.toLowerCase().includes('deleted')
  );
};

export const fixUnnamedArrayFromApi = async (unnamedUsers: IUser[]) => {};
