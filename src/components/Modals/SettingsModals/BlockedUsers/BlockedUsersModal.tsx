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
import { ChatIcon } from '../../../../assets/icons';
import ModalHeaderComponent from '../../ModalHeaderComponent';
import { useSelector } from 'react-redux';
import { RootState } from '../../../../roomStore';
import { ProfileImagePlaceholder } from '../../../MainComponents/ProfileImagePlaceholder';
import {
  SharedSettingsSectionContainer,
  SharedSettingsStyledLabel,
  SharedSettingsLabelData,
  SharedSettingsInfoPanel,
  SharedSettingsInfoText,
  SharedSettingsColumnContainer,
} from '../SharedStyledComponents';

interface BlockedUsersModalProps {
  handleCloseModal: any;
}

const BlockedUsersModal: React.FC<BlockedUsersModalProps> = ({
  handleCloseModal,
}) => {
  const { config } = useSelector((state: RootState) => state.chatSettingStore);

  return (
    <ModalContainerFullScreen>
      <ModalHeaderComponent
        handleCloseModal={handleCloseModal}
        headerTitle={'Blocked Users'}
      />
      <CenterContainer>
        <SharedSettingsColumnContainer>
          <SharedSettingsStyledLabel>
            Users you have blocked
          </SharedSettingsStyledLabel>
          <SharedSettingsLabelData>
            The blocked users cannot message you or view your profile. Tap the
            bin icon if you wish to remove the block.
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
                List of blocked users
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
              </div>
            </div>
            <SharedSettingsInfoPanel bgColor={config?.colors?.secondary}>
              <SharedSettingsInfoText>
                There are no blocked users yet.
              </SharedSettingsInfoText>
            </SharedSettingsInfoPanel>
          </BorderedContainer>
        </SharedSettingsColumnContainer>
      </CenterContainer>
    </ModalContainerFullScreen>
  );
};

export default BlockedUsersModal;
