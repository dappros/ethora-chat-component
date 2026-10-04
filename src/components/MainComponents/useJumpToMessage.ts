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
  PendingJump,
  clearJumpWindow,
  clearPendingJump,
  showArchivedMessage,
} from '../../roomStore/roomsSlice';
import { IMessage } from '../../types/types';
import { HIGHLIGHT_MS, MESSAGE_HIGHLIGHT_CLASS } from '../../styles/classNames';
import { useOptionalToast } from '../../context/ToastContext';
import { useT } from '../../i18n/useT';
import {
  CONTENT_MATCH_WINDOW_MS,
  JumpContent,
} from '../../helpers/jumpWindow';
import {
  ownerThreadFor,
  replyParentId,
  useJumpThread,
} from '../../helpers/jumpThread';

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
// A target already in the store and at most this far from the newest message is
// reached by the existing path (scroll, widen the render window). Anything
// farther is fetched as a small window around it instead: mounting and
// re-merging a thousand rows to reach it is what made a far jump lag.
export const NEAR_LIVE_MESSAGES = 300;

// A jump into a room that is still opening waits this long for its live list
// before it stops waiting for it and asks the archive directly.
const ROOM_OPENING_GRACE_MS = 4000;
// Pause between checks while waiting for a room that is still opening, and how
// many times a window request that could not be asked is repeated meanwhile.
const ROOM_OPENING_POLL_MS = 700;
const MAX_WINDOW_RETRIES = 6;

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

/**
 * How the attempt to open a window around the target went:
 *  - found: the window is in the store; the list now renders it;
 *  - missing: the server answered and the target is not in its archive;
 *  - unavailable: could not ask (no archive id, request failed): page instead.
 */
export type WindowFetchResult = 'found' | 'missing' | 'unavailable';

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
  /** `messages` is a jump window around an earlier target, not the live list. */
  jumpWindowActive?: boolean;
  /**
   * Opens a window around a far target (and puts it in the store). Omitted
   * where windows do not apply (threads); the paging path is used then.
   */
  fetchWindow?: (jump: PendingJump) => Promise<WindowFetchResult>;
  /**
   * Which list this instance is. A jump is fulfilled by exactly one list: the
   * main list, or the thread its target is a reply in. The other instances
   * stay inert for it, so one of them cannot give up (and show the archived
   * card) while the owner is still working.
   */
  scope?: 'main' | { threadId: string };
  /**
   * The room's messages BEFORE the main list's filter (which hides thread
   * replies). Lets the main list recognise a target that is a thread reply.
   */
  allMessages?: IMessage[];
  /**
   * Opens the thread a reply target belongs to (main list only). Resolves true
   * when the thread is open and owns the jump from now on.
   */
  resolveReply?: (jump: PendingJump, reply: IMessage) => Promise<boolean>;
  /**
   * The room is still opening (joining, loading its first history). While it
   * is, a request that cannot be answered yet is waited out, not counted as a
   * failure: the card is for "the server answered and the message is absent".
   */
  roomOpening?: boolean;
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
  jumpWindowActive = false,
  fetchWindow,
  scope = 'main',
  allMessages,
  resolveReply,
  roomOpening = false,
}: Options) {
  const dispatch = useDispatch();
  const t = useT();
  const toast = useOptionalToast();
  const showToast = toast?.showToast;
  const jump = useSelector((state: RootState) => state.rooms.pendingJump);
  const jumpThread = useJumpThread();
  const ownerThreadId = ownerThreadFor(jumpThread, jump?.at);
  const scopeThreadId = scope === 'main' ? null : scope.threadId;
  const isOwner =
    scopeThreadId === null
      ? ownerThreadId === null
      : ownerThreadId === scopeThreadId;

  const attemptsRef = useRef(0);
  const loadingRef = useRef(false);
  // Callbacks that change identity on render live in refs so they do not
  // retrigger the effect below: every retrigger used to run its cleanup, and
  // the cleanup cancelled the scroll this effect had just scheduled, so a
  // target that was already mounted was never scrolled to.
  const latest = useRef({
    t,
    showToast,
    fetchOlderPage,
    setRenderWindow,
    fetchWindow,
    resolveReply,
    allMessages,
    roomOpening,
  });
  latest.current = {
    t,
    showToast,
    fetchOlderPage,
    setRenderWindow,
    fetchWindow,
    resolveReply,
    allMessages,
    roomOpening,
  };
  const replyResolvedAtRef = useRef<number | null>(null);
  const windowRetriesRef = useRef(0);
  // Per request: whether a window was already tried, and whether the server
  // said the target does not exist.
  const windowTriedAtRef = useRef<number | null>(null);
  const windowMissingAtRef = useRef<number | null>(null);
  const currentJumpAtRef = useRef<number | null>(null);
  currentJumpAtRef.current = jump?.at ?? null;
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
    retry?: ReturnType<typeof setTimeout>;
  }>({});
  const [tick, setTick] = useState(0);

  useEffect(
    () => () => {
      const timers = timersRef.current;
      if (timers.frame) cancelAnimationFrame(timers.frame);
      if (timers.settle) clearTimeout(timers.settle);
      if (timers.retry) clearTimeout(timers.retry);
      if (timers.clear) {
        clearTimeout(timers.clear);
        clearInterval(
          timers.clear as unknown as ReturnType<typeof setInterval>
        );
      }
    },
    []
  );

  // A new request starts its own page budget.
  useEffect(() => {
    attemptsRef.current = 0;
    cursorRef.current = null;
    exhaustedRef.current = false;
    failuresRef.current = 0;
    windowRetriesRef.current = 0;
  }, [jump?.at]);

  useEffect(() => {
    if (!jump || jump.roomJID !== roomJID || !isOwner) return;
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

    // Waiting on something the store will not announce (a room still opening):
    // look again shortly. The TTL above bounds how long this can go on.
    const recheckSoon = () => {
      if (timersRef.current.retry) clearTimeout(timersRef.current.retry);
      timersRef.current.retry = setTimeout(
        () => setTick((value) => value + 1),
        ROOM_OPENING_POLL_MS
      );
    };

    const content: JumpContent = {
      createdAt: jump.createdAt,
      body: jump.body,
    };

    // A target that is a thread reply is not in this (main) list at all: it
    // lives in its parent's thread. Open that thread, which takes the jump over.
    if (
      scopeThreadId === null &&
      latest.current.resolveReply &&
      replyResolvedAtRef.current !== jump.at
    ) {
      const pool = latest.current.allMessages ?? messages;
      const rawIndex = findMessageIndex(pool, jump.ids, content);
      const raw = rawIndex >= 0 ? pool[rawIndex] : null;
      if (raw && replyParentId(raw)) {
        replyResolvedAtRef.current = jump.at;
        loadingRef.current = true;
        const requestedAt = jump.at;
        latest.current
          .resolveReply(jump, raw)
          .catch(() => false)
          .then((opened) => {
            loadingRef.current = false;
            if (currentJumpAtRef.current !== requestedAt) return;
            if (!opened) finish(false);
            else setTick((value) => value + 1);
          });
        return;
      }
    }

    const index = findMessageIndex(messages, jump.ids, content);

    const windowAvailable =
      Boolean(latest.current.fetchWindow) &&
      windowTriedAtRef.current !== jump.at;

    if (
      index >= 0 &&
      (jumpWindowActive ||
        messages.length - index <= NEAR_LIVE_MESSAGES ||
        !windowAvailable)
    ) {
      const fromEnd = messages.length - index;
      if (fromEnd > visibleCount) {
        // Re-enters this effect once the wider window has rendered.
        latest.current.setRenderWindow(fromEnd + WINDOW_MARGIN);
        return;
      }
      if (scheduledAtRef.current === jump.at) return;
      scheduledAtRef.current = jump.at;

      const targetId = String(messages[index].id);
      const findTarget = (): HTMLElement | null =>
        Array.from(
          containerRef.current?.querySelectorAll<HTMLElement>(
            '[data-message-id]'
          ) ?? []
        ).find((node) => node.getAttribute('data-message-id') === targetId) ??
        null;
      const scrollToTarget = () => {
        // Compared as strings instead of interpolated into a selector, so an
        // id with quotes or backslashes can never change what is matched.
        const element = findTarget();
        element?.scrollIntoView({ behavior: 'auto', block: 'center' });
        return element;
      };

      // The flash is started only once the rows are laid out and the scroll
      // has settled, and its clock starts then: rendering many rows blocks the
      // main thread, and a class added before that elapses unpainted. The node
      // is looked up again every tick because the list can re-render and
      // replace it; the class follows it for the rest of the flash.
      const flash = () => {
        const until = Date.now() + HIGHLIGHT_MS;
        let applied: HTMLElement | null = null;
        const apply = () => {
          const element = findTarget();
          if (element && element !== applied) {
            applied?.classList.remove(MESSAGE_HIGHLIGHT_CLASS);
            element.classList.add(MESSAGE_HIGHLIGHT_CLASS);
            applied = element;
          }
        };
        apply();
        const interval = setInterval(() => {
          if (Date.now() >= until) {
            clearInterval(interval);
            applied?.classList.remove(MESSAGE_HIGHLIGHT_CLASS);
            findTarget()?.classList.remove(MESSAGE_HIGHLIGHT_CLASS);
            return;
          }
          apply();
        }, 50);
        timersRef.current.clear = interval as unknown as ReturnType<
          typeof setTimeout
        >;
      };

      timersRef.current.frame = requestAnimationFrame(() => {
        const element = scrollToTarget();
        if (element) {
          // Two frames: layout and paint of what the scroll just brought in.
          requestAnimationFrame(() => requestAnimationFrame(flash));
          // Images and embeds above the target finish sizing after the first
          // scroll and push it off centre; settle once more.
          timersRef.current.settle = setTimeout(scrollToTarget, 300);
        }
        finish(Boolean(element));
      });
      return;
    }

    // A new request for a message outside the window now on screen: go back
    // to the live list first (this effect re-runs with it).
    if (jumpWindowActive) {
      dispatch(clearJumpWindow());
      return;
    }

    // Not loaded, or loaded but far back. An empty list means the room is
    // still opening: give its live list a moment (the target is usually in it),
    // then ask the archive directly rather than wait for a history that can
    // take ten seconds. The TTL above bounds all of it.
    if (loadingRef.current) return;
    if (
      messages.length === 0 &&
      (!latest.current.fetchWindow ||
        (latest.current.roomOpening &&
          Date.now() - jump.at < ROOM_OPENING_GRACE_MS))
    ) {
      recheckSoon();
      return;
    }

    if (windowMissingAtRef.current === jump.at && index < 0) {
      finish(false);
      return;
    }

    // Fetch only a window around the target instead of paging the whole
    // stretch of history between it and the live tail.
    if (windowAvailable && latest.current.fetchWindow) {
      windowTriedAtRef.current = jump.at;
      loadingRef.current = true;
      const requestedAt = jump.at;
      latest.current
        .fetchWindow(jump)
        .catch((): WindowFetchResult => 'unavailable')
        .then((result) => {
          loadingRef.current = false;
          if (currentJumpAtRef.current !== requestedAt) return;
          if (result === 'missing') windowMissingAtRef.current = requestedAt;
          if (
            result === 'unavailable' &&
            latest.current.roomOpening &&
            windowRetriesRef.current < MAX_WINDOW_RETRIES
          ) {
            // Could not ask yet (connection or room still coming up): ask
            // again, instead of falling back to paging a room with no history.
            windowRetriesRef.current += 1;
            windowTriedAtRef.current = null;
            recheckSoon();
            return;
          }
          setTick((value) => value + 1);
        });
      return;
    }

    if (messages.length === 0) {
      recheckSoon();
      return;
    }

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
          // A room that is still opening cannot answer yet: that is not the
          // history being unreachable, so it does not count.
          if (latest.current.roomOpening) {
            recheckSoon();
            return;
          }
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
    jumpWindowActive,
    tick,
    isOwner,
    scopeThreadId,
    containerRef,
    isUserScrolledUpRef,
    dispatch,
  ]);
}
