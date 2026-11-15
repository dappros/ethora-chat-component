import { describe, expect, it, vi } from 'vitest';
import { Client } from '@xmpp/client';
import { Element } from 'ltx';
import { sendMediaMessage } from './sendMediaMessage.xmpp';
import { getDataFromXml } from '../../helpers/getDataFromXml';
import { createMessageFromXml } from '../../helpers/createMessageFromXml';

const ROOM_JID = 'room@conference.xmpp.example';

const makeClient = () => {
  const sent: Element[] = [];
  const client = {
    jid: { toString: () => 'user@xmpp.example/web' },
    send: vi.fn((stanza: Element) => {
      sent.push(stanza);
    }),
  } as unknown as Client;
  return { client, sent };
};

const payload = {
  firstName: 'Ada',
  lastName: 'L',
  location: 'https://secure-files.example/b/one.png',
  locationPreview: 'https://secure-files.example/b/one-thumb.png',
  mimetype: 'image/png',
  originalName: 'one.png',
  roomJid: ROOM_JID,
};

describe('sensitive media on the wire', () => {
  it('stamps isSensitive and sensitiveCategory on <data> and they parse back', async () => {
    const { client, sent } = makeClient();
    await sendMediaMessage(
      client,
      ROOM_JID,
      { ...payload, isSensitive: 'true', sensitiveCategory: 'nudity' },
      'send-media-message:1'
    );
    const data = sent[0].getChild('data');
    expect(data?.attrs.isSensitive).toBe('true');
    expect(data?.attrs.sensitiveCategory).toBe('nudity');

    const message = await createMessageFromXml((await getDataFromXml(sent[0])) as never);
    expect(message.isSensitive).toBe('true');
    expect(message.sensitiveCategory).toBe('nudity');
  });

  it('leaves the attributes off a file that was not flagged', async () => {
    const { client, sent } = makeClient();
    await sendMediaMessage(client, ROOM_JID, payload, 'send-media-message:2');
    const data = sent[0].getChild('data');
    expect('isSensitive' in (data?.attrs || {})).toBe(false);
    expect('sensitiveCategory' in (data?.attrs || {})).toBe(false);
  });
});
