import { store } from '../roomStore';
import { toLocalPart } from './xmppIdShape';

// Re-exported for existing callers of this module - the actual
// implementation lives in xmppIdShape.ts, which has no `store` dependency
// (see that file's header comment for why that separation matters).
export { toLocalPart, isOpaqueXmppUserId } from './xmppIdShape';

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
