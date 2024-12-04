import React, { FC, Fragment, useMemo } from 'react';
import { IConfig, IMessage } from '../../types/types';
import DateLabel from '../styled/DateLabel';
import SystemMessage from './SystemMessage';
import NewMessageLabel from '../styled/NewMessageLabel';
import {
  Message,
  MessageText,
  MessageTimestamp,
  UserName,
} from '../styled/StyledComponents';

interface MessageContainerProps {
  CustomMessage?: React.ComponentType<{
    message: IMessage;
    isUser: boolean;
    isReply: boolean;
  }>;
  message: IMessage;
  activeMessage: IMessage;
  config: IConfig;
  walletAddress: string;
  isReply: boolean;
  showDateLabel: boolean;
}

export const MessageContainer: FC<MessageContainerProps> = ({
  CustomMessage,
  message,
  activeMessage,
  config,
  walletAddress,
  showDateLabel,
  isReply,
}) => {
  const isUser = message.user.id === walletAddress;

  const messageDate = new Date(message.date);

  if (message.isSystemMessage === 'true') {
    return (
      <Fragment key={message.id}>
        {showDateLabel && (
          <DateLabel date={messageDate} colors={config?.colors} />
        )}
        <SystemMessage messageText={message.body} colors={config?.colors} />
      </Fragment>
    );
  }

  if (message.id === 'delimiter-new' && message.isReply === 'false') {
    return <NewMessageLabel color={config?.colors?.primary} />;
  }

  const MessageComponent = CustomMessage || Message;

  return (
    <Fragment key={message.id}>
      {showDateLabel && !activeMessage && message.id === 'delimiter-new' && (
        <DateLabel date={messageDate} colors={config?.colors} />
      )}
      <MessageComponent message={message} isUser={isUser} isReply={isReply}>
        {!CustomMessage ? (
          <>
            <MessageTimestamp>
              {messageDate.toLocaleTimeString()}
            </MessageTimestamp>
            <UserName>{message.user.name}: </UserName>
            <MessageText>{message.body}</MessageText>
          </>
        ) : (
          <MessageComponent
            message={message}
            isUser={isUser}
            isReply={isReply}
          />
        )}
      </MessageComponent>
    </Fragment>
  );
};
