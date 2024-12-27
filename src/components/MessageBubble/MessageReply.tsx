import { FC } from 'react';
import { styled } from 'styled-components';

export const StyledMessageReply = styled.div<{
  isUser: boolean;
  configColor: string;
}>`
  background-color: ${(props) => (props.isUser ? '#ffffff' : '#E7EDF9')};
  padding: 8px 16px;
  font-size: 14px;
  border-radius: 4px;
  border-left: ${(props) =>
    props.isUser ? `4px solid ${props.configColor}` : ''};
  border-right: ${(props) =>
    !props.isUser ? `4px solid ${props.configColor}` : ''};
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
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
  color = '#0052CD',
}) => {
  return (
    <StyledMessageReply
      onClick={handleReplyMessage}
      isUser={isUser}
      configColor={color}
    >
      <span>{text}</span>
    </StyledMessageReply>
  );
};
