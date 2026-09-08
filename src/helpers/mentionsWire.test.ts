import { describe, expect, it } from 'vitest';
import { parse } from 'ltx';
import { getDataFromXml } from './getDataFromXml';
import { createMessageFromXml } from './createMessageFromXml';
import { IMentionSpan } from '../types/types';

const ROOM = 'room123@conference.xmpp.chat.ethora.com';
const SENDER = '6a2c08adef26ca2d3e1e3677';

// Mirrors exactly what sendTextMessage.xmpp.ts / sendTextMessageWithTranslateTag.xmpp.ts
// stamp on the wire: a JSON-array-as-string on the <data> element's `mentions`
// attribute, HTML-entity-escaped by the XML serializer (ltx handles that on
// send; here we build the parsed stanza directly with the raw JSON value,
// which is what the client actually receives after XML unescaping).
const stanzaWithMentions = (mentions: IMentionSpan[]) =>
  parse(
    `<message id="send-text-message-1" from="${SENDER}@xmpp.chat.ethora.com/res" to="${ROOM}" type="groupchat">
      <data senderFirstName="Roman" senderLastName="L" fullName="Roman L" senderJID="${SENDER}@xmpp.chat.ethora.com/res" roomJid="${ROOM}" mentions='${JSON.stringify(
        mentions
      ).replace(/'/g, '&apos;')}'/>
      <body>Hey @Alice check this out</body>
    </message>`
  );

describe('mentions wire round-trip', () => {
  it('decodes the mentions attribute back into a real array on the parsed message', async () => {
    const mentions: IMentionSpan[] = [
      { jid: 'alice@xmpp.chat.ethora.com', name: 'Alice', offset: 4, length: 6 },
    ];

    const parsed = await getDataFromXml(stanzaWithMentions(mentions));
    expect(Array.isArray(parsed.data.mentions)).toBe(true);
    expect(parsed.data.mentions).toEqual(mentions);

    const message = await createMessageFromXml({
      ...parsed,
      data: parsed.data,
    } as any);

    expect(message.mentions).toEqual(mentions);
    expect(message.body).toBe('Hey @Alice check this out');
  });

  it('is absent (not a stray empty value) on a message with no mentions', async () => {
    const stanza = parse(
      `<message id="send-text-message-2" from="${SENDER}@xmpp.chat.ethora.com/res" to="${ROOM}" type="groupchat">
        <data senderFirstName="Roman" senderLastName="L"/>
        <body>no mentions here</body>
      </message>`
    );

    const parsed = await getDataFromXml(stanza);
    expect(parsed.data.mentions).toBeUndefined();

    const message = await createMessageFromXml({ ...parsed, data: parsed.data } as any);
    expect(message.mentions).toBeUndefined();
  });

  it('falls back to an empty array on a malformed mentions attribute rather than crashing', async () => {
    const stanza = parse(
      `<message id="send-text-message-3" from="${SENDER}@xmpp.chat.ethora.com/res" to="${ROOM}" type="groupchat">
        <data senderFirstName="Roman" senderLastName="L" mentions="not json"/>
        <body>broken</body>
      </message>`
    );

    const parsed = await getDataFromXml(stanza);
    expect(parsed.data.mentions).toEqual([]);
  });
});
