/**
 * Which `config` keys the chat applies LIVE, and how an operator-saved record
 * is laid over the host's config.
 *
 * Live means: changing the key on a mounted chat re-renders the affected
 * pieces from the store and the CSS variables, with the XMPP connection, the
 * rooms, the messages and every draft left alone. The list is exactly the
 * visual and layout switches; everything else (identity, endpoints, login,
 * history, e2ee, receipts, ...) is read when the chat starts and a new value
 * is picked up by the next mount.
 *
 * The keys below also form the allowlist for `config.remoteAppearance`: a
 * record fetched from the server can set these keys and no others, each with
 * a strict validator, because the record comes over the network and ends up
 * in CSS variables and a stylesheet.
 */

type Parse = (value: unknown) => string | boolean | number | null;

const COLOR_RE = /^(#?[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla)\([0-9.,%\s/]+\)|[a-z]{3,20})$/i;
const FONT_FAMILY_RE = /^[\p{L}\p{N} ,'"_-]{1,120}$/u;
const GOOGLE_FAMILY_RE = /^[A-Za-z0-9 +]{1,80}$/;
const SIZE_RE = /^(\d+(?:\.\d+)?)(px|rem|em)?$/i;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

const asBool: Parse = (v) => {
  if (typeof v === 'boolean') return v;
  const t = String(v).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(t)) return true;
  if (['false', '0', 'no'].includes(t)) return false;
  return null;
};
const asColor: Parse = (v) =>
  typeof v === 'string' && COLOR_RE.test(v.trim()) ? v.trim() : null;
const asText =
  (max: number): Parse =>
  (v) =>
    typeof v === 'string' && v.length <= max && !CONTROL_RE.test(v) ? v : null;
const asPattern =
  (re: RegExp): Parse =>
  (v) =>
    typeof v === 'string' && re.test(v.trim()) ? v.trim() : null;
const asOneOf =
  (...values: string[]): Parse =>
  (v) =>
    typeof v === 'string' && values.includes(v.trim()) ? v.trim() : null;
// The chat reads `typography.fontSize` as a number of px (parseFloat), so
// "1.25rem" would be taken for 1.25px. Hand it px.
const asPx: Parse = (v) => {
  const m = SIZE_RE.exec(String(v).trim());
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = (m[2] || 'px').toLowerCase();
  const px = unit === 'px' ? n : n * 16;
  return Number.isFinite(px) && px > 0 && px <= 96 ? Math.round(px * 100) / 100 : null;
};

/** Live keys and their validators. Mirrors ethora-backend modules/apps/chatComponentConfig.js. */
export const LIVE_CONFIG_KEYS: Readonly<Record<string, Parse>> = {
  // Style
  colorScheme: asOneOf('light', 'dark', 'system'),
  'colors.primary': asColor,
  'colors.secondary': asColor,
  'colors.icons': asColor,
  'colors.iconsBg': asColor,
  'colors.ownMessageBackground': asColor,
  'colors.otherMessageBackground': asColor,
  'colors.inputBackground': asColor,
  'typography.fontFamily': asPattern(FONT_FAMILY_RE),
  'typography.fontSize': asPx,
  'typography.googleFontsFamily': asPattern(GOOGLE_FAMILY_RE),
  'backgroundChat.color': asColor,
  // Layout
  disableHeader: asBool,
  disableMedia: asBool,
  disableRooms: asBool,
  disableRoomMenu: asBool,
  disableNewChatButton: asBool,
  disableUserCount: asBool,
  disableTypingIndicator: asBool,
  disableProfilesInteractions: asBool,
  chatHeaderBurgerMenu: asBool,
  'chatHeaderSettings.hideSearch': asBool,
  // AI agents
  blockMessageSendingWhenProcessing: asBool,
  'customTypingIndicator.enabled': asBool,
  'customTypingIndicator.text': asText(80),
  'customTypingIndicator.position': asOneOf('bottom', 'top', 'overlay', 'floating'),
  'translates.enabled': asBool,
  // B2B
  'secondarySendButton.enabled': asBool,
};

// Whole families a HOST may change on a mounted chat. Wider than the remote
// allowlist: the host is trusted and these are all read reactively
// (`typography.fontFaces`, `colors.*`, `backgroundChat.image`, ...).
const LIVE_FAMILIES = ['colors', 'typography', 'backgroundChat'];

export const isLiveConfigPath = (path: string): boolean =>
  Object.prototype.hasOwnProperty.call(LIVE_CONFIG_KEYS, path) ||
  LIVE_FAMILIES.some((f) => path === f || path.startsWith(`${f}.`));

// --- diff -----------------------------------------------------------------

const MAX_DEPTH = 6;

const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (!v || typeof v !== 'object') return false;
  // React elements and nodes carry fibers and cycles
  if ((v as { $$typeof?: unknown }).$$typeof) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/** Flattens to dotted leaf paths. Functions, nodes and class instances are leaves compared by identity. */
export const flattenConfig = (
  input: unknown,
  out: Map<string, unknown> = new Map(),
  prefix = '',
  depth = 0
): Map<string, unknown> => {
  if (!isPlain(input) && !Array.isArray(input)) {
    if (prefix) out.set(prefix, input);
    return out;
  }
  const entries: Array<[string, unknown]> = Array.isArray(input)
    ? input.map((v, i) => [String(i), v])
    : Object.entries(input);
  for (const [k, v] of entries) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (depth >= MAX_DEPTH) out.set(path, v);
    else flattenConfig(v, out, path, depth + 1);
  }
  return out;
};

const leafEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  // An empty {} or [] on both sides
  if (isPlain(a) && isPlain(b)) return !Object.keys(a).length && !Object.keys(b).length;
  if (Array.isArray(a) && Array.isArray(b)) return !a.length && !b.length;
  return false;
};

export interface ConfigChange {
  /** Changed paths the chat applies live. */
  live: string[];
  /** Changed paths read when the chat starts: applied by the next mount. */
  restart: string[];
}

/**
 * Splits what differs between two host configs into live and start-time
 * paths. A function that is a new closure on every render counts as changed
 * (it is compared by identity) and lands in `restart`; that only affects the
 * log line, the chat applies the whole new config either way.
 */
export function classifyConfigChange(prev: unknown, next: unknown): ConfigChange {
  const a = flattenConfig(prev);
  const b = flattenConfig(next);
  const live: string[] = [];
  const restart: string[] = [];
  const paths = new Set([...a.keys(), ...b.keys()]);
  for (const path of paths) {
    if (leafEqual(a.get(path), b.get(path))) continue;
    (isLiveConfigPath(path) ? live : restart).push(path);
  }
  return { live: live.sort(), restart: restart.sort() };
}

// --- remote record --------------------------------------------------------

export type RemoteConfigRecord = Record<string, string | boolean | number>;

/**
 * Keeps only allowlisted keys with a valid value. Anything else (an unknown
 * key, a wrong type, markup, a URL, an out of range number) is dropped, so a
 * wrong or hostile answer cannot do more than restyle the chat within the
 * validators' limits.
 */
export function parseRemoteConfigRecord(raw: unknown): RemoteConfigRecord {
  const out: RemoteConfigRecord = {};
  if (!isPlain(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    const parse = Object.prototype.hasOwnProperty.call(LIVE_CONFIG_KEYS, key)
      ? LIVE_CONFIG_KEYS[key]
      : undefined;
    if (!parse) continue;
    if (typeof value !== 'string' && typeof value !== 'boolean' && typeof value !== 'number') {
      continue;
    }
    const clean = parse(value);
    if (clean !== null) out[key] = clean;
  }
  return out;
}

const PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** The config with the record laid over it, copying only the objects on the way. Siblings stay. */
export function applyRemoteConfigRecord<T extends object | undefined>(
  base: T,
  record: RemoteConfigRecord | null | undefined
): T {
  if (!record || !Object.keys(record).length) return base;
  const out: Record<string, any> = { ...((base as Record<string, any>) || {}) };
  for (const [key, value] of Object.entries(record)) {
    const parts = key.split('.');
    if (parts.some((p) => PROTO_KEYS.has(p))) continue;
    let node = out;
    for (const part of parts.slice(0, -1)) {
      const child = node[part];
      node[part] = isPlain(child) ? { ...child } : {};
      node = node[part];
    }
    node[parts[parts.length - 1]] = value;
  }
  return out as T;
}
