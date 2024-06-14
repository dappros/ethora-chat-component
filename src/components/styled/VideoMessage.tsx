import React from "react";
import styled from "styled-components";
import Modal from "react-modal";
import { ReactComponent as DownloadIcon } from "../../assets/downloadIcon.svg";
import { ReactComponent as CloseIcon } from "../../assets/closeIcon.svg";

interface CustomMessageVideoProps {
  videoUrl: string | undefined;
}

export const Container = styled.div`
  margin: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const FullScreenVideo = styled.video`
  width: 100%;
  height: 100%;
  object-fit: contain;
`;

export const FixedSizeVideo = styled.video`
  width: 300px;
  height: 200px;
  object-fit: cover;
`;

export const ModalContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border-radius: 10px;
`;

export const ButtonContainer = styled.div`
  display: flex;
  position: absolute;
  top: 8px;
  right: 8px;
`;

export const IconButton = styled.button`
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
        link.setAttribute("download", "MEDIA-ETHORA.mp4");
        document.body.appendChild(link);
        link.click();
      });
    })
    .catch((err) => {
      console.log(err);
    });
};

const CustomMessageVideo: React.FC<CustomMessageVideoProps> = ({
  videoUrl,
}) => {
  const [open, setOpen] = React.useState(false);
  const handleOpen = (e: React.MouseEvent<HTMLVideoElement, MouseEvent>) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  };
  const handleClose = () => setOpen(false);

  const downloadVideo = () => {
    videoUrl && download(videoUrl);
  };

  return (
    <Container>
      <FixedSizeVideo
        src={videoUrl}
        controls
        autoPlay={false}
        onClick={(e) => handleOpen(e)}
        style={{ cursor: "pointer", maxWidth: "100%" }}
      />
      <Modal
        isOpen={open}
        onRequestClose={handleClose}
        contentLabel="Video Modal"
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
            width: "70%",
            height: "70%",
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
          <FullScreenVideo src={videoUrl} controls autoPlay={false} />
          <ButtonContainer>
            {videoUrl && (
              <IconButton
                onClick={downloadVideo}
                aria-label="Download"
                style={{ height: "50px", width: "50px" }}
              >
                <DownloadIcon />
              </IconButton>
            )}
            <IconButton onClick={handleClose} aria-label="Close">
              <CloseIcon />
            </IconButton>
          </ButtonContainer>
        </ModalContent>
      </Modal>
    </Container>
  );
};

export default CustomMessageVideo;
