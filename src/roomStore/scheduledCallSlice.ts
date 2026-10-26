import { PayloadAction, createSlice } from '@reduxjs/toolkit';
import type {
  ScheduledCallDetails,
  ScheduledCallOpenError,
} from '../types/models/scheduledCall.model';

// UI state of scheduled calls. Session only (not persisted): which invite the
// pre-join panel shows, whether the schedule form is open, and what the cards
// have fetched from the server. The invite cards themselves live in the room
// transcript as messages.

export interface ScheduledCallDetailsEntry {
  status: 'loading' | 'ready' | 'error';
  data?: ScheduledCallDetails;
  error?: ScheduledCallOpenError;
}

export interface ScheduledCallState {
  /** A slug somebody asked to open (host prop or openScheduledCall). */
  openRequest: { slug: string; requestedAt: number } | null;
  /** The call whose pre-join panel is on screen. */
  preJoin: ScheduledCallDetails | null;
  /** The schedule form; `editing` set means edit mode. */
  scheduleModal: {
    roomJid: string;
    editing: ScheduledCallDetails | null;
  } | null;
  /** The "cancel this call?" confirmation (mounted by the layer, outside the message list). */
  cancelModal: { slug: string; title: string } | null;
  /** Server copy of the calls the cards show, by slug. */
  details: Record<string, ScheduledCallDetailsEntry>;
  /** The last open request that failed, for the in-chat error notice. */
  openError: { slug: string; reason: ScheduledCallOpenError } | null;
}

const initialState: ScheduledCallState = {
  openRequest: null,
  preJoin: null,
  scheduleModal: null,
  cancelModal: null,
  details: {},
  openError: null,
};

const scheduledCallSlice = createSlice({
  name: 'scheduledCall',
  initialState,
  reducers: {
    requestOpenScheduledCall(state, action: PayloadAction<string>) {
      state.openRequest = { slug: action.payload, requestedAt: Date.now() };
      state.openError = null;
    },
    clearOpenRequest(state) {
      state.openRequest = null;
    },
    setOpenError(
      state,
      action: PayloadAction<{
        slug: string;
        reason: ScheduledCallOpenError;
      } | null>
    ) {
      state.openError = action.payload;
    },
    openPreJoin(state, action: PayloadAction<ScheduledCallDetails>) {
      state.preJoin = action.payload;
      state.details[action.payload.scheduledCall.slug] = {
        status: 'ready',
        data: action.payload,
      };
    },
    closePreJoin(state) {
      state.preJoin = null;
    },
    openScheduleModal(
      state,
      action: PayloadAction<{
        roomJid: string;
        editing?: ScheduledCallDetails | null;
      }>
    ) {
      state.scheduleModal = {
        roomJid: action.payload.roomJid,
        editing: action.payload.editing ?? null,
      };
    },
    closeScheduleModal(state) {
      state.scheduleModal = null;
    },
    openCancelModal(state, action: PayloadAction<{ slug: string; title: string }>) {
      state.cancelModal = action.payload;
    },
    closeCancelModal(state) {
      state.cancelModal = null;
    },
    detailsLoading(state, action: PayloadAction<string>) {
      const current = state.details[action.payload];
      state.details[action.payload] = {
        status: 'loading',
        data: current?.data,
      };
    },
    detailsLoaded(state, action: PayloadAction<ScheduledCallDetails>) {
      state.details[action.payload.scheduledCall.slug] = {
        status: 'ready',
        data: action.payload,
      };
      if (state.preJoin?.scheduledCall.slug === action.payload.scheduledCall.slug) {
        state.preJoin = action.payload;
      }
    },
    detailsFailed(
      state,
      action: PayloadAction<{ slug: string; reason: ScheduledCallOpenError }>
    ) {
      state.details[action.payload.slug] = {
        status: 'error',
        error: action.payload.reason,
      };
    },
    /** Forget the server copy so the next card render fetches it again. */
    forgetDetails(state, action: PayloadAction<string>) {
      delete state.details[action.payload];
    },
  },
  extraReducers: (builder) => {
    builder.addCase('chatSettingStore/logout' as any, () => ({
      ...initialState,
      details: {},
    }));
  },
});

export const {
  requestOpenScheduledCall,
  clearOpenRequest,
  setOpenError,
  openPreJoin,
  closePreJoin,
  openScheduleModal,
  closeScheduleModal,
  openCancelModal,
  closeCancelModal,
  detailsLoading,
  detailsLoaded,
  detailsFailed,
  forgetDetails,
} = scheduledCallSlice.actions;

export default scheduledCallSlice.reducer;
