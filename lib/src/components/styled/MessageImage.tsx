import React from 'react';
import { Container } from './StyledInputComponents/MediaComponents';
import { useDispatch } from 'react-redux';
import {
  setActiveFile,
  setActiveModal,
} from '../../roomStore/chatSettingsSlice';
import { MODAL_TYPES } from '../../helpers/constants/MODAL_TYPES';
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
            (e.target as HTMLImageElement).src =
              'https://as2.ftcdn.net/v2/jpg/02/51/95/53/1000_F_251955356_FAQH0U1y1TZw3ZcdPGybwUkH90a3VAhb.jpg';
          }}
        />
      ) : (
        <img
          src="https://as2.ftcdn.net/v2/jpg/02/51/95/53/1000_F_251955356_FAQH0U1y1TZw3ZcdPGybwUkH90a3VAhb.jpg"
          alt={fileName}
          onClick={handleOpen}
          style={{
            borderRadius: 16,
            cursor: 'pointer',
            maxWidth: '150px',
            maxHeight: '200px',
          }}
        />
      )}
    </Container>
  );
};

export default CustomMessageImage;
