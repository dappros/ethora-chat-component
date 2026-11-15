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
  resetTrustSafety,
} = trustSafetySlice.actions;

export default trustSafetySlice.reducer;
