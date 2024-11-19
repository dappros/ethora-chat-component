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
import Button from '../../styled/Button';

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
          {options.map((option: string, index) => (
            <>
              <div
                style={{
                  minHeight: '40px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  alignItems: 'start',
                  textAlign: 'center',
                  width: '100%',
                  justifyContent: 'center',
                }}
              >
                {[0, 1, 5].includes(index) ? (
                  <Button
                    variant="default"
                    style={{
                      width: '100%',
                      display: 'flex',
                      justifyContent: 'start',
                      borderRadius: '0px',
                    }}
                  >
                    <Label>{option}</Label>
                  </Button>
                ) : (
                  <Label>{option}</Label>
                )}
                {[2, 3, 4].includes(index) && <LabelData>0</LabelData>}
              </div>
              {index < 5 && <Divider />}
            </>
          ))}
        </BorderedContainer>
      </CenterContainer>
    </ModalContainerFullScreen>
  );
};

export default UserSettingsModal;
