import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useOptionalToast } from '../../context/ToastContext';
import { useT } from '../../i18n/useT';
import { setChatPin } from '../../networking/api-requests/rooms.api';
import { setRoomPinned } from '../../roomStore/roomsSlice';
import { RoomPinControl } from '../styled/RoomListComponents';

export function RoomPinButton({ jid, name, pinned }: { jid: string; name: string; pinned: boolean }) {
  const dispatch = useDispatch();
  const t = useT();
  const toast = useOptionalToast();
  const [saving, setSaving] = useState(false);
  const label = t(pinned ? 'action.unpinChat' : 'action.pinChat');

  async function toggle() {
    if (saving) return;
    setSaving(true);
    try {
      await setChatPin(jid.split('@')[0], !pinned);
      dispatch(setRoomPinned({ jid, pinned: !pinned }));
    } catch {
      toast?.showToast({
        id: 'pin-' + jid,
        type: 'error',
        title: t('toast.error'),
        message: t('toast.pinChatFailed'),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <RoomPinControl type="button" title={label} aria-label={`${label}: ${name}`}
      aria-pressed={pinned} disabled={saving} onClick={() => void toggle()}>
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"
        fill={pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 3h8l-1 6 3 3v2H6v-2l3-3-1-6Z" />
        <path d="M12 14v7" />
      </svg>
    </RoomPinControl>
  );
}
