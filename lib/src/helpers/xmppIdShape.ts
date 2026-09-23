// Pure string-shape helpers for xmpp local ids/JIDs - no dependency on the
// redux store. Kept separate from xmppUsername.ts (which imports `store`
// for normalizeXmppUsername/isSameXmppUsername) so this file can be safely
// imported from the redux reducer graph itself (roomsSlice.ts,
// createUserNameFromSetUser.ts): those are pulled in by roomStore/index.ts
// to build the root reducer, and importing anything that in turn imports
// `store` from roomStore/index.ts there creates a circular dependency back
// into the module that is still assembling the store.

// Strips a value that the local part of an XMPP JID may carry, leaving
// just the bare resource (anything before `@`). XMPP allows resources
// with `@` only in escaped form so the simple split is enough here.
export const toLocalPart = (value?: string): string => {
  if (!value) return '';
  return String(value).split('@')[0];
};

// A 24-character hex string is a Mongo ObjectId - the shape of both the
// appId and the userId that make up an Ethora xmpp username.
const HEX24 = '[0-9a-fA-F]{24}';
// `<appId>_<userId>` (the normal shape) or a bare id on its own (seen on
// system/local entries that never went through the appId_userId join).
// Anchored end to end so a human handle that merely contains 24 hex chars
// somewhere (unlikely, but not impossible) is never caught by accident.
const OPAQUE_XMPP_USER_ID_RE = new RegExp(`^${HEX24}(?:_${HEX24})?$`);

/**
 * True when `value` (a full JID or already-bare local part) is a
 * machine-generated Ethora id rather than anything a human would recognize
 * as their own name - `<24 hex>_<24 hex>` (appId_userId) or a bare 24-hex
 * id. Kept narrow on purpose: a handle a person actually picked is never
 * this shape, so it is never mistaken for one.
 */
export const isOpaqueXmppUserId = (value: string | undefined | null): boolean => {
  const local = toLocalPart(value || '').trim();
  if (!local) return false;
  return OPAQUE_XMPP_USER_ID_RE.test(local);
};
