import axios from 'axios';
import { store } from '../../roomStore';
import { toBaseLanguage } from '../../helpers/toBaseLanguage';

export interface TranslateEntry {
  /** the reader's locale, verbatim (e.g. "fr-CA") - used as the lookup key */
  language: string;
  languageName: string;
  translatedText: string;
}

// The dedicated translation service: a plain GET that translates `text`
// from `source` into every other supported language in one call, returning
// `{translates: [{translatedText, language, languageName}, ...]}` - the
// exact shape the receiving-side parser already consumes. It lives on its
// own host (not under the main API's /v1), so it's called with plain axios
// (no baseURL / auth interceptors) and no Authorization header - it
// doesn't need one, and the main API's token shouldn't leak to it.
// Overridable per-host via `config.translates.endpoint`.
const DEFAULT_TRANSLATE_ENDPOINT =
  'https://translate.api.chat-qa.ethora.com/translate';

/**
 * Translate a message BEFORE it goes out.
 *
 * The sender asks the translation service for the message in every locale
 * the room needs, then embeds the result into the outgoing stanza as
 *
 *     <translations value='{"translates":[...]}'/>
 *
 * ejabberd relays custom children untouched (the same way our `<data>` element
 * already travels), so every recipient receives the message with translations
 * already attached and renders them with the existing parser - no ejabberd
 * module, no change on the receiving side.
 *
 * Best-effort by design: if translation fails or times out we return [] and the
 * message is still sent, just untranslated. Never block a send on the
 * translator being up.
 */
// The pre-translate request sits on the send path (awaited before the
// stanza goes out), so it must never make sending feel slow:
// - hard request timeout, so a slow/unresponsive translator delays a send
//   by at most this much;
// - 404 negative-cache: a 404 means the backend simply doesn't have the
//   endpoint deployed (observed on chat-qa) - that won't change within
//   this session, so remember it and skip the request entirely on every
//   subsequent send instead of paying a doomed round trip each time.
const TRANSLATE_REQUEST_TIMEOUT_MS = 1500;
let translateEndpointMissing = false;

/** Test-only escape hatch for the module-level 404 negative-cache. */
export const resetTranslateEndpointAvailabilityForTests = () => {
  translateEndpointMissing = false;
};

export const fetchMessageTranslations = async (
  text: string,
  source: string,
  targets: string[]
): Promise<TranslateEntry[]> => {
  if (!text?.trim() || !source || !targets?.length) return [];
  if (translateEndpointMissing) return [];

  const endpoint =
    store.getState().chatSettingStore.config?.translates?.endpoint ||
    DEFAULT_TRANSLATE_ENDPOINT;

  try {
    const response = await axios.get(endpoint, {
      params: { source: toBaseLanguage(source), text },
      timeout: TRANSLATE_REQUEST_TIMEOUT_MS,
    });

    const list = (response?.data as { translates?: TranslateEntry[] })
      ?.translates;
    if (!Array.isArray(list)) return [];

    // The service translates into every language it supports; only ship
    // the ones this room actually needs, so the stanza stays small.
    const targetBases = new Set(targets.map(toBaseLanguage));
    return list.filter((entry) => targetBases.has(toBaseLanguage(entry?.language)));
  } catch (error) {
    if ((error as { response?: { status?: number } })?.response?.status === 404) {
      translateEndpointMissing = true;
      console.warn(
        `[ethora] translate endpoint ${endpoint} is not available - skipping pre-translation for the rest of the session.`
      );
    }
    return [];
  }
};
