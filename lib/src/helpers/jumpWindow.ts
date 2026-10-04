import type { HistoryWindowPage } from '../networking/xmppClient';
import type { JumpWindow } from '../roomStore/roomsSlice';
import { IMessage } from '../types/types';

/** Messages shown above / below the target when a window opens (tunable). */
export const JUMP_WINDOW_BEFORE = 10;
export const JUMP_WINDOW_AFTER = 10;
/** Page size for loading more once the reader scrolls toward either edge. */
export const JUMP_WINDOW_PAGE = 20;

/** The slice of the XMPP client the window helpers need. */
export interface HistoryWindowClient {
  getHistoryWindow: (
    chatJID: string,
    max: number,
    cursor: { before?: number; after?: number; start?: string; end?: string }
  ) => Promise<HistoryWindowPage>;
}

export type JumpWindowResult =
  /** The window around the target is ready to be shown. */
  | { status: 'found'; window: JumpWindow }
  /** The server answered, and the target is not in the archive. */
  | { status: 'missing' }
  /** No usable id, or a request failed: use the paging path instead. */
  | { status: 'unavailable' };

// MAM stanza ids are microsecond timestamps (16 digits today).
const MAM_ID = /^\d{13,}$/;

/**
 * How far apart the archive's timestamp and the transcript's may be for the
 * same message. They are recorded by different components, so they are not
 * identical, but never more than a moment apart.
 */
export const CONTENT_MATCH_WINDOW_MS = 5000;
/** Rows asked for per page while locating a row by its time. */
const TIME_LOOKUP_PAGE = 50;
/** Pages of the time range read before giving up (a very busy 10 seconds). */
const TIME_LOOKUP_MAX_PAGES = 4;

/** What a hit with no archive id can be located by. */
export interface JumpContent {
  createdAt?: string;
  body?: string;
}

export const mamIdCandidates = (ids: string[]): string[] =>
  Array.from(new Set(ids.map(String).filter((id) => MAM_ID.test(id))));

/**
 * Fetches about JUMP_WINDOW_BEFORE messages before the target, the target and
 * about JUMP_WINDOW_AFTER after it: two MAM queries in parallel (the target
 * itself comes with the "after" page, asked from one microsecond before it).
 * Nothing is written to the store here.
 */
export async function loadJumpWindow(
  client: HistoryWindowClient,
  roomJID: string,
  ids: string[],
  content?: JumpContent
): Promise<JumpWindowResult> {
  const candidates = mamIdCandidates(ids);
  if (candidates.length === 0) {
    return content?.createdAt && content.body
      ? loadJumpWindowByTime(client, roomJID, content)
      : { status: 'unavailable' };
  }

  // Almost always one candidate; a second is only tried when the first one is
  // not an archive id after all (the server then simply does not return it).
  for (const candidate of candidates) {
    const id = Number(candidate);
    const [older, newer] = await Promise.all([
      client.getHistoryWindow(roomJID, JUMP_WINDOW_BEFORE, { before: id }),
      client.getHistoryWindow(roomJID, JUMP_WINDOW_AFTER + 1, {
        after: id - 1,
      }),
    ]);
    if (!older.ok || !newer.ok) return { status: 'unavailable' };

    const target = newer.messages.find(
      (message) => String(message.id) === candidate
    );
    if (!target) continue;

    return {
      status: 'found',
      window: {
        roomJID,
        messages: [...older.messages, ...newer.messages],
        targetId: String(target.id),
        olderCursor: older.first ?? id,
        hasOlder: !older.complete && older.first !== null,
        newerCursor: newer.last ?? id,
        hasNewer: !newer.complete && newer.last !== null,
      },
    };
  }
  // None of the ids was an archive id. A hit that also knows its text and time
  // can still be located by them.
  if (content?.createdAt && content.body) {
    return loadJumpWindowByTime(client, roomJID, content);
  }
  return { status: 'missing' };
}

/**
 * For a hit with no usable archive id (older archive documents carry neither a
 * stanza id nor a message id): ask the server for the rows within a few
 * seconds of its timestamp (MAM start/end filter), find the one with the same
 * text, and continue exactly as the id-based window does with that row's id.
 * The server's answer is final: 'missing' only when it said the range holds no
 * such row.
 */
export async function loadJumpWindowByTime(
  client: HistoryWindowClient,
  roomJID: string,
  content: JumpContent
): Promise<JumpWindowResult> {
  const wanted = new Date(content.createdAt ?? '').getTime();
  const body = (content.body ?? '').trim();
  if (Number.isNaN(wanted) || !body) return { status: 'unavailable' };

  const start = new Date(wanted - CONTENT_MATCH_WINDOW_MS).toISOString();
  const end = new Date(wanted + CONTENT_MATCH_WINDOW_MS).toISOString();

  let after: number | undefined;
  let best: IMessage | null = null;
  for (let page = 0; page < TIME_LOOKUP_MAX_PAGES; page += 1) {
    const result = await client.getHistoryWindow(
      roomJID,
      TIME_LOOKUP_PAGE,
      after === undefined ? { start, end } : { start, end, after }
    );
    if (!result.ok) return { status: 'unavailable' };
    for (const message of result.messages) {
      if (String(message.body ?? '').trim() !== body) continue;
      const gap = Math.abs(new Date(message.date).getTime() - wanted);
      if (gap > CONTENT_MATCH_WINDOW_MS) continue;
      if (
        !best ||
        gap < Math.abs(new Date(best.date).getTime() - wanted)
      ) {
        best = message;
      }
    }
    if (best) break;
    if (result.complete || result.last === null) {
      return { status: 'missing' };
    }
    after = result.last;
  }
  if (!best) return { status: 'unavailable' };

  const id = String(best.id);
  if (!MAM_ID.test(id)) return { status: 'unavailable' };
  return loadJumpWindow(client, roomJID, [id]);
}

export interface OlderWindowPage {
  messages: IMessage[];
  olderCursor: number | null;
  hasOlder: boolean;
}

export interface NewerWindowPage {
  messages: IMessage[];
  newerCursor: number | null;
  hasNewer: boolean;
}

/** The page above the window; null when the request failed. */
export async function loadOlderWindowPage(
  client: HistoryWindowClient,
  window: JumpWindow
): Promise<OlderWindowPage | null> {
  if (window.olderCursor === null) {
    return { messages: [], olderCursor: null, hasOlder: false };
  }
  const page = await client.getHistoryWindow(window.roomJID, JUMP_WINDOW_PAGE, {
    before: window.olderCursor,
  });
  if (!page.ok) return null;
  // A page that does not move the cursor would be asked for again forever.
  const progressed = page.first !== null && page.first < window.olderCursor;
  return {
    messages: page.messages,
    olderCursor: progressed ? page.first : window.olderCursor,
    hasOlder: progressed && !page.complete,
  };
}

/** The page below the window; null when the request failed. */
export async function loadNewerWindowPage(
  client: HistoryWindowClient,
  window: JumpWindow
): Promise<NewerWindowPage | null> {
  if (window.newerCursor === null) {
    return { messages: [], newerCursor: null, hasNewer: false };
  }
  const page = await client.getHistoryWindow(window.roomJID, JUMP_WINDOW_PAGE, {
    after: window.newerCursor,
  });
  if (!page.ok) return null;
  const progressed = page.last !== null && page.last > window.newerCursor;
  return {
    messages: page.messages,
    newerCursor: progressed ? page.last : window.newerCursor,
    hasNewer: progressed && !page.complete,
  };
}
