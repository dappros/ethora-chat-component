import { FC } from 'react';
import { styled } from 'styled-components';

export const StyledMessageReply = styled.div<{
  $isUser: boolean;
  $configColor: string;
}>`
  background-color: ${(props) =>
    props.$isUser
      ? 'var(--ethora-color-bg, #ffffff)'
      : 'var(--ethora-color-primary-soft, #E7EDF9)'};
  padding: 8px 16px;
  font-size: var(--ethora-font-size-sm, 13px);
  line-height: 1.45;
  border-radius: var(--ethora-radius-sm, 8px);
  border-left: ${(props) =>
    props.$isUser ? `3px solid ${props.$configColor}` : ''};
  border-right: ${(props) =>
    !props.$isUser ? `3px solid ${props.$configColor}` : ''};
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 2px;
  }
`;

interface MessageReplyProps {
  isUser: boolean;
  text: string;
  handleReplyMessage: () => void;
  color?: string;
}

export const MessageReply: FC<MessageReplyProps> = ({
  isUser,
  text,
  handleReplyMessage,
  color = 'var(--ethora-color-primary, #0052CD)',
}) => {
  return (
    <StyledMessageReply
      onClick={handleReplyMessage}
      $isUser={isUser}
      $configColor={color}
    >
      <span>{text}</span>
    </StyledMessageReply>
  );
};
