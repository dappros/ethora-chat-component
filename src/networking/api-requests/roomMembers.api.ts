import http from '../apiClient';
import { RoomMember } from '../../types/types';

export async function getUserByXmppUsername(
  xmppUsername: string | undefined,
  token: string
): Promise<RoomMember | null> {
  if (!xmppUsername) {
    return null;
  }
  try {
    const res = await http.get<{ result: RoomMember }>(
      `/apps/users/${xmppUsername}`,
      {
        headers: { Authorization: token },
      }
    );
    return res.data.result;
  } catch (error) {
    console.error(`Failed to fetch user: ${xmppUsername}`, error);
    return null;
  }
}
