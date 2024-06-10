import React from "react";
import styled from "styled-components";
import Modal from "react-modal";
import CloseIcon from "@mui/icons-material/Close";
import DownloadIcon from "@mui/icons-material/Download";

interface CustomMessageImageProps {
  imageUrl: string | undefined;
  imageAlt: string;
}

const Container = styled.div`
  margin: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const FullScreenImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: contain;
`;

const ModalContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border-radius: 10px;
`;

const ButtonContainer = styled.div`
  display: flex;
  position: absolute;
  top: 8px;
  right: 8px;
`;

const IconButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: gray;
  font-size: 36px;
  display: flex;
  align-items: center;
  gap: 5px;
  pointer-events: auto;
`;

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
        src={imageUrl}
        alt={imageAlt}
        onClick={handleOpen}
        style={{ cursor: "pointer" }}
      />
      <Modal
        isOpen={open}
        onRequestClose={handleClose}
        contentLabel="Image Modal"
        style={{
          overlay: {
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          },
          content: {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "80%",
            height: "80%",
            padding: 0,
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
          },
        }}
        shouldCloseOnOverlayClick={true}
      >
        <ModalContent>
          <FullScreenImage src={imageUrl} alt={imageAlt} />
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
      </Modal>
    </Container>
  );
};

export default CustomMessageImage;
