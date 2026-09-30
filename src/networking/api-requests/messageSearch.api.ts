import http from '../apiClient';
import { store } from '../../roomStore';

/**
 * GET /v2/apps/{appId}/messages/search: full-text / substring search over
 * the chat archive. For a user token the server restricts it to chats the
 * caller can see, so no client-side filtering is needed for privacy.
 */
export interface MessageSearchHit {
  /** Room name, the local part of the room JID. */
  chatId: string;
  chatType: string;
  /** Full room JID. */
  room: string;
  /** Sender's full JID, WITH the xmpp host: `appId_userId@xmpp.host`. */
  from: string;
  fromUserId: string;
  body: string;
  messageId: string;
  stanzaId: string;
  createdAt: string;
}

export interface MessageSearchPage {
  items: MessageSearchHit[];
  /** Total matches on the server, not the size of this page. */
  total: number;
  offset: number;
  limit: number;
  /**
   * Where the next page starts. Counted in SERVER rows, not in `items`:
   * deleted messages are dropped from `items`, and paging by the filtered
   * count would re-request rows already seen.
   */
  nextOffset: number;
}

export interface SearchMessagesParams {
  q: string;
  /** Room name (local part of the JID). Omit to search every visible chat. */
  chatId?: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

export const MESSAGE_SEARCH_PAGE_SIZE = 20;

type RawHit = Partial<MessageSearchHit> & { deletedAt?: string | null };

export async function searchMessages({
  q,
  chatId,
  limit = MESSAGE_SEARCH_PAGE_SIZE,
  offset = 0,
  signal,
}: SearchMessagesParams): Promise<MessageSearchPage> {
  const state = store.getState().chatSettingStore;
  const appId = state.config?.appId;
  const token = state.user?.token || '';
  if (!appId) throw new Error('message_search_no_app_id');

  const response = await http.get(
    `/v2/apps/${encodeURIComponent(appId)}/messages/search`,
    {
      params: { q, limit, offset, ...(chatId ? { chatId } : {}) },
      headers: { Authorization: token },
      signal,
    }
  );

  const data = response?.data || {};
  const raw: RawHit[] = Array.isArray(data.items) ? data.items : [];

  return {
    // A deleted message is still in the archive with `deletedAt` set; showing
    // it would let a search resurrect text the author removed.
    items: raw
      .filter(
        (hit) => !hit.deletedAt && typeof hit.body === 'string' && hit.body
      )
      .map((hit) => ({
        chatId: String(hit.chatId ?? ''),
        chatType: String(hit.chatType ?? ''),
        room: String(hit.room ?? ''),
        from: String(hit.from ?? ''),
        fromUserId: String(hit.fromUserId ?? ''),
        body: hit.body as string,
        messageId: String(hit.messageId ?? ''),
        stanzaId: String(hit.stanzaId ?? ''),
        createdAt: String(hit.createdAt ?? ''),
      })),
    total: Number(data.total) || 0,
    offset: Number(data.offset) || offset,
    limit: Number(data.limit) || limit,
    nextOffset: offset + raw.length,
  };
}
