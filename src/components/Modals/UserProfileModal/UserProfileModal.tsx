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
} from '../styledModalComponents';
import { ChatIcon } from '../../../assets/icons';
import ModalHeaderComponent from '../ModalHeaderComponent';
import { useSelector } from 'react-redux';
import { RootState } from '../../../roomStore';
import { ProfileImagePlaceholder } from '../../MainComponents/ProfileImagePlaceholder';

interface UserProfileModalProps {
  handleCloseModal: any;
}

const UserProfileModal: React.FC<UserProfileModalProps> = ({
  handleCloseModal,
}) => {
  const { user, selectedUser } = useSelector(
    (state: RootState) => state.chatSettingStore
  );

  const modalUser: any = selectedUser || user;

  return (
    <ModalContainerFullScreen>
      <ModalHeaderComponent
        handleCloseModal={handleCloseModal}
        headerTitle={'Profile'}
      />
      <CenterContainer>
        <ProfileImagePlaceholder
          icon={(modalUser?.profileImage || modalUser?.avatar) ?? null}
          name={modalUser?.name ?? modalUser?.firstName}
          size={120}
        />
        <UserInfo>
          <UserName>
            {modalUser
              ? `${modalUser?.name}`
              : `${modalUser?.firstName} ${modalUser?.lastName}`}
          </UserName>
          <UserStatus>Status</UserStatus>
        </UserInfo>
        <BorderedContainer>
          <Label>About</Label>
          <LabelData>User's description</LabelData>
        </BorderedContainer>
        {selectedUser && (
          <ActionButton StartIcon={<ChatIcon />} variant="filled">
            Message
          </ActionButton>
        )}
        <EmptySection />
      </CenterContainer>
    </ModalContainerFullScreen>
  );
};

export default UserProfileModal;
