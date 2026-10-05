/**
 * Keys that must never be used as a dynamic property name on a plain object:
 * assigning through them can reach Object.prototype (prototype pollution).
 * JIDs, user ids and locale tags never legitimately take these values.
 */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** True when `key` is a non-empty string that is safe to use as an object key. */
export const isSafeKey = (key: unknown): key is string =>
  typeof key === 'string' && key.length > 0 && !UNSAFE_KEYS.has(key);

/** Names that exist on every plain object (or are prototype-chain machinery). */
const RESERVED_NAMES = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toString',
  'toLocaleString',
  'valueOf',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
]);

/** True when `name` is a property name every object already has. */
export const isReservedName = (name: string): boolean => RESERVED_NAMES.has(name);

/**
 * True for an `<appId>_<rest>` id that is safe to send and to store: the whole
 * id and every underscore-separated segment after the first must not be a
 * reserved object name, and no segment may start with `__` (which also
 * rejects `<appId>___proto__`, where the split yields an empty segment and a
 * `__`-prefixed one).
 */
export const hasSafeIdSegments = (id: string): boolean => {
  if (isReservedName(id) || id.includes('__')) return false;
  const parts = id.split('_');
  for (let i = 1; i < parts.length; i++) {
    if (isReservedName(parts[i])) return false;
  }
  // Also catch a reserved name glued to the app prefix, e.g. `<appId>_prototype`
  // is handled above; the remainder as a whole too, for names containing `_`.
  const rest = id.slice(id.indexOf('_') + 1);
  return !isReservedName(rest);
};
