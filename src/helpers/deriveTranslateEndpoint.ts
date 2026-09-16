/**
 * Derive the translate service's endpoint from the main API's `baseUrl`,
 * when the host hasn't set `config.translates.endpoint` explicitly.
 *
 * The translate service is deployed as a sibling host: the API's
 * `api.<rest>` becomes `translate.api.<rest>`, and the service always lives
 * at `/translate` regardless of what path the API itself uses (`/v1`, `/v2`,
 * ...).
 *
 *   https://api.chat-qa.ethora.com/v1  ->  https://translate.api.chat-qa.ethora.com/translate
 *
 * Defensive by design, since a bogus URL is worse than no request at all: a
 * missing, relative, or non-`api.*` baseUrl yields `undefined` rather than a
 * guessed string, so the caller can fall back to "no request".
 */
export const deriveTranslateEndpoint = (
  baseUrl?: string | null
): string | undefined => {
  if (!baseUrl || typeof baseUrl !== 'string') return undefined;

  let url: URL;
  try {
    // Throws for a relative path (no protocol/origin to rewrite) or
    // anything else that isn't a well-formed absolute URL.
    url = new URL(baseUrl);
  } catch {
    return undefined;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;

  const hostname = url.hostname;
  if (!hostname.startsWith('api.') || hostname.length <= 'api.'.length) {
    return undefined;
  }

  const translateHostname = `translate.${hostname}`;
  const port = url.port ? `:${url.port}` : '';
  return `${url.protocol}//${translateHostname}${port}/translate`;
};
