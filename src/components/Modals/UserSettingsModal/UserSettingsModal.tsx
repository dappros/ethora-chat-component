import React, { useCallback, useMemo } from 'react';

import {
  ModalContainerFullScreen,
  Divider,
  Label,
  LabelData,
  BorderedContainer,
  CenterContainer,
} from '../styledModalComponents';
import ModalHeaderComponent from '../ModalHeaderComponent';
import Button from '../../styled/Button';
import { useDispatch } from 'react-redux';
import { setActiveModal } from '../../../roomStore/chatSettingsSlice';
import { MODAL_TYPES } from '../../../helpers/constants/MODAL_TYPES';

interface UserSettingsModalProps {
  handleCloseModal: any;
}

const UserSettingsModal: React.FC<UserSettingsModalProps> = ({
  handleCloseModal,
}) => {
  const options = useMemo(
    () => [
      { value: 'Manage Data', key: MODAL_TYPES.MANAGE_DATA },
      { value: 'Visiblility', key: MODAL_TYPES.VISIBILITY },
      { value: 'Profile Shares', key: MODAL_TYPES.PROFILE_SHARES },
      { value: 'Document Shares', key: MODAL_TYPES.DOCUMENT_SHARES },
      { value: 'Blocked Users', key: MODAL_TYPES.BLOCKED_USERS },
      { value: 'Referrals', key: MODAL_TYPES.REFERRALS },
    ],
    []
  );

  const dispatch = useDispatch();

  const handleClick = useCallback((key: string) => {
    dispatch(setActiveModal(key));
  }, []);

  return (
    <ModalContainerFullScreen>
      <ModalHeaderComponent
        handleCloseModal={handleCloseModal}
        headerTitle={'Settings'}
      />
      <CenterContainer
        style={{
          boxSizing: 'border-box',
        }}
      >
        <BorderedContainer
          style={{
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            boxSizing: 'border-box',
          }}
        >
          {options.map((option: { value: string; key: string }, index) => (
            <>
              <Button
                variant="default"
                style={{
                  minHeight: '40px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  alignItems: 'start',
                  textAlign: 'center',
                  width: '100%',
                  justifyContent: 'center',
                  borderRadius: '0px',
                }}
                onClick={() => handleClick(option.key)}
              >
                <Label>{option.value}</Label>
                {[2, 3, 4].includes(index) && <LabelData>0</LabelData>}
              </Button>
              {index < 5 && <Divider />}
            </>
          ))}
        </BorderedContainer>
      </CenterContainer>
    </ModalContainerFullScreen>
  );
};

export default UserSettingsModal;
