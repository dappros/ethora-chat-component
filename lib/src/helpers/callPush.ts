// Recognise and parse an *incoming call* push notification.
//
// Calls normally ring via a live XMPP `call-token` stanza, which only arrives
// while the socket is connected. When the app is backgrounded/closed that
// stanza is missed, so the backend (will) also deliver the call over push — in
// the same `data`-payload format as message pushes. This helper lets the push
// layer tell a call push apart from a chat push and pull the call fields out,
// tolerating the field-name variations backends tend to use.

export interface ParsedCallPush {
  callId: string | null;
  /** LiveKit token, if the push carried one (lets us ring + accept offline). */
  token: string | null;
  kind: 'audio' | 'video';
  /** Bare room name (JID localpart) the call belongs to. */
  roomBareName: string | null;
  /** Raw room reference from the payload (full JID or bare name). */
  roomRef: string | null;
  /** Display name for the ring screen (caller). */
  callerName: string | null;
  /** Caller's xmpp localpart, when provided. */
  callerXmppUsername: string | null;
}

const pick = (data: Record<string, any>, keys: string[]): string => {
  for (const k of keys) {
    const v = data?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      return String(v).trim();
    }
  }
  return '';
};

/**
 * True when a push `data` payload represents an incoming call. Matches on an
 * explicit call marker (`type`/`pushType`/`category`/`event` === "call"-ish)
 * or on a callId paired with a call-specific field, so a normal message push
 * is never misread as a call.
 */
export const isCallPush = (data: Record<string, any> | null | undefined): boolean => {
  if (!data) return false;
  const marker = pick(data, [
    'type',
    'pushType',
    'category',
    'messageType',
    'event',
  ]).toLowerCase();
  if (
    marker === 'call' ||
    marker === 'incoming-call' ||
    marker === 'call-token' ||
    marker === 'call-invite'
  ) {
    return true;
  }
  const callId = pick(data, ['callId', 'callid', 'callID']);
  const hasCallField =
    !!pick(data, ['callToken', 'livekitToken']) ||
    !!pick(data, ['callKind']) ||
    pick(data, ['kind']).toLowerCase() === 'audio' ||
    pick(data, ['kind']).toLowerCase() === 'video';
  return !!callId && hasCallField;
};

export const parseCallPush = (
  data: Record<string, any> | null | undefined
): ParsedCallPush => {
  const d = data || {};
  const roomRef =
    pick(d, ['callRoom', 'room', 'roomJid', 'jid', 'chatId']) || null;
  const roomBareName = roomRef ? roomRef.split('@')[0] || roomRef : null;
  const kindRaw = pick(d, ['callKind', 'kind']).toLowerCase();
  return {
    callId: pick(d, ['callId', 'callid', 'callID']) || null,
    token: pick(d, ['callToken', 'livekitToken', 'token']) || null,
    kind: kindRaw === 'audio' ? 'audio' : 'video',
    roomBareName,
    roomRef,
    callerName:
      pick(d, ['callerName', 'callerDisplayName', 'senderName', 'title']) ||
      null,
    callerXmppUsername:
      pick(d, ['callerXmppUsername', 'callerUsername', 'userJid', 'senderJid'])
        .split('@')[0] || null,
  };
};
