import { useEffect } from 'react';
import { useDispatch, useStore } from 'react-redux';
import { setCurrentRoom } from '../roomStore/roomsSlice';
import type { RootState } from '../roomStore';

/**
 * Keeps the open room in step with the browser history when the host lets the
 * chat put the room in the URL (`setRoomJidInPath`, ?chatId=<room>).
 *
 * useRoomUrl writes ?chatId= when a room opens, but nothing read it back: the
 * browser back button, Android's back gesture and an installed iOS app's edge
 * swipe changed the URL while the room stayed open on screen. Back now closes
 * the room the way the header's back arrow does (`showRoom(false)`), and
 * forward to a ?chatId= entry opens that room again.
 */
export const useRoomHistorySync = (
  enabled: boolean | undefined,
  showRoom: (visible: boolean) => void
) => {
  const dispatch = useDispatch();
  const store = useStore<RootState>();

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const onPopState = () => {
      const chatId = new URLSearchParams(window.location.search).get('chatId');
      if (!chatId) {
        showRoom(false);
        return;
      }
      const rooms = store.getState().rooms.rooms || {};
      const jid = Object.keys(rooms).find((j) => j.split('@')[0] === chatId);
      if (!jid) return;
      if (jid !== store.getState().rooms.activeRoomJID) {
        dispatch(setCurrentRoom({ roomJID: jid }));
      }
      showRoom(true);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [enabled, showRoom, dispatch, store]);
};
