import { RefObject, useEffect, useLayoutEffect, useRef } from 'react';
import {
  anchorScrollDelta,
  pickAnchorRow,
  ScrollAnchor,
} from './scrollAnchor';

/** The reader counts as still after this long without scrolling. */
export const ANCHOR_IDLE_MS = 100;

const ROW_SELECTOR = '[data-message-id]';

interface Options {
  containerRef: RefObject<HTMLElement>;
  /** The element whose height changes as rows grow. */
  flowRef: RefObject<HTMLElement>;
  /** Identity changes whenever the mounted rows can change. */
  rows: unknown;
  /** True when the reader follows the bottom: nothing is anchored then. */
  isStuckToBottom: () => boolean;
}

function findRow(container: HTMLElement, id: string): HTMLElement | null {
  const rows = container.querySelectorAll<HTMLElement>(ROW_SELECTOR);
  for (const row of Array.from(rows)) {
    if (row.getAttribute('data-message-id') === id) return row;
  }
  return null;
}

/**
 * Keeps the rows the reader is looking at perfectly still while content is
 * added or resized above or below them (older history prepended, a jump
 * window paged either way, the render window widened, rows trimmed).
 *
 * - Just before a commit that can change the rows, the anchor is captured from
 *   the live DOM (the render phase still sees the previous layout).
 * - The layout effect puts it back before paint, by the anchor ROW's own
 *   movement, so a row that gained a date divider or header is absorbed too.
 * - Rows keep changing height after a commit (images, embeds, waveforms).
 *   Whenever the content resizes and the reader has been still for
 *   ANCHOR_IDLE_MS, the anchor is re-applied by a ResizeObserver. The anchor
 *   is re-taken ANCHOR_IDLE_MS after any scroll this hook did not make (the
 *   reader, a jump) and dropped while that scroll is going on.
 */
export function useScrollAnchor({
  containerRef,
  flowRef,
  rows,
  isStuckToBottom,
}: Options) {
  const stuckRef = useRef(isStuckToBottom);
  stuckRef.current = isStuckToBottom;

  const pendingRef = useRef<ScrollAnchor | null>(null);
  const restAnchorRef = useRef<ScrollAnchor | null>(null);
  const lastRowsRef = useRef<unknown>(rows);
  const ownTopRef = useRef<number | null>(null);
  const lastInputAtRef = useRef(0);

  const capture = (): ScrollAnchor | null => {
    const container = containerRef.current;
    if (!container || stuckRef.current()) return null;
    const viewTop = container.getBoundingClientRect().top;
    const rects = Array.from(
      container.querySelectorAll<HTMLElement>(ROW_SELECTOR)
    ).map((el) => {
      const r = el.getBoundingClientRect();
      return {
        id: el.getAttribute('data-message-id') ?? '',
        top: r.top,
        bottom: r.bottom,
      };
    });
    return pickAnchorRow(viewTop, viewTop + container.clientHeight, rects);
  };

  if (lastRowsRef.current !== rows) {
    lastRowsRef.current = rows;
    // The render phase still sees the previous commit's layout.
    pendingRef.current = capture();
  }

  const apply = (anchor: ScrollAnchor): boolean => {
    const container = containerRef.current;
    if (!container) return false;
    const row = findRow(container, anchor.id);
    if (!row) return false;
    const delta = anchorScrollDelta(
      anchor,
      row.getBoundingClientRect().top,
      container.getBoundingClientRect().top
    );
    if (delta !== 0) {
      container.scrollTop += delta;
      ownTopRef.current = container.scrollTop;
    }
    return true;
  };

  useLayoutEffect(() => {
    const anchor = pendingRef.current;
    pendingRef.current = null;
    if (!anchor) return;
    restAnchorRef.current = apply(anchor) ? anchor : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  useEffect(() => {
    const container = containerRef.current;
    const flow = flowRef.current;
    if (!container) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const reanchorSoon = () => {
      lastInputAtRef.current = Date.now();
      restAnchorRef.current = null;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        restAnchorRef.current = capture();
      }, ANCHOR_IDLE_MS);
    };
    const markInput = reanchorSoon;
    const onScroll = () => {
      if (ownTopRef.current === container.scrollTop) {
        ownTopRef.current = null;
        return;
      }
      // Not ours: the reader (or a jump) moved, the old anchor is obsolete.
      reanchorSoon();
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    container.addEventListener('wheel', markInput, { passive: true });
    container.addEventListener('touchmove', markInput, { passive: true });

    let observer: ResizeObserver | undefined;
    if (flow && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        const anchor = restAnchorRef.current;
        if (!anchor || stuckRef.current()) return;
        if (Date.now() - lastInputAtRef.current < ANCHOR_IDLE_MS) return;
        apply(anchor);
      });
      observer.observe(flow);
    }
    return () => {
      container.removeEventListener('scroll', onScroll);
      container.removeEventListener('wheel', markInput);
      container.removeEventListener('touchmove', markInput);
      observer?.disconnect();
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
