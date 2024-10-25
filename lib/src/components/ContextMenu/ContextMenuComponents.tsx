import styled from 'styled-components';

export const ContextMenu = styled.div`
  position: absolute;
  z-index: 1000;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0px 0px 6px -2px #12121908;
  box-shadow: 0px 0px 16px -4px #12121914;
  padding: 8px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

export const MenuItem = styled.div`
  padding: 8px 8px;
  cursor: pointer;
  &:hover {
    background-color: #f0f0f0;
  }
  min-width: 208px;
  display: flex;
  text-align: start;
`;

export const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 999;
  background: transparent;
`;

export const Delimeter = styled.div`
  border: 1px solid var(--colors-background-bg-prymary-5, #0052cd0d);
`;
