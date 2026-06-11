import { IConfig, IRoom } from '../types/types';

type RoomLike = Pick<IRoom, 'jid' | 'title' | 'name'>;

const normalizeTitle = (value: unknown): string =>
  String(value || '')
    .trim()
    .toLowerCase();

/**
 * True when the room is listed in `config.hiddenRooms` (by JID or by
 * case-insensitive title). Hidden rooms stay joined — they are only
 * suppressed from the room list and the unread counters.
 */
export const isRoomHidden = (
  room: RoomLike | null | undefined,
  config?: Pick<IConfig, 'hiddenRooms'> | null
): boolean => {
  const hidden = config?.hiddenRooms;
  if (!room || !hidden) return false;

  const jid = String(room.jid || '').trim();
  if (jid && (hidden.jids || []).some((h) => String(h || '').trim() === jid)) {
    return true;
  }

  const titles = (hidden.titles || []).map(normalizeTitle).filter(Boolean);
  if (!titles.length) return false;

  const roomTitle = normalizeTitle(room.title);
  const roomName = normalizeTitle(room.name);
  return titles.some((t) => t === roomTitle || t === roomName);
};
