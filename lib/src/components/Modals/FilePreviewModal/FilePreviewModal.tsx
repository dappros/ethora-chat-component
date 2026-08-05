import React, { useMemo } from 'react';
import {
  CenterContainer,
  ModalContainerFullScreen,
} from '../styledModalComponents';
import { FileIcon, SaveIcon } from '../../../assets/icons';
import ModalHeaderComponent from '../ModalHeaderComponent';
import { useDispatch, useSelector } from 'react-redux';
import Button from '../../styled/Button';
import { RootState } from '../../../roomStore';
import { FullScreenImage } from '../../styled/StyledInputComponents/MediaComponents';
import { FullScreenVideo } from '../../styled/VideoMessage';
import { setActiveFile } from '../../../roomStore/chatSettingsSlice';
import PdfViewer from './PdfView';
import { ethoraLogger } from '../../../helpers/ethoraLogger';
import { useT } from '../../../i18n/useT';
import { getFileExtension, getFileKind } from '../../../helpers/fileKind';

interface FilePreviewModalProps {
  handleCloseModal: any;
}

const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  handleCloseModal,
}) => {
  const dispatch = useDispatch();
  const t = useT();
  const { activeFile } = useSelector(
    (state: RootState) => state.chatSettingStore
  );

  const saveClick = () => {
    fetch(activeFile.fileURL, {
      method: 'GET',
      headers: {},
    })
      .then((response) => {
        // The old code appended the whole file name as the extension for
        // anything that was not an image or video, so `report.pdf` saved as
        // `MEDIA-ETHORA.report.pdf`. Keep the user's own name when we have
        // one, and only synthesise an extension when we do not.
        const kind = getFileKind(activeFile.mimetype, activeFile.fileName);
        const hasOwnExtension = !!getFileExtension(activeFile.fileName);
        const fallbackExtension =
          kind === 'image' ? 'png' : kind === 'video' ? 'mp4' : 'bin';
        const downloadName = hasOwnExtension
          ? activeFile.fileName
          : `MEDIA-ETHORA.${fallbackExtension}`;

        response.arrayBuffer().then(function (buffer) {
          if (typeof window === 'undefined') {
            return;
          }
          const url = window.URL.createObjectURL(new Blob([buffer]));
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', downloadName);
          document.body.appendChild(link);
          link.click();
          // Both the node and the blob outlived every download before this.
          link.remove();
          window.URL.revokeObjectURL(url);
        });
      })
      .catch((err) => {
        ethoraLogger.log(err);
      });
  };

  const closeModal = () => {
    dispatch(setActiveFile(undefined));
    handleCloseModal?.();
  };

  const getMediaComponent = useMemo(() => {
    switch (getFileKind(activeFile.mimetype, activeFile.fileName)) {
      case 'image':
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
      case 'video':
        return (
          <FullScreenVideo src={activeFile.fileURL} controls autoPlay={false} />
        );
      case 'pdf':
        return <PdfViewer pdfUrl={activeFile.fileURL} />;
      default:
        return (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <FileIcon style={{ minWidth: '100px', minHeight: '100px' }} />
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
              format. You still can download this file.
            </div>
          </div>
        );
    }
  }, [activeFile]);

  return (
    <ModalContainerFullScreen>
      <ModalHeaderComponent
        handleCloseModal={closeModal}
        headerTitle={t('modal.filePreview.title')}
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
          width: '90%',
        }}
      >
        {getMediaComponent}
      </CenterContainer>
    </ModalContainerFullScreen>
  );
};

export default FilePreviewModal;
