import XmppClient from '../networking/xmppClient';
import { xmppSettingsInterface } from '../types/types';

let currentClient: XmppClient | null = null;
let currentClientKey = '';
const initLocks = new Map<string, Promise<XmppClient>>();

const parseHostFromDevServer = (devServer?: string): string => {
  if (!devServer) return '';
  try {
    return new URL(devServer).hostname || '';
  } catch {
    const match = devServer.match(/wss?:\/\/([^:/]+)/i);
    return match?.[1] || '';
  }
};

export function buildXmppClientKey(
  username: string,
  xmppSettings?: xmppSettingsInterface
): string {
  const normalizedUsername = (username || '').trim().toLowerCase();
  const hostCandidate =
    xmppSettings?.host ||
    parseHostFromDevServer(xmppSettings?.devServer) ||
    'xmpp.chat.ethora.com';
  const normalizedHost = hostCandidate.trim().toLowerCase();
  return `${normalizedUsername}@${normalizedHost}`;
}

export function isXmppClientReusable(client: XmppClient | null): boolean {
  if (!client) return false;
  return client.status === 'online' || client.status === 'connecting';
}

export function setGlobalXmppClient(
  client: XmppClient | null,
  key?: string
): void {
  currentClient = client;
  currentClientKey = client ? key || currentClientKey || '' : '';
}

export function getGlobalXmppClient(): XmppClient | null {
  return currentClient;
}

export function getGlobalXmppClientKey(): string {
  return currentClientKey;
}

export function getReusableXmppClientByKey(
  key: string
): XmppClient | null {
  if (!key || key !== currentClientKey) return null;
  if (!isXmppClientReusable(currentClient)) return null;
  return currentClient;
}

export async function withXmppClientInitLock(
  key: string,
  init: () => Promise<XmppClient>
): Promise<XmppClient> {
  const existing = initLocks.get(key);
  if (existing) {
    return existing;
  }

  const createdPromise = init()
    .finally(() => {
      if (initLocks.get(key) === createdPromise) {
        initLocks.delete(key);
      }
    });

  initLocks.set(key, createdPromise);
  return createdPromise;
}

export function requireXmppClient(): XmppClient {
  if (!currentClient) {
    throw new Error('XMPP client is not initialized');
  }
  return currentClient;
}

export default {
  buildXmppClientKey,
  isXmppClientReusable,
  setGlobalXmppClient,
  getGlobalXmppClient,
  getGlobalXmppClientKey,
  getReusableXmppClientByKey,
  withXmppClientInitLock,
  requireXmppClient,
};
