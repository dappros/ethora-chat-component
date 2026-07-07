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
