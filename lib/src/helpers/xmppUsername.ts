import { store } from '../roomStore';

// Strips a value that the local part of an XMPP JID may carry, leaving
// just the bare resource (anything before `@`). XMPP allows resources
// with `@` only in escaped form so the simple split is enough here.
export const toLocalPart = (value?: string): string => {
  if (!value) return '';
  return String(value).split('@')[0];
};

export const normalizeXmppUsername = (value: string | undefined | null): string => {
  if (!value) return '';
  let result = String(value).trim();
  if (!result) return '';

  const appId =
    (store.getState().chatSettingStore?.appId as string | undefined) || '';
  if (!appId) return result;

  const prefix = `${appId}_`;
  // Collapse N consecutive duplicate `<appId>_` prefixes down to one.
  while (result.startsWith(prefix + prefix)) {
    result = result.slice(prefix.length);
  }
  return result;
};

export const isSameXmppUsername = (
  a: string | undefined | null,
  b: string | undefined | null
): boolean => {
  const na = normalizeXmppUsername(toLocalPart(a || ''));
  const nb = normalizeXmppUsername(toLocalPart(b || ''));
  if (!na || !nb) return false;
  return na === nb;
};
