import React, { forwardRef, useState } from 'react';
import { IUser, MessageProps } from '../../types/types';
import {
  CustomMessageTimestamp,
  CustomMessageContainer,
  CustomMessageBubble,
  CustomMessageText,
  CustomUserName,
  CustomMessagePhoto,
  CustomMessagePhotoContainer,
} from '../styled/StyledComponents';
import MediaMessage from '../MainComponents/MediaMessage';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../roomStore';

import { Avatar } from './Avatar';
import MessageInteractions from './MessageInteractions';
import {
  setActiveModal,
  setSelectedUser,
} from '../../roomStore/chatSettingsSlice';
import { MODAL_TYPES } from '../../helpers/constants/MODAL_TYPES';

const Message: React.FC<MessageProps> = forwardRef<
  HTMLDivElement,
  MessageProps
>(({ message, isUser }, ref) => {
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

  const handleContextMenu = (event: React.MouseEvent) => {
    if (config?.disableInteractions) return;

    event.preventDefault();
    const menuWidth = 240;
    const menuHeight = 310;

    const x = event.clientX;
    const y = event.clientY;
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

  const handleUserAvatarClick = (user: IUser): void => {
    dispatch(setActiveModal(MODAL_TYPES.PROFILE));
    dispatch(setSelectedUser(user));
  };

  return (
    <>
      <CustomMessageContainer key={message.id} isUser={isUser} ref={ref}>
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
        <CustomMessageBubble isUser={isUser} onContextMenu={handleContextMenu}>
          {!isUser && (
            <CustomUserName isUser={isUser} color={config?.colors?.primary}>
              {message.user.name}
            </CustomUserName>
          )}
          {message?.isMediafile === 'true' ? (
            <MediaMessage
              mimeType={message.mimetype}
              messageText={message.locationPreview}
              location={message?.location}
              message={message}
            />
          ) : (
            <CustomMessageText>{message.body}</CustomMessageText>
          )}
          <CustomMessageTimestamp>
            {message?.pending && 'sending...'}
            {new Date(message.date).toLocaleTimeString()}
          </CustomMessageTimestamp>
        </CustomMessageBubble>
      </CustomMessageContainer>

      {!config?.disableInteractions && (
        <MessageInteractions
          message={message}
          setContextMenu={setContextMenu}
          contextMenu={contextMenu}
        />
      )}
    </>
  );
});

export { Message };
