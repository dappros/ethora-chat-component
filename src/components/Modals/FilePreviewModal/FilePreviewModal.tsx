import React, { useMemo } from 'react';
import {
  CenterContainer,
  ModalContainerFullScreen,
} from '../styledModalComponents';
import { SaveIcon } from '../../../assets/icons';
import ModalHeaderComponent from '../ModalHeaderComponent';
import { useDispatch, useSelector } from 'react-redux';
import Button from '../../styled/Button';
import { RootState } from '../../../roomStore';
import { FullScreenImage } from '../../styled/StyledInputComponents/MediaComponents';
import { FullScreenVideo } from '../../styled/VideoMessage';
import { setActiveFile } from '../../../roomStore/chatSettingsSlice';

interface FilePreviewModalProps {
  handleCloseModal: any;
}

const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  handleCloseModal,
}) => {
  const dispatch = useDispatch();
  const { activeFile } = useSelector(
    (state: RootState) => state.chatSettingStore
  );

  const saveClick = () => {
    fetch(activeFile.fileURL, {
      method: 'GET',
      headers: {},
    })
      .then((response) => {
        let downloadFilenameExtesion: string;
        switch (true) {
          case activeFile.mimetype.startsWith('image/'):
            downloadFilenameExtesion = 'png';
          case activeFile.mimetype.startsWith('video/'):
            downloadFilenameExtesion = 'mp4';
          default:
            downloadFilenameExtesion = activeFile.fileName;
        }
        response.arrayBuffer().then(function (buffer) {
          const url = window.URL.createObjectURL(new Blob([buffer]));
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute(
            'download',
            `MEDIA-ETHORA.${downloadFilenameExtesion}`
          );
          document.body.appendChild(link);
          link.click();
        });
      })
      .catch((err) => {
        console.log(err);
      });
  };

  const closeModal = () => {
    dispatch(setActiveFile(undefined));
    handleCloseModal?.();
  };

  const getMediaComponent = useMemo(() => {
    switch (true) {
      case activeFile.mimetype.startsWith('image/'):
        return (
          <FullScreenImage
            src={
              activeFile.fileURL ||
              'https://as2.ftcdn.net/v2/jpg/02/51/95/53/1000_F_251955356_FAQH0U1y1TZw3ZcdPGybwUkH90a3VAhb.jpg'
            }
            alt={activeFile.fileName}
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                'https://as2.ftcdn.net/v2/jpg/02/51/95/53/1000_F_251955356_FAQH0U1y1TZw3ZcdPGybwUkH90a3VAhb.jpg';
            }}
          />
        );
      case activeFile.mimetype.startsWith('video/'):
        return (
          <FullScreenVideo src={activeFile.fileURL} controls autoPlay={false} />
        );
      default:
        return (
          <div
            style={{
              backgroundColor: '#FFF8ED',
              borderRadius: '16px',
              display: 'flex',
              padding: '16px',
            }}
          >
            Unable to open the uploaded document. The file format is not
            supported by the system. Please upload a file in a compatible
            format.
          </div>
        );
    }
  }, [activeFile]);

  return (
    <ModalContainerFullScreen>
      <ModalHeaderComponent
        handleCloseModal={closeModal}
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

      <CenterContainer
        style={{
          display: 'flex',
          height: '100%',
          justifyContent: 'center',
          overflow: 'hidden',
          padding: '16px',
        }}
      >
        {getMediaComponent}
      </CenterContainer>
    </ModalContainerFullScreen>
  );
};

export default FilePreviewModal;
