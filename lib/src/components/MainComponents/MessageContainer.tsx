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
import { useCustomComponents } from '../../context/CustomComponentsContext';

interface MessageContainerProps {
  CustomMessage?: React.ComponentType<{
    message: IMessage;
    isUser: boolean;
    isReply: boolean;
  }>;
  message: IMessage;
  activeMessage: IMessage;
  config: IConfig;
  xmppUsername: string;
  isReply: boolean;
  showDateLabel: boolean;
  className?: string;
}

export const MessageContainer: FC<MessageContainerProps> = ({
  CustomMessage,
  message,
  activeMessage,
  config,
  xmppUsername,
  showDateLabel,
  isReply,
  className,
}) => {
  const { CustomDaySeparator, CustomNewMessageLabel } = useCustomComponents();
  const isUser = message.user.id === xmppUsername;

  const messageDate = new Date(message.date);
  const formattedDate = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }).format(messageDate);
    } catch {
      return messageDate.toDateString();
    }
  }, [messageDate]);

  const renderDaySeparator = () => {
    if (!showDateLabel) {
      return null;
    }

    if (CustomDaySeparator) {
      return (
        <CustomDaySeparator date={messageDate} formattedDate={formattedDate} />
      );
    }

    return <DateLabel date={messageDate} colors={config?.colors} />;
  };

  if (message?.isSystemMessage === 'true') {
    const isWhitelisted = config?.whitelistSystemMessage?.includes(
      message.user.id
    );
    const CustomSystem = config?.customSystemMessage;
    if (CustomSystem && (isWhitelisted || !config?.whitelistSystemMessage)) {
      return (
        <Fragment key={message.id}>
          <CustomSystem message={message} isUser={false} isReply={false} />
        </Fragment>
      );
    }
    return (
      <Fragment key={message.id}>
        {renderDaySeparator()}
        <SystemMessage messageText={message.body} colors={config?.colors} />
      </Fragment>
    );
  }

  if (message?.id === 'delimiter-new') {
    if (CustomNewMessageLabel) {
      return <CustomNewMessageLabel color={config?.colors?.primary} />;
    }
    return <NewMessageLabel color={config?.colors?.primary} />;
  }

  const MessageComponent = CustomMessage || Message;

  return (
    <Fragment key={message.id}>
      {showDateLabel &&
        !activeMessage &&
        message.id !== 'delimiter-new' &&
        renderDaySeparator()}
      <MessageComponent
        message={message}
        isUser={isUser}
        isReply={isReply}
        className={className}
      >
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
