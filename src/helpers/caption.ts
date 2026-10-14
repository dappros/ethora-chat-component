import { IMentionSpan } from '../types/types';
import { safeJsonParse } from './safeJson';
import { validateMentionSpans } from './mentions';

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

/** The caption a message carries, or undefined when it has none. */
export const getMessageCaption = (
  message?: { caption?: unknown } | null
): string | undefined => {
  const caption = message?.caption;
  return typeof caption === 'string' && /\S/.test(caption) ? caption : undefined;
};
