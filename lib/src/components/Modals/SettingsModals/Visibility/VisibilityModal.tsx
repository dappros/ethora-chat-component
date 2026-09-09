import { useEffect, useState } from 'react';
import { RadioGroup, RadioLabel, RadioInput } from './StyledComponents';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../../../roomStore';
import { setUser } from '../../../../roomStore/chatSettingsSlice';
import { updateMe } from '../../../../networking/api-requests/user.api';
import { User } from '../../../../types/types';
import SideDrawer, {
  DrawerCard,
  DrawerCardBody,
  DrawerHint,
  DrawerSection,
  DrawerSectionTitle,
} from '../../SideDrawer/SideDrawer';
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
    <SideDrawer
      title={t('settings.visibility.title')}
      onClose={handleCloseModal}
      backLabel={t('action.back')}
    >
      <DrawerSection>
        <DrawerSectionTitle>
          {t('settings.visibility.profileLabel')}
        </DrawerSectionTitle>
        <DrawerCard>
          <DrawerCardBody>
            <RadioGroup>
              <RadioLabel>
                <RadioInput
                  $radioColor={config?.colors?.primary}
                  type="radio"
                  name="ethora-profile-visibility"
                  checked={isProfileOpen === true}
                  onChange={() => setIsProfileOpen(true)}
                />
                {t('settings.visibility.open')}
              </RadioLabel>
              <DrawerHint>
                {t('settings.visibility.openDescription')}
              </DrawerHint>
              <RadioLabel>
                <RadioInput
                  $radioColor={config?.colors?.primary}
                  type="radio"
                  name="ethora-profile-visibility"
                  checked={isProfileOpen === false}
                  onChange={() => setIsProfileOpen(false)}
                />
                {t('settings.visibility.restricted')}
              </RadioLabel>
              <DrawerHint>
                {t('settings.visibility.restrictedDescription')}
              </DrawerHint>
            </RadioGroup>
          </DrawerCardBody>
        </DrawerCard>
      </DrawerSection>

      <DrawerSection>
        <DrawerSectionTitle>
          {t('settings.visibility.documentsLabel')}
        </DrawerSectionTitle>
        <DrawerCard>
          <DrawerCardBody>
            <RadioGroup>
              <RadioLabel>
                <RadioInput
                  $radioColor={config?.colors?.primary}
                  type="radio"
                  name="ethora-documents-visibility"
                  checked={isAssetsOpen === true}
                  onChange={() => setIsAssetsOpen(true)}
                />
                {t('settings.visibility.full')}
              </RadioLabel>
              <DrawerHint>
                {t('settings.visibility.fullDescription')}
              </DrawerHint>
              <RadioLabel>
                <RadioInput
                  $radioColor={config?.colors?.primary}
                  type="radio"
                  name="ethora-documents-visibility"
                  checked={isAssetsOpen === false}
                  onChange={() => setIsAssetsOpen(false)}
                />
                {t('settings.visibility.individual')}
              </RadioLabel>
              <DrawerHint>
                {t('settings.visibility.individualDescription')}
              </DrawerHint>
            </RadioGroup>
          </DrawerCardBody>
        </DrawerCard>
      </DrawerSection>

      {notification && (
        <Notification type={notification.type}>
          {notification.message}
        </Notification>
      )}
    </SideDrawer>
  );
};

export default VisibilityModal;
