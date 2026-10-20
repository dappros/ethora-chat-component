// Display-name hygiene for the call UI. Names reach the ring screen from
// several places (a call-token attribute, a JWT claim, a room title, a push
// payload); this keeps raw identifiers and hostile text from ever being shown
// as a person's name.

/** Shown on the ring screen when no human-readable name is known. */
export const NEUTRAL_INCOMING_CALL_LABEL = 'Incoming call';

const MAX_CALL_NAME_LENGTH = 80;

const HEX24 = '[0-9a-fA-F]{24}';
// A user JID local part: <appId>_<userId>, optionally with an @domain.
const USER_ID = `${HEX24}_${HEX24}(?:@[A-Za-z0-9.]+)?`;

// A 1:1 chat is named "<jidA>-<jidB>" (two user ids joined by a hyphen).
const ONE_TO_ONE_ROOM = new RegExp(`^${USER_ID}(?:-${USER_ID})*$`);
// A group chat is named "<appId>_<uuid>".
const GROUP_ROOM = new RegExp(
  `^${HEX24}_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`
);
// Anything long that is nothing but hex, underscores and hyphens is an id.
const OPAQUE_ID = /^[0-9a-f_-]{16,}$/i;

/**
 * True for strings that are a chat's internal name or an id rather than
 * something a person would be called: two user JIDs joined (the private chat
 * name), a lone user id, an `<appId>_<uuid>` group name, or any long run of
 * hex / underscore / hyphen.
 */
export const looksLikeRawRoomName = (value: unknown): boolean => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return false;
  return (
    ONE_TO_ONE_ROOM.test(text) ||
    GROUP_ROOM.test(text) ||
    OPAQUE_ID.test(text)
  );
};

// C0/C1 controls, bidi overrides/isolates and zero-width characters: none of
// them belong in a name, and the bidi ones can make text read backwards.
// eslint-disable-next-line no-control-regex
const UNWANTED_CHARS = /[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

/**
 * Plain-text, display-safe version of a name: control characters stripped,
 * whitespace collapsed and trimmed, capped at about 80 characters. Returns ''
 * when nothing usable is left or the value is a raw chat name / id.
 */
export const sanitizeCallName = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  const cleaned = value
    .replace(UNWANTED_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  // Cap by code point so a surrogate pair is never cut in half.
  const capped = Array.from(cleaned).slice(0, MAX_CALL_NAME_LENGTH).join('').trim();
  return looksLikeRawRoomName(capped) ? '' : capped;
};

/** sanitizeCallName with null instead of '' (state-friendly). */
export const safeCallName = (value: unknown): string | null =>
  sanitizeCallName(value) || null;

/**
 * An xmppUsername from a stanza attribute, or null when it is not shaped like
 * one (it is only ever used for lookups and routing, never shown).
 */
export const sanitizeXmppUsername = (value: unknown): string | null => {
  const text = typeof value === 'string' ? value.trim() : '';
  const local = text.split('/')[0];
  return /^[A-Za-z0-9_-]{1,128}(?:@[A-Za-z0-9.-]+)?$/.test(local) ? local : null;
};
