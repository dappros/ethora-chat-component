import React from 'react';

import {
  ModalContainerFullScreen,
  Divider,
  Label,
  LabelData,
  BorderedContainer,
  CenterContainer,
} from '../styledModalComponents';
import ModalHeaderComponent from '../ModalHeaderComponent';

interface UserSettingsModalProps {
  handleCloseModal: any;
}

const options = [
  'ManageData',
  'Visiblility',
  'Profile Shares',
  'Document Shares',
  'Blocked Users',
  'Referrals',
];

const UserSettingsModal: React.FC<UserSettingsModalProps> = ({
  handleCloseModal,
}) => {
  return (
    <ModalContainerFullScreen>
      <ModalHeaderComponent
        handleCloseModal={handleCloseModal}
        headerTitle={'Settings'}
      />
      <CenterContainer>
        <BorderedContainer style={{ padding: '16px' }}>
          {options.map((option: string, index) => (
            <div
              style={{
                minHeight: '40px',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                alignItems: 'start',
                textAlign: 'center',
              }}
            >
              <Label>{option}</Label>
              {[2, 3, 4].includes(index) && <LabelData>0</LabelData>}
              <Divider />
            </div>
          ))}
        </BorderedContainer>
      </CenterContainer>
    </ModalContainerFullScreen>
  );
};

export default UserSettingsModal;
