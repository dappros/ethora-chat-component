import { describe, expect, it, vi } from 'vitest';
import {
  JUMP_WINDOW_AFTER,
  JUMP_WINDOW_BEFORE,
  JUMP_WINDOW_PAGE,
  loadJumpWindow,
  loadNewerWindowPage,
  loadOlderWindowPage,
  mamIdCandidates,
} from './jumpWindow';

const ROOM = 'room@conference.example.com';
const TARGET = 1_700_000_000_500_000;
const m = (id: number) => ({ id: String(id), body: `b${id}` }) as any;

const page = (over: Record<string, unknown> = {}) => ({
  ok: true,
  messages: [] as any[],
  complete: false,
  first: null as number | null,
  last: null as number | null,
  ...over,
});

const makeClient = (older: any, newer: any) => ({
  getHistoryWindow: vi.fn(
    async (_jid: string, _max: number, cursor: { before?: number }) =>
      cursor.before !== undefined ? older : newer
  ),
});

describe('mamIdCandidates', () => {
  it('keeps only archive-style numeric ids', () => {
    expect(
      mamIdCandidates([
        'send-text-message-1',
        String(TARGET),
        '12',
        String(TARGET),
      ])
    ).toEqual([String(TARGET)]);
  });
});

describe('loadJumpWindow', () => {
  it('asks for N before the target and the target plus N after, in two requests', async () => {
    const client = makeClient(
      page({
        messages: [m(TARGET - 2000), m(TARGET - 1000)],
        first: TARGET - 2000,
      }),
      page({ messages: [m(TARGET), m(TARGET + 1000)], last: TARGET + 1000 })
    );
    const result = await loadJumpWindow(client, ROOM, [String(TARGET)]);

    expect(client.getHistoryWindow).toHaveBeenCalledTimes(2);
    expect(client.getHistoryWindow).toHaveBeenCalledWith(
      ROOM,
      JUMP_WINDOW_BEFORE,
      { before: TARGET }
    );
    expect(client.getHistoryWindow).toHaveBeenCalledWith(
      ROOM,
      JUMP_WINDOW_AFTER + 1,
      { after: TARGET - 1 }
    );
    expect(result.status).toBe('found');
    if (result.status !== 'found') return;
    expect(result.window.messages.map((x) => x.id)).toEqual([
      String(TARGET - 2000),
      String(TARGET - 1000),
      String(TARGET),
      String(TARGET + 1000),
    ]);
    expect(result.window.targetId).toBe(String(TARGET));
    expect(result.window.olderCursor).toBe(TARGET - 2000);
    expect(result.window.newerCursor).toBe(TARGET + 1000);
    expect(result.window.hasOlder).toBe(true);
    expect(result.window.hasNewer).toBe(true);
  });

  it('reports the edges of the archive', async () => {
    const client = makeClient(
      page({ complete: true, first: null }),
      page({ messages: [m(TARGET)], complete: true, last: TARGET })
    );
    const result = await loadJumpWindow(client, ROOM, [String(TARGET)]);
    expect(result.status).toBe('found');
    if (result.status !== 'found') return;
    expect(result.window.hasOlder).toBe(false);
    expect(result.window.hasNewer).toBe(false);
  });

  it('is missing when the server does not return the target', async () => {
    const client = makeClient(
      page({ messages: [m(TARGET - 1000)], first: TARGET - 1000 }),
      page({ messages: [m(TARGET + 5000)], last: TARGET + 5000 })
    );
    expect(await loadJumpWindow(client, ROOM, [String(TARGET)])).toEqual({
      status: 'missing',
    });
  });

  it('is unavailable without an archive id, and when a request fails', async () => {
    const client = makeClient(page(), page());
    expect(await loadJumpWindow(client, ROOM, ['not-numeric'])).toEqual({
      status: 'unavailable',
    });
    expect(client.getHistoryWindow).not.toHaveBeenCalled();

    const failing = makeClient(page({ ok: false }), page());
    expect(await loadJumpWindow(failing, ROOM, [String(TARGET)])).toEqual({
      status: 'unavailable',
    });
  });
});

describe('window paging', () => {
  const win = (over: Record<string, unknown> = {}) =>
    ({
      roomJID: ROOM,
      messages: [],
      targetId: String(TARGET),
      olderCursor: TARGET - 1000,
      hasOlder: true,
      newerCursor: TARGET + 1000,
      hasNewer: true,
      ...over,
    }) as any;

  it('pages older from the cursor and moves it', async () => {
    const client = makeClient(
      page({ messages: [m(TARGET - 3000)], first: TARGET - 3000 }),
      page()
    );
    const result = await loadOlderWindowPage(client, win());
    expect(client.getHistoryWindow).toHaveBeenCalledWith(
      ROOM,
      JUMP_WINDOW_PAGE,
      {
        before: TARGET - 1000,
      }
    );
    expect(result).toEqual({
      messages: [m(TARGET - 3000)],
      olderCursor: TARGET - 3000,
      hasOlder: true,
    });
  });

  it('stops older paging when the cursor does not move', async () => {
    const client = makeClient(page({ first: TARGET - 1000 }), page());
    const result = await loadOlderWindowPage(client, win());
    expect(result?.hasOlder).toBe(false);
  });

  it('pages newer and reports the live tail', async () => {
    const client = makeClient(
      page(),
      page({
        messages: [m(TARGET + 2000)],
        last: TARGET + 2000,
        complete: true,
      })
    );
    const result = await loadNewerWindowPage(client, win());
    expect(client.getHistoryWindow).toHaveBeenCalledWith(
      ROOM,
      JUMP_WINDOW_PAGE,
      {
        after: TARGET + 1000,
      }
    );
    expect(result?.hasNewer).toBe(false);
    expect(result?.newerCursor).toBe(TARGET + 2000);
  });

  it('returns null when a page fails', async () => {
    const client = makeClient(page({ ok: false }), page({ ok: false }));
    expect(await loadOlderWindowPage(client, win())).toBeNull();
    expect(await loadNewerWindowPage(client, win())).toBeNull();
  });
});
