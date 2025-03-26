import React, { FC, useCallback, useState } from 'react';
import { ModalBox } from '../ModalBox/ModalBox';
import Button from '../../../../lib/src/components/styled/Button';
import { Divider } from '../../styled/RoomListComponents';
import styled from 'styled-components';
import { MessageInput } from '../../styled/StyledInputComponents/StyledInputComponents.tsx';
import { useChatSettingState } from '../../../hooks/useChatSettingState.tsx';
import { setOpenReportModal } from '../../../roomStore/roomsSlice.ts';
import { useDispatch } from 'react-redux';
import { postReportRoom } from '../../../networking/api-requests/rooms.api.ts';
import { useRoomState } from '../../../../lib/src/hooks/useRoomState.tsx';

export const Report = styled.button`
  padding: 12px 16px;
  border: none;
  cursor: pointer;
  width: 100%;
  border-radius: 12px;
  background: transparent; 
`;

const reportList: string[] = [
  "Spam",
  "Violence",
  "Child Abuse",
  "Pornography",
  "Personal Details",
  "Illegal Drugs",
]

export const ModalReportChat: FC = () => {
  const { config } = useChatSettingState();
  const { activeRoomJID } = useRoomState();
  const dispatch = useDispatch();

  const [message, setMessage] = useState('');
  const [reportChoose, setReportChoose] = useState({
    name: "",
    isChoose: false,
  });

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setMessage(event.target.value);
    },
    []
  );

  const handleCloseModal = () => {
    dispatch(setOpenReportModal({isOpen: false}));
  };

  const handleReport = useCallback(async () => {
    await postReportRoom({
      chatName: activeRoomJID,
      category: reportChoose.name,
      text: message || "",
    });
  }, [activeRoomJID]);

  return (
    <ModalBox title={reportChoose.name === "Other" ? 'Report Message' : 'Report Chat'} handleCloseModal={handleCloseModal}>
      {reportChoose.name === "Other" && <p style={{margin: 0}}>Please enter additional details relevant to your report.</p>}
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
            {reportChoose.name === "Other"
              ? <MessageInput
                color={config?.colors?.primary}
                placeholder="Type message"
                value={message}
                onChange={handleInputChange}
                // disabled={isLoading}
              />
              : <p style={{margin: 0}}>{reportChoose.name}</p>}
          </div>
        ) : (
          <div>
            {reportList.map((report: string) => (
              <div key={report}>
                <Report
                  onClick={() => {
                    setReportChoose({ name: report, isChoose: true });
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'flex-start' }}>
                    {report}
                  </span>
                </Report>
                <div style={{ padding: '8px 0' }}>
                  <Divider />
                </div>
              </div>
            ))}
            <Report
              onClick={() => setReportChoose({ name: 'Other', isChoose: true })}
            >
              <span style={{ display: 'flex', alignItems: 'flex-start' }}>
                Other
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
            text={'Cancel'}
            style={{ width: '100%' }}
            unstyled
            variant="outlined"
          />
          <Button
            onClick={handleReport}
            text={'Report'}
            style={{ width: '100%', backgroundColor: 'red' }}
            unstyled
            variant="filled"
          />
        </div>
      ) : (
        <Button
          onClick={handleCloseModal}
          text={'Cancel'}
          style={{ width: '100%' }}
          unstyled
          variant="outlined"
        />
      )}
    </ModalBox>
  );
};
