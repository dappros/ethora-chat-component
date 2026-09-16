import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../styles/motion';

export interface DelayedActionState {
  /** Call instead of the real close/dismiss handler. */
  requestAction: () => void;
  /** True from the moment `requestAction` is called until `action` actually
   *  runs - apply the exit animation while this is true. */
  isPending: boolean;
}

/**
 * For a component that closes ITSELF (a modal that owns `isOpen` locally,
 * or one that only gets an `onClose` callback with no boolean to watch):
 * wraps `action` so calling `requestAction()` plays out the exit animation
 * first and only invokes the real `action` once it has finished, instead of
 * unmounting on the same tick the user clicked close.
 *
 * This works because the component stays mounted for exactly as long as its
 * parent's render condition stays true, and that condition usually depends
 * on the very state `action` is about to change - delaying the call delays
 * the unmount for free, no separate "still rendering while closing" flag
 * needed at the parent. See `useExitTransition` for the opposite case: the
 * parent owns `isOpen` and the child has no closing callback to intercept.
 */
export function useDelayedAction(
  action: () => void,
  durationMs: number
): DelayedActionState {
  const [isPending, setIsPending] = useState(false);
  const actionRef = useRef(action);
  actionRef.current = action;
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  // A ref, not the `isPending` state, guards against a second call: two
  // synchronous `requestAction()` calls (a fast double-click, or a test
  // calling it twice in one `act()`) both see the same pre-update `isPending`
  // - state only reflects the LAST commit, not calls made since. The ref is
  // updated immediately, so the second call in the same tick still sees it.
  const isPendingRef = useRef(false);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  const requestAction = () => {
    if (isPendingRef.current) return;

    if (durationMs <= 0 || prefersReducedMotion()) {
      actionRef.current();
      return;
    }

    isPendingRef.current = true;
    setIsPending(true);
    timeoutRef.current = setTimeout(() => {
      isPendingRef.current = false;
      actionRef.current();
    }, durationMs);
  };

  return { requestAction, isPending };
}
