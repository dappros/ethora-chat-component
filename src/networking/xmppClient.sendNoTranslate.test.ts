import { describe, expect, it } from 'vitest';

import { sendTextMessageWithTranslateTag } from './xmpp/sendTextMessageWithTranslateTag.xmpp';

const makeClient = () => {
  const sent: any[] = [];
  return {
    jid: { toString: () => 'me@example.com/res', domain: 'example.com' },
    send: vi.fn((stanza) => sent.push(stanza)),
    sent,
  } as any;
};

const baseStanza = {
  roomJID: 'r1@conference.example.com',
  firstName: 'A',
  lastName: 'B',
  photo: '',
  walletAddress: 'w',
  userMessage: 'hola',
};

// Regression: sends had grown multi-second partly because every one of
// them awaited an HTTP round trip to the translation service before the
// stanza was even queued - and 404'd on backends without it deployed. The
// sender wrote the message; only readers need it translated (see
// useMessageTranslation).
describe('sendTextMessageWithTranslateTag', () => {
  it('declares the source language but ships no pre-computed translations', () => {
    const client = makeClient();

    sendTextMessageWithTranslateTag(client, baseStanza, 'es', 'id1');

    const stanza = client.sent[0];
    expect(stanza.getChild('translate')?.attrs?.source).toBe('es');
    // `<translations>` was the pre-translated payload - it must be gone.
    expect(stanza.getChild('translations')).toBeFalsy();
    expect(stanza.getChild('body')?.getText()).toBe('hola');
  });

  it('queues the stanza without awaiting anything in a plain room', async () => {
    const client = makeClient();

    const pending = sendTextMessageWithTranslateTag(
      client,
      baseStanza,
      'es',
      'id1'
    );

    // The function is async now - an e2ee room has to await OMEMO before it
    // can encrypt (see sendTextMessageWithTranslateTag.e2ee.test.ts). A plain
    // room still reaches `client.send` before the first await, i.e. before
    // this assertion runs, so the original guarantee holds: no round trip
    // stands between the user hitting send and the stanza going out.
    expect(client.send).toHaveBeenCalledTimes(1);
    await expect(pending).resolves.toBe(true);
  });
});
