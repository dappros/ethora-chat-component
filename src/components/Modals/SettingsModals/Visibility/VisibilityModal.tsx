import { useEffect, useState } from 'react';
import { RadioGroup, RadioLabel, RadioInput } from './StyledComponents';
import ModalHeaderComponent from '../../ModalHeaderComponent';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../../../roomStore';
import { setUser } from '../../../../roomStore/chatSettingsSlice';
import { updateMe } from '../../../../networking/api-requests/user.api';
import { User } from '../../../../types/types';
import { ModalContainerFullScreen } from '../../styledModalComponents';
import {
  SharedSettingsCenterContainer,
  SharedSettingsColumnContainer,
  SharedSettingsLabelData,
  SharedSettingsStyledLabel,
} from '../SharedStyledComponents';
import { Notification } from '../../../Notification';
import { useT } from '../../../../i18n/useT';

interface VisibilityModalProps {
  handleCloseModal: any;
}

const VisibilityModal: React.FC<VisibilityModalProps> = ({
  handleCloseModal,
}) => {
  const dispatch = useDispatch();
  const t = useT();
  const { user, config } = useSelector(
    (state: RootState) => state.chatSettingStore
  );

  const doUpdateUser = (user: User) => dispatch(setUser(user));
  const [isProfileOpen, setIsProfileOpen] = useState(user?.isProfileOpen);
  const [isAssetsOpen, setIsAssetsOpen] = useState(user?.isAssetsOpen);
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  useEffect(() => {
    if (isProfileOpen !== user.isProfileOpen) {
      updateMe({ isProfileOpen })
        .then(({ data }) => {
          doUpdateUser(data.user);
          showNotification(t('notification.saved'), 'success');
        })
        .catch(() => showNotification(t('toast.error'), 'error'));
    }
  }, [isProfileOpen]);

  useEffect(() => {
    if (isAssetsOpen !== user?.isAssetsOpen) {
      updateMe({ isAssetsOpen })
        .then(({ data }) => {
          doUpdateUser(data.user);
          showNotification(t('notification.saved'), 'success');
        })
        .catch(() => showNotification(t('toast.error'), 'error'));
    }
  }, [isAssetsOpen]);

  return (
    <ModalContainerFullScreen>
      <ModalHeaderComponent
        handleCloseModal={handleCloseModal}
        headerTitle={t('settings.visibility.title')}
      />
      <SharedSettingsCenterContainer>
        <SharedSettingsColumnContainer>
          <SharedSettingsStyledLabel>
            {t('settings.visibility.profileLabel')}
          </SharedSettingsStyledLabel>
          <RadioGroup>
            <RadioLabel>
              <RadioInput
                radioColor={config?.colors?.primary}
                type="radio"
                checked={isProfileOpen === true}
                onChange={() => setIsProfileOpen(true)}
              />
              {t('settings.visibility.open')}
            </RadioLabel>
            <SharedSettingsLabelData>
              {t('settings.visibility.openDescription')}
            </SharedSettingsLabelData>
            <RadioLabel>
              <RadioInput
                radioColor={config?.colors?.primary}
                type="radio"
                checked={isProfileOpen === false}
                onChange={() => setIsProfileOpen(false)}
              />
              {t('settings.visibility.restricted')}
            </RadioLabel>
            <SharedSettingsLabelData>
              {t('settings.visibility.restrictedDescription')}
            </SharedSettingsLabelData>
          </RadioGroup>
        </SharedSettingsColumnContainer>
        <SharedSettingsColumnContainer>
          <SharedSettingsStyledLabel>
            {t('settings.visibility.documentsLabel')}
          </SharedSettingsStyledLabel>
          <RadioGroup>
            <RadioLabel>
              <RadioInput
                radioColor={config?.colors?.primary}
                type="radio"
                checked={isAssetsOpen === true}
                onChange={() => setIsAssetsOpen(true)}
              />
              {t('settings.visibility.full')}
            </RadioLabel>
            <SharedSettingsLabelData>
              {t('settings.visibility.fullDescription')}
            </SharedSettingsLabelData>
            <RadioLabel>
              <RadioInput
                radioColor={config?.colors?.primary}
                type="radio"
                checked={isAssetsOpen === false}
                onChange={() => setIsAssetsOpen(false)}
              />
              {t('settings.visibility.individual')}
            </RadioLabel>
            <SharedSettingsLabelData>
              {t('settings.visibility.individualDescription')}
            </SharedSettingsLabelData>
          </RadioGroup>
        </SharedSettingsColumnContainer>
      </SharedSettingsCenterContainer>

      {notification && (
        <Notification type={notification.type}>
          {notification.message}
        </Notification>
      )}
    </ModalContainerFullScreen>
  );
};

export default VisibilityModal;
