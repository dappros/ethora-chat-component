import type { Element } from 'ltx';
import { ethoraLogger } from '../../helpers/ethoraLogger';
import { store } from '../../roomStore';

/**
 * Notify the host about every inbound XMPP message, including messages that
 * are consumed by protocol handlers or routed to MAM instead of the chat UI.
 */
export function notifyXmppEvent(stanza: Element): void {
  if (!stanza?.is?.('message')) return;

  const callback = store.getState().chatSettingStore.config?.eventHandlers
    ?.onXmppEvent;
  if (typeof callback !== 'function') return;

  try {
    const result = callback({
      stanza: stanza.toString(),
      from: stanza.attrs?.from,
      to: stanza.attrs?.to,
      id: stanza.attrs?.id,
      type: stanza.attrs?.type,
    });
    if (result && typeof result.then === 'function') {
      void result.catch((error) =>
        ethoraLogger.log('[XMPP event] host callback rejected:', error)
      );
    }
  } catch (error) {
    ethoraLogger.log('[XMPP event] host callback threw:', error);
  }
}
