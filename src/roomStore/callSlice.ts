import { PayloadAction, createSlice } from '@reduxjs/toolkit';
import type { CallMode, IceServerConfig } from '../calls/callMode';
import { safeCallName } from '../calls/callDisplay';

export type CallPhase =
  | 'idle'
  | 'requesting'
  | 'ringing-incoming'
  | 'connecting'
  | 'in-call'
  | 'error';

export type CallDirection = 'outgoing' | 'incoming' | null;
export type CallKind = 'audio' | 'video';

export interface CallState {
  phase: CallPhase;
  direction: CallDirection;
  kind: CallKind;
  roomJid: string | null;
  roomName: string | null;
  // Bare room name (JID localpart). Server's call-state stanzas reference
  // calls by this value, and we echo it back on hangup signaling.
  roomBareName: string | null;
  // Stable callId from the call-token data attr (or JWT metadata). Used
  // when emitting our own call-state hangup so the peer can correlate.
  callId: string | null;
  // Peer's XMPP localpart (bare username, no @host). For outgoing we
  // resolve it from members[]; for incoming we derive it from the room
  // name format "<userA>-<userB>" minus our own username.
  peerXmppUsername: string | null;
  token: string | null;
  // Base64 media key for end-to-end encrypted calls, delivered over OMEMO
  // (never through the server). Null when the call is not E2EE or the key has
  // not arrived yet. Fed to LiveKit's ExternalE2EEKeyProvider in the session.
  e2eeKey: string | null;
  // The callId the e2eeKey belongs to, so a key from a stale/overlapping call
  // can be told apart from the current one.
  e2eeKeyCallId: string | null;
  error: string | null;
  startedAt: number | null;
  // When the call actually connected (phase -> 'in-call'). Null until then.
  // Used to compute a duration for the local "call ended" log fallback.
  connectedAt: number | null;
  // Transport of this call. `livekit` is the legacy path (and the only one for
  // group rooms); `p2p` is our own WebRTC peer connection for 1:1. Decided by
  // the server (create response for the caller, call-token `mode` for the
  // callee), defaults to livekit so older servers behave exactly as before.
  mode: CallMode;
  // Group room call (always LiveKit): more than two participants, so the
  // session must not assume the call is over when one remote participant leaves.
  isGroup: boolean;
  // Public LiveKit wss URL the server reported in the create response. Wins
  // over config.videoCalls.livekitUrl when present. Caller side only.
  livekitUrl: string | null;
  // ICE servers (STUN/TURN with ephemeral credentials) for a p2p call.
  iceServers: IceServerConfig[] | null;
  // Who is calling, from the call-token (system account only). roomName is the
  // name shown for the call; for a group it is the room, and this is the person.
  callerName: string | null;
  callerXmppUsername: string | null;
}

const initialState: CallState = {
  phase: 'idle',
  direction: null,
  kind: 'video',
  roomJid: null,
  roomName: null,
  roomBareName: null,
  callId: null,
  peerXmppUsername: null,
  token: null,
  e2eeKey: null,
  e2eeKeyCallId: null,
  error: null,
  startedAt: null,
  connectedAt: null,
  mode: 'livekit',
  isGroup: false,
  livekitUrl: null,
  iceServers: null,
  callerName: null,
  callerXmppUsername: null,
};

const resetState = (): CallState => ({ ...initialState });

const callSlice = createSlice({
  name: 'call',
  initialState,
  reducers: {
    startOutgoingCall(
      state,
      action: PayloadAction<{
        roomJid: string;
        roomName?: string | null;
        roomBareName?: string | null;
        kind?: CallKind;
        peerXmppUsername?: string | null;
        isGroup?: boolean;
      }>
    ) {
      state.phase = 'requesting';
      state.direction = 'outgoing';
      state.kind = action.payload.kind || 'video';
      state.roomJid = action.payload.roomJid;
      // A raw chat name is never a name: safeCallName drops it, the UI then
      // shows a neutral label.
      state.roomName = safeCallName(action.payload.roomName);
      state.roomBareName =
        action.payload.roomBareName ||
        (action.payload.roomJid || '').split('@')[0] ||
        null;
      state.peerXmppUsername = action.payload.peerXmppUsername || null;
      state.callId = null;
      state.token = null;
      // Fresh call: drop any key left over from a previous one. The caller
      // mints and distributes a new one for this call.
      state.e2eeKey = null;
      state.e2eeKeyCallId = null;
      state.error = null;
      state.startedAt = Date.now();
      state.connectedAt = null;
      state.mode = 'livekit';
      state.isGroup = action.payload.isGroup === true;
      state.livekitUrl = null;
      state.iceServers = null;
      state.callerName = null;
      state.callerXmppUsername = null;
    },
    // The create response told the caller how the call is carried. Applied
    // only to the very call that asked (startedAt must match), so a late
    // response for a call the user already cancelled cannot leak into the next.
    setOutgoingCallRoute(
      state,
      action: PayloadAction<{
        startedAt: number | null;
        callId: string | null;
        mode: CallMode;
        group?: boolean | null;
        livekitUrl?: string | null;
        iceServers?: IceServerConfig[] | null;
      }>
    ) {
      if (state.direction !== 'outgoing') return;
      if (action.payload.startedAt !== state.startedAt) return;
      // The LiveKit call-token can overtake the HTTP response, so a livekit
      // route may still be applied once the phase has moved on to
      // 'connecting'. A p2p route only makes sense while still dialling.
      if (state.phase !== 'requesting') {
        if (state.phase !== 'connecting' || action.payload.mode !== 'livekit') {
          return;
        }
      }
      state.mode = action.payload.mode;
      if (action.payload.callId) state.callId = action.payload.callId;
      if (typeof action.payload.group === 'boolean') {
        state.isGroup = action.payload.group;
      }
      state.livekitUrl = action.payload.livekitUrl || null;
      state.iceServers =
        action.payload.mode === 'p2p' ? action.payload.iceServers || [] : null;
    },
    setIncomingCallToken(
      state,
      action: PayloadAction<{
        roomJid: string;
        roomName?: string | null;
        roomBareName?: string | null;
        token: string;
        kind?: CallKind;
        callId?: string | null;
        peerXmppUsername?: string | null;
        mode?: CallMode;
        isGroup?: boolean;
        iceServers?: IceServerConfig[] | null;
        // LiveKit URL from the call-token stanza; wins over the host config.
        livekitUrl?: string | null;
        callerName?: string | null;
        callerXmppUsername?: string | null;
      }>
    ) {
      state.phase = 'ringing-incoming';
      state.direction = 'incoming';
      state.kind = action.payload.kind || 'video';
      state.roomJid = action.payload.roomJid;
      state.roomName = safeCallName(action.payload.roomName);
      state.roomBareName =
        action.payload.roomBareName ||
        (action.payload.roomJid || '').split('@')[0] ||
        null;
      state.callId = action.payload.callId || null;
      state.peerXmppUsername = action.payload.peerXmppUsername || null;
      state.token = action.payload.token;
      state.error = null;
      state.startedAt = Date.now();
      state.connectedAt = null;
      state.mode = action.payload.mode || 'livekit';
      state.isGroup = action.payload.isGroup === true;
      state.livekitUrl = action.payload.livekitUrl || null;
      state.iceServers = action.payload.iceServers || null;
      state.callerName = safeCallName(action.payload.callerName);
      state.callerXmppUsername = action.payload.callerXmppUsername || null;
    },
    setOutgoingCallToken(
      state,
      action: PayloadAction<{
        roomJid: string;
        token: string;
        callId?: string | null;
        livekitUrl?: string | null;
      }>
    ) {
      if (state.direction !== 'outgoing') return;

      const currentRoom = state.roomJid || '';
      if (currentRoom && currentRoom !== action.payload.roomJid) return;

      state.phase = 'connecting';
      state.roomJid = action.payload.roomJid;
      state.token = action.payload.token;
      if (action.payload.callId) state.callId = action.payload.callId;
      // The stanza's URL, when present, wins over the create response's.
      if (action.payload.livekitUrl) state.livekitUrl = action.payload.livekitUrl;
      state.error = null;
      state.startedAt = state.startedAt || Date.now();
    },
    acceptIncomingCall(state) {
      if (state.direction !== 'incoming') return;
      state.phase = 'connecting';
      state.error = null;
      state.startedAt = state.startedAt || Date.now();
    },
    declineIncomingCall() {
      return resetState();
    },
    endCall() {
      return resetState();
    },
    setCallError(state, action: PayloadAction<string>) {
      state.phase = 'error';
      state.error = action.payload;
      state.startedAt = state.startedAt || Date.now();
    },
    setCallPhase(state, action: PayloadAction<CallPhase>) {
      state.phase = action.payload;
      if (action.payload === 'in-call') {
        state.error = null;
        // Anchor the connect moment once, so a mid-call reconnect blip
        // doesn't reset the duration used by the local call-end log.
        state.connectedAt = state.connectedAt || Date.now();
      }
    },
    // Patch the call kind in-place. Used when the server's call-token
    // stanza doesn't carry a `kind` attribute and we receive the
    // client-side `call-invite` hint AFTER the call-token has already
    // landed (race window: token relays through server, invite is direct
    // chat, normally invite wins but not always).
    setCallKind(state, action: PayloadAction<CallKind>) {
      if (state.phase === 'idle') return;
      state.kind = action.payload;
    },
    // The end-to-end media key for the current call, arrived over OMEMO (as
    // the caller's own generated key, or decrypted from the peer's signal).
    setCallE2eeKey(
      state,
      action: PayloadAction<{ key: string; callId: string | null }>
    ) {
      state.e2eeKey = action.payload.key;
      state.e2eeKeyCallId = action.payload.callId;
    },
    resetCall() {
      return resetState();
    },
  },
  extraReducers: (builder) => {
    builder.addCase('chatSettingStore/logout' as any, () => resetState());
  },
});

export const {
  startOutgoingCall,
  setIncomingCallToken,
  setOutgoingCallToken,
  setOutgoingCallRoute,
  acceptIncomingCall,
  declineIncomingCall,
  endCall,
  setCallError,
  setCallPhase,
  setCallKind,
  setCallE2eeKey,
  resetCall,
} = callSlice.actions;

export default callSlice.reducer;
