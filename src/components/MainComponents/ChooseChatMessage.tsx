import { styled } from 'styled-components';
import { NoSelectedChatIcon } from '../../assets/icons';

export const ChooseChatMessageContainer = styled.div`
  height: 100%;
  width: 100%;
  align-items: center;
  display: flex;
  justify-content: center;
  flex-direction: column;
  gap: 16px;
`;

export const ChooseChatMessageContainerBoxText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
`;

export const ChooseChatTitle = styled.div`
  font-size: 16px;
  color: #141414;
  font-weight: 600;
`;

export const ChooseChatDescription = styled.div`
  font-size: 14px;
  color: #141414;
`;

export const ChooseChatMessage = () => {
  return (
    <ChooseChatMessageContainer>
    <NoSelectedChatIcon />
    <ChooseChatMessageContainerBoxText>
      <ChooseChatTitle>
        Start a Conversation
      </ChooseChatTitle>
      <ChooseChatDescription>
        Choose a chat to start messaging.
      </ChooseChatDescription>
    </ChooseChatMessageContainerBoxText>
  </ChooseChatMessageContainer>
  );
};
