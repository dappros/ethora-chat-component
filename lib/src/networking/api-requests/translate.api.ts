import axios from 'axios';
import { toBaseLanguage } from '../../helpers/toBaseLanguage';
import { Translation } from '../../helpers/transformTranslatations';

// The dedicated translation service: a plain GET that translates `text`
// from `source` into every locale it supports in one call, returning
// `{translates: [{translatedText, language, languageName}, ...]}` - the
// same shape already parsed out of the `<translations value='...'/>`
// stanza attribute (see getDataFromXml). It lives on its own host (not
// under the main API), so it's called with plain axios (no baseURL / auth
// interceptors) and no Authorization header - it doesn't need one, and the
// main API's token shouldn't leak to it.
//
// This is the reader-facing, on-demand (manual mode) call: it fires once,
// when the reader clicks "Translate" on a single message, so a slightly
// longer timeout than a send-path pre-translate is fine - nothing else is
// blocked on it.
const TRANSLATE_REQUEST_TIMEOUT_MS = 5000;

// A 404 means this deployment doesn't have the service behind that
// endpoint at all - that won't change within the session, so remember it
// per-endpoint and skip the request entirely on every subsequent click
// instead of paying a doomed round trip each time.
const missingEndpoints = new Set<string>();

/** Test-only escape hatch for the module-level 404 negative-cache. */
export const resetTranslateEndpointAvailabilityForTests = () => {
  missingEndpoints.clear();
};

interface TranslateServiceResponse {
  translates?: Translation[];
}

/**
 * Pick the entry matching the reader's locale out of everything the
 * service returned: the reader's full locale verbatim first (e.g.
 * "fr-CA"), then falling back to a base-language match (a reader locale of
 * "en" or "en-US" against a returned "en-CA" entry) - the service's locale
 * keys carry a region the reader's own locale may not (or may spell
 * differently), and region is not a translation boundary.
 */
const pickEntryForLocale = (
  list: Translation[] | undefined,
  readerLocale: string
): Translation | undefined => {
  if (!Array.isArray(list) || !list.length) return undefined;

  const exact = list.find((entry) => entry?.language === readerLocale);
  if (exact) return exact;

  const targetBase = toBaseLanguage(readerLocale);
  return list.find((entry) => toBaseLanguage(entry?.language) === targetBase);
};

/**
 * Fetch a translation of `text` (written in `source`) from the translate
 * service at `endpoint`, returning the entry matching `readerLocale`, or
 * undefined when there's genuinely nothing to show (no source language, no
 * usable endpoint, the request failed, or the service simply doesn't cover
 * that locale).
 *
 * Best-effort by design and never throws: a manual "Translate" click should
 * end in either a translation or the existing `translation.failed` retry
 * link, never an unhandled rejection.
 */
export const fetchTranslation = async (
  text: string,
  source: string | undefined,
  readerLocale: string,
  endpoint: string | undefined
): Promise<Translation | undefined> => {
  if (!text?.trim() || !source || !readerLocale || !endpoint) {
    return undefined;
  }
  if (missingEndpoints.has(endpoint)) return undefined;

  try {
    const response = await axios.get<TranslateServiceResponse>(endpoint, {
      params: { source: toBaseLanguage(source), text },
      timeout: TRANSLATE_REQUEST_TIMEOUT_MS,
    });

    // Tolerate a differently-shaped deployment (e.g. a single-translation
    // `{translatedText, ...}` body with no `translates` list) rather than
    // throwing - there's simply nothing to pick an entry out of.
    const list = response?.data?.translates;
    return pickEntryForLocale(list, readerLocale);
  } catch (error) {
    if (
      (error as { response?: { status?: number } })?.response?.status === 404
    ) {
      missingEndpoints.add(endpoint);
    }
    return undefined;
  }
};
