import {
  MutableRefObject,
  RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../roomStore';
import {
  clearPendingJump,
  showArchivedMessage,
} from '../../roomStore/roomsSlice';
import { IMessage } from '../../types/types';
import { HIGHLIGHT_MS, MESSAGE_HIGHLIGHT_CLASS } from '../../styles/classNames';
import { useOptionalToast } from '../../context/ToastContext';
import { useT } from '../../i18n/useT';

// How far back a jump will page before giving up, and how long a request may
// stay alive at all (a room that never finishes opening must not leave one
// armed to fire at some unrelated later moment).
const MAX_HISTORY_PAGES = 40;
const PAGE_SIZE = 100;
const JUMP_TTL_MS = 60_000;
// A page request that times out is retried this many times in a row before
// the history is treated as unreachable.
const MAX_PAGE_FAILURES = 3;
// Everything above the target must be mounted for it to be scrollable to, so
// the window is widened to it plus this much, to leave room around it.
const WINDOW_MARGIN = 15;

// How far apart the archive's timestamp and the transcript's may be for the
// same message. They are recorded by different components, so they are not
// identical, but never more than a moment apart.
const CONTENT_MATCH_WINDOW_MS = 5000;

/**
 * Index of the message a jump names.
 *
 * By id first (message.id is the MAM stanza id for history, xmppId the client
 * message id). When the request has no id at all, which is common for archive
 * rows, by content: same text, sent within a few seconds of the same time.
 */
export const findMessageIndex = (
  messages: IMessage[],
  ids: string[],
  content?: { createdAt?: string; body?: string }
): number => {
  if (ids.length > 0) {
    const byId = messages.findIndex(
      (message) =>
        ids.includes(String(message.id)) ||
        (message.xmppId ? ids.includes(String(message.xmppId)) : false)
    );
    if (byId >= 0) return byId;
  }

  if (!content?.createdAt || !content.body) return -1;
  const wanted = new Date(content.createdAt).getTime();
  if (Number.isNaN(wanted)) return -1;
  const body = content.body.trim();
  return messages.findIndex((message) => {
    if (String(message.body ?? '').trim() !== body) return false;
    return (
      Math.abs(new Date(message.date).getTime() - wanted) <=
      CONTENT_MATCH_WINDOW_MS
    );
  });
};

/** What the server said about one page of older history. */
export interface OlderPage {
  /** False when the request failed or timed out. */
  ok: boolean;
  /**
   * The RSM `<first>` of the page: the id (microseconds) of the oldest ROW the
   * server returned. The next page continues from here. It is NOT the oldest
   * message that got displayed: a page can be made entirely of reactions,
   * system rows or deleted messages, display nothing, and still be followed
   * by plenty of history.
   */
  cursor?: number | null;
  /** The server's `<fin complete>`: there is nothing older. */
  complete?: boolean;
}

interface Options {
  roomJID: string;
  /** The room's messages, in display order. */
  messages: IMessage[];
  /** How many of them are currently mounted (the newest N). */
  visibleCount: number;
  setRenderWindow: (size: number) => void;
  /**
   * Fetches the next page of older history by MAM and resolves once that page
   * is in the store, with the server's own cursor for what it returned.
   */
  fetchOlderPage: (
    roomJID: string,
    before: number,
    max: number
  ) => Promise<OlderPage>;
  containerRef: RefObject<HTMLElement>;
  historyComplete?: boolean;
  /**
   * MessageList's "reader is away from the bottom" flag. Set for the length of
   * a jump: paging older history grows the message count, and with the flag
   * false the list reads that as new messages arriving and scrolls to the
   * bottom, undoing the jump the moment the target loads.
   */
  isUserScrolledUpRef: MutableRefObject<boolean>;
}

/**
 * Fulfils a pending "scroll to this message" request for this room.
 *
 * The target can be in one of three places, tried in this order:
 *  1. mounted: scroll to it and flash it;
 *  2. in the store but older than the render window: widen the window to
 *     include it, then scroll;
 *  3. not loaded at all: page older history from the server until it shows
 *     up, bounded by MAX_HISTORY_PAGES and by the end of the archive.
 * If it cannot be reached, say so rather than leaving the tap looking dead.
 */
export function useJumpToMessage({
  roomJID,
  messages,
  visibleCount,
  setRenderWindow,
  fetchOlderPage,
  containerRef,
  historyComplete,
  isUserScrolledUpRef,
}: Options) {
  const dispatch = useDispatch();
  const t = useT();
  const toast = useOptionalToast();
  const showToast = toast?.showToast;
  const jump = useSelector((state: RootState) => state.rooms.pendingJump);

  const attemptsRef = useRef(0);
  const loadingRef = useRef(false);
  // Callbacks that change identity on render live in refs so they do not
  // retrigger the effect below: every retrigger used to run its cleanup, and
  // the cleanup cancelled the scroll this effect had just scheduled, so a
  // target that was already mounted was never scrolled to.
  const latest = useRef({ t, showToast, fetchOlderPage, setRenderWindow });
  latest.current = { t, showToast, fetchOlderPage, setRenderWindow };
  // The request whose scroll is already scheduled. Re-runs of the effect must
  // not schedule it a second time, nor cancel it.
  const scheduledAtRef = useRef<number | null>(null);
  // Where the next page of older history starts: the server's cursor from the
  // previous page, or (first page) the oldest message already loaded.
  const cursorRef = useRef<number | null>(null);
  // The server has nothing older, or paging stopped making progress.
  const exhaustedRef = useRef(false);
  const failuresRef = useRef(0);
  const timersRef = useRef<{
    frame?: number;
    settle?: ReturnType<typeof setTimeout>;
    clear?: ReturnType<typeof setTimeout>;
  }>({});
  const [tick, setTick] = useState(0);

  useEffect(
    () => () => {
      const timers = timersRef.current;
      if (timers.frame) cancelAnimationFrame(timers.frame);
      if (timers.settle) clearTimeout(timers.settle);
      if (timers.clear) clearTimeout(timers.clear);
    },
    []
  );

  // A new request starts its own page budget.
  useEffect(() => {
    attemptsRef.current = 0;
    cursorRef.current = null;
    exhaustedRef.current = false;
    failuresRef.current = 0;
  }, [jump?.at]);

  useEffect(() => {
    if (!jump || jump.roomJID !== roomJID) return;
    isUserScrolledUpRef.current = true;

    const finish = (reached: boolean) => {
      dispatch(clearPendingJump());
      if (reached) return;

      // Not reachable in the transcript. If the request knows what the
      // message says (every search hit does), show IT, so the tap always ends
      // with the message in front of the reader and nothing that reads as an
      // error. Only a jump with no message to show (a notification or a link)
      // falls back to saying it could not be found.
      if (jump.preview) {
        dispatch(showArchivedMessage(jump.preview));
        return;
      }
      const { t, showToast } = latest.current;
      showToast?.({
        id: 'jump-to-message-missing',
        title: t('search.messages.title'),
        message: t('search.messages.notFound'),
        type: 'info',
      });
    };

    if (Date.now() - jump.at > JUMP_TTL_MS) {
      finish(false);
      return;
    }

    const index = findMessageIndex(messages, jump.ids, {
      createdAt: jump.createdAt,
      body: jump.body,
    });

    if (index >= 0) {
      const fromEnd = messages.length - index;
      if (fromEnd > visibleCount) {
        // Re-enters this effect once the wider window has rendered.
        latest.current.setRenderWindow(fromEnd + WINDOW_MARGIN);
        return;
      }
      if (scheduledAtRef.current === jump.at) return;
      scheduledAtRef.current = jump.at;

      const targetId = String(messages[index].id);
      const scrollToTarget = () => {
        const element = containerRef.current?.querySelector<HTMLElement>(
          `[data-message-id="${targetId.replace(/"/g, '\\"')}"]`
        );
        element?.scrollIntoView({ behavior: 'auto', block: 'center' });
        return element ?? null;
      };

      timersRef.current.frame = requestAnimationFrame(() => {
        const element = scrollToTarget();
        if (element) {
          element.classList.add(MESSAGE_HIGHLIGHT_CLASS);
          timersRef.current.clear = setTimeout(
            () => element.classList.remove(MESSAGE_HIGHLIGHT_CLASS),
            HIGHLIGHT_MS
          );
          // Images and embeds above the target finish sizing after the first
          // scroll and push it off centre; settle once more.
          timersRef.current.settle = setTimeout(scrollToTarget, 300);
        }
        finish(Boolean(element));
      });
      return;
    }

    // Not loaded. An empty list means the room is still opening; the TTL
    // above bounds the wait.
    if (messages.length === 0 || loadingRef.current) return;

    const firstReal = messages.find(
      (message) => message.id !== 'delimiter-new'
    );
    if (!firstReal) return;

    if (
      exhaustedRef.current ||
      historyComplete ||
      attemptsRef.current >= MAX_HISTORY_PAGES
    ) {
      finish(false);
      return;
    }

    // Page back through the archive by the server's own cursor. Each request
    // resolves only once its page is in the store, so there is nothing to wait
    // out and no guessing from the list: the answer to "is there more" is the
    // server's, not "did the oldest displayed message change".
    const before = cursorRef.current ?? Number(firstReal.id);
    attemptsRef.current += 1;
    loadingRef.current = true;

    latest.current
      .fetchOlderPage(roomJID, before, PAGE_SIZE)
      .catch((): OlderPage => ({ ok: false }))
      .then((page) => {
        loadingRef.current = false;
        if (!page.ok) {
          failuresRef.current += 1;
          if (failuresRef.current >= MAX_PAGE_FAILURES) {
            exhaustedRef.current = true;
          }
        } else {
          failuresRef.current = 0;
          if (page.complete) exhaustedRef.current = true;
          if (typeof page.cursor === 'number' && page.cursor < before) {
            cursorRef.current = page.cursor;
          } else if (!page.complete) {
            // Same cursor back: this page made no progress, and asking again
            // would repeat it forever.
            exhaustedRef.current = true;
          }
        }
        setTick((value) => value + 1);
      });
  }, [
    jump,
    roomJID,
    messages,
    visibleCount,
    historyComplete,
    tick,
    containerRef,
    isUserScrolledUpRef,
    dispatch,
  ]);
}
