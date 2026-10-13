import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  requestComposerFocus,
  resetComposerFocusForTests,
  subscribeComposerFocus,
  takeComposerFocusRequest,
} from './composerFocus';

afterEach(() => resetComposerFocusForTests());

describe('composerFocus', () => {
  it('hands a request to the room it was made for, exactly once', () => {
    requestComposerFocus('room-a@conference');

    expect(takeComposerFocusRequest('room-b@conference')).toBe(false);
    expect(takeComposerFocusRequest('room-a@conference')).toBe(true);
    expect(takeComposerFocusRequest('room-a@conference')).toBe(false);
  });

  it('keeps a request parked until a composer mounts and claims it', () => {
    requestComposerFocus('room-a@conference');
    // No subscriber at all: a composer that mounts later still gets it.
    expect(takeComposerFocusRequest('room-a@conference')).toBe(true);
  });

  it('wakes subscribed composers on every request and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeComposerFocus(listener);

    requestComposerFocus('room-a@conference');
    requestComposerFocus('room-a@conference');
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    requestComposerFocus('room-a@conference');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('ignores requests without a room', () => {
    requestComposerFocus(undefined);
    requestComposerFocus('');
    expect(takeComposerFocusRequest(undefined)).toBe(false);
    expect(takeComposerFocusRequest('')).toBe(false);
  });
});
