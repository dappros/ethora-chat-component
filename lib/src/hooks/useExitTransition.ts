import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../styles/motion';

type Phase = 'closed' | 'open' | 'closing';

export interface ExitTransitionState {
  /** Whether the caller should still render the element at all. */
  shouldRender: boolean;
  /** True for the window between `isOpen` going false and the element
   *  actually leaving the DOM - apply the exit animation while this is true. */
  isExiting: boolean;
}

/**
 * Keeps an element mounted for `durationMs` after `isOpen` flips to false, so
 * a CSS exit animation has time to play instead of the element vanishing on
 * the same frame the state changes.
 *
 * This is the "someone else decides when I close" half of the presence
 * story - the caller owns `isOpen` (Redux state, a prop, ...) and this hook
 * just tells it how long to keep rendering. For a component that closes
 * itself (a modal with its own local open flag, reacting to its own close
 * button), prefer `useDelayedAction` instead: it lets the component play the
 * animation and only THEN flip its own state, which is simpler when there is
 * no external boolean to watch.
 *
 * Respects `prefers-reduced-motion`: when set, the element is removed on the
 * same tick `isOpen` goes false, same as if `durationMs` were 0.
 */
export function useExitTransition(
  isOpen: boolean,
  durationMs: number
): ExitTransitionState {
  const [phase, setPhase] = useState<Phase>(isOpen ? 'open' : 'closed');
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    if (isOpen) {
      setPhase('open');
      return;
    }

    // Only animate a genuine open -> closed transition; nothing to exit if
    // we were already closed (e.g. isOpen was false on first mount).
    setPhase((current) => (current === 'closed' ? 'closed' : 'closing'));
  }, [isOpen]);

  useEffect(() => {
    if (phase !== 'closing') return undefined;

    if (durationMs <= 0 || prefersReducedMotion()) {
      setPhase('closed');
      return undefined;
    }

    timeoutRef.current = setTimeout(() => setPhase('closed'), durationMs);
    return () => clearTimeout(timeoutRef.current);
  }, [phase, durationMs]);

  return {
    shouldRender: phase !== 'closed',
    isExiting: phase === 'closing',
  };
}
