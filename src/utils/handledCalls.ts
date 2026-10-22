// Calls that were already dealt with (accepted, declined, or ended before they
// were answered), remembered across the tabs of one origin for a couple of
// minutes. A late push, an XMPP replay of the call token or a click from an old
// notification then cannot raise, or accept, a call another tab took care of.
//
// Kept in localStorage so every tab (and a tab opened afterwards) sees it. It
// holds call keys and timestamps only, no secrets. Keys that are only a room
// (`room:<name>`, a call with no callId) are not kept: a new call in that room
// would be mistaken for the old one.

export const HANDLED_CALLS_TTL_MS = 2 * 60_000;
export const HANDLED_CALLS_STORAGE_KEY = '@ethora/chat-component:handledCalls';

const memory = new Map<string, number>();

const trackable = (key: string | null | undefined): key is string =>
  !!key && !key.startsWith('room:') && key !== 'incoming-call';

const readStored = (): Record<string, number> => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return {};
    const raw = window.localStorage.getItem(HANDLED_CALLS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeStored = (entries: Record<string, number>) => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(
      HANDLED_CALLS_STORAGE_KEY,
      JSON.stringify(entries)
    );
  } catch {
    // Storage blocked or full: this tab still remembers in memory.
  }
};

export const markCallHandled = (
  key: string | null | undefined,
  now: number = Date.now()
): void => {
  if (!trackable(key)) return;
  memory.set(key, now);
  const entries = readStored();
  Object.keys(entries).forEach((k) => {
    if (!(now - Number(entries[k]) <= HANDLED_CALLS_TTL_MS)) delete entries[k];
  });
  entries[key] = now;
  writeStored(entries);
};

export const isCallHandled = (
  key: string | null | undefined,
  now: number = Date.now()
): boolean => {
  if (!trackable(key)) return false;
  const local = memory.get(key);
  if (local !== undefined) {
    if (now - local <= HANDLED_CALLS_TTL_MS) return true;
    memory.delete(key);
  }
  const ts = Number(readStored()[key]);
  return Number.isFinite(ts) && now - ts <= HANDLED_CALLS_TTL_MS;
};

export const resetHandledCalls = (): void => {
  memory.clear();
  try {
    if (typeof window !== 'undefined') {
      window.localStorage?.removeItem(HANDLED_CALLS_STORAGE_KEY);
    }
  } catch {
    // nothing to clear
  }
};
