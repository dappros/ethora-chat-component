import { FC } from "react";
import { IMessage } from "../../types/types";
import { styled } from "styled-components";

export const StyledMessageReply = styled.div<{ isUser: boolean }>`
  background-color: ${(props) => props.isUser ? '#ffffff' : '#E7EDF9'};
  padding: 8px 16px;
  font-size: 14px;
  border-radius: 4px;
  border-left: ${(props) => props.isUser ? '4px solid #0052CD' : ''};
  border-right: ${(props) => !props.isUser ? '4px solid #0052CD' : ''};
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
`

interface MessageReplyProps {
  isUser: boolean;
  text: string;
  handleReplyMessage: () => void;
}

export const MessageReply: FC<MessageReplyProps> = ({
  isUser,
  text,
  handleReplyMessage
}) => {
  return (
    <StyledMessageReply
      onClick={handleReplyMessage}
      isUser={isUser}
    >
    <span>{text}</span>
  </StyledMessageReply>
  );
};
