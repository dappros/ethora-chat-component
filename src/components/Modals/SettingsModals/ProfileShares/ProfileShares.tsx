import React from 'react';
import {
  EmptySection,
  CenterContainer,
  UserInfo,
  UserName,
  UserStatus,
  ModalContainerFullScreen,
  ActionButton,
  Label,
  BorderedContainer,
  LabelData,
} from '../../styledModalComponents';
import { ChatIcon, PlusIcon } from '../../../../assets/icons';
import ModalHeaderComponent from '../../ModalHeaderComponent';
import { useSelector } from 'react-redux';
import { RootState } from '../../../../roomStore';
import { ProfileImagePlaceholder } from '../../../MainComponents/ProfileImagePlaceholder';
import {
  SharedSettingsInfoPanel,
  SharedSettingsInfoText,
  SharedSettingsLabelData,
  SharedSettingsSectionContainer,
  SharedSettingsStyledLabel,
} from '../SharedStyledComponents';
import Button from '../../../styled/Button';

interface ProfileSharesModalProps {
  handleCloseModal: any;
}

const ProfileSharesModal: React.FC<ProfileSharesModalProps> = ({
  handleCloseModal,
}) => {
  const { config } = useSelector((state: RootState) => state.chatSettingStore);

  return (
    <ModalContainerFullScreen>
      <ModalHeaderComponent
        handleCloseModal={handleCloseModal}
        headerTitle={'Profile Shares'}
      />
      <CenterContainer>
        <SharedSettingsSectionContainer>
          <SharedSettingsStyledLabel>
            Current Profile Shares
          </SharedSettingsStyledLabel>
          <SharedSettingsLabelData>
            Listed below are your currently active profile sharing links. You
            can share or delete them.
          </SharedSettingsLabelData>
          <BorderedContainer
            style={{
              padding: '16px 8px',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div
              style={{
                display: 'flex',
                width: '100%',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxSizing: 'border-box',
              }}
            >
              <SharedSettingsStyledLabel>
                List of shares
              </SharedSettingsStyledLabel>
              <div style={{ display: 'flex', flexDirection: 'row' }}>
                {/* <div>
                    <SearchInput style={{ width: '20px' }} direction="right" />
                  </div> */}
                {/* <div>
                    <DropdownMenu
                      sortFunction={function (value: string): void {
                        throw new Error('Function not implemented.');
                      }}
                      icon={''}
                      values={['Name', 'Surname']}
                    />
                  </div> */}
                <Button
                  variant="filled"
                  StartIcon={<PlusIcon />}
                  style={{
                    width: '100%',
                    padding: '8px 14.5px',
                    borderRadius: '12px',
                    height: '40px',
                  }}
                >
                  Add New Share
                </Button>
              </div>
            </div>
            <SharedSettingsInfoPanel bgColor={config?.colors?.secondary}>
              <SharedSettingsInfoText>
                There are no shares yet, or you can add them by clicking the
                “Add New Share” button
              </SharedSettingsInfoText>
            </SharedSettingsInfoPanel>
          </BorderedContainer>
        </SharedSettingsSectionContainer>
      </CenterContainer>
    </ModalContainerFullScreen>
  );
};

export default ProfileSharesModal;
