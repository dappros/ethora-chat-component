import { describe, expect, it } from 'vitest';
import { resolveHistoryPreloadConfig } from './historyPreloadConfig';

describe('resolveHistoryPreloadConfig', () => {
  it('defaults to staged, top 8 rooms, concurrency 3', () => {
    expect(resolveHistoryPreloadConfig({})).toMatchObject({
      mode: 'staged',
      topRooms: 8,
      concurrency: 3,
    });
  });

  it('reads historyPreload', () => {
    expect(
      resolveHistoryPreloadConfig({
        historyPreload: { mode: 'staged', topRooms: 12, concurrency: 5 },
      })
    ).toMatchObject({ mode: 'staged', topRooms: 12, concurrency: 5 });
  });

  it("'all' has no room cap and 'off' is passed through", () => {
    expect(
      resolveHistoryPreloadConfig({ historyPreload: { mode: 'all', topRooms: 3 } })
        .topRooms
    ).toBe(0);
    expect(
      resolveHistoryPreloadConfig({ historyPreload: { mode: 'off' } }).mode
    ).toBe('off');
  });

  it('falls back to the older historyQoS names', () => {
    expect(
      resolveHistoryPreloadConfig({
        historyQoS: { preloadTopKRooms: 20, stagedPreloadConcurrency: 2 },
      })
    ).toMatchObject({ mode: 'staged', topRooms: 20, concurrency: 2 });
  });

  it('keeps the legacy catch-up path when a host pinned stagedPreloadEnabled: false', () => {
    expect(
      resolveHistoryPreloadConfig({
        historyQoS: { stagedPreloadEnabled: false },
      }).mode
    ).toBe('legacy');
    // ...but an explicit historyPreload.mode wins.
    expect(
      resolveHistoryPreloadConfig({
        historyPreload: { mode: 'staged' },
        historyQoS: { stagedPreloadEnabled: false },
      }).mode
    ).toBe('staged');
  });

  it('ignores junk numbers', () => {
    expect(
      resolveHistoryPreloadConfig({
        historyPreload: { topRooms: -1, concurrency: 0 },
      })
    ).toMatchObject({ topRooms: 8, concurrency: 3 });
  });
});
