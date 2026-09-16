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
  /* This stands in for the chat pane, which has its own background. Left
     transparent, the near-black text below sat on whatever the host page
     paints - on a dark page the copy was simply invisible, which is how an
     "this chat isn't available" message manages to be no message at all. */
  background: var(--ethora-color-bg, #fff);
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

interface ChooseChatMessageProps {
  /**
   * True when a specific room WAS requested (a QR code, a shared link, a
   * `roomJID` prop) but is not available to this user. Without this the
   * failure rendered as the ordinary "pick a chat" placeholder, so a dead
   * or members-only link looked exactly like an idle chat pane.
   */
  unavailable?: boolean;
}

export const ChooseChatMessage = ({ unavailable }: ChooseChatMessageProps = {}) => {
  const { config } = useChatSettingState();

  return (
    <ChooseChatMessageContainer data-testid="choose-chat-message">
    <EmptyChatIllustration width={240} style={{ color: resolveIconColor(config) }} />
    <ChooseChatMessageContainerBoxText>
      <ChooseChatTitle>
        {unavailable ? "This chat isn't available" : 'Start a Conversation'}
      </ChooseChatTitle>
      <ChooseChatDescription>
        {unavailable
          ? 'The link may have expired, or you may not be a member of this chat.'
          : 'Choose a chat to start messaging.'}
      </ChooseChatDescription>
    </ChooseChatMessageContainerBoxText>
  </ChooseChatMessageContainer>
  );
};
