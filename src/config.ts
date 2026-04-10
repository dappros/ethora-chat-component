const env = (((import.meta as unknown as { env?: Record<string, string | undefined> })
  .env) || {}) as Record<string, string | undefined>;

const normalizeHost = (value?: string): string =>
  (value || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();

export const VITE_APP_API_URL =
  env['VITE_API'] || env['VITE_WIDGET_API_URL'] || 'https://api.ethoradev.com/v1';
export const VITE_APP_DISABLE_STRICT = 'true';
export const VITE_APP_DOMAIN_NAME = env['VITE_DOMAIN_NAME'] || 'ethoradev.com';
export const VITE_APP_WEB_DOMAIN = normalizeHost(env['VITE_WEB_DOMAIN']);
export const VITE_APP_WEB_URL = VITE_APP_WEB_DOMAIN
  ? `https://${VITE_APP_WEB_DOMAIN}`
  : '';
export const VITE_APP_XMPP_BASEDOMAIN_OLD = normalizeHost(
  env['VITE_XMPP_HOST'] ||
    env['VITE_WIDGET_XMPP_DOMAIN'] ||
    'xmpp.ethoradev.com'
);
export const VITE_APP_XMPP_BASEDOMAIN = VITE_APP_XMPP_BASEDOMAIN_OLD;
export const VITE_APP_XMPP_CONFERENCE =
  env['VITE_XMPP_SERVICE'] ||
  env['VITE_WIDGET_XMPP_CONFERENCE'] ||
  `conference.${VITE_APP_XMPP_BASEDOMAIN}`;

export const SERVICE =
  env['VITE_APP_XMPP_SERVICE'] ||
  env['VITE_WIDGET_XMPP_WS_URL'] ||
  `wss://${VITE_APP_XMPP_BASEDOMAIN}/ws`;
