import React from 'react';
import {
  CenterContainer,
  ModalContainerFullScreen,
} from '../styledModalComponents';
import { SaveIcon } from '../../../assets/icons';
import ModalHeaderComponent from '../ModalHeaderComponent';
import { useDispatch, useSelector } from 'react-redux';
import Button from '../../styled/Button';
import { RootState } from '../../../roomStore';

interface FilePreviewModalProps {
  handleCloseModal: any;
}

const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  handleCloseModal,
}) => {
  const { activeFile } = useSelector(
    (state: RootState) => state.chatSettingStore
  );

  const saveClick = () => {};

  return (
    <ModalContainerFullScreen>
      <ModalHeaderComponent
        handleCloseModal={handleCloseModal}
        headerTitle={'File preview'}
        rightMenu={
          <>
            <Button onClick={saveClick}>
              <SaveIcon />
            </Button>
            {/* <Button onClick={deleteCLick}>
              <DeleteIcon />
            </Button> */}
          </>
        }
      />
      <CenterContainer></CenterContainer>
    </ModalContainerFullScreen>
  );
};

export default FilePreviewModal;
