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

interface DocumentSharesModalProps {
  handleCloseModal: any;
}

const DocumentSharesModal: React.FC<DocumentSharesModalProps> = ({
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
        headerTitle={'Document Shares'}
      />
      <CenterContainer></CenterContainer>
    </ModalContainerFullScreen>
  );
};

export default DocumentSharesModal;
