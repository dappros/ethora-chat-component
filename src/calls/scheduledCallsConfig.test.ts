import { describe, expect, it } from 'vitest';
import {
  canManageScheduledCall,
  canPlaceCallsInRoom,
  isScheduledCallsEnabled,
} from './scheduledCallsConfig';

const calls = { enabled: true, livekitUrl: 'wss://lk.example.com' };

describe('isScheduledCallsEnabled', () => {
  it('is on whenever video calls are on', () => {
    expect(isScheduledCallsEnabled({ videoCalls: calls })).toBe(true);
  });
  it('is off without calls', () => {
    expect(isScheduledCallsEnabled({})).toBe(false);
    expect(isScheduledCallsEnabled({ videoCalls: { ...calls, enabled: false } })).toBe(false);
    expect(isScheduledCallsEnabled(undefined)).toBe(false);
  });
  it('can be switched off by the host', () => {
    expect(
      isScheduledCallsEnabled({ videoCalls: calls, scheduledCalls: { enabled: false } })
    ).toBe(false);
    expect(
      isScheduledCallsEnabled({ videoCalls: calls, scheduledCalls: { enabled: true } })
    ).toBe(true);
  });
});

describe('canPlaceCallsInRoom', () => {
  it('follows the same gate as the header call buttons', () => {
    expect(canPlaceCallsInRoom({ videoCalls: calls }, 'group')).toBe(true);
    expect(canPlaceCallsInRoom({ videoCalls: calls }, 'private')).toBe(true);
    expect(canPlaceCallsInRoom({ videoCalls: calls }, 'public')).toBe(false);
    expect(
      canPlaceCallsInRoom({ videoCalls: { ...calls, allowedRoomTypes: ['private'] } }, 'group')
    ).toBe(false);
    expect(canPlaceCallsInRoom({ videoCalls: { ...calls, livekitUrl: ' ' } }, 'group')).toBe(false);
    expect(canPlaceCallsInRoom({}, 'group')).toBe(false);
  });
});

describe('canManageScheduledCall', () => {
  it('lets the creator and the room owner manage', () => {
    expect(canManageScheduledCall({ userId: 'u1', callCreatedBy: 'u1' })).toBe(true);
    expect(canManageScheduledCall({ userId: 'u1', room: { createdBy: 'u1' } })).toBe(true);
    expect(canManageScheduledCall({ userId: 'u1', room: { role: 'owner' } })).toBe(true);
  });
  it('never grants on unknowns', () => {
    expect(canManageScheduledCall({ userId: 'u1' })).toBe(false);
    expect(canManageScheduledCall({ userId: '', callCreatedBy: '' })).toBe(false);
    expect(canManageScheduledCall({ userId: 'u1', callCreatedBy: 'u2', room: { role: 'participant' } })).toBe(false);
  });
});
