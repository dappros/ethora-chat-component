import React, { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../roomStore';
import {
  closeCancelModal,
  forgetDetails,
} from '../../roomStore/scheduledCallSlice';
import { useT } from '../../i18n/useT';
import { useToast } from '../../context/ToastContext';
import {
  ScheduledCallApiError,
  cancelScheduledCall,
} from '../../networking/api-requests/scheduledCalls.api';
import { ModalWrapper } from '../Modals/ModalWrapper/ModalWrapper';

/**
 * "Cancel this call?" confirmation. Mounted by ScheduledCallLayer, not by the
 * card: a fixed overlay rendered inside the message list is bounded by the
 * list's ancestors and came out clipped on the left.
 */
export const ScheduledCallCancelConfirm: React.FC = () => {
  const dispatch = useDispatch();
  const t = useT();
  const { showToast } = useToast();
  const pending = useSelector((state: RootState) => state.scheduledCall?.cancelModal);

  const close = useCallback(() => dispatch(closeCancelModal()), [dispatch]);

  const confirm = useCallback(async () => {
    if (!pending) return;
    const { slug } = pending;
    close();
    try {
      await cancelScheduledCall(slug);
      dispatch(forgetDetails(slug));
      showToast({
        id: Date.now().toString(),
        title: t('toast.success'),
        message: t('scheduledCall.toast.cancelled'),
        type: 'success',
      });
    } catch (error) {
      const forbidden =
        error instanceof ScheduledCallApiError && error.status === 403;
      showToast({
        id: Date.now().toString(),
        title: t('toast.error'),
        message: forbidden
          ? t('scheduledCall.error.forbidden')
          : t('scheduledCall.toast.cancelFailed'),
        type: 'error',
      });
    }
  }, [pending, close, dispatch, showToast, t]);

  if (!pending) return null;

  return (
    <ModalWrapper
      title={t('scheduledCall.cancelConfirm.title')}
      description={t('scheduledCall.cancelConfirm.description')}
      buttonText={t('scheduledCall.cancelConfirm.confirm')}
      cancelText={t('scheduledCall.cancelConfirm.keep')}
      backgroundColorButton="#E53935"
      handleClick={() => void confirm()}
      handleCloseModal={close}
    />
  );
};

export default ScheduledCallCancelConfirm;
