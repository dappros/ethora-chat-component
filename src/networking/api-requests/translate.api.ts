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
export const fetchMessageTranslations = async (
  text: string,
  source: string,
  targets: string[]
): Promise<TranslateEntry[]> => {
  if (!text?.trim() || !source || !targets?.length) return [];

  try {
    const token = store.getState().chatSettingStore.user?.token;
    const response = await http.post(
      '/chats/translate',
      { text, source, targets },
      token ? { headers: { Authorization: token } } : undefined
    );

    const list = (response?.data as { translates?: TranslateEntry[] })
      ?.translates;
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};
