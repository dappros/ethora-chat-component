import type { IConfig } from '../types/types';
import { isCallRoomTypeAllowed } from './callMode';

/**
 * Scheduled calls are on whenever video calls are on, unless the host sets
 * `config.scheduledCalls.enabled: false`. Never on without calls: a booked
 * call has to be joinable through the same call path.
 */
export const isScheduledCallsEnabled = (
  config: Pick<IConfig, 'videoCalls' | 'scheduledCalls'> | null | undefined
): boolean =>
  config?.videoCalls?.enabled === true &&
  config?.scheduledCalls?.enabled !== false;

/**
 * Whether a call can be placed in a room of this type under this config: the
 * same gate the chat header uses for its call buttons (master switch, room
 * type, LiveKit URL). Join on a scheduled call is offered only when true.
 */
export const canPlaceCallsInRoom = (
  config: Pick<IConfig, 'videoCalls'> | null | undefined,
  roomType: string | undefined | null
): boolean => {
  const calls = config?.videoCalls;
  return (
    calls?.enabled === true &&
    Boolean(calls.livekitUrl?.trim()) &&
    isCallRoomTypeAllowed(roomType, calls.allowedRoomTypes)
  );
};

/**
 * Edit and Cancel are for the person who scheduled the call and for the room
 * owner. The server enforces the same rule (403); this only decides whether
 * to offer the buttons. `callCreatedBy` is unknown until the call has been
 * fetched, and an unknown creator never grants anything.
 */
export const canManageScheduledCall = (params: {
  userId?: string | null;
  callCreatedBy?: string | null;
  room?: { createdBy?: string; role?: string } | null;
}): boolean => {
  const userId = String(params.userId || '');
  if (!userId) return false;
  if (params.callCreatedBy && String(params.callCreatedBy) === userId) {
    return true;
  }
  const room = params.room;
  return Boolean(
    room && (String(room.createdBy || '') === userId || room.role === 'owner')
  );
};
