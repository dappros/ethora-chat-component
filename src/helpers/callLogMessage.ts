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

const formatCallDuration = (ms: number): string => {
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
