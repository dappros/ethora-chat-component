import { describe, expect, it } from 'vitest';
import reducer, { setLogoutState, setRoomsLoadResolved } from './roomsSlice';

describe('roomsLoadedOnce / roomsLoadError', () => {
  it('starts false, false - nothing has resolved yet', () => {
    const state = reducer(undefined, { type: '@@INIT' });
    expect(state.roomsLoadedOnce).toBe(false);
    expect(state.roomsLoadError).toBe(false);
  });

  it('a successful resolution latches roomsLoadedOnce and clears roomsLoadError', () => {
    const state = reducer(undefined, setRoomsLoadResolved({ success: true }));
    expect(state.roomsLoadedOnce).toBe(true);
    expect(state.roomsLoadError).toBe(false);
  });

  it('a failed resolution latches roomsLoadedOnce and sets roomsLoadError', () => {
    const state = reducer(undefined, setRoomsLoadResolved({ success: false }));
    expect(state.roomsLoadedOnce).toBe(true);
    expect(state.roomsLoadError).toBe(true);
  });

  it('a later successful retry clears roomsLoadError without unlatching roomsLoadedOnce', () => {
    const failed = reducer(undefined, setRoomsLoadResolved({ success: false }));
    const retried = reducer(failed, setRoomsLoadResolved({ success: true }));
    expect(retried.roomsLoadedOnce).toBe(true);
    expect(retried.roomsLoadError).toBe(false);
  });

  it('never unlatches roomsLoadedOnce on its own - only setLogoutState resets it', () => {
    const succeeded = reducer(undefined, setRoomsLoadResolved({ success: true }));
    const failedAfter = reducer(succeeded, setRoomsLoadResolved({ success: false }));
    expect(failedAfter.roomsLoadedOnce).toBe(true);
  });

  it('logging out resets the latch, so the next login starts with its own clean state', () => {
    const resolved = reducer(undefined, setRoomsLoadResolved({ success: false }));
    expect(resolved.roomsLoadedOnce).toBe(true);
    expect(resolved.roomsLoadError).toBe(true);

    const loggedOut = reducer(resolved, setLogoutState());
    expect(loggedOut.roomsLoadedOnce).toBe(false);
    expect(loggedOut.roomsLoadError).toBe(false);
  });
});
