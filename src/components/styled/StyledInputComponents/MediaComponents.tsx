import styled from 'styled-components';

export const Container = styled.div`
  margin: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const FullScreenImage = styled.button`
  width: 100%;
  height: 100%;
  object-fit: contain;
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
  gap: 4px;
`;

export const IconButton = styled.button`
  border: none;
  cursor: pointer;
  color: gray;
  font-size: 36px;
  display: flex;
  align-items: center;
  gap: 5px;
  pointer-events: auto;
`;

export const UnsupportedContainer = styled.button`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
  gap: 8px;
  background-color: #f3f6fc;
  border: none;
`;

export const BackgroundFile = styled.div`
  border-radius: 8px;
  width: 100%;
  height: 100%;
  background-color: #fff;
`;

export const FileInformation = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
`;

export const FileName = styled.span`
  font-size: 14px;
  font-weight: 500;
  flex-grow: 1;
  color: #141414;
  overflow: hidden;
  min-width: 100px;
  text-align: start;
`;

export const FileSizeContainer = styled.div`
  align-items: flex-start;
  flex-direction: row;
  background-color: #fff;
  padding: 2px 8px;
  border-radius: 40px;
`;

export const FileSize = styled.span`
  color: #53575a;
  overflow: hidden;
  text-align: left;
  font-weight: 500;
`;
