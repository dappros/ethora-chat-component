import { IMessage } from '../types/types';

// A server "call-state" stanza is emitted into the room when a call session
// concludes (someone leaves the LiveKit room). It carries:
//   type="call-state" callId="..." durationMs="<ms>"
//   callerXmppUsername="<who started the call>" isSystemMessage="true"
// We turn it into a friendly chat-log entry, Telegram/WhatsApp style:
//   - durationMs > 0  → "Outgoing call · 12 sec" / "Incoming call · 1 min"
//   - durationMs == 0 → "No answer" (we called)  / "Missed call" (they called)
// Direction is derived from callerXmppUsername vs the logged-in user.

export interface CallLogMeta {
  callId: string;
  direction: 'outgoing' | 'incoming';
  durationMs: number;
  missed: boolean;
  kind: 'audio' | 'video';
}

export const isCallLogMessage = (message: unknown): boolean => {
  const type = String((message as any)?.type || '').toLowerCase();
  return type === 'call-state';
};

// Only a call-state that actually carries log metadata (a caller and/or a
// duration) is worth rendering. Bare client-side signaling frames
// (state=cancelled/declined/ended with no caller/duration) must NOT become
// chat entries — they're real-time teardown only.
export const callStateHasLogData = (attrs: Record<string, any>): boolean => {
  if (!attrs) return false;
  const hasCaller = !!String(attrs.callerXmppUsername || '').trim();
  const hasDuration =
    attrs.durationMs !== undefined && attrs.durationMs !== null && attrs.durationMs !== '';
  return hasCaller || hasDuration;
};

export const formatCallDuration = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds} sec`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (seconds === 0) return `${minutes} min`;
  return `${minutes} min ${seconds} sec`;
};

export const transformCallLogMessage = (
  message: IMessage,
  selfXmppUsername: string
): IMessage => {
  if (!isCallLogMessage(message)) return message;

  const raw = message as any;
  const callerLocal = String(raw.callerXmppUsername || '')
    .split('@')[0]
    .trim();
  const selfLocal = String(selfXmppUsername || '').split('@')[0].trim();
  // When we know the caller, "outgoing" means we started it. With no
  // caller info, default to incoming (safer label than claiming we dialed).
  const isOutgoing = !!callerLocal && callerLocal === selfLocal;
  const durationMs = Number(raw.durationMs || 0);
  const kind: 'audio' | 'video' =
    String(raw.kind || '').toLowerCase() === 'audio' ? 'audio' : 'video';

  let body: string;
  if (durationMs > 0) {
    body = `${isOutgoing ? 'Outgoing' : 'Incoming'} call · ${formatCallDuration(durationMs)}`;
  } else {
    body = isOutgoing ? 'No answer' : 'Missed call';
  }

  const callLog: CallLogMeta = {
    callId: String(raw.callId || raw.callid || '').trim(),
    direction: isOutgoing ? 'outgoing' : 'incoming',
    durationMs,
    missed: durationMs === 0,
    kind,
  };

  return {
    ...message,
    body,
    // Render through the existing centered SystemMessage pipeline.
    isSystemMessage: 'true',
    callLog,
  } as IMessage;
};

// Build a "call ended" log entry locally (client-side) when a call finishes.
// The authoritative entry is a SERVER `call-state` broadcast, but that isn't
// guaranteed to arrive (see header comment). This fallback keeps the chat log
// working regardless. It's deduplicated against any server copy in
// `addRoomMessage` by `callLog.callId` (the entry with the largest duration
// wins), so if the server does broadcast, the two collapse into one.
export const buildLocalCallLogMessage = (params: {
  callId: string;
  direction: 'outgoing' | 'incoming';
  durationMs: number;
  kind: 'audio' | 'video';
  selfXmppUsername: string;
}): IMessage => {
  const { callId, direction, durationMs, kind, selfXmppUsername } = params;
  const isOutgoing = direction === 'outgoing';
  const safeDuration = Math.max(0, Math.round(durationMs || 0));

  let body: string;
  if (safeDuration > 0) {
    body = `${isOutgoing ? 'Outgoing' : 'Incoming'} call · ${formatCallDuration(safeDuration)}`;
  } else {
    body = isOutgoing ? 'No answer' : 'Missed call';
  }

  const callLog: CallLogMeta = {
    callId,
    direction,
    durationMs: safeDuration,
    missed: safeDuration === 0,
    kind,
  };

  return {
    // Deterministic id so a re-fire for the same call collapses in place.
    id: callId ? `calllog-${callId}` : `calllog-${Date.now()}`,
    body,
    date: new Date().toISOString(),
    isSystemMessage: 'true',
    type: 'call-state',
    callLog,
    user: { id: selfXmppUsername },
  } as unknown as IMessage;
};

/**
 * The label for a call-log entry, built at RENDER time from the callLog
 * meta rather than read off `message.body`.
 *
 * transformCallLogMessage bakes an English sentence into `body` the moment
 * the stanza arrives, which freezes the language: switch to Chinese and
 * every call log you already received stays English forever, because the
 * text is data by then, not a rendering. The meta (direction/duration/
 * missed) is the actual fact - the sentence is a view of it, so it belongs
 * where the view is. `body` stays as the fallback for entries received
 * before this existed, and for the notification/sidebar preview paths that
 * only have the raw message.
 */
export const formatCallLogLabel = (
  callLog: CallLogMeta | undefined,
  t: (key: string, vars?: Record<string, string | number>) => string,
  fallbackBody = ''
): string => {
  if (!callLog) return fallbackBody;

  if (!callLog.durationMs || callLog.durationMs <= 0) {
    return callLog.direction === 'outgoing' ? t('call.noAnswer') : t('call.missed');
  }

  const totalSeconds = Math.max(0, Math.round(callLog.durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const duration =
    totalSeconds < 60
      ? t('call.durationSec', { n: totalSeconds })
      : seconds === 0
        ? t('call.durationMin', { n: minutes })
        : t('call.durationMinSec', { m: minutes, s: seconds });

  const direction =
    callLog.direction === 'outgoing' ? t('call.outgoing') : t('call.incoming');

  return `${direction} · ${duration}`;
};
