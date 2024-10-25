import React, { forwardRef, useState } from 'react';
import { IMessage, MessageProps } from '../types/types';
import {
  CustomMessageTimestamp,
  CustomMessageContainer,
  CustomMessageBubble,
  CustomMessageText,
  CustomUserName,
  CustomMessagePhoto,
  CustomMessagePhotoContainer,
} from './styled/StyledComponents';
import MediaMessage from './MainComponents/MediaMessage';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../roomStore';
import {
  ContextMenu,
  Delimeter,
  MenuItem,
  Overlay,
} from './ContextMenu/ContextMenuComponents';
import { useXmppClient } from '../context/xmppProvider';
import { deleteRoomMessage } from '../roomStore/roomsSlice';
import { Avatar } from './MessageBubble/Avatar';
import {
  MESSAGE_INTERACTIONS,
  MESSAGE_INTERACTIONS_ICONS,
} from '../helpers/constants/MESSAGE_INTERACTIONS';

const Message: React.FC<MessageProps> = forwardRef<
  HTMLDivElement,
  MessageProps
>(({ message, isUser }, ref) => {
  const { client } = useXmppClient();
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

  const closeContextMenu = () => {
    if (!config?.disableInteractions) {
      setContextMenu({ visible: false, x: 0, y: 0 });
    }
  };

  // const handleDeleteMessage = (room: string, msgId: string) => {
  //   dispatch(deleteRoomMessage({ roomJID: room, messageId: msgId }));
  //   client.deleteMessage(room, msgId);
  // };

  const handleCopyMessage = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <>
      <CustomMessageContainer key={message.id} isUser={isUser} ref={ref}>
        {!isUser && (
          <CustomMessagePhotoContainer>
            {message.user.avatar ? (
              <CustomMessagePhoto
                src={
                  message.user.avatar ||
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

      {!config.disableInteractions && contextMenu.visible && (
        <>
          {/* Click outside to close the context menu */}
          <Overlay onClick={closeContextMenu}>
            <ContextMenu
              style={{ top: contextMenu.y, left: contextMenu.x }}
              onClick={closeContextMenu}
            >
              <MenuItem
                onClick={() => console.log(MESSAGE_INTERACTIONS.SEND_COINS)}
              >
                {MESSAGE_INTERACTIONS.SEND_COINS}
                <MESSAGE_INTERACTIONS_ICONS.SEND_COINS />{' '}
              </MenuItem>
              <Delimeter />
              <MenuItem
                onClick={() => console.log(MESSAGE_INTERACTIONS.SEND_ITEM)}
              >
                {MESSAGE_INTERACTIONS.SEND_ITEM}
                <MESSAGE_INTERACTIONS_ICONS.SEND_ITEM />{' '}
              </MenuItem>
              <Delimeter />
              <MenuItem onClick={() => console.log(MESSAGE_INTERACTIONS.REPLY)}>
                {MESSAGE_INTERACTIONS.REPLY}
                <MESSAGE_INTERACTIONS_ICONS.REPLY />{' '}
              </MenuItem>
              <Delimeter />
              <MenuItem
                onClick={() => {
                  console.log(MESSAGE_INTERACTIONS.COPY);
                  handleCopyMessage(message.body);
                }}
              >
                {MESSAGE_INTERACTIONS.COPY}
                <MESSAGE_INTERACTIONS_ICONS.COPY />
              </MenuItem>
              <Delimeter />
              <MenuItem
                onClick={() => {
                  console.log(MESSAGE_INTERACTIONS.DELETE);
                  // handleDeleteMessage(message.roomJID, message.id);
                }}
              >
                {MESSAGE_INTERACTIONS.DELETE}
                <MESSAGE_INTERACTIONS_ICONS.DELETE />{' '}
              </MenuItem>
              <Delimeter />
              <MenuItem
                onClick={() => console.log(MESSAGE_INTERACTIONS.REPORT)}
              >
                {MESSAGE_INTERACTIONS.REPORT}
                <MESSAGE_INTERACTIONS_ICONS.REPORT />{' '}
              </MenuItem>
            </ContextMenu>
          </Overlay>
        </>
      )}
    </>
  );
});

export { Message };
