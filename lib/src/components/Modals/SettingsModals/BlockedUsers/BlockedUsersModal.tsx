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
import { useT } from '../../../../i18n/useT';

interface BlockedUsersModalProps {
  handleCloseModal: any;
}

const BlockedUsersModal: React.FC<BlockedUsersModalProps> = ({
  handleCloseModal,
}) => {
  const { config } = useSelector((state: RootState) => state.chatSettingStore);
  const t = useT();

  return (
    <ModalContainerFullScreen>
      <ModalHeaderComponent
        handleCloseModal={handleCloseModal}
        headerTitle={t('settings.blockedUsers.title')}
      />
      <SharedSettingsSectionContainer>
        <SharedSettingsStyledLabel>
          {t('settings.blockedUsers.label')}
        </SharedSettingsStyledLabel>
        <SharedSettingsLabelData>
          {t('settings.blockedUsers.description')}
        </SharedSettingsLabelData>
        <BorderedContainer>
          <SharedSettingsInfoPanel bgColor={config?.colors?.secondary}>
            <SharedSettingsInfoText>
              {t('settings.blockedUsers.emptyState')}
            </SharedSettingsInfoText>
          </SharedSettingsInfoPanel>
        </BorderedContainer>
      </SharedSettingsSectionContainer>
    </ModalContainerFullScreen>
  );
};

export default BlockedUsersModal;
