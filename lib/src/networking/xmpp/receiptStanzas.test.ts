import { describe, expect, it, vi } from 'vitest';
import { sendReceivedReceipt } from './sendReceivedReceipt.xmpp';
import { sendDisplayedMarker } from './sendDisplayedMarker.xmpp';

const ROOM = 'room1@conference.example.com';
const fakeClient = () => {
  const send = vi.fn();
  return {
    send,
    client: { jid: { toString: () => 'alice@xmpp.example.com/web' }, send } as any,
  };
};

describe('receipt stanza hints', () => {
  it('delivery receipts carry no-permanent-store, not store', () => {
    const { client, send } = fakeClient();
    sendReceivedReceipt(client, 'm1', ROOM);
    const stanza = send.mock.calls[0][0];
    expect(stanza.getChild('received')?.attrs.id).toBe('m1');
    expect(stanza.getChild('no-permanent-store')?.attrs.xmlns).toBe('urn:xmpp:hints');
    expect(stanza.getChild('store')).toBeUndefined();
    expect(stanza.attrs.type).toBe('groupchat');
  });

  it('read markers keep the store hint', () => {
    const { client, send } = fakeClient();
    sendDisplayedMarker(client, 'm9', ROOM);
    const stanza = send.mock.calls[0][0];
    expect(stanza.getChild('displayed')?.attrs.id).toBe('m9');
    expect(stanza.getChild('store')?.attrs.xmlns).toBe('urn:xmpp:hints');
    expect(stanza.getChild('no-permanent-store')).toBeUndefined();
  });
});
