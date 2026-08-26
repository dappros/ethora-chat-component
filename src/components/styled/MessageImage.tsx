import React, { useEffect, useState } from 'react';
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

const NO_IMAGE_PLACEHOLDER =
  'https://as2.ftcdn.net/v2/jpg/02/51/95/53/1000_F_251955356_FAQH0U1y1TZw3ZcdPGybwUkH90a3VAhb.jpg';

interface CustomMessageImageProps {
  fileURL: string;
  fileName: string;
  mimetype: string;
  locationPreview?: string;
}

type LoadFailure = 'none' | 'recovering' | 'failed';

const CustomMessageImage: React.FC<CustomMessageImageProps> = ({
  fileURL,
  fileName,
  mimetype,
  locationPreview,
}) => {
  const dispatch = useDispatch();

  // Load-failure state instead of mutating the <img> src in onError: a
  // secure URL that 403s (expired fileToken) shows the loading skeleton
  // while the token rotation runs, and the rotation changing
  // `locationPreview` resets this and lets the <img> retry with the fresh
  // signed URL. Only a URL that cannot recover shows the placeholder.
  const [failure, setFailure] = useState<LoadFailure>('none');

  useEffect(() => {
    setFailure('none');
  }, [locationPreview]);

  const handleError = () => {
    if (isSecureFileUrl(locationPreview)) {
      setFailure('recovering');
      requestFileTokenRecovery().then((gotToken) => {
        // On success the fresh token re-renders us with a new
        // locationPreview and the effect above resets the state.
        if (!gotToken) setFailure('failed');
      });
    } else {
      setFailure('failed');
    }
  };

  const handleOpen = () => {
    dispatch(setActiveFile({ fileName, fileURL, mimetype }));
    dispatch(setActiveModal(MODAL_TYPES.FILE_PREVIEW));
  };

  if (!fileURL || failure === 'recovering') {
    return (
      <Container>
        <MediaLoadingSkeleton $width={150} $height={200} />
      </Container>
    );
  }

  return (
    <Container>
      <img
        src={failure === 'failed' ? NO_IMAGE_PLACEHOLDER : locationPreview}
        alt={fileName}
        onClick={failure === 'failed' ? undefined : handleOpen}
        style={{
          borderRadius: 16,
          cursor: failure === 'failed' ? 'default' : 'pointer',
          maxWidth: '150px',
          maxHeight: '200px',
        }}
        onError={failure === 'failed' ? undefined : handleError}
      />
    </Container>
  );
};

export default CustomMessageImage;
