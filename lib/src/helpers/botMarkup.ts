import { QuickReply } from './quickReplies';

/**
 * Buttons an AI agent writes straight into its reply text.
 *
 * Bots built on the SDK attach buttons as the `quickReplies` attribute of the
 * stanza's <data> element. An LLM agent cannot do that: all it controls is the
 * text of its answer. So its system prompt teaches it an in-band form of the
 * same thing, part of the Ethora chat protocol:
 *
 *   <xml>
 *   <bot-data type="buttons">[Accept],[Reject]</bot-data>
 *   <body>Choose one please</body>
 *   </xml>
 *
 * This module turns that text into the same QuickReply buttons the attribute
 * produces, plus the text that should actually be shown. It is written for
 * model output, so it is deliberately forgiving about the envelope (the
 * <xml>/<body> wrappers are optional, code fences are unwrapped, an
 * HTML-escaped copy is accepted) and deliberately strict about what it
 * hides: only a `type="buttons"` block is consumed, and nothing is stripped
 * from a message that does not contain one.
 */

export interface BotMarkup {
  /** Text to display, with the machine-readable markup removed. */
  text: string;
  buttons: QuickReply[];
}

// A model asked for "a few options" occasionally produces a wall of them.
const MAX_BUTTONS = 10;

const BUTTONS_BLOCK =
  /<bot-data\b[^>]*\btype\s*=\s*["']?buttons["']?[^>]*>([\s\S]*?)<\/bot-data\s*>/gi;

const unescapeEntities = (value: string): string =>
  value
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/gi, '&');

/**
 * `[Accept],[Reject]` is the documented form; labels may contain commas
 * inside their brackets. A model that drops the brackets gets a plain
 * comma- or newline-separated list instead of no buttons at all.
 */
const parseLabels = (raw: string): string[] => {
  const inner = raw.trim();
  const bracketed = Array.from(inner.matchAll(/\[([^\]]*)\]/g), (m) => m[1]);
  const labels = bracketed.length ? bracketed : inner.split(/[,\n]/);
  return labels.map((label) => label.trim()).filter(Boolean);
};

export const parseBotMarkup = (body: unknown): BotMarkup => {
  const original = typeof body === 'string' ? body : '';
  // Cheap exit for the overwhelmingly common case: no markup at all.
  if (!original || !/bot-data/i.test(original)) {
    return { text: original, buttons: [] };
  }

  let text = /&lt;\s*bot-data/i.test(original)
    ? unescapeEntities(original)
    : original;

  // Models like to put XML in a fenced code block. A fence that carries the
  // markup is envelope, not content: unwrap it so the markup can be consumed
  // and the <body> shown as text rather than as a code sample.
  text = text.replace(/```[a-z]*[ \t]*\n?([\s\S]*?<bot-data[\s\S]*?)```/gi, '$1');

  let found = false;
  const labels: string[] = [];
  text = text.replace(BUTTONS_BLOCK, (_match, inner: string) => {
    found = true;
    labels.push(...parseLabels(inner));
    return '';
  });

  // Only a message that really carried a buttons block loses its wrappers;
  // anything else (a bot explaining HTML, say) is displayed untouched.
  if (!found) {
    return { text: original, buttons: [] };
  }

  text = text
    .replace(/<\?xml\b[^>]*\?>/gi, '')
    .replace(/<\/?xml\b[^>]*>/gi, '')
    .replace(/<body\b[^>]*>/gi, '')
    .replace(/<\/body\s*>/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const seen = new Set<string>();
  const buttons: QuickReply[] = [];
  for (const label of labels) {
    if (seen.has(label)) continue;
    seen.add(label);
    // The label is what gets sent: the agent reads back exactly the option
    // it offered.
    buttons.push({ name: label, value: label });
    if (buttons.length >= MAX_BUTTONS) break;
  }

  return { text, buttons };
};

/** The displayable text of a body, for previews and copy. */
export const stripBotMarkup = (body: unknown): string =>
  parseBotMarkup(body).text;
