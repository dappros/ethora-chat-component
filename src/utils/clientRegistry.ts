import XmppClient from '../networking/xmppClient';

let currentClient: XmppClient | null = null;

export function setGlobalXmppClient(client: XmppClient | null): void {
  currentClient = client;
}

export function getGlobalXmppClient(): XmppClient | null {
  return currentClient;
}

export function requireXmppClient(): XmppClient {
  if (!currentClient) {
    throw new Error('XMPP client is not initialized');
  }
  return currentClient;
}

export default {
  setGlobalXmppClient,
  getGlobalXmppClient,
  requireXmppClient,
};
