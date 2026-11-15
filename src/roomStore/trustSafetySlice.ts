import { createSlice, PayloadAction } from '@reduxjs/toolkit';

/**
 * Trust & Safety state for this session. Nothing here is persisted: the age
 * and the App policy are asked once per session (see trustSafetyThunks.ts),
 * and what the viewer chose to reveal is forgotten on reload on purpose.
 */

export type FileBlockReason = 'age-required' | 'moderation';

export interface AppPolicyEntry {
  status: 'loading' | 'loaded' | 'error';
  enabled?: boolean;
  ageGate?: boolean;
}

export interface AgeState {
  status: 'idle' | 'loading' | 'loaded' | 'error';
  birthYear: number | null;
  isAdult: boolean | null;
  declaredAt: string | null;
  canDeclareAdult: boolean;
}

export interface TrustSafetyState {
  /** GET /v2/apps/:appId/trust-safety, per App. */
  policy: Record<string, AppPolicyEntry>;
  /** GET /v2/users/me/age. */
  age: AgeState;
  /** Message ids whose sensitive media the viewer chose to see. */
  revealed: Record<string, true>;
  /**
   * Message ids whose original file answered 403 with a Trust & Safety
   * reason. Remembered so the bubble and the viewer never ask again.
   */
  blocked: Record<string, FileBlockReason>;
  /**
   * Other accounts' suspension status, keyed by xmppUsername (local part).
   * Filled by POST /v2/users/suspended-status (see suspendedPeers.ts) and by
   * a chat-server bounce that says the recipient is suspended. `checkedAt`
   * is when the answer arrived; entries older than five minutes are asked
   * again while something on screen still shows that account.
   */
  peers: Record<string, PeerStatus>;
}

export interface PeerStatus {
  suspended: boolean;
  checkedAt: number;
}

export const initialAgeState: AgeState = {
  status: 'idle',
  birthYear: null,
  isAdult: null,
  declaredAt: null,
  canDeclareAdult: true,
};

const initialState: TrustSafetyState = {
  policy: {},
  age: initialAgeState,
  revealed: {},
  blocked: {},
  peers: {},
};

const isPlainKey = (key: string) =>
  Boolean(key) && key !== '__proto__' && key !== 'constructor' && key !== 'prototype';

const trustSafetySlice = createSlice({
  name: 'trustSafety',
  initialState,
  reducers: {
    setAppPolicy(
      state,
      action: PayloadAction<{ appId: string } & AppPolicyEntry>
    ) {
      const { appId, ...entry } = action.payload;
      if (!isPlainKey(appId)) return;
      state.policy[appId] = entry;
    },
    setAgeLoading(state) {
      state.age.status = 'loading';
    },
    setAge(
      state,
      action: PayloadAction<Omit<AgeState, 'status'>>
    ) {
      state.age = { ...action.payload, status: 'loaded' };
    },
    setAgeFailed(state) {
      state.age.status = 'error';
    },
    revealMessageMedia(state, action: PayloadAction<string>) {
      if (!isPlainKey(action.payload)) return;
      state.revealed[action.payload] = true;
    },
    concealMessageMedia(state, action: PayloadAction<string>) {
      delete state.revealed[action.payload];
    },
    markMediaBlocked(
      state,
      action: PayloadAction<{ messageId: string; reason: FileBlockReason }>
    ) {
      const { messageId, reason } = action.payload;
      if (!isPlainKey(messageId)) return;
      state.blocked[messageId] = reason;
      if (reason === 'moderation') delete state.revealed[messageId];
    },
    clearMediaBlocked(state, action: PayloadAction<string>) {
      delete state.blocked[action.payload];
    },
    /**
     * One status lookup answered: every name in `checked` is suspended when
     * it is in `suspended`, and not suspended otherwise.
     */
    setPeerStatuses(
      state,
      action: PayloadAction<{
        checked: string[];
        suspended: string[];
        checkedAt: number;
      }>
    ) {
      const { checked, suspended, checkedAt } = action.payload;
      const suspendedSet = new Set(suspended);
      for (const key of checked) {
        if (!isPlainKey(key)) continue;
        state.peers[key] = { suspended: suspendedSet.has(key), checkedAt };
      }
    },
    /** The chat server or the API refused something because of it. */
    markPeerSuspended(
      state,
      action: PayloadAction<{ xmppUsername: string; at: number }>
    ) {
      const { xmppUsername, at } = action.payload;
      if (!isPlainKey(xmppUsername)) return;
      state.peers[xmppUsername] = { suspended: true, checkedAt: at };
    },
    resetTrustSafety() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    // Another account may sign in next: nothing about this one carries over.
    builder.addMatcher(
      (action) => action.type === 'chatSettingStore/logout',
      () => initialState
    );
  },
});

export const {
  setAppPolicy,
  setAgeLoading,
  setAge,
  setAgeFailed,
  revealMessageMedia,
  concealMessageMedia,
  markMediaBlocked,
  clearMediaBlocked,
  setPeerStatuses,
  markPeerSuspended,
  resetTrustSafety,
} = trustSafetySlice.actions;

export default trustSafetySlice.reducer;
