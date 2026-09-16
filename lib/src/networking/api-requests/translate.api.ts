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
//
// CORS note for whoever wires up a self-hosted deployment of this service:
// a browser fetch needs the response to carry
// `Access-Control-Allow-Origin`. The reference server (ethora-translate-
// server) only sends it when its `CORS_ORIGIN` env var is set - without
// that, `curl` and server-to-server calls work fine but this call fails
// silently in the browser (the catch below just shows the retry link).
// If you can't set that env var, pass `config.translates.onTranslate`
// instead and proxy the request through your own backend.
const TRANSLATE_REQUEST_TIMEOUT_MS = 5000;

// Two deployments of the service exist side by side:
//  - the older/currently-live one only understands
//    `GET <endpoint>?source=&text=` and answers with the multi-locale
//    `{translates: [...]}` shape;
//  - the newer one (see ethora-translate-server's src/server.ts) dropped
//    that GET route entirely and instead exposes
//    `POST <endpoint>` with `{text, source, target, targetLocale}`,
//    answering with a single `{translatedText, engine, cached}`.
// `fetchTranslation` tries GET first (one round trip, no preflight) and
// only falls back to POST when the GET route itself isn't there (404/405).
const NOT_FOUND_STATUSES = new Set([404, 405]);

// Per-endpoint "this form of the call isn't there" memory, so a deployment
// missing one route doesn't pay a doomed request for it on every click.
// `missingEndpoints` (the full negative-cache: skip the endpoint outright)
// is only populated once BOTH forms have come back 404/405 - if only GET
// is missing, the endpoint is still usable via POST, so it must stay out
// of that set or a POST-capable deployment would get disabled by its GET
// 404 alone.
const getRouteMissing = new Set<string>();
const postRouteMissing = new Set<string>();
const missingEndpoints = new Set<string>();

/** Test-only escape hatch for the module-level 404 negative-cache. */
export const resetTranslateEndpointAvailabilityForTests = () => {
  getRouteMissing.clear();
  postRouteMissing.clear();
  missingEndpoints.clear();
};

interface TranslateServiceResponse {
  translates?: Translation[];
}

// The newer deployment's single-translation shape (translateOne's return
// value in ethora-translate-server/src/server.ts): no locale field at all,
// since the caller already told it which target it wanted.
interface SingleTranslateResponse {
  translatedText?: string;
  engine?: string;
  cached?: boolean;
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

const statusOf = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } })?.response?.status;

// A plain string-literal discriminant (rather than an ad-hoc
// `Translation | undefined | { notFound: true }` union) so the caller can
// narrow with a simple `=== 'not-found'` check that holds up under any
// tsconfig this file is compiled with, `strictNullChecks` included or not.
type RouteResult =
  | { kind: 'found'; entry: Translation | undefined }
  | { kind: 'not-found' };

const found = (entry: Translation | undefined): RouteResult => ({
  kind: 'found',
  entry,
});
const notFound: RouteResult = { kind: 'not-found' };

/**
 * GET form: today's deployment. Resolves `found` with the matching entry
 * (possibly undefined - the service just doesn't cover that locale), or
 * `not-found` when the route itself is missing (404/405) so the caller
 * knows it's safe (and worthwhile) to try POST. Any other failure (network
 * error, timeout, 5xx, CORS block) resolves `found(undefined)` - nothing to
 * show, and nothing learned about which form the deployment supports.
 */
const tryGet = async (
  text: string,
  source: string,
  readerLocale: string,
  endpoint: string
): Promise<RouteResult> => {
  try {
    const response = await axios.get<TranslateServiceResponse>(endpoint, {
      params: { source, text },
      timeout: TRANSLATE_REQUEST_TIMEOUT_MS,
    });

    // Tolerate a differently-shaped 200 (e.g. a single-translation body
    // with no `translates` list) rather than throwing - there's simply
    // nothing to pick an entry out of.
    return found(pickEntryForLocale(response?.data?.translates, readerLocale));
  } catch (error) {
    if (NOT_FOUND_STATUSES.has(statusOf(error) ?? -1)) return notFound;
    return found(undefined);
  }
};

/**
 * POST form: the newer deployment's `POST /translate`. Same
 * found/not-found contract as `tryGet`. The response carries no locale
 * field, so the entry is synthesised from the reader's own locale.
 */
const tryPost = async (
  text: string,
  source: string,
  readerLocale: string,
  endpoint: string
): Promise<RouteResult> => {
  try {
    const response = await axios.post<SingleTranslateResponse>(
      endpoint,
      {
        text,
        source,
        target: toBaseLanguage(readerLocale),
        targetLocale: readerLocale,
      },
      { timeout: TRANSLATE_REQUEST_TIMEOUT_MS }
    );

    const translatedText = response?.data?.translatedText;
    if (!translatedText) return found(undefined);

    // No `language`/`languageName` in this shape - the reader's own
    // locale is the only thing we know it corresponds to.
    return found({ translatedText, language: readerLocale, languageName: readerLocale });
  } catch (error) {
    if (NOT_FOUND_STATUSES.has(statusOf(error) ?? -1)) return notFound;
    return found(undefined);
  }
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

  const baseSource = toBaseLanguage(source);

  // Skip straight to POST once GET is already known missing for this
  // endpoint - no point paying a second doomed round trip per click.
  if (!getRouteMissing.has(endpoint)) {
    const getResult = await tryGet(text, baseSource, readerLocale, endpoint);
    if (getResult.kind === 'found') return getResult.entry;
    getRouteMissing.add(endpoint);
  }

  if (postRouteMissing.has(endpoint)) {
    // GET was missing already (this call or a previous one) and POST is
    // known missing too - now, and only now, the endpoint itself is dead.
    missingEndpoints.add(endpoint);
    return undefined;
  }

  const postResult = await tryPost(text, baseSource, readerLocale, endpoint);
  if (postResult.kind === 'found') return postResult.entry;

  postRouteMissing.add(endpoint);
  missingEndpoints.add(endpoint);
  return undefined;
};
