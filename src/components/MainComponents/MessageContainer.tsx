import React, { FC, Fragment, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { IConfig, IMessage } from '../../types/types';
import { RootState } from '../../roomStore';
import DateLabel from '../styled/DateLabel';
import SystemMessage from './SystemMessage';
import NewMessageLabel from '../styled/NewMessageLabel';
import {
  Message,
  MessageText,
  MessageTimestamp,
  UserName,
  CustomMessageContainer,
  CustomMessageBubble,
  CustomMessageText,
  CustomUserName,
  CustomMessagePhotoContainer,
} from '../styled/StyledComponents';
import { MessageAvatarPhoto } from '../MessageBubble/MessageAvatarPhoto';
import { useCustomComponents } from '../../context/CustomComponentsContext';
import { useT } from '../../i18n/useT';
import { formatCallLogLabel } from '../../helpers/callLogMessage';

interface MessageContainerProps {
  CustomMessage?: React.ComponentType<{
    message: IMessage;
    isUser: boolean;
    $isUser?: boolean;
    isReply: boolean;
    isLastInGroup?: boolean;
  }>;
  message: IMessage;
  activeMessage: IMessage;
  config: IConfig;
  xmppUsername: string;
  isReply: boolean;
  showDateLabel: boolean;
  /** False when the next row is the same sender's message (a run continues). */
  isLastInGroup?: boolean;
  className?: string;
}

const MessageContainerBase: FC<MessageContainerProps> = ({
  CustomMessage,
  message,
  activeMessage,
  config,
  xmppUsername,
  showDateLabel,
  isReply,
  isLastInGroup,
  className,
}) => {
  const { CustomDaySeparator, CustomNewMessageLabel } = useCustomComponents();
  const t = useT();
  const isUser = message.user.id === xmppUsername;
  // Must be read unconditionally, before the early returns below
  // (react-hooks/rules-of-hooks).
  const blockedUserIds = useSelector(
    (state: RootState) => state.chatSettingStore.blockedUserIds
  );

  const messageDate = useMemo(() => new Date(message.date), [message.date]);
  // Key the memo on the raw date value: a `new Date()` instance created per
  // render used as the dep defeated the memo, so the (expensive)
  // Intl.DateTimeFormat construction ran on every render of every row.
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
  }, [message.date]);

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
        <SystemMessage
          // Call logs carry their facts in `callLog` meta; the sentence is
          // rebuilt here so it follows the current language instead of
          // being frozen in whatever was active when the stanza landed.
          messageText={
            message.callLog
              ? formatCallLogLabel(message.callLog, t, message.body)
              : message.body
          }
          colors={config?.colors}
        />
      </Fragment>
    );
  }

  if (message?.id === 'delimiter-new') {
    if (CustomNewMessageLabel) {
      return <CustomNewMessageLabel color={config?.colors?.primary} />;
    }
    return <NewMessageLabel color={config?.colors?.primary} />;
  }

  const senderLocal = (message.user?.id ?? '').split('@')[0];
  const isSenderBlocked = !isUser && blockedUserIds?.includes(senderLocal);

  if (isSenderBlocked) {
    // Render like a normal incoming message so the row keeps the same
    // layout, but anonymise the sender: an empty avatar (no photo, no name ->
    // the neutral person glyph) and a fixed "Blocked user" label instead of
    // the real name, with the unblock hint as the body.
    return (
      <Fragment key={message.id}>
        {showDateLabel &&
          !activeMessage &&
          renderDaySeparator()}
        <div data-message-id={message.id}>
          <CustomMessageContainer
            $isUser={false}
            $reply={false}
            $lastInGroup={isLastInGroup}
          >
            <CustomMessagePhotoContainer style={{ cursor: 'default' }}>
              <MessageAvatarPhoto
                src=""
                username=""
                style={{ cursor: 'default' }}
              />
            </CustomMessagePhotoContainer>
            <CustomMessageBubble $isUser={false} $deleted={false}>
              <CustomUserName $isUser={false} $color={config?.colors?.primary}>
                {t('message.blockedUserName')}
              </CustomUserName>
              <CustomMessageText style={{ fontStyle: 'italic', opacity: 0.7 }}>
                {t('message.blockedUser')}
              </CustomMessageText>
            </CustomMessageBubble>
          </CustomMessageContainer>
        </div>
      </Fragment>
    );
  }

  const MessageComponent = CustomMessage || Message;

  return (
    <Fragment key={message.id}>
      {showDateLabel &&
        !activeMessage &&
        message.id !== 'delimiter-new' &&
        renderDaySeparator()}
      {/* The anchor that "scroll to this message" looks for. MessageList has
          always passed data-message-id to this component, but nothing here
          forwarded it, so no bubble ever carried it: the scroll-to-message
          on a notification or push tap silently found nothing for ordinary
          messages. A plain block wrapper, so the row's layout is unchanged. */}
      <div data-message-id={message.id}>
        <MessageComponent
          message={message}
          isUser={isUser}
          $isUser={isUser}
          isReply={isReply}
          isLastInGroup={isLastInGroup}
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
              $isUser={isUser}
              isReply={isReply}
            />
          )}
        </MessageComponent>
      </div>
    </Fragment>
  );
};

// Memoized so unchanged rows skip re-rendering once message identities are
// stable (the reducers preserve object identity for untouched messages).
export const MessageContainer = React.memo(MessageContainerBase);
