import styled from "styled-components";
import sendIcon from "../../../assets/sendIcon.svg";
import attachIcon from "../../../assets/attachIcon.svg";
import recordIcon from "../../../assets/recordIcon.svg";
import removeIcon from "../../../assets/removeIcon.svg";
import pauseIcon from "../../../assets/pauseIcon.svg";

export const InputContainer = styled.div`
  display: flex;
  flex-direction: column;
  border-radius: 15px 15px 0px 0px;
  padding: 16px;
  background-color: #fff;
  z-index: 1;
  box-shadow: 0px 0px 8px -4px #12121908;
  box-shadow: 0px 0px 24px -4px #12121914;
`;

export const MessageInputContainer = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
  max-height: 72px;
  display: "flex";
  gap: "16px";
`;

export const MessageInput = styled.input`
  flex-grow: 1;
  padding: 10px;
  border-radius: 12px;
  border: none;
  color: #8c8c8c;
  background-color: #f5f7f9;
  ::placeholder {
    color: red;
  }
  max-height: 40px;
`;

export const SendButton = styled.button<{ disabled: boolean }>`
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
  height: 40px;
  width: 40px;
  display: flex;
  justify-content: center;
  align-items: center;
`;

export const AttachButton = styled.button<{ disabled: boolean }>`
  padding: 10px;
  border: none;
  border-radius: 8px;
  background: url(${attachIcon}) no-repeat center center;
  background-size: contain;
  cursor: pointer;
  height: 40px;
  width: 40px;
  color: ${(props) => (props.disabled ? "#E7EDF9" : "#FFFFFF")};
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
  height: 40px;
  width: 40px;
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
  height: 40px;
  background: #f1f1f1;
`;

export const RecordContainer = styled.div`
  height: 40px;
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
