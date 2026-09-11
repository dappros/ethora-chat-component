import emojiData from '@emoji-mart/data';

// Reactions travel on the wire as emoji-mart ids ("+1", "heart") and are
// rendered by looking the id up in @emoji-mart/data. Two things used to make
// that lookup throw and take the whole chat tree down (there is no error
// boundary above a message bubble):
//
//   - a host can alias @emoji-mart/data to a stub to keep the dataset out of
//     its bundle (the AI widget does, since its visitors cannot react), so
//     `emojiData.emojis` is undefined there;
//   - a sender (a bot, another client) may put the character itself on the
//     wire rather than an id.
//
// This resolves an id to its character when the dataset is present, falls
// back to a small built-in table of the common reactions when it is not, and
// passes a bare emoji character through. Anything else renders as nothing.

const table: Record<string, { skins?: { native?: string }[] }> =
  (emojiData as any)?.emojis || (emojiData as any)?.default?.emojis || {};

const FALLBACK: Record<string, string> = {
  '+1': '👍',
  '-1': '👎',
  heart: '❤️',
  joy: '😂',
  smile: '😄',
  grin: '😁',
  laughing: '😆',
  wink: '😉',
  slightly_smiling_face: '🙂',
  heart_eyes: '😍',
  sunglasses: '😎',
  thinking_face: '🤔',
  hugging_face: '🤗',
  partying_face: '🥳',
  cry: '😢',
  sob: '😭',
  rage: '😡',
  scream: '😱',
  fire: '🔥',
  tada: '🎉',
  sparkles: '✨',
  eyes: '👀',
  pray: '🙏',
  clap: '👏',
  raised_hands: '🙌',
  ok_hand: '👌',
  wave: '👋',
  muscle: '💪',
  rocket: '🚀',
  '100': '💯',
  white_check_mark: '✅',
  x: '❌',
  star: '⭐',
  bulb: '💡',
  warning: '⚠️',
  question: '❓',
  hourglass: '⏳',
};

const looksLikeEmoji = (value: string): boolean => {
  try {
    return /\p{Extended_Pictographic}/u.test(value);
  } catch {
    return false;
  }
};

/** The character to render for a reaction id (or a raw character); '' when neither. */
export const emojiNative = (idOrNative: string | undefined | null): string => {
  const key = String(idOrNative || '').trim();
  if (!key) return '';
  const native = table[key]?.skins?.[0]?.native;
  if (native) return native;
  if (FALLBACK[key]) return FALLBACK[key];
  return looksLikeEmoji(key) ? key : '';
};
