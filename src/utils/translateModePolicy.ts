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
