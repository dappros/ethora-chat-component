import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const fetchRemote = vi.hoisted(() => vi.fn());
vi.mock('../networking/api-requests/remoteAppearance.api', async (orig) => ({
  ...(await orig<typeof import('../networking/api-requests/remoteAppearance.api')>()),
  fetchRemoteAppearance: fetchRemote,
}));

import { useRemoteAppearance } from './useRemoteAppearance';
import {
  publishChatComponentConfigUpdated,
  resetChatComponentConfigListeners,
} from '../helpers/chatComponentConfigEvents';

const APP = '646cc8dc96d4a4dc8f7b2f2d';

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
const snap = (primary: string, version: string) => ({
  record: { 'colors.primary': primary },
  version,
});

beforeEach(() => {
  fetchRemote.mockReset();
  resetChatComponentConfigListeners();
});
afterEach(() => {
  resetChatComponentConfigListeners();
});

const cfg = (extra: Record<string, unknown> = {}) =>
  ({ baseUrl: 'https://api.test', remoteAppearance: { appId: APP, ...extra } }) as any;

describe('useRemoteAppearance', () => {
  it('does nothing and never waits without remoteAppearance', () => {
    const { result } = renderHook(() => useRemoteAppearance({ baseUrl: 'https://api.test' } as any));
    expect(result.current).toEqual({ record: null, waiting: false });
    expect(fetchRemote).not.toHaveBeenCalled();
  });

  it('refuses an App id that is not id-shaped', () => {
    const { result } = renderHook(() => useRemoteAppearance(cfg({ appId: '../etc' })));
    expect(result.current.waiting).toBe(false);
    expect(fetchRemote).not.toHaveBeenCalled();
  });

  it('waits for the first read, then hands over the record', async () => {
    const d = deferred<ReturnType<typeof snap>>();
    fetchRemote.mockReturnValueOnce(d.promise);
    const { result } = renderHook(() => useRemoteAppearance(cfg()));
    expect(result.current).toEqual({ record: null, waiting: true });
    expect(fetchRemote.mock.calls[0][0]).toEqual({ baseUrl: 'https://api.test', appId: APP, version: undefined });
    await act(async () => d.resolve(snap('#0052cd', '10')));
    expect(result.current).toEqual({ record: { 'colors.primary': '#0052cd' }, waiting: false });
  });

  it('a failed first read releases the wait with no record', async () => {
    fetchRemote.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useRemoteAppearance(cfg()));
    await act(async () => {});
    expect(result.current).toEqual({ record: null, waiting: false });
  });

  it('stops waiting after initialWaitMs even if the read is still out', async () => {
    vi.useFakeTimers();
    try {
      fetchRemote.mockReturnValueOnce(new Promise(() => {}));
      const { result } = renderHook(() => useRemoteAppearance(cfg({ initialWaitMs: 1200 })));
      expect(result.current.waiting).toBe(true);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1300);
      });
      expect(result.current.waiting).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads again on the event of its own App, with the announced version, and keeps the new record', async () => {
    fetchRemote.mockResolvedValueOnce(snap('#111111', '10'));
    const { result } = renderHook(() => useRemoteAppearance(cfg()));
    await act(async () => {});
    expect(result.current.record).toEqual({ 'colors.primary': '#111111' });

    fetchRemote.mockResolvedValueOnce(snap('#222222', '11'));
    await act(async () => publishChatComponentConfigUpdated({ appId: APP, version: '11' }));
    expect(fetchRemote).toHaveBeenCalledTimes(2);
    expect(fetchRemote.mock.calls[1][0]).toEqual({ baseUrl: 'https://api.test', appId: APP, version: '11' });
    expect(result.current.record).toEqual({ 'colors.primary': '#222222' });
    expect(result.current.waiting).toBe(false);
  });

  it('ignores another App and a version it already shows', async () => {
    fetchRemote.mockResolvedValueOnce(snap('#111111', '10'));
    renderHook(() => useRemoteAppearance(cfg()));
    await act(async () => {});
    await act(async () => publishChatComponentConfigUpdated({ appId: 'other', version: '11' }));
    await act(async () => publishChatComponentConfigUpdated({ appId: APP, version: '10' }));
    expect(fetchRemote).toHaveBeenCalledTimes(1);
  });

  it('a late answer of an older read cannot replace a newer one', async () => {
    fetchRemote.mockResolvedValueOnce(snap('#111111', '10'));
    const { result } = renderHook(() => useRemoteAppearance(cfg()));
    await act(async () => {});

    const slow = deferred<ReturnType<typeof snap>>();
    const fast = deferred<ReturnType<typeof snap>>();
    fetchRemote.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    await act(async () => publishChatComponentConfigUpdated({ appId: APP, version: '11' }));
    await act(async () => publishChatComponentConfigUpdated({ appId: APP, version: '12' }));
    await act(async () => fast.resolve(snap('#333333', '12')));
    await act(async () => slow.resolve(snap('#222222', '11')));
    expect(result.current.record).toEqual({ 'colors.primary': '#333333' });
  });

  it('a failed re-read keeps what is shown', async () => {
    fetchRemote.mockResolvedValueOnce(snap('#111111', '10'));
    const { result } = renderHook(() => useRemoteAppearance(cfg()));
    await act(async () => {});
    fetchRemote.mockRejectedValueOnce(new Error('502'));
    await act(async () => publishChatComponentConfigUpdated({ appId: APP, version: '11' }));
    expect(result.current.record).toEqual({ 'colors.primary': '#111111' });
  });

  it('stops listening when unmounted', async () => {
    fetchRemote.mockResolvedValueOnce(snap('#111111', '10'));
    const { unmount } = renderHook(() => useRemoteAppearance(cfg()));
    await act(async () => {});
    unmount();
    await act(async () => publishChatComponentConfigUpdated({ appId: APP, version: '11' }));
    expect(fetchRemote).toHaveBeenCalledTimes(1);
  });

  it('uses remoteAppearance.baseUrl over config.baseUrl', async () => {
    fetchRemote.mockResolvedValueOnce(snap('#111111', '10'));
    renderHook(() => useRemoteAppearance(cfg({ baseUrl: 'https://other.test' })));
    await act(async () => {});
    expect(fetchRemote.mock.calls[0][0].baseUrl).toBe('https://other.test');
  });
});
