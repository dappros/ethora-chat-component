import http from '../apiClient';
import { store } from '../../roomStore';

export interface TranslateEntry {
  /** the reader's locale, verbatim (e.g. "fr-CA") - used as the lookup key */
  language: string;
  languageName: string;
  translatedText: string;
}

/**
 * Translate a message BEFORE it goes out.
 *
 * The sender asks the backend (`POST /v1/chats/translate`, which proxies to the
 * self-hosted translation service) for the message in every locale the room
 * needs, then embeds the result into the outgoing stanza as
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

  try {
    const token = store.getState().chatSettingStore.user?.token;
    const response = await http.post(
      '/chats/translate',
      { text, source, targets },
      {
        timeout: TRANSLATE_REQUEST_TIMEOUT_MS,
        ...(token ? { headers: { Authorization: token } } : {}),
      }
    );

    const list = (response?.data as { translates?: TranslateEntry[] })
      ?.translates;
    return Array.isArray(list) ? list : [];
  } catch (error) {
    if ((error as { response?: { status?: number } })?.response?.status === 404) {
      translateEndpointMissing = true;
      console.warn(
        '[ethora] /chats/translate is not available on this backend - skipping pre-translation for the rest of the session.'
      );
    }
    return [];
  }
};
