import { describe, expect, it } from 'vitest';
import {
  ALIAS_STANZAS,
  BLOB_VOICE_STANZA,
  COMMA_LIST_STANZA,
  MOJIBAKE_NAME_STANZA,
  N1_STANZA,
  NO_MIMETYPE_STANZA,
  OCTET_STREAM_VIDEO_STANZA,
  PERCENT_NAME_STANZA,
  PLAIN_MEDIA_STANZA,
  VOICE_WEBM_STANZA,
  toMessage,
} from '../test/legacyMediaFixtures';
import { getMessageAttachments, isMediaMessage, normalizeAttachment } from './attachments';
import { getMessageCaption, getMessageCaptionMentions } from './caption';
import { deriveMediaPreview } from './lastMessagePreview';
import { createMainMessageForThread } from './createMainMessageForThread';
import { buildNotificationContent } from '../utils/messageNotificationContent';
import { getFileKind } from './fileKind';

const t = (key: string, vars?: Record<string, string | number>) =>
  ({
    'notification.photo': 'Photo',
    'notification.video': 'Video',
    'notification.audio': 'Voice message',
    'notification.file': 'File',
    'notification.photos': `${vars?.count} photos`,
    'notification.attachments': `${vars?.count} attachments`,
  })[key] ?? key;

const notify = (message: any) =>
  buildNotificationContent({
    message: {
      ...message,
      user: { id: 'app1_user9', name: 'Alice Smith' },
    },
    roomJID: 'app1_room1@conference.xmpp.example.com',
    room: { jid: 'x', name: 'Team', title: 'Team', type: 'group' } as never,
    currentXmppUsername: 'app1_me',
    tabVisible: false,
    locale: 'en',
  })?.body;

describe('legacy format (a): text in <body> beside the file (QA "app level chat N1")', () => {
  it('reads the body as the caption and the file as one attachment', async () => {
    const message = await toMessage(N1_STANZA);
    expect(isMediaMessage(message)).toBe(true);
    expect(getMessageCaption(message)).toBe('hello');
    const attachments = getMessageAttachments(message);
    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({
      mimetype: 'image/jpeg',
      originalName: 'daria-k-FU3IdARAdbI-unsplash.jpg',
      size: '1833474',
    });
    expect(attachments[0].locationPreview).toContain('/files/');
  });

  it('feeds every derived view the same text', async () => {
    const message = await toMessage(N1_STANZA);
    expect(deriveMediaPreview(message as never)).toMatchObject({
      kind: 'image',
      count: 1,
      caption: 'hello',
    });
    expect(notify(message)).toBe('Alice Smith: Photo, hello');
    expect(JSON.parse(createMainMessageForThread(message, t)).text).toBe('hello');
  });

  it('keeps mention spans of the body on the caption', () => {
    const message = {
      isMediafile: 'true',
      location: 'https://f/x.png',
      mimetype: 'image/png',
      body: 'hi @Alice look',
      mentions: [{ jid: 'alice@x', name: 'Alice', offset: 3, length: 6 }],
    };
    expect(getMessageCaption(message)).toBe('hi @Alice look');
    expect(getMessageCaptionMentions(message)).toEqual(message.mentions);
  });

  it('drops body mention spans that no longer read @Name', () => {
    const message = {
      isMediafile: 'true',
      location: 'https://f/x.png',
      mimetype: 'image/png',
      body: 'hi @Alice look',
      mentions: [{ jid: 'alice@x', name: 'Alice', offset: 0, length: 6 }],
    };
    expect(getMessageCaptionMentions(message)).toBeUndefined();
  });

  it('works for a thin backend lastMessage that only has the media id and the text', () => {
    const preview = deriveMediaPreview(
      {
        id: 'send-media-message:011e37c5',
        body: 'hello',
        user: { id: 'u', name: 'etest etest' },
      } as never,
      { senderNames: ['etest etest'] }
    );
    expect(preview).toMatchObject({ kind: 'attachment', caption: 'hello' });
  });
});

describe('format (b): the SDK placeholder body and the separate text message', () => {
  it('"media" is not a caption and the label stands in for it', async () => {
    const message = await toMessage(PLAIN_MEDIA_STANZA);
    expect(getMessageCaption(message)).toBeUndefined();
    expect(notify(message)).toBe('Alice Smith: File');
    expect(JSON.parse(createMainMessageForThread(message, t)).text).toBe('File');
    expect(deriveMediaPreview(message as never)?.caption).toBeUndefined();
  });

  it('a following text message is its own message and never a caption', () => {
    expect(getMessageCaption({ body: 'hello', id: 'send-text-message:1' })).toBeUndefined();
    expect(isMediaMessage({ body: 'hello' } as never)).toBe(false);
  });
});

describe('format (c): the text under another name on <data>', () => {
  it.each(ALIAS_STANZAS)('reads "%s" as the caption', async (_key, xml) => {
    const message = await toMessage(xml);
    expect(getMessageCaption(message)).toBe('from the alias');
    expect(notify(message)).toBe('Alice Smith: Photo, from the alias');
  });

  it('prefers the caption attribute over an alias and over the body', () => {
    expect(
      getMessageCaption({
        isMediafile: 'true',
        location: 'https://f/a.png',
        caption: 'real caption',
        text: 'alias',
        body: 'body text',
      })
    ).toBe('real caption');
  });

  it('ignores aliases on a message without a file', () => {
    expect(getMessageCaption({ text: 'x', title: 'y', body: 'hello' })).toBeUndefined();
  });
});

describe('format (d): several files in the flat fields', () => {
  it('splits a comma separated URL list into attachments', async () => {
    const message = await toMessage(COMMA_LIST_STANZA);
    const attachments = getMessageAttachments(message);
    expect(attachments.map((a) => a.originalName)).toEqual(['a.jpg', 'b.png']);
    expect(attachments.map((a) => a.mimetype)).toEqual(['image/jpeg', 'image/png']);
    expect(attachments[1].locationPreview).toMatch(/b-s\.png$/);
    expect(getMessageCaption(message)).toBe('two shots');
    expect(deriveMediaPreview(message as never)).toMatchObject({ kind: 'image', count: 2 });
    expect(notify(message)).toBe('Alice Smith: 2 photos, two shots');
  });

  it('keeps a single URL with a comma whole', () => {
    expect(
      getMessageAttachments({ location: 'https://f/a,b.png', mimetype: 'image/png' } as never)
    ).toHaveLength(1);
  });
});

describe('format (e): missing or octet-stream mimetype', () => {
  it('reads a picture from the name when there is no mimetype', async () => {
    const message = await toMessage(NO_MIMETYPE_STANZA);
    const [attachment] = getMessageAttachments(message);
    expect(attachment.mimetype).toBe('image/jpeg');
    expect(deriveMediaPreview(message as never)).toMatchObject({ kind: 'image', caption: 'sunset' });
    expect(notify(message)).toBe('Alice Smith: Photo, sunset');
  });

  it('reads a video from the name when the type is octet-stream', async () => {
    const message = await toMessage(OCTET_STREAM_VIDEO_STANZA);
    expect(getMessageAttachments(message)[0].mimetype).toBe('video/mp4');
    expect(deriveMediaPreview(message as never)?.kind).toBe('video');
    expect(notify(message)).toBe('Alice Smith: Video, clip!');
  });

  it('keeps an unknown extension generic', () => {
    expect(getFileKind('application/octet-stream', 'archive.xyz')).toBe('audio');
    expect(getFileKind(undefined, 'archive.xyz')).toBe('file');
    expect(getFileKind('application/octet-stream', 'pic.PNG')).toBe('image');
  });
});

describe('format (e/f): voice notes', () => {
  it('a blob with a duration and octet-stream stays a voice note, whatever the stored extension', async () => {
    const message = await toMessage(BLOB_VOICE_STANZA);
    const [attachment] = getMessageAttachments(message);
    expect(attachment.mimetype).toBe('application/octet-stream');
    expect(attachment.duration).toBe('12');
    expect(deriveMediaPreview(message as never)).toMatchObject({
      kind: 'voice',
      durationText: '0:12',
    });
    expect(getMessageCaption(message)).toBeUndefined();
  });

  it('a missing mimetype with a blob name and a duration is a voice note too', () => {
    const [attachment] = getMessageAttachments({
      location: 'https://f/x',
      originalName: 'blob',
      mediaDuration: 9,
    } as never);
    expect(attachment.duration).toBe('9');
    expect(getFileKind(attachment.mimetype, 'blob')).toBe('audio');
  });

  it('audio/webm carries its duration from the flat field', async () => {
    const message = await toMessage(VOICE_WEBM_STANZA);
    expect(getMessageAttachments(message)[0]).toMatchObject({
      mimetype: 'audio/webm',
      duration: '7.5',
    });
    expect(deriveMediaPreview(message as never)?.durationText).toBe('0:07');
  });
});

describe('formats (h), (i): names and sizes', () => {
  it('decodes a percent-encoded name', async () => {
    const message = await toMessage(PERCENT_NAME_STANZA);
    expect(getMessageAttachments(message)[0].originalName).toBe('Список.pdf');
  });

  it('repairs a mojibake name', async () => {
    const message = await toMessage(MOJIBAKE_NAME_STANZA);
    expect(getMessageAttachments(message)[0].originalName).toBe('Список.pdf');
  });

  it('accepts numeric sizes as numbers or strings', () => {
    expect(normalizeAttachment({ location: 'https://f/a.png', size: 12345 })?.size).toBe('12345');
    expect(normalizeAttachment({ location: 'https://f/a.png', size: '12345' })?.size).toBe('12345');
  });
});

describe('what is not a caption', () => {
  const media = (body: string, extra: Record<string, unknown> = {}) => ({
    isMediafile: 'true',
    location: 'https://files.example.com/files/9f8e7d.jpg',
    mimetype: 'image/jpeg',
    originalName: 'holiday photo.jpg',
    fileName: '9f8e7d',
    body,
    user: { id: 'app1_user1', name: 'Roman Leshchuh' },
    ...extra,
  });

  it.each([
    ['the placeholder', 'media'],
    ['the placeholder in other case', ' Media '],
    ['an empty body', ''],
    ['whitespace', '   \n '],
    ['the original name', 'holiday photo.jpg'],
    ['the original name in other case', 'HOLIDAY PHOTO.JPG'],
    ['the stored name', '9f8e7d'],
    ['the stored name with its extension', '9f8e7d.jpg'],
    ['the URL', 'https://files.example.com/files/9f8e7d.jpg'],
    ['the sender name', 'Roman Leshchuh'],
    ['a generated label', 'Photo'],
    ['a generated voice label', 'Voice message'],
    ['"blob"', 'blob'],
    ['"undefined"', 'undefined'],
  ])('%s gives no caption', (_label, body) => {
    expect(getMessageCaption(media(body))).toBeUndefined();
  });

  it('the sender e-mail, username and a doubled first name give no caption', () => {
    const user = { id: 'x', name: 'etest etest', email: 'etest@example.com', username: 'etest7' };
    expect(getMessageCaption(media('etest@example.com', { user }))).toBeUndefined();
    expect(getMessageCaption(media('etest7', { user }))).toBeUndefined();
    expect(getMessageCaption(media('etest', { user }))).toBeUndefined();
  });

  it('the sender name from the data fields gives no caption', () => {
    expect(
      getMessageCaption(
        media('Ann Lee', { user: { id: 'x' }, senderFirstName: 'Ann', senderLastName: 'Lee' })
      )
    ).toBeUndefined();
  });

  it('a name passed by the caller gives no caption', () => {
    expect(getMessageCaption(media('Dr Roman'), { senderNames: ['dr roman'] })).toBeUndefined();
  });

  it('a body that merely contains the file name is still a caption', () => {
    expect(getMessageCaption(media('holiday photo.jpg is mine'))).toBe('holiday photo.jpg is mine');
  });

  it('a text message has no caption, whatever its body', () => {
    expect(getMessageCaption({ body: 'hello' })).toBeUndefined();
    expect(getMessageCaption({ body: 'hello', isMediafile: 'false' })).toBeUndefined();
  });

  it('a deleted media message has no caption', () => {
    expect(getMessageCaption(media('hello', { isDeleted: true }))).toBeUndefined();
  });
});

describe('sealed (e2ee) messages never derive a caption', () => {
  const sealed = {
    isMediafile: 'true',
    location: 'https://f/cipher',
    mimetype: 'application/octet-stream',
  };

  it('ignores the body of a clientEncrypted message', () => {
    expect(getMessageCaption({ ...sealed, clientEncrypted: 'true', body: 'secret text' })).toBeUndefined();
  });

  it('ignores the body when the keys are present', () => {
    expect(getMessageCaption({ ...sealed, e2eeKeys: ['k'], body: 'secret text' })).toBeUndefined();
  });

  it('ignores the body when the caller says sealed', () => {
    expect(getMessageCaption({ ...sealed, body: 'secret text' }, { sealed: true })).toBeUndefined();
  });

  it('still shows a caption that came out of the envelope', () => {
    expect(getMessageCaption({ ...sealed, clientEncrypted: 'true', caption: 'opened', body: 'media' })).toBe(
      'opened'
    );
  });

  it('a sealed row in the room list shows no body text', () => {
    const preview = deriveMediaPreview(
      { ...sealed, body: 'secret text' } as never,
      { sealed: true }
    );
    expect(preview?.caption).toBeUndefined();
  });

  it('a sealed reply quote carries no label and no caption', () => {
    const message = {
      id: 'm',
      body: 'media',
      date: '2026-10-14T00:00:00Z',
      roomJid: 'r',
      user: { id: 'u', name: 'U' },
      clientEncrypted: 'true',
      ...sealed,
    } as never;
    expect(JSON.parse(createMainMessageForThread(message, t)).text).toBe('media');
  });
});
