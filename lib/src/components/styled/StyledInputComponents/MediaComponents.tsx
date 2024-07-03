import styled from "styled-components";

export const Container = styled.div`
  margin: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const FullScreenImage = styled.img`
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

export const UnsupportedContainer = styled.div`
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

export const FileName = styled.div`
  flex-grow: 1;
  padding: 0 10px;
  color: #333;
`;
