import React from 'react';
import styled from 'styled-components';
import {
  ButtonContainer,
  Container,
  FullScreenImage,
  IconButton,
  ModalContent,
} from './StyledInputComponents/MediaComponents';
import { CloseIcon, DownloadIcon } from '../../assets/icons';
import { Overlay, StyledModal } from './MediaModal';
import { IConfig } from '../../types/types';
import { ActionButton } from './ActionButton';
interface CustomMessageImageProps {
  imageUrl: string | undefined;
  imageAlt: string;
}

const download = (link: string) => {
  fetch(link, {
    method: 'GET',
    headers: {},
  })
    .then((response) => {
      response.arrayBuffer().then(function (buffer) {
        const url = window.URL.createObjectURL(new Blob([buffer]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'MEDIA-ETHORA.png');
        document.body.appendChild(link);
        link.click();
      });
    })
    .catch((err) => {
      console.log(err);
    });
};

const CustomMessageImage: React.FC<CustomMessageImageProps> = ({
  imageUrl,
  imageAlt,
}) => {
  const [open, setOpen] = React.useState(false);
  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  const downloadImage = () => {
    imageUrl && download(imageUrl);
  };

  return (
    <Container>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={imageAlt}
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
          alt={imageAlt}
          onClick={handleOpen}
          style={{
            borderRadius: 16,
            cursor: 'pointer',
            maxWidth: '150px',
            maxHeight: '200px',
          }}
        />
      )}
      {open && (
        <Overlay>
          <StyledModal>
            <ModalContent>
              <FullScreenImage
                src={
                  imageUrl ||
                  'https://as2.ftcdn.net/v2/jpg/02/51/95/53/1000_F_251955356_FAQH0U1y1TZw3ZcdPGybwUkH90a3VAhb.jpg'
                }
                alt={imageAlt}
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'https://as2.ftcdn.net/v2/jpg/02/51/95/53/1000_F_251955356_FAQH0U1y1TZw3ZcdPGybwUkH90a3VAhb.jpg';
                }}
              />
              <ButtonContainer>
                {imageUrl && (
                  <ActionButton onClick={downloadImage} aria-label="Download" />
                )}
                <ActionButton
                  onClick={handleClose}
                  aria-label="Close"
                  icon={<CloseIcon />}
                />
              </ButtonContainer>
            </ModalContent>
          </StyledModal>
        </Overlay>
      )}
    </Container>
  );
};

export default CustomMessageImage;
