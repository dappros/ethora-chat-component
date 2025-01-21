import React, { forwardRef, useCallback, useRef, useState } from 'react';
import { IUser, MessageProps } from '../../types/types';
import {
  CustomMessageTimestamp,
  CustomMessageContainer,
  CustomMessageBubble,
  CustomMessageText,
  CustomUserName,
  CustomMessagePhoto,
  CustomMessagePhotoContainer,
  MessageFooter,
} from '../styled/StyledComponents';
import MediaMessage from '../MainComponents/MediaMessage';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../roomStore';

import { Avatar } from './Avatar';
import MessageInteractions from './MessageInteractions';
import {
  setActiveModal,
  setDeleteModal,
  setSelectedUser,
} from '../../roomStore/chatSettingsSlice';
import { MODAL_TYPES } from '../../helpers/constants/MODAL_TYPES';
import { BottomReplyContainer } from './BottomReplyContainer';
import { setActiveMessage, setEditAction } from '../../roomStore/roomsSlice';
import { MessageReply } from './MessageReply';
import { DeletedMessage } from './DeletedMessage';
import { useXmppClient } from '../../context/xmppProvider';
import { MessageReaction } from './MessageReaction';
import { useChatSettingState } from '../../hooks/useChatSettingState';

const Message: React.FC<MessageProps> = forwardRef<
  HTMLDivElement,
  MessageProps
>(({ message, isUser, isReply }, ref) => {
  const { client } = useXmppClient();
  const { user, client: storedClient } = useChatSettingState();

  const dispatch = useDispatch();
  const config = useSelector(
    (state: RootState) => state.chatSettingStore.config
  );

  const [contextMenu, setContextMenu] = !config?.disableInteractions
    ? useState<{ visible: boolean; x: number; y: number }>({
        visible: false,
        x: 0,
        y: 0,
      })
    : [null, null];

  const handleContextMenu = (event: React.MouseEvent | React.TouchEvent) => {
    if (config?.disableInteractions) return;

    event.preventDefault();
    const menuWidth = 240;
    const menuHeight = 310;

    const x = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const y = 'touches' in event ? event.touches[0].clientY : event.clientY;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    const adjustedX = x + menuWidth > windowWidth ? x - menuWidth : x;
    const adjustedY =
      y + menuHeight > windowHeight ? windowHeight - menuHeight : y;

    setContextMenu({
      visible: true,
      x: adjustedX,
      y: adjustedY,
    });
  };

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleTouchStart = (event: React.TouchEvent) => {
    timerRef.current = setTimeout(() => {
      handleContextMenu(event);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleUserAvatarClick = (user: IUser): void => {
    dispatch(setActiveModal(MODAL_TYPES.PROFILE));
    dispatch(setSelectedUser(user));
  };

  const handleReplyMessage = () => {
    dispatch(setEditAction({ isEdit: false }));

    if (!isReply && message.mainMessage) {
      const messageCore = JSON.parse(message.mainMessage);
      return dispatch(
        setActiveMessage({ id: messageCore.id, chatJID: messageCore.roomJid })
      );
    }

    return dispatch(
      setActiveMessage({ id: message.id, chatJID: message.roomJid })
    );
  };

  const handleDeleteMessage = () => {
    dispatch(
      setDeleteModal({
        isDeleteModal: true,
        roomJid: message.roomJid,
        messageId: message.id,
      })
    );
    // dispatch(deleteRoomMessage({ roomJID: message.roomJid, messageId: message.id }));
    // client.deleteMessageStanza(message.roomJid, message.id);
  };

  const handleEditMessage = () => {
    dispatch(
      setEditAction({
        isEdit: true,
        roomJid: message.roomJid,
        messageId: message.id,
        text: message.body,
      })
    );
    setContextMenu({
      visible: false,
      x: null,
      y: null,
    });
  };

  const handleReactionMessage = (emoji: string) => {
    if (!message.reaction) {
      return client.sendMessageReactionStanza(
        message.id,
        message.roomJid,
        [emoji],
        { firstName: user.firstName, lastName: user.lastName }
      );
    }
    if (
      message.reaction &&
      message.reaction[user.xmppUsername] &&
      message.reaction[user.xmppUsername].emoji.includes(emoji)
    ) {
      const filterEmoji = message.reaction[user.xmppUsername].emoji.filter(
        (reaction) => reaction !== emoji
      );

      return client.sendMessageReactionStanza(
        message.id,
        message.roomJid,
        filterEmoji,
        { firstName: user.firstName, lastName: user.lastName }
      );
    }

    client.sendMessageReactionStanza(
      message.id,
      message.roomJid,
      [...(message.reaction[user.xmppUsername]?.emoji || []), emoji],
      { firstName: user.firstName, lastName: user.lastName }
    );
  };

  return (
    <>
      <CustomMessageContainer
        key={message.id}
        isUser={isUser}
        reply={message?.reply?.length}
        reaction={!!message?.reaction?.length}
        ref={ref}
      >
        {!isUser && (
          <CustomMessagePhotoContainer
            onClick={() => handleUserAvatarClick(message.user)}
          >
            {message.user?.profileImage && message.user.profileImage !== '' ? (
              <CustomMessagePhoto
                src={
                  message.user.profileImage ||
                  'https://soccerpointeclaire.com/wp-content/uploads/2021/06/default-profile-pic-e1513291410505.jpg'
                }
                alt="userIcon"
              />
            ) : (
              <Avatar username={message.user.name} />
            )}
          </CustomMessagePhotoContainer>
        )}
        <CustomMessageBubble
          deleted={message.isDeleted}
          isUser={isUser}
          onContextMenu={handleContextMenu}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {!isUser && (
            <CustomUserName isUser={isUser} color={config?.colors?.primary}>
              {message.user.name}
            </CustomUserName>
          )}
          {!isReply && message.mainMessage && (
            <MessageReply
              handleReplyMessage={handleReplyMessage}
              isUser={isUser}
              text={JSON.parse(message.mainMessage).text}
              color={config?.colors?.primary}
            />
          )}
          {message?.isMediafile === 'true' && !message?.isDeleted ? (
            <MediaMessage
              mimeType={message.mimetype}
              messageText={message.locationPreview}
              location={message?.location}
              message={message}
            />
          ) : (
            <CustomMessageText>
              {message.isDeleted && message.id !== 'delimiter-new' ? (
                <DeletedMessage />
              ) : (
                <span>{message.body}</span>
              )}
            </CustomMessageText>
          )}
          <CustomMessageTimestamp>
            {message?.pending && 'sending...'}
            {new Date(message.date).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </CustomMessageTimestamp>
        </CustomMessageBubble>
        <MessageFooter isUser={isUser}>
          {message?.reply?.length && message.reaction ? (
            <BottomReplyContainer
              isUser={isUser}
              onClick={handleReplyMessage}
              reply={message?.reply}
              color={config.colors?.primary}
            />
          ) : null}
          {message.reaction && (
            <MessageReaction
              reaction={message.reaction}
              changeReaction={handleReactionMessage}
              color={config.colors?.primary}
            />
          )}
        </MessageFooter>
      </CustomMessageContainer>

      {!config?.disableInteractions && (
        <MessageInteractions
          isReply={isReply}
          isUser={isUser}
          message={message}
          setContextMenu={setContextMenu}
          contextMenu={contextMenu}
          handleReplyMessage={handleReplyMessage}
          handleDeleteMessage={handleDeleteMessage}
          handleEditMessage={handleEditMessage}
          handleReactionMessage={handleReactionMessage}
        />
      )}
    </>
  );
});

export { Message };
