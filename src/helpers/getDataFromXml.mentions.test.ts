import { describe, expect, it } from 'vitest';
import { xml } from '@xmpp/client';
import { getDataFromXml } from './getDataFromXml';

const buildStanza = (referenceAttrs: Record<string, string>[]) =>
  xml(
    'message',
    { from: 'room1@conference.example.com/alice', type: 'groupchat', id: 'm1' },
    xml('body', {}, 'hi @Bob'),
    xml('data', { xmlns: 'ethora', senderJID: 'alice@example.com' }),
    ...referenceAttrs.map((attrs) =>
      xml('reference', { xmlns: 'urn:xmpp:reference:0', type: 'mention', ...attrs })
    )
  );

describe('getDataFromXml - mention references', () => {
  it('parses a single XEP-0372 mention reference', async () => {
    const stanza = buildStanza([
      { begin: '3', end: '7', uri: 'xmpp:bob@example.com' },
    ]);

    const { mentions } = await getDataFromXml(stanza);

    expect(mentions).toEqual([
      { begin: 3, end: 7, uri: 'xmpp:bob@example.com', xmppUsername: 'bob' },
    ]);
  });

  it('parses multiple mention references in order', async () => {
    const stanza = buildStanza([
      { begin: '3', end: '7', uri: 'xmpp:bob@example.com' },
      { begin: '10', end: '15', uri: 'xmpp:carol@example.com' },
    ]);

    const { mentions } = await getDataFromXml(stanza);

    expect(mentions).toHaveLength(2);
    expect(mentions?.[1]).toEqual({
      begin: 10,
      end: 15,
      uri: 'xmpp:carol@example.com',
      xmppUsername: 'carol',
    });
  });

  it('ignores a reference that is not a mention type', async () => {
    const stanza = xml(
      'message',
      { from: 'room1@conference.example.com/alice', type: 'groupchat', id: 'm1' },
      xml('body', {}, 'see this'),
      xml('reference', {
        xmlns: 'urn:xmpp:reference:0',
        type: 'data',
        begin: '0',
        end: '3',
        uri: 'xmpp:bob@example.com',
      })
    );

    const { mentions } = await getDataFromXml(stanza);

    expect(mentions).toBeUndefined();
  });

  it('drops a malformed reference (non-numeric offsets)', async () => {
    const stanza = buildStanza([{ begin: 'x', end: '7', uri: 'xmpp:bob@example.com' }]);

    const { mentions } = await getDataFromXml(stanza);

    expect(mentions).toBeUndefined();
  });

  it('returns undefined mentions when there are no reference children', async () => {
    const stanza = xml(
      'message',
      { from: 'room1@conference.example.com/alice', type: 'groupchat', id: 'm1' },
      xml('body', {}, 'no mentions here')
    );

    const { mentions } = await getDataFromXml(stanza);

    expect(mentions).toBeUndefined();
  });
});
