import http from '../apiClient';
import { store } from '../../roomStore';

/**
 * GET /v2/apps/{appId}/messages/search: full-text / substring search over
 * the chat archive. For a user token the server restricts it to chats the
 * caller can see, so no client-side filtering is needed for privacy.
 */
export interface MessageSearchHit {
  /** The archive row's own id: the only identifier every hit is guaranteed to have. */
  id: string;
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
  /** Only messages from this user (a room member's `_id`). */
  fromUserId?: string;
  /** ISO 8601 bounds; the server rejects anything else. */
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

export const MESSAGE_SEARCH_PAGE_SIZE = 20;

type RawHit = Partial<Omit<MessageSearchHit, 'id'>> & {
  _id?: string;
  deletedAt?: string | null;
};

export async function searchMessages({
  q,
  chatId,
  fromUserId,
  since,
  until,
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
      params: {
        q,
        limit,
        offset,
        ...(chatId ? { chatId } : {}),
        ...(fromUserId ? { fromUserId } : {}),
        ...(since ? { since } : {}),
        ...(until ? { until } : {}),
      },
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
        id: String(hit._id ?? ''),
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

/**
 * A key that is unique per hit. stanzaId and messageId are NOT: on QA whole
 * pages of older hits come back with both empty, which made every React key
 * `chatId:` (rows were left behind when the list changed) and made a
 * duplicate check by those ids throw real hits away.
 */
export const hitKey = (hit: MessageSearchHit): string =>
  hit.id ||
  `${hit.chatId}:${hit.stanzaId}:${hit.messageId}:${hit.createdAt}:${hit.body.slice(0, 24)}`;
