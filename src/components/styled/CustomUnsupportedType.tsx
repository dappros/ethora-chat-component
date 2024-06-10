import React from "react";
import styled from "styled-components";
import DownloadIcon from "@mui/icons-material/Download";
import { IconButton } from "@mui/material";

interface FileDownloadProps {
  fileUrl: string;
  fileName: string;
}

const Container = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 10px;
  margin: 5px 0;
  cursor: pointer;
  background-color: #f9f9f9;
  &:hover {
    background-color: #f1f1f1;
  }
`;

const FileName = styled.div`
  flex-grow: 1;
  padding: 0 10px;
  color: #333;
`;

const downloadFile = (fileUrl: string, fileName: string) => {
  fetch(fileUrl, {
    method: "GET",
    headers: {},
  })
    .then((response) => {
      response.arrayBuffer().then(function (buffer) {
        const url = window.URL.createObjectURL(new Blob([buffer]));
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", fileName);
        document.body.appendChild(link);
        link.click();
      });
    })
    .catch((err) => {
      console.error(err);
    });
};

const FileDownload: React.FC<FileDownloadProps> = ({ fileUrl, fileName }) => {
  return (
    <Container onClick={() => downloadFile(fileUrl, fileName)}>
      <FileName>{fileName}</FileName>
      <IconButton>
        <DownloadIcon />
      </IconButton>
    </Container>
  );
};

export default FileDownload;
