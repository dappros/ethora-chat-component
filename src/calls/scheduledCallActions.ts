import type { Dispatch } from '@reduxjs/toolkit';
import type { RootState } from '../roomStore';
import {
  detailsFailed,
  detailsLoaded,
  detailsLoading,
} from '../roomStore/scheduledCallSlice';
import {
  ScheduledCallApiError,
  getScheduledCall,
} from '../networking/api-requests/scheduledCalls.api';
import type { ScheduledCallDetails } from '../types/models/scheduledCall.model';

/**
 * Fetches one scheduled call into the slice's details cache. Cards call this
 * when they appear, so it is deduped: a call already loading or loaded (and
 * not `force`d) is left alone. Never throws; a failure is recorded on the
 * entry and the card falls back to what the room message carried.
 */
export async function loadScheduledCallDetails(
  dispatch: Dispatch,
  getState: () => RootState,
  slug: string,
  options?: { force?: boolean }
): Promise<ScheduledCallDetails | null> {
  const entry = getState().scheduledCall?.details?.[slug];
  if (!options?.force && entry && entry.status !== 'error') {
    return entry.data ?? null;
  }
  dispatch(detailsLoading(slug));
  try {
    const details = await getScheduledCall(slug);
    dispatch(detailsLoaded(details));
    return details;
  } catch (error) {
    const reason =
      error instanceof ScheduledCallApiError ? error.reason : 'network';
    dispatch(detailsFailed({ slug, reason }));
    return null;
  }
}
