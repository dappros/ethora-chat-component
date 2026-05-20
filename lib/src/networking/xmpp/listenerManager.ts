import { Client } from '@xmpp/client';
import { Element } from '@xmpp/xml';
import { ethoraLogger } from '../../helpers/ethoraLogger';

const activeListeners = new Map<
  string,
  {
    handler: (stanza: Element) => void;
    client: Client;
    eventType: string;
    timestamp: number;
  }
>();

export class XmppListenerManager {
  static addListener(
    client: Client,
    eventType: string,
    listenerKey: string,
    handler: (stanza: Element) => void
  ): void {
    this.removeListener(listenerKey);

    activeListeners.set(listenerKey, {
      handler,
      client,
      eventType,
      timestamp: Date.now(),
    });

    client.on(eventType, handler);

    if (process.env.NODE_ENV === 'development') {
      ethoraLogger.log(
        `[XmppListenerManager] Added listener: ${listenerKey}, Total: ${activeListeners.size}`
      );
    }
  }

  static removeListener(listenerKey: string): boolean {
    const listener = activeListeners.get(listenerKey);
    if (listener) {
      listener.client?.off?.(listener.eventType, listener.handler);
      activeListeners.delete(listenerKey);

      if (process.env.NODE_ENV === 'development') {
        ethoraLogger.log(
          `[XmppListenerManager] Removed listener: ${listenerKey}, Total: ${activeListeners.size}`
        );
      }
      return true;
    }
    return false;
  }

  static removeAllListenersForClient(client: Client): void {
    let removedCount = 0;
    for (const [key, listener] of activeListeners.entries()) {
      if (listener.client === client) {
        listener.client?.off?.(listener.eventType, listener.handler);
        activeListeners.delete(key);
        removedCount++;
      }
    }

    if (process.env.NODE_ENV === 'development' && removedCount > 0) {
      ethoraLogger.log(
        `[XmppListenerManager] Removed ${removedCount} listeners for client, Total: ${activeListeners.size}`
      );
    }
  }

  static getListenerKey(operation: string, identifier: string): string {
    return `${operation}-${identifier}`;
  }

  static clearAllListeners(): void {
    const count = activeListeners.size;
    for (const [key, listener] of activeListeners.entries()) {
      listener.client?.off?.(listener.eventType, listener.handler);
    }
    activeListeners.clear();

    if (process.env.NODE_ENV === 'development') {
      ethoraLogger.log(`[XmppListenerManager] Cleared all ${count} listeners`);
    }
  }

  static getActiveListenerCount(): number {
    return activeListeners.size;
  }

  static getActiveListenersInfo(): Array<{
    key: string;
    eventType: string;
    timestamp: number;
    age: number;
  }> {
    const now = Date.now();
    return Array.from(activeListeners.entries()).map(([key, listener]) => ({
      key,
      eventType: listener.eventType,
      timestamp: listener.timestamp,
      age: now - listener.timestamp,
    }));
  }

  static logActiveListeners(): void {
    if (process.env.NODE_ENV === 'development') {
      const info = this.getActiveListenersInfo();
      ethoraLogger.log(
        `[XmppListenerManager] Active listeners (${info.length}):`,
        info
      );
    }
  }
}
