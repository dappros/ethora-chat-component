import { describe, expect, it } from 'vitest';
import {
  computeReceiptState,
  getReceiptIndex,
  getReceiptIndexBuildCount,
  NO_RECEIPTS,
} from './receiptState';
import { IMessage } from '../types/types';

const msg = (id: string, user: string, ts: number): IMessage =>
  ({
    id,
    body: id,
    date: new Date(ts).toISOString(),
    user: { id: user, name: user },
  }) as unknown as IMessage;

const T0 = Date.UTC(2026, 9, 1, 10, 0, 0);
// Message ids that encode their time (ms), so the timestamp fallback can use them.
const at = (n: number) => String(T0 + n * 1000);

const state = (
  messages: IMessage[],
  overrides: Partial<Parameters<typeof computeReceiptState>[0]> = {}
) => {
  const index = getReceiptIndex(messages);
  const pos = index.indexById.get(overrides.messageId ?? messages[0].id) ?? 0;
  return computeReceiptState({
    index,
    messageId: overrides.messageId ?? messages[0].id,
    messageTs: index.tsByIndex[pos],
    selfId: 'me',
    ...overrides,
  });
};

describe('computeReceiptState', () => {
  const messages = [msg('m1', 'me', T0), msg('m2', 'me', T0 + 1000), msg('m3', 'me', T0 + 2000)];

  it('counts a delivery watermark as delivered to every earlier own message', () => {
    const r = state(messages, { lastReceivedByUser: { bob: 'm3' } });
    expect(r.deliveredBy).toEqual(['bob']);
    expect(r.seenBy).toEqual([]);
  });

  it('does not count a delivery watermark that is before the message', () => {
    const r = state(messages, { messageId: 'm3', lastReceivedByUser: { bob: 'm2' } });
    expect(r).toBe(NO_RECEIPTS);
  });

  it('uses the timestamp when the watermark id is not loaded', () => {
    const later = state([msg(at(5), 'me', T0 + 5000)], {
      messageId: at(5),
      lastDisplayedByUser: { bob: at(9) },
    });
    expect(later.seenBy).toEqual(['bob']);

    const equal = state([msg(at(5), 'me', T0 + 5000)], {
      messageId: at(5),
      lastDisplayedByUser: { bob: at(5) },
    });
    expect(equal.seenBy).toEqual(['bob']);

    const earlier = state([msg(at(5), 'me', T0 + 5000)], {
      messageId: at(5),
      lastDisplayedByUser: { bob: at(4) },
    });
    expect(earlier).toBe(NO_RECEIPTS);
  });

  it('treats an unloaded watermark with no readable time as not covering', () => {
    const r = state(messages, { messageId: 'm1', lastDisplayedByUser: { bob: 'gone' } });
    expect(r).toBe(NO_RECEIPTS);
  });

  it('counts a viewer who authored a later message as having seen everything before it', () => {
    const withBob = [
      msg('m1', 'me', T0),
      msg('m2', 'bob', T0 + 1000),
      msg('m3', 'me', T0 + 2000),
    ];
    const r = state(withBob, { messageId: 'm1' });
    expect(r.seenBy).toEqual(['bob']);
    const later = state(withBob, { messageId: 'm3' });
    expect(later).toBe(NO_RECEIPTS);
  });

  it('never lists the current user as a viewer', () => {
    const r = state(messages, {
      lastDisplayedByUser: { me: 'm3' },
      lastReceivedByUser: { me: 'm3' },
    });
    expect(r).toBe(NO_RECEIPTS);
  });

  it('merges per-message receipts into deliveredBy', () => {
    const r = state(messages, { receivedBy: { carol: T0 } });
    expect(r.deliveredBy).toEqual(['carol']);
  });

  it('a reader is also counted as delivered', () => {
    const r = state(messages, { lastDisplayedByUser: { bob: 'm3' } });
    expect(r.seenBy).toEqual(['bob']);
    expect(r.deliveredBy).toEqual(['bob']);
  });
});

describe('getReceiptIndex', () => {
  it('builds once per messages array and reuses the result', () => {
    const messages = [msg('a', 'me', T0), msg('b', 'bob', T0 + 1000)];
    const before = getReceiptIndexBuildCount();
    const first = getReceiptIndex(messages);
    const second = getReceiptIndex(messages);
    expect(second).toBe(first);
    expect(getReceiptIndexBuildCount() - before).toBe(1);
    const next = getReceiptIndex([...messages, msg('c', 'me', T0 + 2000)]);
    expect(next).not.toBe(first);
    expect(getReceiptIndexBuildCount() - before).toBe(2);
  });

  it('scales: 1000 messages, 200 own bubbles, 50 viewers builds the index once', () => {
    const viewers = Array.from({ length: 50 }, (_, i) => `v${i}`);
    const messages: IMessage[] = [];
    for (let i = 0; i < 1000; i++) {
      const author = i % 20 === 0 ? 'me' : viewers[i % viewers.length];
      messages.push(msg(`id${i}`, author, T0 + i * 1000));
    }
    const lastDisplayedByUser = Object.fromEntries(viewers.map((v, i) => [v, `id${900 + i}`]));
    const lastReceivedByUser = Object.fromEntries(viewers.map((v) => [v, 'id999']));

    const before = getReceiptIndexBuildCount();
    const started = performance.now();
    let seen = 0;
    for (let i = 0; i < 200; i++) {
      const id = `id${i * 5}`;
      const index = getReceiptIndex(messages);
      const pos = index.indexById.get(id)!;
      const r = computeReceiptState({
        index,
        messageId: id,
        messageTs: index.tsByIndex[pos],
        lastDisplayedByUser,
        lastReceivedByUser,
        selfId: 'me',
      });
      seen += r.seenBy.length;
    }
    const elapsed = performance.now() - started;
    expect(getReceiptIndexBuildCount() - before).toBe(1);
    expect(seen).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(500);
  });
});

describe('computeReceiptState id handling', () => {
  const UUID_WATERMARK = 'send-text-message:a2b4cc53-96d8-4510-81ee-8b6619068803';

  it('does not read a digit run inside a uuid-style id as a time', () => {
    const messages = [msg('m1', 'me', T0), msg('m2', 'me', T0 + 1000)];
    const r = state(messages, { lastDisplayedByUser: { bob: UUID_WATERMARK } });
    expect(r).toBe(NO_RECEIPTS);
  });

  it('ignores reserved object names as viewers', () => {
    const messages = [msg('m1', 'me', T0), msg('m2', 'constructor', T0 + 1000)];
    const r = state(messages, { receivedBy: {} });
    expect(r.seenBy).not.toContain('constructor');
  });
});
