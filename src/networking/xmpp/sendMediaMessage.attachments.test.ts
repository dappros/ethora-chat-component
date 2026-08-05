import { describe, expect, it, vi } from 'vitest';
import { Client } from '@xmpp/client';
import { Element } from 'ltx';
import { sendMediaMessage } from './sendMediaMessage.xmpp';
import { getDataFromXml } from '../../helpers/getDataFromXml';
import { createMessageFromXml } from '../../helpers/createMessageFromXml';
import {
  getMessageAttachments,
  serializeAttachments,
} from '../../helpers/attachments';
import { IMessage } from '../../types/types';

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

const basePayload = {
  firstName: 'Ada',
  lastName: 'L',
  location: 'https://files.example/one.pdf',
  locationPreview: '',
  mimetype: 'application/pdf',
  originalName: 'one.pdf',
  fileName: 'stored-one.pdf',
  size: '2048',
  attachmentId: 'att-1',
  roomJid: ROOM_JID,
};

/** Walks a sent stanza back through the receive path. */
const receive = async (stanza: Element): Promise<IMessage> => {
  const data = await getDataFromXml(stanza);
  return createMessageFromXml(data as never);
};

describe('media stanza attachment round-trip', () => {
  it('carries every attachment through send -> parse', async () => {
    const { client, sent } = makeClient();
    const attachments = [
      {
        attachmentId: 'att-1',
        location: 'https://files.example/one.pdf',
        mimetype: 'application/pdf',
        originalName: 'one.pdf',
        size: '2048',
      },
      {
        attachmentId: 'att-2',
        location: 'https://files.example/two.png',
        locationPreview: 'https://files.example/two-thumb.png',
        mimetype: 'image/png',
        originalName: 'two.png',
        size: '4096',
      },
    ];

    sendMediaMessage(
      client,
      ROOM_JID,
      { ...basePayload, attachments: serializeAttachments(attachments) },
      'msg-1'
    );

    const message = await receive(sent[0]);

    expect(getMessageAttachments(message)).toMatchObject([
      { attachmentId: 'att-1', originalName: 'one.pdf' },
      { attachmentId: 'att-2', originalName: 'two.png' },
    ]);
  });

  // Old clients read the flat fields and know nothing about `attachments`.
  // Those fields must keep describing attachment #0 so they show one file
  // rather than nothing.
  it('keeps the flat legacy fields pointing at the first attachment', () => {
    const { client, sent } = makeClient();

    sendMediaMessage(
      client,
      ROOM_JID,
      { ...basePayload, attachments: serializeAttachments([]) },
      'msg-2'
    );

    const attrs = sent[0].getChild('data')?.attrs;
    expect(attrs).toMatchObject({
      location: 'https://files.example/one.pdf',
      mimetype: 'application/pdf',
      originalName: 'one.pdf',
      isMediafile: 'true',
    });
  });

  it('omits the attribute entirely for a single-file message', async () => {
    const { client, sent } = makeClient();

    sendMediaMessage(client, ROOM_JID, basePayload, 'msg-3');

    expect(sent[0].getChild('data')?.attrs).not.toHaveProperty('attachments');

    const message = await receive(sent[0]);
    expect(getMessageAttachments(message)).toMatchObject([
      { location: 'https://files.example/one.pdf', originalName: 'one.pdf' },
    ]);
  });

  it('falls back to the single file when the payload is corrupt', async () => {
    const { client, sent } = makeClient();

    sendMediaMessage(
      client,
      ROOM_JID,
      { ...basePayload, attachments: '{not-json' },
      'msg-4'
    );

    const message = await receive(sent[0]);
    expect(getMessageAttachments(message)).toMatchObject([
      { location: 'https://files.example/one.pdf' },
    ]);
  });
});
