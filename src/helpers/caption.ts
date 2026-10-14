import { IMentionSpan } from '../types/types';
import { safeJsonParse } from './safeJson';
import { validateMentionSpans } from './mentions';
import { getAttachmentName, getMessageAttachments, isMediaMessage } from './attachments';

/**
 * The text typed with a set of attachments, sent as part of the media
 * message itself (never as a separate text stanza).
 *
 * `mentions` index into `text`, the same way a text message's mention spans
 * index into its body.
 */
export interface CaptionInput {
  text: string;
  mentions?: IMentionSpan[];
}

export interface NormalizedCaption {
  caption: string;
  mentions?: IMentionSpan[];
}

const isSpanShape = (value: unknown): value is IMentionSpan => {
  if (!value || typeof value !== 'object') return false;
  const span = value as Record<string, unknown>;
  return (
    typeof span.jid === 'string' &&
    typeof span.name === 'string' &&
    typeof span.offset === 'number' &&
    Number.isInteger(span.offset) &&
    typeof span.length === 'number' &&
    Number.isInteger(span.length)
  );
};

/**
 * Mention spans for a caption, checked against the caption text: a span that
 * no longer reads "@Name" at its offset is dropped. Undefined when nothing is
 * left, so a caption without mentions carries no empty attribute.
 */
export const normalizeCaptionMentions = (
  value: unknown,
  caption: string
): IMentionSpan[] | undefined => {
  const parsed =
    typeof value === 'string' ? safeJsonParse<unknown>(value, []) : value;
  if (!Array.isArray(parsed)) return undefined;
  const spans = validateMentionSpans(caption, parsed.filter(isSpanShape));
  return spans.length > 0 ? spans : undefined;
};

/**
 * Turns what the composer typed into the caption that travels with the
 * media. Undefined for blank text, which means "no caption".
 */
export const normalizeCaptionInput = (
  input?: CaptionInput | null
): NormalizedCaption | undefined => {
  const text = typeof input?.text === 'string' ? input.text : '';
  if (!/\S/.test(text)) return undefined;
  const mentions = normalizeCaptionMentions(input?.mentions, text);
  return mentions ? { caption: text, mentions } : { caption: text };
};

/** What a media message's text is, and the @-mention spans that index into it. */
export interface ResolvedCaption {
  text: string;
  mentions?: IMentionSpan[];
}

export interface CaptionOptions {
  /**
   * The caller already knows this is a media message (a thin `lastMessage`
   * that only says so by its id). Otherwise it is read off the message.
   */
  isMedia?: boolean;
  /** The message is sealed: only a caption that came out of the envelope counts. */
  sealed?: boolean;
  /** Extra names of the sender, which a body may merely echo. */
  senderNames?: string[];
}

/**
 * Bodies that are not something a person typed: the media placeholder every
 * SDK sends, and the labels apps generate for a file with nothing to say.
 */
const PLACEHOLDER_BODIES = new Set([
  'media',
  'attachment',
  'attachments',
  'photo',
  'photos',
  'image',
  'images',
  'picture',
  'video',
  'audio',
  'voice',
  'voice message',
  'voice note',
  'file',
  'files',
  'document',
  'blob',
  'undefined',
  'null',
  '[object object]',
]);

/** `<data>` attributes older or foreign clients stamp the file's text on. */
const CAPTION_ALIASES = ['captionText', 'text', 'message', 'description', 'title'] as const;

const norm = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const str = (value: unknown): string =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';

const tail = (url: string): string => {
  const path = url.split(/[?#]/)[0];
  return path.slice(path.lastIndexOf('/') + 1);
};

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/** Every string a media message's `body` is allowed to merely repeat. */
const echoCandidates = (
  message: Record<string, any>,
  options: CaptionOptions
): Set<string> => {
  const out = new Set<string>();
  const add = (value: unknown) => {
    const v = norm(value);
    if (v) out.add(v);
  };

  // The file itself: its names and its URLs, as sent and as stored.
  const attachments = getMessageAttachments(message as never);
  for (const attachment of attachments) {
    add(getAttachmentName(attachment));
    add(attachment.originalName);
    add(attachment.fileName);
    for (const url of [attachment.location, attachment.locationPreview]) {
      if (!url) continue;
      add(url);
      add(safeDecode(url));
      add(tail(url));
      add(safeDecode(tail(url)));
    }
  }
  add(message.originalName);
  add(message.fileName);
  add(message.location);
  add(message.locationPreview);

  // The sender: some clients put their own name, e-mail or username in the
  // body next to the file.
  const user = (message.user ?? {}) as Record<string, unknown>;
  const first = str(message.senderFirstName) || str(message.firstName) || str(user.firstName);
  const last = str(message.senderLastName) || str(message.lastName) || str(user.lastName);
  add(user.name);
  add(`${first} ${last}`);
  add(first && !last ? first : '');
  add(user.email);
  add(user.username);
  add(message.email);
  add(message.userName);
  add(message.username);
  add(message.senderName);
  const idLocal = str(user.id).split('@')[0];
  add(idLocal);
  add(str(user.id).split('_').pop());
  add(str(message.senderJID).split('/')[0].split('@')[0]);
  for (const name of options.senderNames ?? []) add(name);
  return out;
};

/** "etest etest" is echoed as "etest": every word of the name is the body. */
const isRepeatedName = (name: string, text: string): boolean =>
  Boolean(name && text) && name.split(/\s+/).every((part) => part === text);

const isRealCaptionText = (
  text: string,
  message: Record<string, any>,
  options: CaptionOptions
): boolean => {
  const t = text.trim();
  if (!t) return false;
  const n = t.toLowerCase();
  if (PLACEHOLDER_BODIES.has(n)) return false;
  // The key envelope a sealed message carries in its body is never text.
  if (/^\{\s*"v"\s*:\s*\d+\s*,\s*"keys"/.test(t)) return false;
  const candidates = echoCandidates(message, options);
  if (candidates.has(n)) return false;
  for (const name of candidates) if (isRepeatedName(name, n)) return false;
  return true;
};

const asRecord = (message: unknown): Record<string, any> | undefined =>
  message && typeof message === 'object' ? (message as Record<string, any>) : undefined;

const resolveSpans = (
  message: Record<string, any>,
  text: string,
  keys: string[]
): IMentionSpan[] | undefined => {
  for (const key of keys) {
    const spans = normalizeCaptionMentions(message[key] ?? message.data?.[key], text);
    if (spans) return spans;
  }
  return undefined;
};

/**
 * The text of a media message, from whichever format carried it. The one
 * place that knows the formats, so every surface (bubble, room list preview,
 * notification, reply quote, copy) agrees:
 *
 *  1. `caption` (+ `captionMentions`): what this SDK sends. The only source
 *     for a sealed message, whose caption comes out of the envelope.
 *  2. The caption under another name on `<data>` (`captionText`, `text`,
 *     `message`, `description`, `title`) from other clients.
 *  3. A real `body`: older clients and other SDKs put the text in the
 *     `<body>` of the media message itself. "media", the file's name or URL,
 *     the sender's own name or e-mail and generated labels are not text.
 *
 * Never derived for a sealed message, and never for a message with no file.
 */
export const resolveMessageCaption = (
  message?: object | null,
  options: CaptionOptions = {}
): ResolvedCaption | undefined => {
  const source = asRecord(message);
  if (!source || source.isDeleted) return undefined;

  const explicit = source.caption;
  if (typeof explicit === 'string' && /\S/.test(explicit)) {
    const mentions = normalizeCaptionMentions(source.captionMentions, explicit);
    return mentions ? { text: explicit, mentions } : { text: explicit };
  }

  const sealed =
    options.sealed === true ||
    source.clientEncrypted === 'true' ||
    (Array.isArray(source.e2eeKeys) && source.e2eeKeys.length > 0);
  if (sealed) return undefined;

  const isMedia = options.isMedia ?? isMediaMessage(source as never);
  if (!isMedia) return undefined;

  for (const key of CAPTION_ALIASES) {
    const value = str(source[key] ?? source.data?.[key]);
    if (value && isRealCaptionText(value, source, options)) {
      const mentions = resolveSpans(source, value, ['captionMentions']);
      return mentions ? { text: value, mentions } : { text: value };
    }
  }

  const body = str(source.body);
  if (body && isRealCaptionText(body, source, options)) {
    const mentions = resolveSpans(source, body, ['mentions']);
    return mentions ? { text: body, mentions } : { text: body };
  }
  return undefined;
};

/** The caption a message carries, or undefined when it has none. */
export const getMessageCaption = (
  message?: object | null,
  options?: CaptionOptions
): string | undefined => resolveMessageCaption(message, options)?.text;

/** The mention spans of `getMessageCaption`'s text. */
export const getMessageCaptionMentions = (
  message?: object | null,
  options?: CaptionOptions
): IMentionSpan[] | undefined => resolveMessageCaption(message, options)?.mentions;
