import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Client } from '@xmpp/client';
import { Element } from 'ltx';

// The seam under test is "which stanza goes out, and what is readable on it",
// so OMEMO itself is stubbed: encryptGroupMessage records what it was asked to
// encrypt and returns a stand-in <encrypted> stanza carrying the cleartext
// elements it was told to leave outside.
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

// What a sealed upload actually comes back as: the backend echoes the opaque
// name and octet-stream type the client declared.
const sealedPayload = {
  firstName: 'Ada',
  lastName: 'L',
  location: 'https://secure-files.example/bucket/9f2c',
  locationPreview: '',
  mimetype: 'application/octet-stream',
  originalName: '4a7d1ed414474e4033ac29ccb8653d9b',
  fileName: 'stored-9f2c',
  size: '2048',
  attachmentId: 'att-1',
  roomJid: ROOM_JID,
  e2eeKeys: ['a2V5LW1hdGVyaWFsLWZvci1maWxlLW9uZQ=='],
};

beforeEach(() => {
  vi.clearAllMocks();
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

describe('sendMediaMessage in an e2ee room', () => {
  beforeEach(() => isE2eeRoom.mockReturnValue(true));

  it('puts the attachment keys in the encrypted body, never on <data>', async () => {
    const { client, sent } = makeClient();

    await sendMediaMessage(client, ROOM_JID, sealedPayload, 'msg-1');

    expect(encryptGroupMessage).toHaveBeenCalledTimes(1);
    const [, , content, , cleartext] = encryptGroupMessage.mock.calls[0];

    // The key rides inside the encrypted content...
    const body = JSON.parse((content[0] as Element).getText());
    expect(body).toEqual({ v: 1, keys: sealedPayload.e2eeKeys });

    // ...and nowhere in what stays readable.
    const readable = cleartext.map((el: Element) => el.toString()).join('');
    expect(readable).not.toContain(sealedPayload.e2eeKeys[0]);
    expect(sent[0].toString()).toContain('encrypted-content-marker');
  });

  it('leaves nothing identifying on the cleartext <data>', async () => {
    const { client } = makeClient();

    await sendMediaMessage(client, ROOM_JID, sealedPayload, 'msg-1');

    const [, , , , cleartext] = encryptGroupMessage.mock.calls[0];
    const data = cleartext.find((el: Element) => el.name === 'data') as Element;

    expect(data.attrs.mimetype).toBe('application/octet-stream');
    expect(data.attrs.originalName).toBe(sealedPayload.originalName);
    expect(data.attrs.locationPreview).toBe('');
    // The receiver needs to know the bytes are sealed rather than corrupt.
    expect(data.attrs.clientEncrypted).toBe('true');
  });

  it('fails the send rather than leaking the keys when OMEMO is not ready', async () => {
    // A cleartext fallback would undo the sealing; dropping the keys would
    // leave an attachment nobody can ever open. Neither is acceptable.
    omemoReady.mockResolvedValue(undefined);
    const { client, sent } = makeClient();

    await expect(
      sendMediaMessage(client, ROOM_JID, sealedPayload, 'msg-1')
    ).rejects.toThrow(/omemo_not_ready/);

    expect(sent).toHaveLength(0);
    expect(client.send).not.toHaveBeenCalled();
  });

  it('fails the send when encryption itself throws', async () => {
    encryptGroupMessage.mockRejectedValue(new Error('no_devices_for_recipient'));
    const { client, sent } = makeClient();

    await expect(
      sendMediaMessage(client, ROOM_JID, sealedPayload, 'msg-1')
    ).rejects.toThrow(/no_devices_for_recipient/);
    expect(sent).toHaveLength(0);
  });
});

describe('sendMediaMessage without sealed attachments', () => {
  it('sends the plain stanza in a plain room', async () => {
    isE2eeRoom.mockReturnValue(false);
    const { client, sent } = makeClient();
    const { e2eeKeys: _e2eeKeys, ...plain } = sealedPayload;

    await sendMediaMessage(client, ROOM_JID, { ...plain, mimetype: 'application/pdf' }, 'msg-1');

    expect(encryptGroupMessage).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
    const data = sent[0].getChild('data') as Element;
    expect(data.attrs.mimetype).toBe('application/pdf');
    expect(data.attrs.clientEncrypted).toBeUndefined();
    expect(sent[0].getChildText('body')).toBe('media');
  });

  it('does not encrypt an unsealed attachment even in an e2ee room', async () => {
    // Defensive: if sealing was skipped upstream there are no keys to protect,
    // and silently encrypting the body would only hide that from the sender.
    isE2eeRoom.mockReturnValue(true);
    const { client, sent } = makeClient();
    const { e2eeKeys: _e2eeKeys, ...plain } = sealedPayload;

    await sendMediaMessage(client, ROOM_JID, plain, 'msg-1');

    expect(encryptGroupMessage).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
  });
});
