import React from 'react';
import {
  Container,
  MediaLoadingSkeleton,
} from './StyledInputComponents/MediaComponents';
import { useDispatch } from 'react-redux';
import {
  setActiveFile,
  setActiveModal,
} from '../../roomStore/chatSettingsSlice';
import { MODAL_TYPES } from '../../helpers/constants/MODAL_TYPES';
import {
  isSecureFileUrl,
  requestFileTokenRecovery,
} from '../../helpers/secureFileUrl';
interface CustomMessageImageProps {
  fileURL: string;
  fileName: string;
  mimetype: string;
  locationPreview?: string;
}

const CustomMessageImage: React.FC<CustomMessageImageProps> = ({
  fileURL,
  fileName,
  mimetype,
  locationPreview,
}) => {
  const dispatch = useDispatch();

  const handleOpen = () => {
    dispatch(setActiveFile({ fileName, fileURL, mimetype }));
    dispatch(setActiveModal(MODAL_TYPES.FILE_PREVIEW));
  };

  return (
    <Container>
      {fileURL ? (
        <img
          src={locationPreview}
          alt={fileName}
          onClick={handleOpen}
          style={{
            borderRadius: 16,
            cursor: 'pointer',
            maxWidth: '150px',
            maxHeight: '200px',
          }}
          onError={(e) => {
            // Expired fileToken: kick the refresh flow; the refreshTokens
            // dispatch re-renders MediaMessage with a fresh src and the
            // browser retries automatically.
            if (isSecureFileUrl(locationPreview)) {
              requestFileTokenRecovery();
            }
            (e.target as HTMLImageElement).src =
              'https://as2.ftcdn.net/v2/jpg/02/51/95/53/1000_F_251955356_FAQH0U1y1TZw3ZcdPGybwUkH90a3VAhb.jpg';
          }}
        />
      ) : (
        <MediaLoadingSkeleton $width={150} $height={200} />
      )}
    </Container>
  );
};

export default CustomMessageImage;
