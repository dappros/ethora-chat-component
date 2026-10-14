import { RefObject, useEffect, useRef } from 'react';
import { PANE_WIDTH_VAR } from '../helpers/mediaBox';

/**
 * Publishes the width of an element as the `--ethora-pane-w` custom property
 * on that element, so message media can size itself to the chat pane (which
 * may be a narrow host) instead of the viewport. Updated on every resize.
 *
 * The element may mount after the first render (the list shows a loader
 * first), so every commit checks whether the ref points at a new element
 * and re-attaches the observer if so.
 */
export const usePaneWidthVar = (ref: RefObject<HTMLElement | null>) => {
  const attached = useRef<HTMLElement | null>(null);
  const observer = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (el === attached.current) return;
    observer.current?.disconnect();
    observer.current = null;
    attached.current = el;
    if (!el) return;
    const apply = () => {
      const width = Math.round(el.clientWidth);
      if (width > 0) el.style.setProperty(PANE_WIDTH_VAR, `${width}px`);
    };
    apply();
    if (typeof ResizeObserver !== 'undefined') {
      observer.current = new ResizeObserver(apply);
      observer.current.observe(el);
    }
  });

  useEffect(
    () => () => {
      observer.current?.disconnect();
      observer.current = null;
      attached.current = null;
    },
    []
  );
};
