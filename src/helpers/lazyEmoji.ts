import { useEffect, useState } from 'react';

// @emoji-mart/data is a multi-hundred-KB JSON blob; loading it lazily keeps
// it out of the host's initial bundle. The handful of ids used for quick
// reactions are inlined below so those render instantly even before the
// full dataset arrives.
const FIXED_EMOJIS: Record<string, string> = {
  joy: '😂',
  heart: '❤️',
  fire: '🔥',
  '+1': '👍',
  smile: '😄',
  scream: '😱',
};

let emojiData: any = null;
let emojiDataPromise: Promise<any> | null = null;

export const loadEmojiData = (): Promise<any> => {
  if (!emojiDataPromise) {
    emojiDataPromise = import('@emoji-mart/data').then((module) => {
      emojiData = module.default;
      return emojiData;
    });
  }
  return emojiDataPromise;
};

export const getEmojiNativeById = (id: string): string => {
  const emoji = emojiData?.emojis?.[id];
  if (emoji) return emoji.skins?.[0]?.native ?? '';
  return FIXED_EMOJIS[id] ?? '';
};

// Kicks off the dataset load and re-renders the caller once it lands, so
// lookups that returned '' on first paint fill in.
export const useEmojiData = (): boolean => {
  const [ready, setReady] = useState(emojiData !== null);

  useEffect(() => {
    if (ready) return;
    let mounted = true;
    loadEmojiData().then(() => {
      if (mounted) setReady(true);
    });
    return () => {
      mounted = false;
    };
  }, [ready]);

  return ready;
};
