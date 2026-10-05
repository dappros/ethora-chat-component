import { describe, expect, it, vi } from 'vitest';
import {
  loadRoomsThenJoinInBackground,
  startBackgroundJoinSweep,
} from './useChatWrapperInit';

describe('loadRoomsThenJoinInBackground', () => {
  it('ends loading right after the rooms fetch, without awaiting the join sweep', async () => {
    const client = {
      // Never resolves: a sweep over rooms that never answer.
      sendAllPresencesAndMarkReady: vi.fn(() => new Promise<void>(() => {})),
    };
    const onListReady = vi.fn();
    const rooms = await loadRoomsThenJoinInBackground(
      client,
      async () => [{ jid: 'a' }],
      onListReady
    );
    expect(rooms).toEqual([{ jid: 'a' }]);
    expect(onListReady).toHaveBeenCalledTimes(1);
    expect(client.sendAllPresencesAndMarkReady).toHaveBeenCalledTimes(1);
  });

  it('does not start the sweep or end loading when the fetch fails', async () => {
    const client = { sendAllPresencesAndMarkReady: vi.fn() };
    const onListReady = vi.fn();
    await expect(
      loadRoomsThenJoinInBackground(
        client,
        async () => {
          throw new Error('boom');
        },
        onListReady
      )
    ).rejects.toThrow('boom');
    expect(onListReady).not.toHaveBeenCalled();
    expect(client.sendAllPresencesAndMarkReady).not.toHaveBeenCalled();
  });

  it('swallows a failing sweep', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    startBackgroundJoinSweep({
      sendAllPresencesAndMarkReady: () => Promise.reject(new Error('x')),
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
