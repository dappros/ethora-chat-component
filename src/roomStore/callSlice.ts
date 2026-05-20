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
        kind?: CallKind;
      }>
    ) {
      state.phase = 'requesting';
      state.direction = 'outgoing';
      state.kind = action.payload.kind || 'video';
      state.roomJid = action.payload.roomJid;
      state.roomName = action.payload.roomName || null;
      state.token = null;
      state.error = null;
      state.startedAt = Date.now();
    },
    setIncomingCallToken(
      state,
      action: PayloadAction<{
        roomJid: string;
        roomName?: string | null;
        token: string;
        kind?: CallKind;
      }>
    ) {
      state.phase = 'ringing-incoming';
      state.direction = 'incoming';
      state.kind = action.payload.kind || 'video';
      state.roomJid = action.payload.roomJid;
      state.roomName = action.payload.roomName || null;
      state.token = action.payload.token;
      state.error = null;
      state.startedAt = Date.now();
    },
    setOutgoingCallToken(
      state,
      action: PayloadAction<{ roomJid: string; token: string }>
    ) {
      if (state.direction !== 'outgoing') return;

      const currentRoom = state.roomJid || '';
      if (currentRoom && currentRoom !== action.payload.roomJid) return;

      state.phase = 'connecting';
      state.roomJid = action.payload.roomJid;
      state.token = action.payload.token;
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
  resetCall,
} = callSlice.actions;

export default callSlice.reducer;
