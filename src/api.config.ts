// App token used as the Authorization header for unauthenticated API
// calls (e.g. /users/login-with-email). Must match the app behind the
// configured baseUrl, otherwise the API returns 401.
//
// This module-level fallback is intentionally empty: a hardcoded
// JWT here would either silently target the wrong app — at one point
// this file shipped a base-app-on-prod JWT and broke every demo run
// against any other server — or expire and fail mysteriously.
//
// In practice the value gets overridden at runtime by
// apiClient.setBaseURL(baseUrl, customAppToken), called by
// LoginWrapper / xmppProvider / resolveInitBeforeLoadUser when the
// host app passes IConfig.customAppToken (populated from VITE_APP_TOKEN
// in the env-driven demo, or from the integrating app directly).
export const appToken = '';
