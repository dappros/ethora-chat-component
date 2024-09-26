import React from "react";
import styled from "styled-components";
import {
  ButtonContainer,
  Container,
  FullScreenImage,
  IconButton,
  ModalContent,
} from "./StyledInputComponents/MediaComponents";
import { CloseIcon, DownloadIcon } from "../../assets/icons";
import { Overlay, StyledModal } from "./Modal";

interface CustomMessageImageProps {
  imageUrl: string | undefined;
  imageAlt: string;
}

const download = (link: string) => {
  console.log(link);
  fetch(link, {
    method: "GET",
    headers: {},
  })
    .then((response) => {
      response.arrayBuffer().then(function (buffer) {
        const url = window.URL.createObjectURL(new Blob([buffer]));
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", "MEDIA-ETHORA.png");
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
      <img
        src={
          imageUrl ||
          "https://as2.ftcdn.net/v2/jpg/02/51/95/53/1000_F_251955356_FAQH0U1y1TZw3ZcdPGybwUkH90a3VAhb.jpg"
        }
        alt={imageAlt}
        onClick={handleOpen}
        style={{ cursor: "pointer", maxWidth: "100%" }}
      />
      {open && (
        <Overlay>
          <StyledModal>
            <ModalContent>
              <FullScreenImage
                src={
                  imageUrl ||
                  "https://as2.ftcdn.net/v2/jpg/02/51/95/53/1000_F_251955356_FAQH0U1y1TZw3ZcdPGybwUkH90a3VAhb.jpg"
                }
                alt={imageAlt}
              />
              <ButtonContainer>
                {imageUrl && (
                  <IconButton onClick={downloadImage} aria-label="Download">
                    <DownloadIcon fontSize="inherit" />
                  </IconButton>
                )}
                <IconButton onClick={handleClose} aria-label="Close">
                  <CloseIcon fontSize="inherit" />
                </IconButton>
              </ButtonContainer>
            </ModalContent>
          </StyledModal>
        </Overlay>
      )}
    </Container>
  );
};

export default CustomMessageImage;
