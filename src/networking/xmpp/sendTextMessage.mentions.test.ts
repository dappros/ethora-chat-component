import { describe, expect, it, vi } from 'vitest';
import { sendTextMessage } from './sendTextMessage.xmpp';

const makeClient = () => {
  const sent: any[] = [];
  return {
    jid: { toString: () => 'alice@example.com/res', domain: 'example.com' },
    send: vi.fn((stanza) => sent.push(stanza)),
    sent,
  } as any;
};

describe('sendTextMessage - mention references', () => {
  it('adds no <reference> children when there are no mentions', () => {
    const client = makeClient();
    sendTextMessage(
      client, 'room1@conference.example.com', 'A', 'B', '', 'wallet',
      'hello', '', false, false, '', undefined, 'id1'
    );

    const stanza = client.sent[0];
    expect(stanza.getChildren('reference')).toHaveLength(0);
  });

  it('adds one <reference type="mention"> per mention, with correct offsets and uri', () => {
    const client = makeClient();
    sendTextMessage(
      client, 'room1@conference.example.com', 'A', 'B', '', 'wallet',
      'hi @Bob and @Carol', '', false, false, '', undefined, 'id1',
      [
        { begin: 3, end: 7, xmppUsername: 'bob' },
        { begin: 12, end: 18, xmppUsername: 'carol' },
      ]
    );

    const stanza = client.sent[0];
    const refs = stanza.getChildren('reference');
    expect(refs).toHaveLength(2);

    expect(refs[0].attrs).toMatchObject({
      xmlns: 'urn:xmpp:reference:0',
      type: 'mention',
      begin: '3',
      end: '7',
      uri: 'xmpp:bob@example.com',
    });
    expect(refs[1].attrs).toMatchObject({
      begin: '12',
      end: '18',
      uri: 'xmpp:carol@example.com',
    });
  });
});
