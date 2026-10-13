/**
 * Hands "focus the message input" from the room list to the composer.
 *
 * The room list and the composer live in different subtrees, and the
 * composer may only mount after the switch (or re-render later), so a plain
 * callback would race it. Instead the request is parked here until the
 * mounted composer for that room claims it. A claim is one-shot, so a single
 * click focuses exactly once.
 */

type Listener = () => void;

const listeners = new Set<Listener>();
let pendingRoomJid: string | null = null;

/** Ask the composer for `roomJid` to take focus. Wakes mounted composers. */
export const requestComposerFocus = (roomJid: string | null | undefined): void => {
  if (!roomJid) return;
  pendingRoomJid = roomJid;
  listeners.forEach((listener) => listener());
};

/** Mounted composers subscribe here to learn that a request arrived. */
export const subscribeComposerFocus = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Claims a pending request for `roomJid`. Returns true exactly once per
 * request, and only for the room the request was made for.
 */
export const takeComposerFocusRequest = (roomJid: string | null | undefined): boolean => {
  if (!roomJid || pendingRoomJid !== roomJid) return false;
  pendingRoomJid = null;
  return true;
};

/** Test helper: drops any parked request and all listeners. */
export const resetComposerFocusForTests = (): void => {
  pendingRoomJid = null;
  listeners.clear();
};
