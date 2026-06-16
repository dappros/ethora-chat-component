import { styled } from 'styled-components';
import { EmptyChatIllustration } from '../../assets/illustrations/EmptyChatIllustration';
import { useChatSettingState } from '../../hooks/useChatSettingState';
import { resolveIconColor } from '../../helpers/resolveIconColor';

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
  font-size: var(--ethora-font-size, 16px);
  color: #141414;
  font-weight: 600;
`;

export const ChooseChatDescription = styled.div`
  font-size: var(--ethora-font-size-sm, 14px);
  color: #141414;
`;

export const ChooseChatMessage = () => {
  const { config } = useChatSettingState();

  return (
    <ChooseChatMessageContainer>
    <EmptyChatIllustration width={240} style={{ color: resolveIconColor(config) }} />
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
