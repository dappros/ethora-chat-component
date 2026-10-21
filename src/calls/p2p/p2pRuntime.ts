import { Element } from 'ltx';
import { store } from '../../roomStore';
import { getGlobalXmppClient } from '../../utils/clientRegistry';
import { ethoraLogger } from '../../helpers/ethoraLogger';
import { fetchIceServers } from '../../networking/api-requests/callState.api';
import { P2PSignalInbox } from './signalInbox';
import {
  buildP2PSignalStanza,
  isP2PSignalFresh,
  parseP2PSignalStanza,
  P2PSignalName,
  P2PSignalPayload,
} from './signalStanza';
import type { P2PCallController, P2PCallDeps } from './P2PCallController';

// The glue between the XMPP stanza stream, the redux call state and the
// per-call controller. Browser/XMPP specifics live here so the controller and
// the pure modules stay free of them.

/** Signals that arrive for a call nobody is handling yet wait here. */
export const p2pInbox = new P2PSignalInbox();

/**
 * Entry point for an incoming `<data type="call-p2p">` message (called from
 * the stanza router). Stale, replayed, malformed or self-sent signals are
 * dropped; the rest go to the inbox, which delivers or briefly holds them.
 */
export const handleP2PSignalStanza = (inner: Element): void => {
  const signal = parseP2PSignalStanza(inner);
  if (!signal || !signal.fromLocal) return;
  if (!isP2PSignalFresh(signal)) return;

  const self = String(store.getState().chatSettingStore.user?.xmppUsername || '')
    .split('@')[0]
    .toLowerCase();
  if (signal.fromLocal === self) return;

  p2pInbox.receive(signal);
};

/** Sends one signal straight to the peer's bare JID over the live XMPP client. */
export const sendP2PSignal = (params: {
  peerXmppUsername: string;
  callId: string;
  signal: P2PSignalName;
  payload: P2PSignalPayload;
}): boolean => {
  const xmppClient = getGlobalXmppClient();
  const host = (xmppClient as any)?.host || '';
  const peer = String(params.peerXmppUsername || '').trim();
  if (!xmppClient || !host || !peer) return false;
  try {
    const stanza = buildP2PSignalStanza({
      to: peer.includes('@') ? peer : `${peer}@${host}`,
      callId: params.callId,
      signal: params.signal,
      payload: params.payload,
    });
    (xmppClient as any).client?.send?.(stanza);
    return true;
  } catch (error) {
    ethoraLogger.log('[p2p] failed to send signal', error);
    return false;
  }
};

/** The real browser dependencies for one call's controller. */
export const createBrowserP2PDeps = (params: {
  callId: string;
  peerXmppUsername: string;
}): P2PCallDeps => ({
  createPeerConnection: (config) => new RTCPeerConnection(config),
  getUserMedia: (constraints) =>
    navigator.mediaDevices.getUserMedia(constraints),
  createMediaStream: () => new MediaStream(),
  fetchIceServers: async () => {
    const response = await fetchIceServers();
    return response && response.iceServers.length > 0
      ? response.iceServers
      : null;
  },
  sendSignal: (signal, payload) => {
    sendP2PSignal({
      peerXmppUsername: params.peerXmppUsername,
      callId: params.callId,
      signal,
      payload,
    });
  },
  log: (message, detail) => ethoraLogger.log(message, detail),
});

// ---- the one active controller --------------------------------------------

let active: { key: string; controller: P2PCallController } | null = null;
let pendingDispose: ReturnType<typeof setTimeout> | null = null;
const activeListeners = new Set<() => void>();

const notifyActive = () => {
  for (const listener of Array.from(activeListeners)) listener();
};

export const getActiveP2PController = (): P2PCallController | null =>
  active?.controller ?? null;

export const subscribeActiveP2P = (listener: () => void): (() => void) => {
  activeListeners.add(listener);
  return () => {
    activeListeners.delete(listener);
  };
};

/**
 * Returns the controller for `key`, creating it on first use. Effects that
 * unmount and immediately remount (React StrictMode, a parent re-keying) get
 * the SAME controller back instead of tearing the call down and starting a
 * second negotiation: release() only disposes after a tick, and acquire()
 * within that tick cancels it.
 */
export const acquireP2PController = (
  key: string,
  create: () => P2PCallController
): P2PCallController => {
  if (pendingDispose) {
    clearTimeout(pendingDispose);
    pendingDispose = null;
  }
  if (active && active.key === key) return active.controller;
  if (active) {
    active.controller.dispose();
    active = null;
  }
  active = { key, controller: create() };
  notifyActive();
  return active.controller;
};

export const releaseP2PController = (key: string): void => {
  if (!active || active.key !== key) return;
  const released = active;
  if (pendingDispose) clearTimeout(pendingDispose);
  pendingDispose = setTimeout(() => {
    pendingDispose = null;
    if (active === released) {
      active = null;
      notifyActive();
    }
    released.controller.dispose();
  }, 0);
};
