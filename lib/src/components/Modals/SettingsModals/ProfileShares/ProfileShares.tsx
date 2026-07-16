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
import { useT } from '../../../../i18n/useT';

interface ProfileSharesModalProps {
  handleCloseModal: any;
}

const ProfileSharesModal: React.FC<ProfileSharesModalProps> = ({
  handleCloseModal,
}) => {
  const { config } = useSelector((state: RootState) => state.chatSettingStore);
  const t = useT();

  return (
    <ModalContainerFullScreen>
      <ModalHeaderComponent
        handleCloseModal={handleCloseModal}
        headerTitle={t('settings.profileShares.title')}
      />
      <CenterContainer>
        <SharedSettingsSectionContainer>
          <SharedSettingsStyledLabel>
            {t('settings.profileShares.currentShares')}
          </SharedSettingsStyledLabel>
          <SharedSettingsLabelData>
            {t('settings.profileShares.description')}
          </SharedSettingsLabelData>
          <BorderedContainer>
            <SharedSettingsInfoPanel bgColor={config?.colors?.secondary}>
              <SharedSettingsInfoText>
                {t('settings.documentShares.emptyState')}
              </SharedSettingsInfoText>
            </SharedSettingsInfoPanel>
          </BorderedContainer>
        </SharedSettingsSectionContainer>
      </CenterContainer>
    </ModalContainerFullScreen>
  );
};

export default ProfileSharesModal;
