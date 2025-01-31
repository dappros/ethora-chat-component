import styled from 'styled-components';
import Button from '../styled/Button';

export const ModalBackground = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

export const CloseButton = styled.button`
  position: absolute;
  top: 16px;
  right: 16px;
  background: none;
  border: none;
  font-size: 1.25em;
  cursor: pointer;
  color: #888;
  border-radius: 8px;

  &:hover {
    color: #555;
    background-color: #dddddd;
  }
`;

export const ModalContainer = styled.div`
  background: white;
  border-radius: 24px;
  padding: 32px 64px;
  box-shadow: 0px 4px 16px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  gap: 32px;
  position: relative;
  justify-content: center;
  align-items: center;
  width: 50%;
  max-width: 400px;
`;

export const ModalTitle = styled.h2`
  font-size: 1.5em;
  margin: 0;
  font-weight: 400;
  color: #141414;
`;

export const ModalDescription = styled.p`
  font-size: 14px;
  margin: 0;
  font-weight: 400;
`;

export const GroupContainer = styled.div`
  display: flex;
  gap: 32px;
  width: 100%;
  padding: 0;
`;

export const ModalContainerFullScreen = styled.div`
  width: 100%;
  height: 100%;
  background-color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
  overflow-y: auto;
`;

export const HeaderContainer = styled(GroupContainer)`
  position: sticky;
  top: 0;
  width: 100%;
  padding: 16px;
  background-color: #fff;
  box-sizing: border-box;
  border-bottom: 1px solid #f0f0f0;
  z-index: 1;
  justify-content: space-between;
`;

export const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

export const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

export const CenterContainer = styled(GroupContainer)`
  width: 52.5%;
  padding: 16px;
  flex-direction: column;
  align-items: center;
`;

export const ProfileImage = styled.div`
  width: 120px;
  height: 120px;
  border-radius: 10000px;
  border: 1px solid #f0f0f0;
`;

export const UserInfo = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`;

export const UserName = styled.div`
  color: #141414;
  font-size: 24px;
  font-weight: 400;
`;

export const UserStatus = styled.div`
  color: #8c8c8c;
  font-size: 16px;
  font-weight: 400;
`;

export const BorderedContainer = styled.div`
  width: 100%;
  border-radius: 8px;
  border: 1px solid #f0f0f0;
  display: flex;
  flex-direction: column;
  padding: 16px;
`;

export const LabelData = styled.div`
  color: #8c8c8c;
  font-size: 14px;
  font-weight: 400;
`;

export const Label = styled.span`
  color: #141414;
  font-size: 16px;
`;

export const ActionButton = styled(Button)`
  width: 100%;
`;

export const EmptySection = styled.div`
  height: 200px;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  width: 100%;
  display: flex;
`;

export const Divider = styled.div`
  height: 1px;
  width: 100%;
  background-color: #0052cd0d;
`;
