import { Element } from 'ltx';
import { xml } from '@xmpp/client';

// Wire format of the peer to peer call signalling. It travels as a direct
// XMPP chat message between the two users, no server involvement:
//
//   <message type="chat" to="<peer bare jid>">
//     <body>system</body>
//     <data type="call-p2p" callId="..." signal="offer|answer|candidate|end"
//           payload="<JSON string>"/>
//   </message>
//
// payload is the SDP init ({type, sdp}) for offer/answer, the
// RTCIceCandidateInit for candidate and {reason} for end. This module only
// builds and parses stanzas, so it stays unit testable without a connection.

export const P2P_SIGNAL_TYPE = 'call-p2p';

export type P2PSignalName = 'offer' | 'answer' | 'candidate' | 'end';

export interface P2PSdpPayload {
  type: 'offer' | 'answer';
  sdp: string;
}

export interface P2PCandidatePayload {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export interface P2PEndPayload {
  reason?: string;
}

export type P2PSignalPayload =
  | P2PSdpPayload
  | P2PCandidatePayload
  | P2PEndPayload;

export interface P2PSignal {
  callId: string;
  signal: P2PSignalName;
  payload: P2PSignalPayload;
  /** Sender's bare JID as written in `from` (lower-cased), '' when missing. */
  fromBare: string;
  /** Sender's xmpp localpart (the part before '@'), '' when missing. */
  fromLocal: string;
  /**
   * Age of the stanza from the server's stanza-id timestamp, null when the
   * stanza carries none (direct messages often do not).
   */
  ageMs: number | null;
  /** Carries <delay/>: it was stored offline and replayed, so it is stale. */
  delayed: boolean;
}

// SDP for a call with audio + video + data-less sections is a few KB; this
// only guards against a hostile peer pushing megabytes through an attribute.
const MAX_SDP_LENGTH = 64 * 1024;
const MAX_REASON_LENGTH = 64;

// A signal older than this (by the server's own timestamp) is not part of a
// live negotiation. Call-tokens use 5 s; signalling gets more headroom because
// candidates can queue behind a slow permission prompt on the sender, but
// anything the server replays after a reconnect is far older.
export const MAX_P2P_SIGNAL_AGE_MS = 15_000;

let outgoingCounter = 0;

export const buildP2PSignalStanza = (params: {
  to: string;
  callId: string;
  signal: P2PSignalName;
  payload?: P2PSignalPayload;
}): Element => {
  outgoingCounter = (outgoingCounter + 1) % 1_000_000;
  return xml(
    'message',
    {
      to: params.to,
      type: 'chat',
      id: `call-p2p-${Date.now()}-${outgoingCounter}`,
    },
    xml('body', {}, 'system'),
    xml('data', {
      type: P2P_SIGNAL_TYPE,
      callId: params.callId,
      signal: params.signal,
      // JSON.stringify escapes newlines in the SDP, so the attribute survives
      // XML attribute-value normalisation on the receiving parser.
      payload: JSON.stringify(params.payload ?? {}),
    }),
    // Signalling is only meaningful live: keep it out of the archive and the
    // offline store (a replayed offer for a finished call is just noise).
    xml('no-store', { xmlns: 'urn:xmpp:hints' }),
    xml('no-permanent-store', { xmlns: 'urn:xmpp:hints' })
  ) as unknown as Element;
};

const SIGNAL_NAMES: ReadonlySet<string> = new Set([
  'offer',
  'answer',
  'candidate',
  'end',
]);

const validatePayload = (
  signal: P2PSignalName,
  raw: unknown
): P2PSignalPayload | null => {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (signal === 'offer' || signal === 'answer') {
    if (p.type !== signal) return null;
    if (typeof p.sdp !== 'string' || !p.sdp || p.sdp.length > MAX_SDP_LENGTH) {
      return null;
    }
    return { type: signal, sdp: p.sdp };
  }
  if (signal === 'candidate') {
    if (typeof p.candidate !== 'string' || p.candidate.length > 2048) {
      return null;
    }
    return {
      candidate: p.candidate,
      sdpMid: typeof p.sdpMid === 'string' ? p.sdpMid : null,
      sdpMLineIndex:
        typeof p.sdpMLineIndex === 'number' ? p.sdpMLineIndex : null,
      usernameFragment:
        typeof p.usernameFragment === 'string' ? p.usernameFragment : null,
    };
  }
  return {
    reason:
      typeof p.reason === 'string'
        ? p.reason.slice(0, MAX_REASON_LENGTH)
        : undefined,
  };
};

// Same trick as the call-token freshness check: the server stamps a
// microsecond id on archived stanzas and the first 13 digits are epoch ms.
const stanzaAgeMs = (stanza: Element, now: number): number | null => {
  const id = String(stanza.getChild('stanza-id')?.attrs?.id || '').trim();
  if (!id) return null;
  const match = id.match(/\d{13,}/)?.[0];
  if (!match) return null;
  const ts = Number(match.slice(0, 13));
  return Number.isFinite(ts) && ts > 0 ? Math.abs(now - ts) : null;
};

/**
 * Reads a `call-p2p` message. Returns null for anything that is not a
 * well formed signal (wrong type, unknown signal, bad JSON, bad payload).
 */
export const parseP2PSignalStanza = (
  stanza: Element,
  now: number = Date.now()
): P2PSignal | null => {
  const data = stanza?.getChild?.('data');
  if (!data || String(data.attrs?.type || '').toLowerCase() !== P2P_SIGNAL_TYPE) {
    return null;
  }
  const callId = String(data.attrs?.callId || data.attrs?.callid || '').trim();
  const signal = String(data.attrs?.signal || '')
    .trim()
    .toLowerCase();
  if (!callId || !SIGNAL_NAMES.has(signal)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(String(data.attrs?.payload || '{}'));
  } catch {
    return null;
  }
  const payload = validatePayload(signal as P2PSignalName, parsed);
  if (!payload) return null;

  const fromBare = String(stanza.attrs?.from || '')
    .split('/')[0]
    .trim()
    .toLowerCase();
  return {
    callId,
    signal: signal as P2PSignalName,
    payload,
    fromBare,
    fromLocal: fromBare.split('@')[0],
    ageMs: stanzaAgeMs(stanza, now),
    delayed: !!stanza.getChild?.('delay'),
  };
};

/**
 * Whether a parsed signal belongs to a live negotiation. An `end` is always
 * accepted unless replayed (it only ever acts on a call that is still
 * active, and stopping a call late is better than never).
 */
export const isP2PSignalFresh = (signal: P2PSignal): boolean => {
  if (signal.delayed) return false;
  if (signal.signal === 'end') return true;
  return signal.ageMs === null || signal.ageMs <= MAX_P2P_SIGNAL_AGE_MS;
};
