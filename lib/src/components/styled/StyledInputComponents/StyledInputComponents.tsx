import styled from "styled-components";

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
  gap: 16px;
`;

export const MessageInput = styled.input<{ color?: string }>`
  flex-grow: 1;
  padding: 10px;
  border-radius: 12px;
  border: none;
  color: #141414;
  background-color: #f5f7f9;
  max-height: 40px;
  &:focus {
    border: 1px solid ${(props) => (props.color ? props.color : "#0052CD")};
    outline: none;
  }
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

export const FileIcon = styled.img`
  max-width: 80%;
  max-height: 80%;
`;

export const VideoPreview = styled.video`
  max-width: 80%;
  max-height: 80%;
`;
