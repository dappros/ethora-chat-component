/**
 * The translate-tagged send path in an e2ee room.
 *
 * This path is what a host with `translates.enabled` uses for every text
 * message (useSendMessage, resendMessage, useHeapSender all funnel into it),
 * and it used to have no encryption seam at all - so turning translation on
 * silently put every message of an encrypted room into MAM as plaintext,
 * twice over: once in <body>, once in the `userMessage` attribute of the
 * always-clear <data>, plus whatever mod_translate stored off <translate>.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Client, xml } from '@xmpp/client';
import { Element } from 'ltx';

const e2eeRooms = new Set<string>();
const encryptGroupMessage = vi.fn();
let crypto: unknown = { encryptGroupMessage };

vi.mock('../../e2ee', () => ({
  isE2eeRoom: (jid: string) => e2eeRooms.has(jid),
  omemoReady: () => Promise.resolve(crypto),
  roomRecipients: () => ['alice@xmpp.example', 'bob@xmpp.example'],
  accountDomain: () => 'xmpp.example',
}));

const { sendTextMessageWithTranslateTag } = await import(
  './sendTextMessageWithTranslateTag.xmpp'
);

const ROOM_JID = 'room@conference.xmpp.example';

const makeClient = () => {
  const sent: Element[] = [];
  const client = {
    jid: {
      toString: () => 'alice@xmpp.example/web',
      getDomain: () => 'xmpp.example',
    },
    send: vi.fn((stanza: Element) => {
      sent.push(stanza);
    }),
  } as unknown as Client;

  return { client, sent };
};

const payload = (roomJID = ROOM_JID) => ({
  roomJID,
  firstName: 'Ada',
  lastName: 'L',
  photo: '',
  walletAddress: '0xabc',
  userMessage: 'the secret',
});

beforeEach(() => {
  e2eeRooms.clear();
  encryptGroupMessage.mockReset();
  crypto = { encryptGroupMessage };
});

describe('sendTextMessageWithTranslateTag', () => {
  it('encrypts the body and keeps the text out of <data> in an e2ee room', async () => {
    e2eeRooms.add(ROOM_JID);
    encryptGroupMessage.mockResolvedValue(xml('message', { id: 'enc' }));
    const { client, sent } = makeClient();

    const ok = await sendTextMessageWithTranslateTag(
      client,
      payload(),
      'en',
      'send-translate-message-1'
    );

    expect(ok).toBe(true);
    expect(sent).toHaveLength(1);
    // What went out is the envelope OMEMO built, not our plain <message>.
    expect(sent[0].attrs.id).toBe('enc');

    const [room, recipients, content, id, clear] =
      encryptGroupMessage.mock.calls[0];
    expect(room).toBe(ROOM_JID);
    expect(recipients).toEqual(['alice@xmpp.example', 'bob@xmpp.example']);
    expect(id).toBe('send-translate-message-1');
    // The text is encrypted...
    expect(content[0].name).toBe('body');
    expect(content[0].text()).toBe('the secret');
    // ...and does NOT survive in the clear-text half.
    expect(clear[0].name).toBe('data');
    expect(clear[0].attrs.userMessage).toBeUndefined();
    expect(JSON.stringify(clear)).not.toContain('the secret');
  });

  it('drops <translate> in an e2ee room, including on the clear fallback', async () => {
    e2eeRooms.add(ROOM_JID);
    crypto = undefined; // OMEMO not ready - the send falls back to plaintext
    const { client, sent } = makeClient();

    await sendTextMessageWithTranslateTag(client, payload(), 'en');

    expect(sent).toHaveLength(1);
    expect(sent[0].getChild('translate')).toBeUndefined();
    expect(sent[0].getChild('body')?.text()).toBe('the secret');
    // Even unencrypted, the text is not duplicated into <data>: the server
    // gets one copy to route, not a second one to archive and translate.
    expect(sent[0].getChild('data')?.attrs.userMessage).toBeUndefined();
  });

  it('is unchanged for a plain room: <translate>, and the text in <data>', async () => {
    const { client, sent } = makeClient();

    await sendTextMessageWithTranslateTag(client, payload(), 'uk');

    expect(encryptGroupMessage).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
    expect(sent[0].getChild('translate')?.attrs.source).toBe('uk');
    expect(sent[0].getChild('body')?.text()).toBe('the secret');
    expect(sent[0].getChild('data')?.attrs.userMessage).toBe('the secret');
  });
});
