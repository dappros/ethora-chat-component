import { RoomMember } from '../types/types';

export const createUserNameFromSetUser = (
  usersSet: Record<string, RoomMember>,
  userId: string
): string => {
  const user = usersSet[userId];

  if (!user) return 'Unknown User';

  const firstName = user.firstName?.trim() || '';
  const lastName = user.lastName?.trim() || '';

  return `${firstName} ${lastName}`.trim() || userId;
};
