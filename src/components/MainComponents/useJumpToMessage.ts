import {
  MutableRefObject,
  RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../roomStore';
import { clearPendingJump } from '../../roomStore/roomsSlice';
import { IMessage } from '../../types/types';
import { MESSAGE_HIGHLIGHT_CLASS } from '../../styles/classNames';
import { useOptionalToast } from '../../context/ToastContext';
import { useT } from '../../i18n/useT';

// How far back a jump will page before giving up, and how long a request may
// stay alive at all (a room that never finishes opening must not leave one
// armed to fire at some unrelated later moment).
const MAX_HISTORY_PAGES = 25;
const PAGE_SIZE = 50;
const JUMP_TTL_MS = 30_000;
// How long after a page request resolves the oldest message must stay the
// same before the archive is called exhausted: the delivered messages reach
// the list a beat AFTER the request's promise resolves, so an immediate
// comparison reads the old list.
const EXHAUSTED_GRACE_MS = 1500;
// Everything above the target must be mounted for it to be scrollable to, so
// the window is widened to it plus this much, to leave room around it.
const WINDOW_MARGIN = 15;

/** Index of the message a jump names, matching any id it may be known by. */
export const findMessageIndex = (messages: IMessage[], ids: string[]): number =>
  messages.findIndex(
    (message) =>
      ids.includes(String(message.id)) ||
      (message.xmppId ? ids.includes(String(message.xmppId)) : false)
  );

interface Options {
  roomJID: string;
  /** The room's messages, in display order. */
  messages: IMessage[];
  /** How many of them are currently mounted (the newest N). */
  visibleCount: number;
  setRenderWindow: (size: number) => void;
  loadMoreMessages: (
    chatJID: string,
    max: number,
    amount?: number
  ) => Promise<void>;
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
  loadMoreMessages,
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
  const latest = useRef({ t, showToast, loadMoreMessages, setRenderWindow });
  latest.current = { t, showToast, loadMoreMessages, setRenderWindow };
  // The request whose scroll is already scheduled. Re-runs of the effect must
  // not schedule it a second time, nor cancel it.
  const scheduledAtRef = useRef<number | null>(null);
  // The oldest message id a finished page request started from. Compared on
  // the NEXT render, with the messages that request actually delivered: the
  // store update lands in the list a render after the request resolves, so
  // checking at resolve time read the old list and wrongly called the
  // archive exhausted.
  const awaitingCheckRef = useRef<string | null>(null);
  const graceElapsedRef = useRef(false);
  const timersRef = useRef<{
    frame?: number;
    settle?: ReturnType<typeof setTimeout>;
    clear?: ReturnType<typeof setTimeout>;
    grace?: ReturnType<typeof setTimeout>;
  }>({});
  const [tick, setTick] = useState(0);

  useEffect(
    () => () => {
      const timers = timersRef.current;
      if (timers.frame) cancelAnimationFrame(timers.frame);
      if (timers.settle) clearTimeout(timers.settle);
      if (timers.clear) clearTimeout(timers.clear);
      if (timers.grace) clearTimeout(timers.grace);
    },
    []
  );

  // A new request starts its own page budget.
  useEffect(() => {
    attemptsRef.current = 0;
    awaitingCheckRef.current = null;
    graceElapsedRef.current = false;
  }, [jump?.at]);

  useEffect(() => {
    if (!jump || jump.roomJID !== roomJID) return;
    isUserScrolledUpRef.current = true;

    const finish = (reached: boolean) => {
      dispatch(clearPendingJump());
      if (!reached) {
        const { t, showToast } = latest.current;
        showToast?.({
          id: 'jump-to-message-missing',
          title: t('search.messages.title'),
          message: t('search.messages.notFound'),
          type: 'info',
        });
      }
    };

    if (Date.now() - jump.at > JUMP_TTL_MS) {
      finish(false);
      return;
    }

    const index = findMessageIndex(messages, jump.ids);

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
            2000
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

    // A page finished and the oldest message is still the one it started
    // from: there is nothing older to fetch, so the target is not in the
    // history and paging again would repeat the same empty request.
    if (awaitingCheckRef.current !== null) {
      if (awaitingCheckRef.current !== String(firstReal.id)) {
        // The page arrived: keep going from the new oldest message.
        awaitingCheckRef.current = null;
        graceElapsedRef.current = false;
        if (timersRef.current.grace) clearTimeout(timersRef.current.grace);
      } else if (graceElapsedRef.current) {
        finish(false);
        return;
      } else {
        // Nothing new YET; wait out the grace period before concluding.
        return;
      }
    }

    if (attemptsRef.current >= MAX_HISTORY_PAGES || historyComplete) {
      finish(false);
      return;
    }

    attemptsRef.current += 1;
    loadingRef.current = true;
    const firstIdBefore = String(firstReal.id);

    latest.current
      .loadMoreMessages(roomJID, PAGE_SIZE, Number(firstReal.id))
      .catch(() => undefined)
      .finally(() => {
        loadingRef.current = false;
        awaitingCheckRef.current = firstIdBefore;
        graceElapsedRef.current = false;
        timersRef.current.grace = setTimeout(() => {
          graceElapsedRef.current = true;
          setTick((value) => value + 1);
        }, EXHAUSTED_GRACE_MS);
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
