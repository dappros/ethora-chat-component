import { store } from '../roomStore';
import { requestOpenScheduledCall } from '../roomStore/scheduledCallSlice';
import {
  ScheduledCallLinkOptions,
  isValidScheduledCallSlug,
  parseScheduledCallLink as parseLink,
} from './scheduledCall';

/**
 * Asks the chat to open a scheduled call: select its room and show the
 * pre-join panel. Returns false (and does nothing) when `slug` is not a
 * plausible slug. The request waits in the store until a signed-in <Chat> is
 * mounted, so a deep link can be passed in before either is ready; failures
 * are reported through `config.scheduledCalls.onOpenError`.
 */
export function openScheduledCall(slug: string): boolean {
  const value = String(slug || '').trim();
  if (!isValidScheduledCallSlug(value)) return false;
  store.dispatch(requestOpenScheduledCall(value));
  return true;
}

/**
 * The slug of a scheduled-call join link (`https://<host>/call/<slug>` or
 * `<scheme>://call/<slug>`), or null when `url` is not one. The hosted web app
 * (`DEFAULT_SCHEDULED_CALL_HOSTS`) and the page's own host are always
 * accepted, plus `options.hosts` or, without them, the hosts of
 * `config.scheduledCalls`. Schemes: `options.schemes`, else the configured
 * ones, unset means any. Same name, options and defaults as the React Native SDK.
 */
/** The hosted web app: always accepted. */
export const DEFAULT_SCHEDULED_CALL_HOSTS = ['app.chat.ethora.com'];

export function parseScheduledCallLink(
  url: unknown,
  options?: ScheduledCallLinkOptions
): string | null {
  const configured = store.getState().chatSettingStore?.config?.scheduledCalls;
  const extraHosts = options?.hosts?.length ? options.hosts : configured?.hosts;
  const pageHost =
    typeof window !== 'undefined' && window.location?.host ? [window.location.host] : [];
  return parseLink(url, {
    hosts: [...DEFAULT_SCHEDULED_CALL_HOSTS, ...pageHost, ...(extraHosts || [])],
    schemes: options?.schemes?.length ? options.schemes : configured?.schemes,
  });
}
