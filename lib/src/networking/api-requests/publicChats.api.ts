import http from '../apiClient';
import { store } from '../../roomStore';

/** One entry of GET /v1/chats/public: a chat anyone in the app may join. */
export interface PublicChat {
  /** Room name: the local part of its JID. */
  name: string;
  title: string;
  description: string;
  picture: string;
  e2ee: boolean;
}

export interface PublicChatsPage {
  items: PublicChat[];
  total: number;
  offset: number;
  limit: number;
  /** Server rows consumed so far, not counting hidden ones. */
  nextOffset: number;
}

// The endpoint rejects anything above 50 with a validation error.
export const PUBLIC_CHATS_PAGE_SIZE = 50;

interface RawPublicChat {
  name?: string;
  title?: string;
  description?: string;
  picture?: string;
  type?: string;
  e2ee?: boolean;
  reported?: boolean;
}

export async function getPublicChats({
  offset = 0,
  limit = PUBLIC_CHATS_PAGE_SIZE,
  signal,
}: {
  offset?: number;
  limit?: number;
  signal?: AbortSignal;
} = {}): Promise<PublicChatsPage> {
  const token = store.getState().chatSettingStore.user?.token || '';
  const response = await http.get('/v1/chats/public', {
    params: { limit: Math.min(limit, PUBLIC_CHATS_PAGE_SIZE), offset },
    headers: { Authorization: token },
    signal,
  });

  const data = response?.data || {};
  const raw: RawPublicChat[] = Array.isArray(data.items) ? data.items : [];

  return {
    // A chat that has been reported is not one to advertise in a directory.
    items: raw
      .filter((chat) => chat.name && !chat.reported)
      .map((chat) => ({
        name: String(chat.name),
        title: String(chat.title || '').trim(),
        description: String(chat.description || '').trim(),
        picture: String(chat.picture || ''),
        e2ee: Boolean(chat.e2ee),
      })),
    total: Number(data.total) || 0,
    offset: Number(data.offset) || offset,
    limit: Number(data.limit) || limit,
    nextOffset: offset + raw.length,
  };
}
