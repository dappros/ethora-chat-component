/**
 * Keys that must never be used as a dynamic property name on a plain object:
 * assigning through them can reach Object.prototype (prototype pollution).
 * JIDs, user ids and locale tags never legitimately take these values.
 */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** True when `key` is a non-empty string that is safe to use as an object key. */
export const isSafeKey = (key: unknown): key is string =>
  typeof key === 'string' && key.length > 0 && !UNSAFE_KEYS.has(key);
