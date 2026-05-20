import type { xmppSettingsInterface } from '../types/types';

type EnvMap = Record<string, string | undefined>;

const normalizeHost = (value?: string): string =>
  (value || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();

const parseHostFromDevServer = (devServer?: string): string => {
  if (!devServer) return '';
  try {
    return new URL(devServer).hostname || '';
  } catch {
    const match = devServer.match(/wss?:\/\/([^:/]+)/i);
    return match?.[1] || '';
  }
};

export const buildRuntimeHostConfig = (env: EnvMap) => {
  const apiUrl = env['VITE_API'] || env['VITE_WIDGET_API_URL'] || '';
  const domainName = env['VITE_DOMAIN_NAME'] || '';
  const webDomain = normalizeHost(env['VITE_WEB_DOMAIN']);
  const webUrl = webDomain ? `https://${webDomain}` : '';
  const xmppBaseDomain = normalizeHost(
    env['VITE_XMPP_HOST'] || env['VITE_WIDGET_XMPP_DOMAIN']
  );
  const xmppConference =
    env['VITE_XMPP_SERVICE'] ||
    env['VITE_WIDGET_XMPP_CONFERENCE'] ||
    (xmppBaseDomain ? `conference.${xmppBaseDomain}` : '');
  const service =
    env['VITE_APP_XMPP_SERVICE'] ||
    env['VITE_WIDGET_XMPP_WS_URL'] ||
    (xmppBaseDomain ? `wss://${xmppBaseDomain}/ws` : '');

  return {
    apiUrl,
    domainName,
    webDomain,
    webUrl,
    xmppBaseDomain,
    xmppConference,
    service,
  };
};

export const buildXmppClientIdentityHost = (
  xmppSettings?: xmppSettingsInterface
): string =>
  (xmppSettings?.host || parseHostFromDevServer(xmppSettings?.devServer) || '')
    .trim()
    .toLowerCase();

export const buildXmppClientKeyValue = (
  username: string,
  xmppSettings?: xmppSettingsInterface
): string => {
  const normalizedUsername = (username || '').trim().toLowerCase();
  const normalizedHost = buildXmppClientIdentityHost(xmppSettings);
  return normalizedHost ? `${normalizedUsername}@${normalizedHost}` : normalizedUsername;
};

export const normalizeRoomJidWithConference = (
  jid?: string,
  conference?: string
): string => {
  if (!jid) return '';
  if (jid.includes('@')) return jid;
  return conference ? `${jid}@${conference}` : jid;
};
