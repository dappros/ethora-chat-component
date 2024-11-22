import { useEffect, useState } from 'react';
import { RadioGroup, RadioLabel, RadioInput } from './StyledComponents';
import ModalHeaderComponent from '../../ModalHeaderComponent';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../../../roomStore';
import { setUser } from '../../../../roomStore/chatSettingsSlice';
import { Notification } from '../../../Toast';
import { updateMe } from '../../../../networking/api-requests/user.api';
import { User } from '../../../../types/types';
import { ModalContainerFullScreen } from '../../styledModalComponents';
import {
  SharedSettingsCenterContainer,
  SharedSettingsColumnContainer,
  SharedSettingsLabelData,
  SharedSettingsStyledLabel,
} from '../SharedStyledComponents';

interface VisibilityModalProps {
  handleCloseModal: any;
}

const VisibilityModal: React.FC<VisibilityModalProps> = ({
  handleCloseModal,
}) => {
  const dispatch = useDispatch();
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
          showNotification('Saved', 'success');
        })
        .catch(() => showNotification('Error', 'error'));
    }
  }, [isProfileOpen]);

  useEffect(() => {
    if (isAssetsOpen !== user?.isAssetsOpen) {
      updateMe({ isAssetsOpen })
        .then(({ data }) => {
          doUpdateUser(data.user);
          showNotification('Saved', 'success');
        })
        .catch(() => showNotification('Error', 'error'));
    }
  }, [isAssetsOpen]);

  return (
    <ModalContainerFullScreen>
      <ModalHeaderComponent
        handleCloseModal={handleCloseModal}
        headerTitle={'Visibility'}
      />
      <SharedSettingsCenterContainer>
        <SharedSettingsColumnContainer>
          <SharedSettingsStyledLabel>
            Profile Visiblility
          </SharedSettingsStyledLabel>
          <RadioGroup>
            <RadioLabel>
              <RadioInput
                radioColor={config?.colors?.primary}
                type="radio"
                checked={isProfileOpen === true}
                onChange={() => setIsProfileOpen(true)}
              />
              Open (default)
            </RadioLabel>
            <SharedSettingsLabelData>
              Your profile can be viewed by anyone who follows your profile link
              or QR code.
            </SharedSettingsLabelData>
            <RadioLabel>
              <RadioInput
                radioColor={config?.colors?.primary}
                type="radio"
                checked={isProfileOpen === false}
                onChange={() => setIsProfileOpen(false)}
              />
              Restricted
            </RadioLabel>
            <SharedSettingsLabelData>
              Only users with your permission or temporary secure link can see
              your profile.
            </SharedSettingsLabelData>
          </RadioGroup>
        </SharedSettingsColumnContainer>
        <SharedSettingsColumnContainer>
          <SharedSettingsStyledLabel>
            Documents Visibility
          </SharedSettingsStyledLabel>
          <RadioGroup>
            <RadioLabel>
              <RadioInput
                radioColor={config?.colors?.primary}
                type="radio"
                checked={isAssetsOpen === true}
                onChange={() => setIsAssetsOpen(true)}
              />
              Full (default)
            </RadioLabel>
            <SharedSettingsLabelData>
              Show all Documents to those who can see your profile.
            </SharedSettingsLabelData>
            <RadioLabel>
              <RadioInput
                radioColor={config?.colors?.primary}
                type="radio"
                checked={isAssetsOpen === false}
                onChange={() => setIsAssetsOpen(false)}
              />
              Individual
            </RadioLabel>
            <SharedSettingsLabelData>
              You need to share each document individually before others can see
              them.
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
