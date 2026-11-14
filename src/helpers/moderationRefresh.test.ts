import { describe, expect, it, vi } from 'vitest';
import { fetchRestoredMessages, MAX_PAGES, restoreTargets } from './moderationRefresh';
import type { IMessage } from '../types/types';

const ROOM = 'room@conference.xmpp.example';
const msg = (id: number, overrides: Partial<IMessage> = {}): IMessage =>
  ({ id: String(id), body: `m${id}`, roomJid: ROOM, date: '', user: { id: 'alice' }, ...overrides }) as IMessage;

describe('restoreTargets', () => {
  it('picks moderated or masked messages the notice names', () => {
    const list = [
      msg(1, { moderation: { action: 'hidden' }, body: '' }),
      msg(2),
      msg(3, { senderMasked: true }),
      msg(4, { user: { id: 'bob' } as never, moderation: { action: 'hidden' } }),
    ];
    expect(
      restoreTargets(list, { roomJID: ROOM, action: 'restore', user: 'alice' }).map((m) => m.id)
    ).toEqual(['1', '3']);
  });
});

describe('fetchRestoredMessages', () => {
  it('reads windows from the oldest target and returns only the targets', async () => {
    const getHistoryWindow = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        complete: false,
        last: 1002,
        messages: [msg(1000), msg(1001), msg(1002)],
      })
      .mockResolvedValueOnce({ ok: true, complete: true, last: 1005, messages: [msg(1005)] });
    const found = await fetchRestoredMessages({ getHistoryWindow }, ROOM, [msg(1000), msg(1005)]);
    expect(found.map((m) => m.id)).toEqual(['1000', '1005']);
    expect(getHistoryWindow).toHaveBeenNthCalledWith(1, ROOM, 50, { after: 999 });
    expect(getHistoryWindow).toHaveBeenNthCalledWith(2, ROOM, 50, { after: 1002 });
  });

  it('is bounded and survives failures', async () => {
    let n = 0;
    const getHistoryWindow = vi.fn(async () => {
      n += 1;
      return { ok: true, complete: false, last: n, messages: [msg(n)] };
    });
    await fetchRestoredMessages({ getHistoryWindow }, ROOM, [msg(0 + 1), msg(1e6)]);
    expect(getHistoryWindow.mock.calls.length).toBeLessThanOrEqual(MAX_PAGES);

    const failing = vi.fn(async () => {
      throw new Error('offline');
    });
    expect(await fetchRestoredMessages({ getHistoryWindow: failing }, ROOM, [msg(5)])).toEqual([]);
    expect(await fetchRestoredMessages(undefined, ROOM, [msg(5)])).toEqual([]);
  });
});
