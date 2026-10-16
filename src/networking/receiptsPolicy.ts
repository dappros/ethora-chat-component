import type { ReceiptsConfig } from '../types/models/config.model';
import type { IMessage, IRoom } from '../types/types';
import {
  getTimestampFromId,
  getTimestampFromUnknown,
} from '../helpers/timestamp';

export const RECEIPTS_DEFAULTS = {
  mode: 'auto' as const,
  deliveryMaxRoomSize: 20,
  readMaxRoomSize: 100,
  maxAgeDays: 7,
  coalesceMs: 1500,
};

export interface ResolvedReceiptsConfig {
  mode: 'auto' | 'all' | 'off';
  deliveryMaxRoomSize: number;
  readMaxRoomSize: number;
  maxAgeDays: number;
  coalesceMs: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const nonNegative = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : fallback;

/** Fills every unset or invalid option with its default. */
export const resolveReceiptsConfig = (
  cfg?: ReceiptsConfig | null
): ResolvedReceiptsConfig => {
  const mode =
    cfg?.mode === 'all' || cfg?.mode === 'off' || cfg?.mode === 'auto'
      ? cfg.mode
      : RECEIPTS_DEFAULTS.mode;
  return {
    mode,
    deliveryMaxRoomSize: nonNegative(
      cfg?.deliveryMaxRoomSize,
      RECEIPTS_DEFAULTS.deliveryMaxRoomSize
    ),
    readMaxRoomSize: nonNegative(
      cfg?.readMaxRoomSize,
      RECEIPTS_DEFAULTS.readMaxRoomSize
    ),
    maxAgeDays: nonNegative(cfg?.maxAgeDays, RECEIPTS_DEFAULTS.maxAgeDays),
    coalesceMs: nonNegative(cfg?.coalesceMs, RECEIPTS_DEFAULTS.coalesceMs),
  };
};

/**
 * Other members of the room (the sender excluded). The larger of the true
 * `usersCnt` and the loaded `members` list wins. 0 when the size is unknown.
 */
export const roomOtherMembers = (
  room?: Pick<IRoom, 'usersCnt' | 'members'> | null
): number => {
  const size = Math.max(room?.usersCnt ?? 0, room?.members?.length ?? 0);
  return size > 0 ? size - 1 : 0;
};

const isPrivateRoom = (room?: Pick<IRoom, 'type'> | null): boolean =>
  room?.type === 'private';

/** Timestamp of a message in ms (date, timestamp, then id), 0 when unreadable. */
export const messageTimestamp = (
  message: Pick<IMessage, 'id' | 'date' | 'timestamp'>
): number =>
  getTimestampFromUnknown(message.date) ||
  getTimestampFromUnknown(message.timestamp) ||
  getTimestampFromId(message.id) ||
  0;

/**
 * Whether this client should send a XEP-0184 `<received/>` for `message`.
 * The caller has already excluded our own messages and MAM/echo duplicates.
 */
export const shouldSendDelivery = (
  room: Pick<IRoom, 'type' | 'usersCnt' | 'members'> | null | undefined,
  message: Pick<IMessage, 'id' | 'date' | 'timestamp' | 'isSystemMessage'>,
  cfg: ResolvedReceiptsConfig,
  now: number
): boolean => {
  if (cfg.mode === 'off') return false;
  if (!message.id) return false;
  if (message.isSystemMessage === 'true') return false;
  if (cfg.mode === 'all') return true;
  if (isPrivateRoom(room)) return true;
  if (roomOtherMembers(room) > cfg.deliveryMaxRoomSize) return false;
  const ts = messageTimestamp(message);
  if (ts > 0 && now - ts > cfg.maxAgeDays * DAY_MS) return false;
  return true;
};

/** Whether this client should send a XEP-0333 `<displayed/>` for the room. */
export const shouldSendRead = (
  room: Pick<IRoom, 'type' | 'usersCnt' | 'members'> | null | undefined,
  cfg: ResolvedReceiptsConfig
): boolean => {
  if (cfg.mode === 'off') return false;
  if (cfg.mode === 'all') return true;
  if (isPrivateRoom(room)) return true;
  return roomOtherMembers(room) <= cfg.readMaxRoomSize;
};
