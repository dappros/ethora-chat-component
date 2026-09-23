import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Client, xml } from '@xmpp/client';
import { Element } from 'ltx';

// End-to-end for one sealed attachment: seal -> stanza -> parse -> open.
// The OMEMO layer is stubbed at the same seam the transport uses, so this
// exercises the real envelope, the real body encoding and the real receive
// parsing rather than re-asserting each in isolation.
const encryptGroupMessage = vi.fn();
const isE2eeRoom = vi.fn(() => true);

vi.mock('../e2ee', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./index')>();
  return {
    ...actual,
    isE2eeRoom: (...args: unknown[]) => isE2eeRoom(...(args as [string])),
    omemoReady: async () => ({ encryptGroupMessage }),
    accountDomain: () => 'xmpp.example',
    roomRecipients: () => ['a@xmpp.example'],
  };
});

import { sealFileForUpload } from './fileEnvelope';
import { sendMediaMessage } from '../networking/xmpp/sendMediaMessage.xmpp';
import { getDataFromXml } from '../helpers/getDataFromXml';
import { createMessageFromXml } from '../helpers/createMessageFromXml';
import { saveSealedAttachment } from '../helpers/sealedAttachments';

const ROOM_JID = 'room@conference.xmpp.example';

beforeEach(() => {
  vi.clearAllMocks();
  isE2eeRoom.mockReturnValue(true);
  // Stand-in for OMEMO: the <body> it was handed is what a receiving client
  // gets back after decryptStanzaInPlace rewrites the stanza.
  encryptGroupMessage.mockImplementation(
    async (_room, _members, content: Element[], id: string, cleartext: Element[]) => {
      const stanza = new Element('message', {
        id,
        type: 'groupchat',
        from: `${ROOM_JID}/sender`,
      });
      content.forEach((c) => stanza.append(c));
      cleartext.forEach((c) => stanza.append(c));
      return stanza;
    }
  );
});

describe('a sealed attachment, all the way round', () => {
  it('leaves the room sealed and arrives openable', async () => {
    const original = new File(['the actual contents'], 'contract-final.pdf', {
      type: 'application/pdf',
    });

    // --- sender ---
    const seal = await sealFileForUpload(original);

    const sent: Element[] = [];
    const client = {
      jid: { toString: () => 'me@xmpp.example/web' },
      send: (stanza: Element) => sent.push(stanza),
    } as unknown as Client;

    await sendMediaMessage(
      client,
      ROOM_JID,
      {
        // What the backend echoes for a clientEncrypted upload.
        location: 'https://secure-files.example/bucket/9f2c',
        locationPreview: '',
        mimetype: 'application/octet-stream',
        originalName: seal.filename,
        fileName: 'stored-9f2c',
        size: String(seal.ciphertext.length),
        attachmentId: 'att-1',
        roomJid: ROOM_JID,
        e2eeKeys: [seal.keyMaterial],
      },
      'msg-1'
    );

    // --- what the server can see ---
    const stanza = sent[0];
    const data = stanza.getChild('data') as Element;
    expect(data.attrs.mimetype).toBe('application/octet-stream');
    expect(data.attrs.originalName).not.toContain('contract');
    expect(data.toString()).not.toContain(seal.keyMaterial);

    // --- receiver: getDataFromXml lifts the keys and restores the body ---
    const parsed = await getDataFromXml(stanza);
    expect(parsed.body).toBe('media');

    const message = await createMessageFromXml(parsed as never);
    expect(message.e2eeKeys).toEqual([seal.keyMaterial]);

    // --- receiver: fetch + open ---
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => seal.ciphertext.slice().buffer,
    })) as unknown as typeof fetch;

    const save = vi.fn();
    const meta = await saveSealedAttachment(
      message.location as string,
      message.e2eeKeys![0],
      { fetchImpl, save }
    );

    expect(meta.originalname).toBe('contract-final.pdf');
    expect(meta.mimetype).toBe('application/pdf');

    // ...and what reaches the disk is the file the sender picked.
    const [blob, fileName] = save.mock.calls[0];
    expect(fileName).toBe('contract-final.pdf');
    expect(new TextDecoder().decode(await blob.arrayBuffer())).toBe(
      'the actual contents'
    );
  });

  it('an ordinary media message still parses with no keys', async () => {
    isE2eeRoom.mockReturnValue(false);
    const sent: Element[] = [];
    const client = {
      jid: { toString: () => 'me@xmpp.example/web' },
      send: (stanza: Element) => sent.push(stanza),
    } as unknown as Client;

    await sendMediaMessage(
      client,
      ROOM_JID,
      {
        location: 'https://files.example/photo.png',
        locationPreview: 'https://files.example/photo-thumb.png',
        mimetype: 'image/png',
        originalName: 'photo.png',
        fileName: 'stored-photo.png',
        size: '2048',
        roomJid: ROOM_JID,
      },
      'msg-2'
    );

    const parsed = await getDataFromXml(sent[0]);
    const message = await createMessageFromXml(parsed as never);

    expect(parsed.body).toBe('media');
    expect(message.e2eeKeys).toBeUndefined();
    expect(message.mimetype).toBe('image/png');
  });

  it('keeps the body intact when a sealed message could not be decrypted', async () => {
    // decryptStanzaInPlace leaves a localised placeholder in <body> and no
    // keys. The message must survive parsing rather than being mangled.
    const stanza = xml(
      'message',
      { id: 'msg-3', type: 'groupchat', from: `${ROOM_JID}/sender` },
      xml('body', {}, 'Could not decrypt this message'),
      xml('data', {
        location: 'https://secure-files.example/bucket/9f2c',
        mimetype: 'application/octet-stream',
        clientEncrypted: 'true',
        omemoEncrypted: 'true',
        roomJid: ROOM_JID,
      })
    ) as unknown as Element;

    const parsed = await getDataFromXml(stanza);
    const message = await createMessageFromXml(parsed as never);

    expect(parsed.body).toBe('Could not decrypt this message');
    expect(message.e2eeKeys).toBeUndefined();
  });
});
