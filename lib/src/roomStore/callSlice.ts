import { PayloadAction, createSlice } from '@reduxjs/toolkit';

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
  error: string | null;
  startedAt: number | null;
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
  error: null,
  startedAt: null,
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
      }>
    ) {
      state.phase = 'requesting';
      state.direction = 'outgoing';
      state.kind = action.payload.kind || 'video';
      state.roomJid = action.payload.roomJid;
      state.roomName = action.payload.roomName || null;
      state.roomBareName =
        action.payload.roomBareName ||
        (action.payload.roomJid || '').split('@')[0] ||
        null;
      state.peerXmppUsername = action.payload.peerXmppUsername || null;
      state.callId = null;
      state.token = null;
      state.error = null;
      state.startedAt = Date.now();
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
      }>
    ) {
      state.phase = 'ringing-incoming';
      state.direction = 'incoming';
      state.kind = action.payload.kind || 'video';
      state.roomJid = action.payload.roomJid;
      state.roomName = action.payload.roomName || null;
      state.roomBareName =
        action.payload.roomBareName ||
        (action.payload.roomJid || '').split('@')[0] ||
        null;
      state.callId = action.payload.callId || null;
      state.peerXmppUsername = action.payload.peerXmppUsername || null;
      state.token = action.payload.token;
      state.error = null;
      state.startedAt = Date.now();
    },
    setOutgoingCallToken(
      state,
      action: PayloadAction<{
        roomJid: string;
        token: string;
        callId?: string | null;
      }>
    ) {
      if (state.direction !== 'outgoing') return;

      const currentRoom = state.roomJid || '';
      if (currentRoom && currentRoom !== action.payload.roomJid) return;

      state.phase = 'connecting';
      state.roomJid = action.payload.roomJid;
      state.token = action.payload.token;
      if (action.payload.callId) state.callId = action.payload.callId;
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
  acceptIncomingCall,
  declineIncomingCall,
  endCall,
  setCallError,
  setCallPhase,
  setCallKind,
  resetCall,
} = callSlice.actions;

export default callSlice.reducer;
