import { describe, expect, it, vi } from 'vitest';

vi.mock('./api-requests/translate.api', () => ({
  fetchMessageTranslations: vi.fn(() =>
    Promise.reject(new Error('the send path must never call the translator'))
  ),
}));

import { fetchMessageTranslations } from './api-requests/translate.api';
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

  it('does not touch the translation service at all', () => {
    const client = makeClient();

    sendTextMessageWithTranslateTag(client, baseStanza, 'es', 'id1');

    expect(fetchMessageTranslations).not.toHaveBeenCalled();
  });

  it('is synchronous - nothing to await before the stanza goes out', () => {
    const client = makeClient();

    const result = sendTextMessageWithTranslateTag(client, baseStanza, 'es', 'id1');

    expect(result).toBe(true);
    // Already sent by the time the call returns, not after a microtask.
    expect(client.send).toHaveBeenCalledTimes(1);
  });
});
