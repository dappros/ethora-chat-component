import { appendFileToken, isSecureFileUrl, withoutFileToken } from './secureFileUrl';
import type { FileBlockReason } from '../roomStore/trustSafetySlice';

/**
 * Why the secure files host refused a file, learned with one request.
 *
 * An <img> or <video> that fails says nothing about why: the browser does not
 * hand the status or the headers of a cross-origin media request to the page.
 * The secure files host answers a Trust & Safety refusal with
 * `403` + `X-Ethora-Block: age-required | moderation`, so when a secure file
 * fails (or before an original is revealed) the client asks once with fetch(),
 * carrying the viewer's file token as `?ft=` exactly like the <img> does.
 *
 *  - `ok`: the file is served (2xx/3xx).
 *  - `age-required` / `moderation`: the 403 named its reason.
 *  - `forbidden`: a 403 whose reason could not be read (a host that does not
 *    expose the header to scripts, or a plain membership refusal).
 *  - `unknown`: anything else (network, CORS, 401, 404, 5xx).
 *
 * HEAD is used so nothing but the headers is transferred. Results are cached
 * per file for the session: a failing tile asks once, never in a loop. A
 * viewer action (a tap on "view") passes `force` to ask again, which is what
 * makes a freshly declared age take effect.
 */
export type FileAccess = 'ok' | FileBlockReason | 'forbidden' | 'unknown';

export const BLOCK_HEADER = 'x-ethora-block';

const cache = new Map<string, Promise<FileAccess>>();
const CACHE_LIMIT = 300;

export const resetFileAccessProbeCache = () => cache.clear();

export const readBlockReason = (value: string | null | undefined): FileBlockReason | null => {
  const reason = String(value || '').trim().toLowerCase();
  if (reason === 'age-required') return 'age-required';
  if (reason === 'moderation') return 'moderation';
  return null;
};

export const classifyResponse = (response: Pick<Response, 'ok' | 'status' | 'headers'>): FileAccess => {
  if (response.ok || (response.status >= 300 && response.status < 400)) return 'ok';
  if (response.status === 403) {
    return readBlockReason(response.headers?.get?.(BLOCK_HEADER)) ?? 'forbidden';
  }
  return 'unknown';
};

export interface ProbeOptions {
  /** Ask again even when this file has an answer already. */
  force?: boolean;
  fetchImpl?: typeof fetch;
  /** The viewer's file token; appended as `?ft=` to a secure URL. */
  fileToken?: string;
}

export const probeFileAccess = (
  url: string | undefined | null,
  options: ProbeOptions = {}
): Promise<FileAccess> => {
  if (!url) return Promise.resolve('unknown');
  const key = withoutFileToken(url);
  if (!options.force) {
    const hit = cache.get(key);
    if (hit) return hit;
  }

  const fetchImpl = options.fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!fetchImpl) return Promise.resolve('unknown');

  const secure = isSecureFileUrl(url);
  const target = secure && options.fileToken ? appendFileToken(key, options.fileToken) : url;
  const request = fetchImpl(target, {
    method: 'HEAD',
    cache: 'no-store',
    // The token rides in the URL; without one, fall back to the cookie.
    credentials: secure && !options.fileToken ? 'include' : 'omit',
  })
    .then(classifyResponse)
    .catch((): FileAccess => 'unknown');

  cache.delete(key);
  cache.set(key, request);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return request;
};
