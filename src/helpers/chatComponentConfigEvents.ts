/**
 * In-process bus for the `chat-component-config-updated` server event, so the
 * XMPP stanza handler (networking/ethoraEvents.ts) and whoever acts on it
 * (`config.remoteAppearance`, see hooks/useRemoteAppearance.ts) do not import
 * each other.
 */
export interface ChatComponentConfigUpdatedEvent {
  appId: string;
  /** Opaque state id from the server, pass it to the config endpoint as `v`. */
  version: string;
}

type Listener = (event: ChatComponentConfigUpdatedEvent) => void;

const listeners = new Set<Listener>();

export const subscribeChatComponentConfigUpdated = (
  listener: Listener
): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const publishChatComponentConfigUpdated = (
  event: ChatComponentConfigUpdatedEvent
): void => {
  for (const listener of Array.from(listeners)) {
    try {
      listener(event);
    } catch {
      // one bad listener must not stop the others
    }
  }
};

export const resetChatComponentConfigListeners = (): void => {
  listeners.clear();
};
