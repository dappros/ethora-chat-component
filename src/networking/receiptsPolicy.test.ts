import { describe, expect, it } from 'vitest';
import {
  resolveReceiptsConfig,
  shouldSendDelivery,
  shouldSendRead,
} from './receiptsPolicy';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 16, 12, 0, 0);
const auto = resolveReceiptsConfig(undefined);
const group = (others: number) => ({ type: 'group' as const, usersCnt: others + 1 });
const msg = (ts: number) => ({ id: 'm1', date: new Date(ts).toISOString() });

describe('resolveReceiptsConfig', () => {
  it('uses the documented defaults when nothing is set', () => {
    expect(auto).toEqual({
      mode: 'auto',
      deliveryMaxRoomSize: 20,
      readMaxRoomSize: 100,
      maxAgeDays: 7,
      coalesceMs: 1500,
    });
  });

  it('falls back per field for unknown modes and invalid numbers', () => {
    const cfg = resolveReceiptsConfig({
      mode: 'sometimes' as any,
      deliveryMaxRoomSize: -1,
      readMaxRoomSize: Number.NaN,
      maxAgeDays: 3,
    });
    expect(cfg.mode).toBe('auto');
    expect(cfg.deliveryMaxRoomSize).toBe(20);
    expect(cfg.readMaxRoomSize).toBe(100);
    expect(cfg.maxAgeDays).toBe(3);
  });
});

describe('shouldSendDelivery', () => {
  it('sends in a room at the threshold and not one member above it', () => {
    expect(shouldSendDelivery(group(20), msg(NOW), auto, NOW)).toBe(true);
    expect(shouldSendDelivery(group(21), msg(NOW), auto, NOW)).toBe(false);
  });

  it('always sends in a private 1:1 room', () => {
    const room = { type: 'private' as const, usersCnt: 2 };
    expect(shouldSendDelivery(room, msg(NOW), auto, NOW)).toBe(true);
  });

  it('treats an unknown room size as allowed', () => {
    expect(shouldSendDelivery({ usersCnt: 0 }, msg(NOW), auto, NOW)).toBe(true);
    expect(shouldSendDelivery(undefined, msg(NOW), auto, NOW)).toBe(true);
  });

  it('counts the larger of usersCnt and the loaded members list, minus the sender', () => {
    const room = { usersCnt: 5, members: Array.from({ length: 25 }, (_, i) => ({ id: `u${i}` })) } as any;
    expect(shouldSendDelivery(room, msg(NOW), auto, NOW)).toBe(false);
  });

  it('skips messages older than maxAgeDays in auto mode', () => {
    expect(shouldSendDelivery(group(3), msg(NOW - 8 * DAY), auto, NOW)).toBe(false);
    expect(shouldSendDelivery(group(3), msg(NOW - 6 * DAY), auto, NOW)).toBe(true);
  });

  it('never acks system messages or messages without an id', () => {
    expect(
      shouldSendDelivery(group(1), { ...msg(NOW), isSystemMessage: 'true' }, auto, NOW)
    ).toBe(false);
    expect(shouldSendDelivery(group(1), { id: '', date: '' }, auto, NOW)).toBe(false);
  });

  it('mode all sends regardless of size and age', () => {
    const all = resolveReceiptsConfig({ mode: 'all' });
    expect(shouldSendDelivery(group(468), msg(NOW - 30 * DAY), all, NOW)).toBe(true);
  });

  it('mode off never sends', () => {
    const off = resolveReceiptsConfig({ mode: 'off' });
    expect(shouldSendDelivery(group(0), msg(NOW), off, NOW)).toBe(false);
    expect(shouldSendDelivery({ type: 'private' }, msg(NOW), off, NOW)).toBe(false);
  });
});

describe('shouldSendRead', () => {
  it('uses readMaxRoomSize in auto mode', () => {
    expect(shouldSendRead(group(100), auto)).toBe(true);
    expect(shouldSendRead(group(101), auto)).toBe(false);
  });

  it('is not limited by the delivery threshold', () => {
    expect(shouldSendRead(group(50), auto)).toBe(true);
    expect(shouldSendDelivery(group(50), msg(NOW), auto, NOW)).toBe(false);
  });

  it('always sends in 1:1 rooms and unknown-size rooms', () => {
    expect(shouldSendRead({ type: 'private', usersCnt: 2 }, auto)).toBe(true);
    expect(shouldSendRead({ usersCnt: 0 }, auto)).toBe(true);
  });

  it('mode all sends and mode off never sends', () => {
    expect(shouldSendRead(group(468), resolveReceiptsConfig({ mode: 'all' }))).toBe(true);
    expect(shouldSendRead(group(1), resolveReceiptsConfig({ mode: 'off' }))).toBe(false);
  });
});
