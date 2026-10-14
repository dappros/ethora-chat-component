import { parse } from 'ltx';
import { getDataFromXml } from '../helpers/getDataFromXml';
import { createMessageFromXml } from '../helpers/createMessageFromXml';
import { IMessage } from '../types/types';

/**
 * Media messages as they exist on the wire, one stanza per format found in
 * the wild (QA room "app level chat N1" and the other Ethora SDKs). Hosts,
 * ids and names are sanitised copies; the shapes are the real ones.
 */
const ROOM = 'app1_room1@conference.xmpp.example.com';
const FROM = `${ROOM}/app1_user1`;

const stanza = (id: string, body: string | null, dataAttrs: Record<string, string>) => {
  const attrs = Object.entries(dataAttrs)
    .map(([key, value]) => `${key}="${value.replace(/"/g, '&quot;')}"`)
    .join(' ');
  return `<message xmlns="jabber:client" id="${id}" type="groupchat" from="${FROM}">${
    body === null ? '' : `<body>${body}</body>`
  }<stanza-id id="17919711801062851" by="${ROOM}" xmlns="urn:xmpp:sid:0"/><data ${attrs}/></message>`;
};

const FILES = 'https://files.example.com/files';

/**
 * (a) N1: one <message>, the typed text in <body>, the file on <data>, and
 * nothing named caption anywhere. Sent by a client with no sender fields.
 */
export const N1_STANZA = stanza('send-media-message:011e37c5', 'hello', {
  isMediafile: 'true',
  expiresAt: '0',
  location: `${FILES}/16ee46ff47d96275902815e7826ccd4e.jpg`,
  locationPreview: `${FILES}/16ee46ff47d96275902815e7826ccd4e.jpg`,
  mimetype: 'image/jpeg',
  originalName: 'daria-k-FU3IdARAdbI-unsplash.jpg',
  size: '1833474',
  isReply: 'false',
  showInChannel: 'false',
  mainMessage: '',
  push: 'true',
});

/** (b) What the Ethora SDKs send for a file: body "media" and the sender's fields. */
export const PLAIN_MEDIA_STANZA = stanza('send-media-message:b1', 'media', {
  senderJID: `${FROM.replace('/app1_user1', '')}/abc`,
  senderFirstName: 'user',
  senderLastName: 'user',
  isMediafile: 'true',
  location: `${FILES}/574f4ba5.pdf`,
  locationPreview: '',
  mimetype: 'application/pdf',
  originalName: 'sample.pdf',
  fileName: '574f4ba5',
  size: '18810',
});

/** (c) The text under other names on <data>, with body "media". */
export const ALIAS_STANZAS = ['text', 'message', 'description', 'title', 'captionText'].map(
  (key) =>
    [
      key,
      stanza(`send-media-message:c-${key}`, 'media', {
        isMediafile: 'true',
        location: `${FILES}/pic.png`,
        mimetype: 'image/png',
        originalName: 'pic.png',
        [key]: 'from the alias',
      }),
    ] as const
);

/** (d) Several files in the flat fields, comma separated. */
export const COMMA_LIST_STANZA = stanza('send-media-message:d1', 'two shots', {
  isMediafile: 'true',
  location: `${FILES}/a.jpg,${FILES}/b.png`,
  locationPreview: `${FILES}/a-s.jpg,${FILES}/b-s.png`,
  mimetype: 'image/jpeg,image/png',
  originalName: 'a.jpg,b.png',
});

/** (e) isMediafile with no mimetype, and with octet-stream; the name has the extension. */
export const NO_MIMETYPE_STANZA = stanza('send-media-message:e1', 'sunset', {
  isMediafile: 'true',
  location: `${FILES}/c0ffee`,
  originalName: 'Sunset.JPG',
});
export const OCTET_STREAM_VIDEO_STANZA = stanza('send-media-message:e2', 'clip!', {
  isMediafile: 'true',
  location: `${FILES}/c0ffee`,
  mimetype: 'application/octet-stream',
  originalName: 'clip.mp4',
});

/** (e/f) A recorded voice note: octet-stream, a `blob` name and a duration. */
export const BLOB_VOICE_STANZA = stanza('send-media-message:f1', 'media', {
  isMediafile: 'true',
  location: `${FILES}/9d1f.webm`,
  mimetype: 'application/octet-stream',
  originalName: 'blob',
  duration: '12',
  waveForm: '',
});
export const VOICE_WEBM_STANZA = stanza('send-media-message:f2', 'media', {
  isMediafile: 'true',
  location: `${FILES}/9d20.webm`,
  mimetype: 'audio/webm',
  originalName: 'blob',
  duration: '7.5',
});

/** (h) A percent-encoded name and a UTF-8-read-as-Latin-1 one. */
export const PERCENT_NAME_STANZA = stanza('send-media-message:h1', 'media', {
  isMediafile: 'true',
  location: `${FILES}/doc.pdf`,
  mimetype: 'application/pdf',
  originalName: '%D0%A1%D0%BF%D0%B8%D1%81%D0%BE%D0%BA.pdf',
});
export const MOJIBAKE_NAME_STANZA = stanza('send-media-message:h2', 'media', {
  isMediafile: 'true',
  location: `${FILES}/doc2.pdf`,
  mimetype: 'application/pdf',
  originalName: Buffer.from('Список.pdf', 'utf8').toString('latin1'),
});

export const toMessage = async (xml: string): Promise<IMessage> => {
  const data = await getDataFromXml(parse(xml) as never);
  return (await createMessageFromXml(data as never)) as IMessage;
};
