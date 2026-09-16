import { useEffect, useRef, useState } from 'react';

// How long the "not loading right now" signal has to hold continuously
// before we trust it. The raw loading signal ChatRoom feeds in here is an
// OR of several independent async sources (MUC join, MAM history fetch,
// background preload) that each flip true/false on their own schedule -
// so "loading just went false" does not mean the room is actually settled,
// it can mean "source A finished, source B hasn't started its own pulse
// yet". Requiring the false reading to hold for this long bridges those
// gaps between pulses without meaningfully delaying a room that really has
// nothing to fetch (it still settles in one debounce window, not zero, but
// that is a deliberate trade: instant felt indistinguishable from "did
// this render at all" and was exactly what produced the flicker).
const SETTLE_DEBOUNCE_MS = 220;

export type ChatOpenPhase = 'opening' | 'settled';

interface PhaseState {
  key: string | null;
  phase: ChatOpenPhase;
}

/**
 * Collapses "is this room's history still loading" into one phase that only
 * ever moves forward, once, for a given room key: 'opening' -> 'settled'.
 * It never reports 'opening' again for the same key once it has settled -
 * ChatRoom relies on that to stop the Loader/placeholder pane from
 * oscillating while a room opens (see the flicker this hook exists to
 * fix). A settled-but-empty room can still legitimately start rendering
 * messages later (a live message arrives) - that is not this hook's
 * concern; callers derive that from their own `hasMessages`, this hook only
 * owns whether the opening UI is still allowed to show.
 *
 * `roomKey` resets the latch: pass the active room's JID (or null). The
 * reset happens synchronously during render (React's "adjust state while
 * rendering" pattern), so switching rooms - even quickly, back and forth -
 * never paints a frame of the previous room's settled state under the new
 * room's key, and never leaves a stale debounce timer running against the
 * new key (the effect below is keyed on `roomKey` too, so its cleanup
 * clears the old timer before the new one can be scheduled).
 */
export const useChatOpenPhase = (
  roomKey: string | null,
  isLoadingSignal: boolean
): ChatOpenPhase => {
  const [state, setState] = useState<PhaseState>({
    key: roomKey,
    phase: 'opening',
  });

  let key = state.key;
  let phase = state.phase;
  if (key !== roomKey) {
    key = roomKey;
    phase = 'opening';
  }
  if (key !== state.key || phase !== state.phase) {
    setState({ key, phase });
  }

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // Nothing left to settle (already settled, or no active room to track).
    if (phase !== 'opening' || !roomKey) return;

    // Loading is active right now: cancel any pending settle and wait for
    // the next render, which will re-run this effect once it changes.
    if (isLoadingSignal) return;

    timerRef.current = setTimeout(() => {
      setState((current) =>
        current.key === roomKey && current.phase === 'opening'
          ? { key: roomKey, phase: 'settled' }
          : current
      );
    }, SETTLE_DEBOUNCE_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [roomKey, isLoadingSignal, phase]);

  return phase;
};
