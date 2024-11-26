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
  SharedSettingsInfoPanel,
  SharedSettingsInfoText,
  SharedSettingsLabelData,
  SharedSettingsSectionContainer,
  SharedSettingsStyledLabel,
} from '../SharedStyledComponents';

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
          <BorderedContainer>
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
