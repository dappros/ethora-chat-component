import { IConfig } from '../types/types';

export type TranslateMode = 'auto' | 'manual';

/**
 * Whether the reader is allowed to pick auto vs manual themselves via the
 * language-selector modal's switcher. `forceType: true` means the host has
 * pinned `translates.mode` as policy - the switcher must not even render,
 * let alone let a reader flip it.
 */
export const canReaderChooseTranslateMode = (
  translates?: IConfig['translates']
): boolean => !translates?.forceType;

/**
 * The mode actually in effect for this reader right now.
 *
 * `forceType` wins unconditionally - even a leftover `readerMode` from
 * before the host turned forcing on must not leak through. Otherwise the
 * reader's own pick (if they've touched the switcher) wins over the host's
 * declared default, and the host's `mode` (defaulting to 'auto') is the
 * fallback for a reader who never has.
 */
export const resolveTranslateMode = (
  translates?: IConfig['translates'],
  readerMode?: TranslateMode
): TranslateMode => {
  const hostDefault: TranslateMode = translates?.mode || 'auto';
  if (translates?.forceType) return hostDefault;
  return readerMode || hostDefault;
};

// Whether THIS reader's outgoing messages get tagged with
// `<translate source="xx"/>` (sendTextMessageWithTranslateTag) instead of
// going out as a plain, untagged send. Two layers: the host must have the
// feature enabled at all (config.translates.enabled - a build-time
// decision), AND the reader must not have opted out via the
// language-selector toggle (translateSendEnabled - a runtime one).
// `undefined` means the reader never touched the toggle, which reads as
// opted-in so existing hosts see no behaviour change until someone
// explicitly turns it off.
//
// Lives here rather than in useSendMessage so the retry control in the
// message bubble can ask the same question without importing the whole
// send hook (and the upload/firebase graph behind it).
export const shouldTagOutgoingTranslateSource = (
  translatesEnabled: boolean | undefined,
  translateSendEnabled: boolean | undefined
): boolean => !!translatesEnabled && translateSendEnabled !== false;
