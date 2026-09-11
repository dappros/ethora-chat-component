import { useCallback, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../roomStore';
import { setRoomMuted } from '../roomStore/roomsSlice';
import { muteRoom, unmuteRoom } from '../networking/api-requests/rooms.api';
import { useToast } from '../context/ToastContext';
import { useT } from '../i18n/useT';

export interface UseRoomMuteResult {
  /** Current muted state for this room. `false` whenever the backend hasn't reported the field - see `isSupported`. */
  muted: boolean;
  /**
   * True only once this room has an actual `muted` boolean - either fetched
   * from a backend that supports per-chat mute (`/v1/chats/my` or
   * `/v1/chats/my/{chatName}`), or because this client already toggled it
   * successfully. Prod doesn't send `muted` yet, so UI should hide the mute
   * control unless this is true - otherwise it offers a toggle that 404s.
   */
  isSupported: boolean;
  /** True while a toggle request is in flight. Disable the control to avoid a double submit. */
  isPending: boolean;
  /** Flips the current muted state - optimistic, with rollback + an error toast on failure. */
  toggleMute: () => Promise<void>;
  /** Sets the muted state directly - for controls with an explicit on/off state (e.g. a switch). */
  setMuted: (nextMuted: boolean) => Promise<void>;
}

// Requires a ToastProvider in the tree (the same one <Chat> already renders)
// to surface a failed toggle - only call this from within the chat UI, or
// from a host tree that wraps its own ToastProvider.
export const useRoomMute = (roomJid: string | undefined): UseRoomMuteResult => {
  const dispatch = useDispatch();
  const t = useT();
  const { showToast } = useToast();
  const [isPending, setIsPending] = useState(false);
  // A slow in-flight request that later fails must not roll back a *newer*
  // toggle that already landed - only the most recent request may act.
  const requestIdRef = useRef(0);

  const rawMuted = useSelector((state: RootState) =>
    roomJid ? state.rooms.rooms[roomJid]?.muted : undefined
  );

  const muted = rawMuted === true;
  const isSupported = typeof rawMuted === 'boolean';

  const setMuted = useCallback(
    async (nextMuted: boolean) => {
      if (!roomJid) return;
      const previous = rawMuted;
      const chatName = roomJid.split('@')[0];
      const requestId = ++requestIdRef.current;

      dispatch(setRoomMuted({ jid: roomJid, muted: nextMuted }));
      setIsPending(true);

      try {
        if (nextMuted) {
          await muteRoom(chatName);
        } else {
          await unmuteRoom(chatName);
        }
      } catch (error) {
        if (requestIdRef.current === requestId) {
          dispatch(setRoomMuted({ jid: roomJid, muted: previous }));
          showToast({
            id: Date.now().toString(),
            title: t('toast.error'),
            message: nextMuted ? t('toast.muteFailed') : t('toast.unmuteFailed'),
            type: 'error',
          });
        }
      } finally {
        if (requestIdRef.current === requestId) {
          setIsPending(false);
        }
      }
    },
    [dispatch, rawMuted, roomJid, showToast, t]
  );

  const toggleMute = useCallback(() => setMuted(!muted), [muted, setMuted]);

  return useMemo(
    () => ({ muted, isSupported, isPending, toggleMute, setMuted }),
    [muted, isSupported, isPending, toggleMute, setMuted]
  );
};
