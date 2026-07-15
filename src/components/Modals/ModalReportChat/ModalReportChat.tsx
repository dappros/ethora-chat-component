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

export const Report = styled.button`
  padding: 12px 16px;
  border: none;
  cursor: pointer;
  width: 100%;
  border-radius: 12px;
  background: transparent;
`;

// `id` is what's sent to postReportRoom as `category` (an API contract, not
// UI text) - keep it in English regardless of locale. `labelKey` is what
// the reader sees.
const REPORT_CATEGORIES: { id: string; labelKey: string }[] = [
  { id: 'Spam', labelKey: 'report.category.spam' },
  { id: 'Violence', labelKey: 'report.category.violence' },
  { id: 'Child Abuse', labelKey: 'report.category.childAbuse' },
  { id: 'Pornography', labelKey: 'report.category.pornography' },
  { id: 'Personal Details', labelKey: 'report.category.personalDetails' },
  { id: 'Illegal Drugs', labelKey: 'report.category.illegalDrugs' },
];
const OTHER_CATEGORY = { id: 'Other', labelKey: 'report.category.other' };

export const ModalReportChat: FC = () => {
  const { config } = useChatSettingState();
  const { activeRoomJID } = useRoomState();
  const dispatch = useDispatch();
  const t = useT();

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

  const handleCloseModal = () => {
    dispatch(setOpenReportModal({ isOpen: false }));
  };

  const handleReport = useCallback(async () => {
    await postReportRoom({
      chatName: activeRoomJID,
      category: reportChoose.name,
      text: message || '',
    });
  }, [activeRoomJID]);

  const chosenLabel = () => {
    const category = [...REPORT_CATEGORIES, OTHER_CATEGORY].find(
      (c) => c.id === reportChoose.name
    );
    return category ? t(category.labelKey) : reportChoose.name;
  };

  return (
    <ModalBox
      title={
        reportChoose.name === 'Other'
          ? t('modal.report.messageTitle')
          : t('modal.report.chatTitle')
      }
      handleCloseModal={handleCloseModal}
    >
      {reportChoose.name === 'Other' && (
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
            {reportChoose.name === 'Other' ? (
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
            text={t('action.report')}
            style={{ width: '100%', backgroundColor: 'red' }}
            unstyled
            variant="filled"
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
