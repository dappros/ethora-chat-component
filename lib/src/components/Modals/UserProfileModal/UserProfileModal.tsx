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

interface UserProfileModalProps {
  handleCloseModal: any;
}

const UserProfileModal: React.FC<UserProfileModalProps> = ({
  handleCloseModal,
}) => {
  return (
    <ModalContainerFullScreen>
      <ModalHeaderComponent
        handleCloseModal={handleCloseModal}
        headerTitle={'Profile'}
      />
      <CenterContainer>
        <ProfileImage />
        <UserInfo>
          <UserName>User's name</UserName>
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
