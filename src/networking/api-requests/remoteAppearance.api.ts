import { VITE_APP_API_URL } from '../../config';
import {
  parseRemoteConfigRecord,
  type RemoteConfigRecord,
} from '../../helpers/liveConfig';

export interface RemoteAppearanceSnapshot {
  record: RemoteConfigRecord;
  /** `'0'` when the App never saved anything. */
  version: string;
}

const APP_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const VERSION_RE = /^[A-Za-z0-9._-]{1,40}$/;

export const isValidRemoteAppId = (appId: unknown): appId is string =>
  typeof appId === 'string' && APP_ID_RE.test(appId);

/** `https://api.example.com/v1/` and `https://api.example.com` both give `https://api.example.com`. */
const apiOrigin = (baseUrl?: string): string =>
  String(baseUrl || VITE_APP_API_URL || '')
    .trim()
    .replace(/\/+(v[12])\/*$/i, '')
    .replace(/\/+$/, '');

export const remoteAppearanceUrl = (
  baseUrl: string | undefined,
  appId: string,
  version?: string
): string => {
  const v = version && VERSION_RE.test(version) ? `&v=${encodeURIComponent(version)}` : '';
  return `${apiOrigin(baseUrl)}/v2/chat-component/config?appId=${encodeURIComponent(appId)}${v}`;
};

/**
 * Reads the App's public chat component config. Unauthenticated on purpose
 * (no token, no cookies, no refresh logic): it is the same public endpoint
 * the web app reads at load. Pass the `version` the server announced to get
 * past the endpoint's 30 s cache. Throws on a network or HTTP failure; the
 * caller keeps what it has.
 */
export async function fetchRemoteAppearance(
  opts: { baseUrl?: string; appId: string; version?: string },
  signal?: AbortSignal
): Promise<RemoteAppearanceSnapshot> {
  if (!isValidRemoteAppId(opts.appId)) throw new Error('remoteAppearance: invalid appId');
  const res = await fetch(remoteAppearanceUrl(opts.baseUrl, opts.appId, opts.version), {
    method: 'GET',
    credentials: 'omit',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!res.ok) throw new Error(`remoteAppearance: HTTP ${res.status}`);
  const body = (await res.json()) as { config?: unknown; version?: unknown } | null;
  const version = typeof body?.version === 'string' && VERSION_RE.test(body.version) ? body.version : '0';
  return { record: parseRemoteConfigRecord(body?.config), version };
}
