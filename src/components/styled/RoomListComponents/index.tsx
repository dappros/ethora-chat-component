import styled, { css } from 'styled-components';
import { getTintedColor } from '../../../helpers/getTintedColor';

export const Container = styled.div<{ burgerMenu?: boolean; open?: boolean }>`
  ${({ burgerMenu, open }) =>
    burgerMenu
      ? css`
          position: fixed;
          left: 0;
          top: 0;
          width: 300px;
          height: 100%;
          transform: ${open ? 'translateX(0)' : 'translateX(-100%)'};
          transition: transform 0.3s ease-in-out;
          z-index: 2;
          display: flex;
          flex-direction: column;
          background-color: #fff;
          padding: 16px;
          padding-top: 0px;
          z-index: 1000;
          border-right: 1px solid var(--Colors-Border-border-primary, #f0f0f0);
        `
      : css`
          padding: 16px;
          padding-top: 0px;
          overflow: auto;
          display: relative;
          z-index: 2;
          background-color: #fff;
          min-width: 335px;
          border-right: 1px solid var(--Colors-Border-border-primary, #f0f0f0);
        `}
`;

export const BurgerButton = styled.button`
  /* position: fixed; */
  left: 10px;
  top: 10px;
  color: #333;
  border: none;
  padding: 10px;
  cursor: pointer;
  z-index: 1000;
`;

export const ChatItem = styled.div<{ active: boolean; bg?: string }>`
  display: flex;
  justify-content: space-between;
  border-radius: 16px;
  gap: 16px;
  padding: 8px;
  cursor: pointer;
  background-color: ${({ active, bg }) =>
    active ? (bg ? bg : '#0052CD') : '#fff'};

  &:hover {
    background-color: ${({ active, bg }) =>
      active ? getTintedColor(bg ? bg : '#0052CD') : 'rgba(0, 0, 0, 0.05)'};
  }
  color: #141414;
`;

export const SearchContainer = styled.div<{}>`
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 50px;
  padding: 12px 0px;
`;

export const ScollableContainer = styled.div<{}>`
  height: 100%;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  position: sticky;
`;

export const ChatInfo = styled.div`
  display: flex;
  flex-direction: column;
  max-width: 60%;
  text-align: start;
`;

export const ChatName = styled.div`
  font-weight: bold;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const LastMessage = styled.div`
  color: #999;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const UserCount = styled.div<{ active: boolean }>`
  color: ${({ active }) => (!active ? '#000' : '#fff')};
  margin-left: auto;
`;

export const Divider = styled.div`
  height: 1px;
  width: 100%;
  background-color: #0052cd0d;
`;
