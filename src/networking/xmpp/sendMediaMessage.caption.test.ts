import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Client } from '@xmpp/client';
import { Element, parse } from 'ltx';
import { getDataFromXml } from '../../helpers/getDataFromXml';
import { createMessageFromXml } from '../../helpers/createMessageFromXml';
import { IMentionSpan } from '../../types/types';

// Same seam as sendMediaMessage.e2ee.test.ts: OMEMO is stubbed and the test
// reads what goes out and what stays readable on it.
const encryptGroupMessage = vi.fn();
const isE2eeRoom = vi.fn();
const omemoReady = vi.fn();

vi.mock('../../e2ee', () => ({
  isE2eeRoom: (...args: unknown[]) => isE2eeRoom(...args),
  omemoReady: () => omemoReady(),
  accountDomain: () => 'xmpp.example',
  roomRecipients: () => ['a@xmpp.example', 'b@xmpp.example'],
}));

import { sendMediaMessage } from './sendMediaMessage.xmpp';

const ROOM_JID = 'room@conference.xmpp.example';
const SENDER = 'user@xmpp.example/web';
const CAPTION = 'hi @Alice look at this';
const MENTIONS: IMentionSpan[] = [
  { jid: 'alice@xmpp.example', name: 'Alice', offset: 3, length: 6 },
];

const makeClient = () => {
  const sent: Element[] = [];
  const client = {
    jid: { toString: () => SENDER },
    send: vi.fn((stanza: Element) => {
      sent.push(stanza);
    }),
  } as unknown as Client;
  return { client, sent };
};

const plainPayload = {
  firstName: 'Ada',
  lastName: 'L',
  location: 'https://files.example/one.png',
  locationPreview: '',
  mimetype: 'image/png',
  originalName: 'one.png',
  fileName: 'stored-one.png',
  size: '1024',
  attachmentId: 'att-1',
  roomJid: ROOM_JID,
  attachments: JSON.stringify([
    { attachmentId: 'att-1', location: 'https://files.example/one.png', mimetype: 'image/png' },
  ]),
};

const sealedPayload = {
  ...plainPayload,
  mimetype: 'application/octet-stream',
  originalName: '4a7d1ed414474e4033ac29ccb8653d9b',
  location: 'https://secure-files.example/bucket/9f2c',
  e2eeKeys: ['a2V5LW1hdGVyaWFsLWZvci1maWxlLW9uZQ=='],
};

beforeEach(() => {
  vi.clearAllMocks();
  isE2eeRoom.mockReturnValue(false);
  encryptGroupMessage.mockImplementation(
    async (_room, _members, content: Element[], id: string, cleartext: Element[]) => {
      const stanza = new Element('message', { id, type: 'groupchat' });
      stanza.append(new Element('encrypted-content-marker'));
      content.forEach((c) => stanza.append(c));
      cleartext.forEach((c) => stanza.append(c));
      return stanza;
    }
  );
  omemoReady.mockResolvedValue({ encryptGroupMessage });
});

describe('sendMediaMessage caption in a plain room', () => {
  it('puts the caption and its spans on <data>, in one stanza', async () => {
    const { client, sent } = makeClient();

    await sendMediaMessage(client, ROOM_JID, { ...plainPayload, caption: CAPTION, captionMentions: MENTIONS }, 'msg-1');

    expect(client.send).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(1);
    const data = sent[0].getChild('data') as Element;
    expect(data.attrs.caption).toBe(CAPTION);
    expect(JSON.parse(data.attrs.captionMentions)).toEqual(MENTIONS);
    // The body is still the placeholder every older reader expects.
    expect(sent[0].getChildText('body')).toBe('media');
    // No second message, and no text body with the caption in it.
    expect(sent[0].getChildren('body')).toHaveLength(1);
  });

  it('keeps the caption out of the legacy fields', async () => {
    const { client, sent } = makeClient();

    await sendMediaMessage(client, ROOM_JID, { ...plainPayload, caption: CAPTION }, 'msg-1');

    const data = sent[0].getChild('data') as Element;
    expect(data.attrs.originalName).toBe('one.png');
    expect(data.attrs.fileName).toBe('stored-one.png');
    expect(data.attrs.mimetype).toBe('image/png');
    expect(data.attrs.caption).toBe(CAPTION);
    expect(data.attrs.captionMentions).toBeUndefined();
  });

  it('writes nothing caption-shaped for a message without a caption (legacy stanza)', async () => {
    const { client, sent } = makeClient();

    await sendMediaMessage(client, ROOM_JID, { ...plainPayload, caption: '   ' }, 'msg-1');

    const data = sent[0].getChild('data') as Element;
    expect(data.attrs.caption).toBeUndefined();
    expect(data.attrs.captionMentions).toBeUndefined();
    expect(sent[0].getChildText('body')).toBe('media');
  });

  it('drops mention spans that no longer read "@Name" in the caption', async () => {
    const { client, sent } = makeClient();
    const stale: IMentionSpan[] = [{ jid: 'alice@xmpp.example', name: 'Alice', offset: 0, length: 6 }];

    await sendMediaMessage(client, ROOM_JID, { ...plainPayload, caption: CAPTION, captionMentions: stale }, 'msg-1');

    const data = sent[0].getChild('data') as Element;
    expect(data.attrs.captionMentions).toBeUndefined();
  });

  it('round-trips through the wire: stanza -> message with caption and mention spans', async () => {
    const { client, sent } = makeClient();
    await sendMediaMessage(client, ROOM_JID, { ...plainPayload, caption: CAPTION, captionMentions: MENTIONS }, 'msg-1');

    const received = parse(sent[0].toString());
    const parsed = await getDataFromXml(received);
    const message = await createMessageFromXml({ ...parsed, data: parsed.data } as never);

    expect(message.body).toBe('media');
    expect(message.isMediafile).toBeDefined();
    expect(message.caption).toBe(CAPTION);
    expect(message.captionMentions).toEqual(MENTIONS);
  });

  it('a legacy media stanza without a caption parses with no caption at all', async () => {
    const legacy = parse(
      `<message id="msg-old" from="${ROOM_JID}/someone" to="${ROOM_JID}" type="groupchat">
        <data senderFirstName="Ada" senderLastName="L" isMediafile="true" location="https://files.example/x.png" mimetype="image/png" originalName="x.png"/>
        <body>media</body>
      </message>`
    );

    const parsed = await getDataFromXml(legacy);
    const message = await createMessageFromXml({ ...parsed, data: parsed.data } as never);

    expect(message.body).toBe('media');
    expect(message.caption).toBeUndefined();
    expect(message.captionMentions).toBeUndefined();
  });
});

describe('sendMediaMessage caption in an e2ee room', () => {
  beforeEach(() => isE2eeRoom.mockReturnValue(true));

  it('seals the caption and its spans in the encrypted body, never on <data>', async () => {
    const { client, sent } = makeClient();

    await sendMediaMessage(client, ROOM_JID, { ...sealedPayload, caption: CAPTION, captionMentions: MENTIONS }, 'msg-1');

    const [, , content, , cleartext] = encryptGroupMessage.mock.calls[0];
    const sealed = JSON.parse((content[0] as Element).getText());
    expect(sealed).toEqual({
      v: 1,
      keys: sealedPayload.e2eeKeys,
      caption: CAPTION,
      captionMentions: MENTIONS,
    });

    const readable = cleartext.map((el: Element) => el.toString()).join('');
    expect(readable).not.toContain(CAPTION);
    expect(readable).not.toContain('Alice');
    // <data> is the clear half of the stanza: nothing caption-shaped on it.
    const data = sent[0].getChild('data') as Element;
    expect(data.attrs.caption).toBeUndefined();
    expect(data.attrs.captionMentions).toBeUndefined();
    expect(client.send).toHaveBeenCalledTimes(1);
  });

  it('a sealed message without a caption carries the keys only, as before', async () => {
    const { client } = makeClient();

    await sendMediaMessage(client, ROOM_JID, sealedPayload, 'msg-1');

    const [, , content] = encryptGroupMessage.mock.calls[0];
    expect(JSON.parse((content[0] as Element).getText())).toEqual({
      v: 1,
      keys: sealedPayload.e2eeKeys,
    });
  });

  it('a sealed caption is read back from the decrypted envelope', async () => {
    const { client } = makeClient();
    await sendMediaMessage(client, ROOM_JID, { ...sealedPayload, caption: CAPTION, captionMentions: MENTIONS }, 'msg-1');

    // What a receiver sees once OMEMO has opened the body: the envelope text
    // in <body>, the sender's clear <data> beside it, and the sealed marker.
    const [, , content] = encryptGroupMessage.mock.calls[0];
    const envelopeText = (content[0] as Element).getText();
    const received = parse(
      `<message id="msg-1" from="${ROOM_JID}/someone" to="${ROOM_JID}" type="groupchat">
        <data senderFirstName="Ada" clientEncrypted="true" mimetype="application/octet-stream"/>
        <body>${envelopeText.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</body>
      </message>`
    );

    const parsed = await getDataFromXml(received);
    expect(parsed.body).toBe('media');
    expect(parsed.data.e2eeKeys).toEqual(sealedPayload.e2eeKeys);
    expect(parsed.data.caption).toBe(CAPTION);
    expect(parsed.data.captionMentions).toEqual(MENTIONS);
  });

  it('never takes a caption from a clear attribute on a sealed message', async () => {
    const received = parse(
      `<message id="msg-2" from="${ROOM_JID}/someone" to="${ROOM_JID}" type="groupchat">
        <data senderFirstName="Ada" clientEncrypted="true" caption="forged in clear"/>
        <body>media</body>
      </message>`
    );

    const parsed = await getDataFromXml(received);
    expect(parsed.data.caption).toBeUndefined();
  });

  it('fails the send rather than sending the caption in clear when OMEMO is not ready', async () => {
    omemoReady.mockResolvedValue(undefined);
    const { client, sent } = makeClient();

    await expect(
      sendMediaMessage(client, ROOM_JID, { ...sealedPayload, caption: CAPTION }, 'msg-1')
    ).rejects.toThrow(/omemo_not_ready/);

    expect(sent).toHaveLength(0);
  });
});
