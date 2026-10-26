import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../roomStore';
import { setCurrentRoom } from '../../roomStore/roomsSlice';
import {
  clearOpenRequest,
  openPreJoin,
  requestOpenScheduledCall,
  setOpenError,
} from '../../roomStore/scheduledCallSlice';
import { useChatSettingState } from '../../hooks/useChatSettingState';
import { useT } from '../../i18n/useT';
import { useToast } from '../../context/ToastContext';
import {
  ScheduledCallApiError,
  getScheduledCall,
} from '../../networking/api-requests/scheduledCalls.api';
import { isValidScheduledCallSlug } from '../../calls/scheduledCall';
import type { ScheduledCallOpenError } from '../../types/models/scheduledCall.model';
import ScheduleCallModal from './ScheduleCallModal';
import ScheduledCallCancelConfirm from './ScheduledCallCancelConfirm';
import ScheduledCallPreJoin from './ScheduledCallPreJoin';

const ERROR_KEYS: Record<ScheduledCallOpenError, string> = {
  'not-found': 'scheduledCall.error.notFound',
  'not-a-member': 'scheduledCall.error.notMember',
  cancelled: 'scheduledCall.error.cancelled',
  network: 'scheduledCall.error.network',
};

interface Props {
  /** `<Chat scheduledCallSlug>`: open this call's room and pre-join panel. */
  scheduledCallSlug?: string;
  /** Narrow screens show the room list first; this brings the room forward. */
  onRevealRoom?: () => void;
}

/**
 * Everything scheduled calls need inside a mounted chat: the schedule form,
 * the pre-join panel, and the opener that turns a slug (host prop or
 * `openScheduledCall(slug)`) into "room selected, pre-join panel up". Mounted
 * once the chat shell is up, so the room list is already there to select from.
 */
export const ScheduledCallLayer: React.FC<Props> = ({
  scheduledCallSlug,
  onRevealRoom,
}) => {
  const dispatch = useDispatch();
  const t = useT();
  const { showToast } = useToast();
  const { config } = useChatSettingState();
  const request = useSelector((state: RootState) => state.scheduledCall?.openRequest);
  const rooms = useSelector((state: RootState) => state.rooms.rooms);
  const lastPropSlug = useRef<string | null>(null);
  // The room to select once it shows up in the list (the join link can beat
  // the room list on a cold load).
  const [pendingRoom, setPendingRoom] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // A slug passed as a prop becomes an open request, once per distinct value.
  useEffect(() => {
    const slug = (scheduledCallSlug || '').trim();
    if (!slug || lastPropSlug.current === slug) return;
    lastPropSlug.current = slug;
    dispatch(requestOpenScheduledCall(slug));
  }, [scheduledCallSlug, dispatch]);

  useEffect(() => {
    if (!request) return;
    const { slug } = request;
    dispatch(clearOpenRequest());

    const fail = (reason: ScheduledCallOpenError) => {
      dispatch(setOpenError({ slug, reason }));
      showToast({
        id: Date.now().toString(),
        title: t('toast.error'),
        message: t(ERROR_KEYS[reason]),
        type: 'error',
      });
      try {
        config?.scheduledCalls?.onOpenError?.({ slug, reason });
      } catch {
        // A host callback must not break the chat.
      }
    };

    void (async () => {
      if (!isValidScheduledCallSlug(slug)) return fail('not-found');
      try {
        const details = await getScheduledCall(slug);
        if (!mounted.current) return;
        if (details.scheduledCall.status === 'cancelled') return fail('cancelled');
        setPendingRoom(details.chat.jid);
        dispatch(openPreJoin(details));
        onRevealRoom?.();
      } catch (error) {
        if (!mounted.current) return;
        fail(error instanceof ScheduledCallApiError ? error.reason : 'network');
      }
    })();
    // The request is consumed (cleared) above, so this runs once per request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  // Select the call's room as soon as the list has it.
  useEffect(() => {
    if (!pendingRoom || !rooms?.[pendingRoom]) return;
    dispatch(setCurrentRoom({ roomJID: pendingRoom }));
    setPendingRoom(null);
  }, [rooms, pendingRoom, dispatch]);

  return (
    <>
      <ScheduleCallModal />
      <ScheduledCallPreJoin />
      <ScheduledCallCancelConfirm />
    </>
  );
};

export default ScheduledCallLayer;
