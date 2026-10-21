import React, { FC, useCallback, useState } from 'react';
import { ModalBox } from '../ModalBox/ModalBox';
import { Divider } from '../../styled/RoomListComponents';
import styled from 'styled-components';
import { MessageInput } from '../../styled/StyledInputComponents/StyledInputComponents.tsx';
import { useChatSettingState } from '../../../hooks/useChatSettingState.tsx';
import { setOpenReportModal } from '../../../roomStore/roomsSlice.ts';
import { useDispatch } from 'react-redux';
import { postReportRoom } from '../../../networking/api-requests/rooms.api.ts';
import { useRoomState } from '../../../hooks/useRoomState.tsx';
import Button from '../../styled/Button.tsx';
import { useT } from '../../../i18n/useT';
import { useToast } from '../../../context/ToastContext';
import {
  buildReportRoomPayload,
  findReportCategory,
  OTHER_REPORT_CATEGORY,
  REPORT_CATEGORIES,
} from '../../../helpers/reportRoom';

export const Report = styled.button`
  padding: 12px 16px;
  border: none;
  cursor: pointer;
  width: 100%;
  min-height: 48px;
  border-radius: var(--ethora-radius-md, 12px);
  background: transparent;
  transition: background-color var(--ethora-motion-fast, 150ms);

  &:hover {
    background-color: var(--ethora-color-bg-hover, #f0f2f5);
  }

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: -2px;
  }
`;

// Categories, their labels and how each one maps onto the values the report
// route accepts live in helpers/reportRoom.
const OTHER_CATEGORY = OTHER_REPORT_CATEGORY;

interface ModalReportChatProps {
  /** Forwarded to `ModalBox` - see its `isClosing` doc. */
  isClosing?: boolean;
}

export const ModalReportChat: FC<ModalReportChatProps> = ({ isClosing }) => {
  const { config } = useChatSettingState();
  const { activeRoomJID } = useRoomState();
  const dispatch = useDispatch();
  const t = useT();
  const { showToast } = useToast();
  const [isSending, setIsSending] = useState(false);

  const [message, setMessage] = useState('');
  const [reportChoose, setReportChoose] = useState({
    name: '',
    isChoose: false,
  });

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setMessage(event.target.value);
    },
    []
  );

  const handleCloseModal = useCallback(() => {
    dispatch(setOpenReportModal({ isOpen: false }));
  }, [dispatch]);

  const handleReport = useCallback(async () => {
    const payload = buildReportRoomPayload(
      activeRoomJID,
      reportChoose.name,
      message
    );
    if (!payload || isSending) return;
    setIsSending(true);
    try {
      await postReportRoom(payload);
      showToast({
        id: Date.now().toString(),
        title: t('toast.success'),
        message: t('toast.reportSent'),
        type: 'success',
      });
      handleCloseModal();
    } catch {
      showToast({
        id: Date.now().toString(),
        title: t('toast.error'),
        message: t('toast.reportFailed'),
        type: 'error',
      });
    } finally {
      setIsSending(false);
    }
  }, [
    activeRoomJID,
    reportChoose.name,
    message,
    isSending,
    showToast,
    t,
    handleCloseModal,
  ]);

  const chosenLabel = () => {
    const category = findReportCategory(reportChoose.name);
    return category ? t(category.labelKey) : reportChoose.name;
  };

  return (
    <ModalBox
      title={
        reportChoose.name === OTHER_CATEGORY.id
          ? t('modal.report.messageTitle')
          : t('modal.report.chatTitle')
      }
      handleCloseModal={handleCloseModal}
      isClosing={isClosing}
    >
      {reportChoose.name === OTHER_CATEGORY.id && (
        <p style={{ margin: 0 }}>{t('modal.report.otherDetails')}</p>
      )}
      <div style={{ width: '100%' }}>
        {reportChoose.isChoose ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              position: 'relative',
            }}
          >
            {/*<button*/}
            {/*  style={{ position: 'absolute', left: 0 }}*/}
            {/*  onClick={handleBack}*/}
            {/*>*/}
            {/*  <BackIcon />*/}
            {/*</button>*/}
            {reportChoose.name === OTHER_CATEGORY.id ? (
              <MessageInput
                color={config?.colors?.primary}
                $colorBg={config?.colors?.colorInput}
                placeholder={t('input.placeholder')}
                value={message}
                onChange={handleInputChange}
                // disabled={isLoading}
              />
            ) : (
              <p style={{ margin: 0 }}>{chosenLabel()}</p>
            )}
          </div>
        ) : (
          <div>
            {REPORT_CATEGORIES.map((category) => (
              <div key={category.id}>
                <Report
                  onClick={() => {
                    setReportChoose({ name: category.id, isChoose: true });
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'flex-start' }}>
                    {t(category.labelKey)}
                  </span>
                </Report>
                <div style={{ padding: '8px 0' }}>
                  <Divider />
                </div>
              </div>
            ))}
            <Report
              onClick={() =>
                setReportChoose({ name: OTHER_CATEGORY.id, isChoose: true })
              }
            >
              <span style={{ display: 'flex', alignItems: 'flex-start' }}>
                {t(OTHER_CATEGORY.labelKey)}
              </span>
            </Report>
          </div>
        )}
      </div>
      {reportChoose.isChoose ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            gap: 16,
          }}
        >
          <Button
            onClick={handleCloseModal}
            text={t('action.cancel')}
            style={{ width: '100%' }}
            unstyled
            variant="outlined"
          />
          <Button
            onClick={handleReport}
            disabled={isSending}
            text={t('action.report')}
            style={{ width: '100%' }}
            unstyled
            variant="filled"
            tone="danger"
          />
        </div>
      ) : (
        <Button
          onClick={handleCloseModal}
          text={t('action.cancel')}
          style={{ width: '100%' }}
          unstyled
          variant="outlined"
        />
      )}
    </ModalBox>
  );
};
