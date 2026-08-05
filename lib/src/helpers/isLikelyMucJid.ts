// Real MUC room JIDs always look like `<localpart>@conference.<host>`. Various
// state-map iterations over `rooms.rooms` (history preload, presence sweeps,
// catch-up sync) can encounter non-room entries — corrupted/legacy persisted
// state where root-slice keys (`activeRoomJID`, `usersSet`, `subscribedRooms`,
// `pushSubscriptionStatus`, `rooms` itself) leaked into the rooms map, or a
// bare app ID without the conference suffix. Treating those as room JIDs sends
// MAM/presence requests for garbage names, wasting queue slots and network
// round-trips that could go to real rooms instead. Filter with this before
// any operation that fans out over "all rooms".
export const isLikelyMucJid = (jid: unknown): jid is string => {
  if (typeof jid !== 'string' || !jid) return false;
  const at = jid.indexOf('@');
  if (at <= 0) return false;
  const domain = jid.slice(at + 1).split('/')[0];
  return domain.includes('.') && domain.startsWith('conference.');
};

/**
 * Root keys of the rooms slice. When a caller fans out over the slice itself
 * instead of `slice.rooms`, these leak through as if they were room ids, and
 * anything that appends the conference domain then produces real-looking but
 * nonexistent JIDs (`usersSet@conference.host`), which the server answers with
 * "Conference room does not exist". Cheap explicit denylist so the failure is
 * named rather than mysterious.
 */
const ROOMS_SLICE_ROOT_KEYS = new Set([
  'rooms',
  'activeRoomJID',
  'isChatUiVisible',
  'isLoading',
  'editAction',
  'usersSet',
  'presenceByRoom',
  'reportRoom',
  'subscribedRooms',
  'pushSubscriptionStatus',
  'loadingText',
]);

/**
 * True when `value` can be used as the localpart of a MUC room JID, i.e. it is
 * safe to build `${value}@conference.<host>` from it.
 *
 * Ethora room localparts are always `<appId>_<roomId>`, so the underscore is a
 * reliable discriminator against slice keys, plain flags and stray strings.
 * Callers that already hold a full JID should use `isLikelyMucJid` instead.
 */
export const isLikelyRoomLocalpart = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (!v || v.includes('@')) return false;
  if (ROOMS_SLICE_ROOT_KEYS.has(v)) return false;
  return v.includes('_');
};

/**
 * Normalise a room reference into a full MUC JID, or return null when the
 * input cannot be one. Use at every point that would otherwise blindly do
 * `chatJID.includes('@') ? chatJID : chatJID + '@' + conference`: that pattern
 * silently manufactures a valid-looking JID out of any garbage handed to it,
 * which is how slice keys ended up being joined as rooms.
 */
export const toRoomJid = (
  chatJID: unknown,
  conference: string | undefined
): string | null => {
  if (typeof chatJID !== 'string' || !chatJID) return null;
  if (chatJID.includes('@')) return chatJID;
  if (!conference) return null;
  if (!isLikelyRoomLocalpart(chatJID)) return null;
  return `${chatJID}@${conference}`;
};
