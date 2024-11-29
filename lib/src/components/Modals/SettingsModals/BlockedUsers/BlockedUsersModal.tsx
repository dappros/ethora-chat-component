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
        headerTitle={'Blocke Users'}
      />
      <SharedSettingsSectionContainer>
        <SharedSettingsStyledLabel>
          Current Document Shares
        </SharedSettingsStyledLabel>
        <SharedSettingsLabelData>
          Listed below are your currently active document sharing links. You can
          share or delete them.
        </SharedSettingsLabelData>
        <BorderedContainer>
          <SharedSettingsInfoPanel bgColor={config?.colors?.secondary}>
            <SharedSettingsInfoText>
              There are no shares yet, or you can add them by clicking the “Add
              New Share” button
            </SharedSettingsInfoText>
          </SharedSettingsInfoPanel>
        </BorderedContainer>
      </SharedSettingsSectionContainer>
    </ModalContainerFullScreen>
  );
};

export default BlockedUsersModal;
