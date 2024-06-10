import React from "react";
import styled from "styled-components";
import sendIcon from "../../assets/sendIcon.svg";
import attachIcon from "../../assets/attachIcon.svg";
import recordIcon from "../../assets/recordIcon.svg";
import removeIcon from "../../assets/removeIcon.svg";
import pauseIcon from "../../assets/pauseIcon.svg";

export const InputContainer = styled.div`
  display: flex;
  flex-direction: column;
  border-radius: 15px 15px 0px 0px;
  padding: 11px 30px;
  background-color: #fff;
  z-index: 1;
`;

export const MessageInputContainer = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
`;

export const MessageInput = styled.input`
  flex-grow: 1;
  padding: 10px;
  border-radius: 8px;
  border: none;
  margin-right: 10px;
  color: #8f8f8f;
  ::placeholder {
    color: red;
  }
  height: 70px;
  border: 1px solid #8f8f8f;
`;

export const SendButton = styled.button`
  border: none;
  border-radius: 8px;
  background: url(${sendIcon}) no-repeat center center !important;
  background-size: contain;
  color: white;
  cursor: pointer;
  height: 50px;
  width: 50px;
  display: flex;
  justify-content: center;
  align-items: center;
`;

export const RecordButton = styled.button`
  border: none;
  border-radius: 8px;
  background: url(${recordIcon}) no-repeat center center !important;
  background-size: contain;
  color: white;
  cursor: pointer;
  height: 70px;
  width: 70px;
  display: flex;
  justify-content: center;
  align-items: center;
`;

export const AttachButton = styled.button`
  padding: 10px;
  border: none;
  border-radius: 8px;
  background: url(${attachIcon}) no-repeat center center;
  background-size: contain;
  cursor: pointer;
  margin-right: 10px;
  height: 70px;
  width: 70px;
`;

export const CancelButton = styled.button`
  padding: 10px;
  border: none;
  border-radius: 8px;
  background: url(${removeIcon}) no-repeat center center;
  background-size: contain;
  cursor: pointer;
  height: 30px;
  width: 30px;
`;

export const PauseButton = styled.button`
  padding: 10px;
  border: none;
  border-radius: 8px;
  background: url(${pauseIcon}) no-repeat center center;
  background-size: contain;
  cursor: pointer;
  height: 70px;
  width: 70px;
`;

export const HiddenFileInput = styled.input`
  display: none;
`;

export const Timer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: bold;
  margin-left: 10px;
  color: #000;
`;

export const WaveformContainer = styled.canvas`
  width: 100%;
  height: 70px;
  background: #f1f1f1;
`;

export const RecordContainer = styled.div`
  height: 70px;
  display: flex;
  flex-direction: row;
  gap: 8px;
  justify-content: space-between;
  align-items: center;
  width: 100%;
`;

export const FilePreviewContainer = styled.div`
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
`;

export const FilePreview = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100px;
  height: 100px;
  border: 1px solid #ccc;
  border-radius: 8px;
  overflow: hidden;
  background-color: #f9f9f9;
`;

export const RemoveButton = styled.button`
  position: absolute;
  top: 5px;
  right: 5px;
  padding: 5px;
  border: none;
  background: url(${removeIcon}) no-repeat center center;
  background-size: contain;
  cursor: pointer;
  width: 24px;
  height: 24px;
`;

export const FileIcon = styled.img`
  max-width: 80%;
  max-height: 80%;
`;

export const VideoPreview = styled.video`
  max-width: 80%;
  max-height: 80%;
`;
