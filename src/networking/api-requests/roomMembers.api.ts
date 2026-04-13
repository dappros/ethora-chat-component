import http from '../apiClient';
import { RoomMember } from '../../types/types';

export async function getUserByXmppUsername(
  xmppUsername: string,
  token: string
): Promise<RoomMember | null> {
  const normalizedXmppUsername = String(xmppUsername || '').trim();
  if (!normalizedXmppUsername || normalizedXmppUsername === 'undefined') {
    return null;
  }

  try {
    const res = await http.get<{ result: RoomMember }>(
      `/apps/users/${normalizedXmppUsername}`,
      {
        headers: { Authorization: token },
      }
    );
    return res.data.result;
  } catch (error) {
    console.error(`Failed to fetch user: ${normalizedXmppUsername}`, error);
    return null;
  }
}
