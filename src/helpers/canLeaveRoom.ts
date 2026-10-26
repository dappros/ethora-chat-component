import type { ConfigRoom } from '../types/models/room.model';

const normalizeJid = (jid: string): string =>
  jid.trim().split('/')[0].toLowerCase();

/** Ordinary rooms are leaveable; configured app rooms require an explicit opt-in. */
export const canLeaveRoom = (
  jid: string | undefined,
  defaultRooms: ConfigRoom[] | undefined
): boolean => {
  if (!jid) return true;
  const roomJid = normalizeJid(jid);
  const appRoom = defaultRooms?.find(
    (room) => normalizeJid(room.jid) === roomJid
  );
  return appRoom ? appRoom.removable === true : true;
};
