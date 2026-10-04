import { describe, expect, it, vi } from 'vitest';
import {
  CONTENT_MATCH_WINDOW_MS,
  JUMP_WINDOW_AFTER,
  loadJumpWindow,
  loadJumpWindowByTime,
} from './jumpWindow';

const ROOM = 'room@conference.example.com';
const CREATED = '2026-06-25T10:00:00.000Z';
const T = new Date(CREATED).getTime();
const ID = 1_782_381_600_000_000;

const row = (id: number, body: string, atMs: number) =>
  ({ id: String(id), body, date: new Date(atMs).toISOString() }) as any;
const page = (over: Record<string, unknown> = {}) => ({
  ok: true,
  messages: [] as any[],
  complete: true,
  first: null as number | null,
  last: null as number | null,
  ...over,
});

// A client that answers time-filtered queries from `timeRows` and id cursors
// from a fixed list of neighbours.
const makeClient = (timeRows: any[], opts: { complete?: boolean } = {}) => {
  const target = row(ID, 'Searches the Mongo archive', T + 400);
  return {
    getHistoryWindow: vi.fn(async (_jid: string, _max: number, cursor: any) => {
      if (cursor.start || cursor.end) {
        return page({
          messages: timeRows,
          complete: opts.complete ?? true,
          first: timeRows.length ? Number(timeRows[0].id) : null,
          last: timeRows.length
            ? Number(timeRows[timeRows.length - 1].id)
            : null,
        });
      }
      if (cursor.before !== undefined) {
        return page({
          messages: [row(ID - 2000, 'before', T - 2000)],
          first: ID - 2000,
          last: ID - 2000,
        });
      }
      return page({
        messages: [target, row(ID + 2000, 'after', T + 2000)],
        first: ID,
        last: ID + 2000,
      });
    }),
  };
};

describe('loadJumpWindowByTime', () => {
  it('asks for a narrow time range around createdAt and continues as the id window', async () => {
    const client = makeClient([
      row(ID - 5000, 'something else', T - 3000),
      row(ID, 'Searches the Mongo archive', T + 400),
    ]);
    const result = await loadJumpWindowByTime(client, ROOM, {
      createdAt: CREATED,
      body: ' Searches the Mongo archive ',
    });
    expect(result.status).toBe('found');
    if (result.status !== 'found') return;
    expect(result.window.targetId).toBe(String(ID));
    const first = client.getHistoryWindow.mock.calls[0][2];
    expect(first.start).toBe(new Date(T - CONTENT_MATCH_WINDOW_MS).toISOString());
    expect(first.end).toBe(new Date(T + CONTENT_MATCH_WINDOW_MS).toISOString());
    // then the two id based queries
    const rest = client.getHistoryWindow.mock.calls.slice(1);
    expect(rest.some((c) => c[2].before === ID)).toBe(true);
    expect(rest.some((c) => c[2].after === ID - 1 && c[1] === JUMP_WINDOW_AFTER + 1)).toBe(true);
  });

  it('is used by loadJumpWindow when the hit has no archive id', async () => {
    const client = makeClient([row(ID, 'hello', T)]);
    const result = await loadJumpWindow(client, ROOM, [], {
      createdAt: CREATED,
      body: 'hello',
    });
    expect(result.status).toBe('found');
  });

  it('stays unavailable without an id and without content', async () => {
    const client = makeClient([]);
    expect(await loadJumpWindow(client, ROOM, [])).toEqual({
      status: 'unavailable',
    });
    expect(client.getHistoryWindow).not.toHaveBeenCalled();
  });

  it('answers missing when the server says the range holds no such row', async () => {
    const client = makeClient([row(ID, 'another text', T)]);
    const result = await loadJumpWindowByTime(client, ROOM, {
      createdAt: CREATED,
      body: 'hello',
    });
    expect(result).toEqual({ status: 'missing' });
  });

  it('ignores a row with the right text but outside the match window', async () => {
    const client = makeClient([
      row(ID, 'hello', T + CONTENT_MATCH_WINDOW_MS + 1000),
    ]);
    const result = await loadJumpWindowByTime(client, ROOM, {
      createdAt: CREATED,
      body: 'hello',
    });
    expect(result).toEqual({ status: 'missing' });
  });

  it('is unavailable (not missing) when the request fails', async () => {
    const client = {
      getHistoryWindow: vi.fn(async () => page({ ok: false })),
    };
    const result = await loadJumpWindowByTime(client, ROOM, {
      createdAt: CREATED,
      body: 'hello',
    });
    expect(result).toEqual({ status: 'unavailable' });
  });

  it('reads on to the next page of a busy range before concluding', async () => {
    let calls = 0;
    const client = {
      getHistoryWindow: vi.fn(async (_j: string, _m: number, cursor: any) => {
        if (cursor.start) {
          calls += 1;
          return calls === 1
            ? page({
                messages: [row(ID - 10, 'noise', T)],
                complete: false,
                first: ID - 10,
                last: ID - 10,
              })
            : page({
                messages: [row(ID, 'hello', T)],
                complete: true,
                first: ID,
                last: ID,
              });
        }
        return page({ messages: [row(ID, 'hello', T)], first: ID, last: ID });
      }),
    };
    const result = await loadJumpWindowByTime(client, ROOM, {
      createdAt: CREATED,
      body: 'hello',
    });
    expect(result.status).toBe('found');
    expect(client.getHistoryWindow.mock.calls[1][2].after).toBe(ID - 10);
  });
});
