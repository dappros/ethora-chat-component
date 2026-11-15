import { useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../roomStore';
import {
  collectSuspendedLookupTargets,
  getPrivatePeerXmppUsername,
  toPeerKey,
} from '../helpers/suspendedPeers';
import {
  requestSuspendedStatus,
  watchSuspendedStatus,
} from '../networking/suspendedPeersLookup';
import type { IRoom } from '../types/types';

const selectDisabled = (state: RootState): boolean =>
  state.chatSettingStore?.config?.disableSuspendedPeers === true;

/**
 * Whether the account behind `xmppUsername` (bare name or JID) is
 * suspended, as far as this client knows. While a component shows it, its
 * status is looked up and kept current (re-asked every five minutes).
 * Always false with `config.disableSuspendedPeers`.
 */
export const usePeerSuspended = (
  xmppUsername: string | null | undefined
): boolean => {
  const key = toPeerKey(xmppUsername || '');
  const disabled = useSelector(selectDisabled);
  const suspended = useSelector((state: RootState) =>
    key ? state.trustSafety?.peers?.[key]?.suspended === true : false
  );
  useEffect(() => {
    if (!key || disabled) return;
    return watchSuspendedStatus(key);
  }, [key, disabled]);
  return suspended && !disabled;
};

/** The other person in a 1:1 room, or '' for any other room. */
export const usePrivatePeerXmppUsername = (
  room: Pick<IRoom, 'type' | 'members'> | null | undefined
): string => {
  const me = useSelector(
    (state: RootState) => state.chatSettingStore?.user?.xmppUsername || ''
  );
  return useMemo(() => getPrivatePeerXmppUsername(room, me), [room, me]);
};

// Re-run the batch at least this often, so an account whose answer has
// expired is asked again even when nothing in the room list changed.
const RECHECK_INTERVAL_MS = 60 * 1000;

// Memoized on its inputs: the walk over the rooms only runs when the rooms
// map, the open room or the account changes, not on every dispatch.
const selectTargetsKey = createSelector(
  [
    (state: RootState) => state.rooms?.rooms,
    (state: RootState) => state.rooms?.activeRoomJID,
    (state: RootState) => state.chatSettingStore?.user?.xmppUsername,
  ],
  (rooms, activeRoomJID, me): string =>
    collectSuspendedLookupTargets(rooms, activeRoomJID, me).join(',')
);

/**
 * Mounted once by the chat wrapper: asks about every private-chat partner
 * in the room list and every member and sender of the open room, in
 * batches, and again once an answer is five minutes old.
 */
export const useSuspendedPeerLookups = (): void => {
  const disabled = useSelector(selectDisabled);
  // A joined string: equal lists compare equal, so the effect below only
  // runs when the set of names actually changes.
  const targetsKey = useSelector(selectTargetsKey);

  useEffect(() => {
    if (disabled || !targetsKey) return;
    const targets = targetsKey.split(',');
    requestSuspendedStatus(targets);
    const timer = setInterval(
      () => requestSuspendedStatus(targets),
      RECHECK_INTERVAL_MS
    );
    return () => clearInterval(timer);
  }, [targetsKey, disabled]);
};
