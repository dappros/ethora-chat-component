import { buildRuntimeHostConfig } from './utils/runtimeHostConfig';

const env = (((import.meta as unknown as { env?: Record<string, string | undefined> })
  .env) || {}) as Record<string, string | undefined>;

const runtimeHostConfig = buildRuntimeHostConfig(env);

export const VITE_APP_API_URL = runtimeHostConfig.apiUrl;
export const VITE_APP_ID = runtimeHostConfig.appId;
export const VITE_APP_DISABLE_STRICT = 'true';
export const VITE_APP_DOMAIN_NAME = runtimeHostConfig.domainName;
export const VITE_APP_WEB_DOMAIN = runtimeHostConfig.webDomain;
export const VITE_APP_WEB_URL = runtimeHostConfig.webUrl;
export const VITE_APP_XMPP_BASEDOMAIN_OLD = runtimeHostConfig.xmppBaseDomain;
export const VITE_APP_XMPP_BASEDOMAIN = VITE_APP_XMPP_BASEDOMAIN_OLD;
export const VITE_APP_XMPP_CONFERENCE = runtimeHostConfig.xmppConference;
export const SERVICE = runtimeHostConfig.service;
