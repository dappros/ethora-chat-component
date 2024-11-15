import React from 'react';
import {
  EmptySection,
  CenterContainer,
  ProfileImage,
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

interface UserProfileModalProps {
  handleCloseModal: any;
}

const UserProfileModal: React.FC<UserProfileModalProps> = ({
  handleCloseModal,
}) => {
  const { user } = useSelector((state: RootState) => state.chatSettingStore);

  return (
    <ModalContainerFullScreen>
      <ModalHeaderComponent
        handleCloseModal={handleCloseModal}
        headerTitle={'Profile'}
      />
      <CenterContainer>
        <ProfileImage />
        <UserInfo>
          <UserName>
            {user.firstName} {user.lastName}
          </UserName>
          <UserStatus>Status</UserStatus>
        </UserInfo>
        <BorderedContainer>
          <Label>About</Label>
          <LabelData>User's description</LabelData>
        </BorderedContainer>
        <ActionButton StartIcon={<ChatIcon />} variant="filled">
          Message
        </ActionButton>
        <EmptySection />
      </CenterContainer>
    </ModalContainerFullScreen>
  );
};

export default UserProfileModal;
