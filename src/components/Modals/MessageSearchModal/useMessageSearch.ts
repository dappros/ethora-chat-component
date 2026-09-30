import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  MESSAGE_SEARCH_PAGE_SIZE,
  MessageSearchHit,
  searchMessages,
} from '../../../networking/api-requests/messageSearch.api';

export const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

export type SearchScope = 'chat' | 'all';

interface State {
  status: 'idle' | 'loading' | 'loadingMore' | 'done' | 'error';
  items: MessageSearchHit[];
  total: number;
  /** Server rows consumed so far: the offset of the next page. */
  nextOffset: number;
}

type Action =
  | { type: 'reset' }
  | { type: 'start' }
  | { type: 'startMore' }
  | {
      type: 'page';
      items: MessageSearchHit[];
      total: number;
      nextOffset: number;
      append: boolean;
    }
  | { type: 'fail' };

const initial: State = { status: 'idle', items: [], total: 0, nextOffset: 0 };

const keyOf = (hit: MessageSearchHit) =>
  `${hit.chatId}:${hit.stanzaId || hit.messageId}`;

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'reset':
      return initial;
    case 'start':
      return { ...state, status: 'loading' };
    case 'startMore':
      return { ...state, status: 'loadingMore' };
    case 'page': {
      const seen = new Set(action.append ? state.items.map(keyOf) : []);
      const fresh = action.items.filter((hit) => !seen.has(keyOf(hit)));
      return {
        status: 'done',
        total: action.total,
        nextOffset: action.nextOffset,
        items: action.append ? [...state.items, ...fresh] : fresh,
      };
    }
    case 'fail':
      return { ...state, status: 'error' };
    default:
      return state;
  }
};

/**
 * Debounced, cancellable message search with paging.
 *
 * A newer query (or scope) aborts the request in flight, and a response that
 * arrives after it was superseded is dropped, so a slow answer to "he" can
 * never overwrite the results for "hello".
 */
export function useMessageSearch(
  query: string,
  scope: SearchScope,
  roomName?: string
) {
  const [state, dispatch] = useReducer(reducer, initial);
  const abortRef = useRef<AbortController | null>(null);
  const requestRef = useRef(0);
  const trimmed = query.trim();
  const chatId = scope === 'chat' ? roomName : undefined;
  const searchable =
    trimmed.length >= MIN_QUERY_LENGTH &&
    (scope === 'all' || Boolean(roomName));

  const run = useCallback(
    async (offset: number) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const id = ++requestRef.current;
      dispatch({ type: offset ? 'startMore' : 'start' });
      try {
        const page = await searchMessages({
          q: trimmed,
          chatId,
          offset,
          limit: MESSAGE_SEARCH_PAGE_SIZE,
          signal: controller.signal,
        });
        if (id !== requestRef.current) return;
        dispatch({
          type: 'page',
          items: page.items,
          total: page.total,
          nextOffset: page.nextOffset,
          append: offset > 0,
        });
      } catch (error) {
        if (id !== requestRef.current || controller.signal.aborted) return;
        dispatch({ type: 'fail' });
      }
    },
    [trimmed, chatId]
  );

  useEffect(() => {
    abortRef.current?.abort();
    if (!searchable) {
      requestRef.current += 1;
      dispatch({ type: 'reset' });
      return;
    }
    const timer = setTimeout(() => void run(0), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchable, run]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const loadMore = useCallback(() => {
    if (state.status !== 'done' || state.nextOffset >= state.total) return;
    void run(state.nextOffset);
  }, [run, state.status, state.nextOffset, state.total]);

  return {
    ...state,
    searchable,
    hasMore: state.nextOffset < state.total,
    loadMore,
    retry: () => void run(0),
  };
}
