import React, { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
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
import AlbumMediaGrid from './AlbumMediaGrid';
import { MediaStatusOverlay } from './MediaStatusOverlay';
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
import MessageTranslations from './MessageTranslations';
import MessageTranslate from './MessageTranslate';
import { useChatSettingState } from '../../hooks/useChatSettingState';
import { DoubleTick, SingleTick } from '../../assets/icons';
import { parseMessageBody } from '../../helpers/parseMessageBody';
import URLPreviewCard from './URLPreviewCard';
import { useMessageHeapState } from '../../hooks/useMessageHeapState';
import { parseMessageReference } from '../../helpers/parseMessageReference';
import { createUserNameFromSetUser } from '../../helpers/createUserNameFromSetUser';
import styled from 'styled-components';

const firstUrlRegex =
  /(https?:\/\/[\w.-]+(?:\.[\w.-]+)+[\w\-._~:/?#[\]@!$&'()*+,;=.]+)/;

// Hover-only (no click) status tooltip on the sent/delivered/seen tick -
// same CSS-hover convention as MessageReaction.tsx's emoji tooltip.
const TickStatusWrapper = styled.span`
  position: relative;
  display: inline-flex;
  align-items: center;

  &:hover .tick-tooltip {
    visibility: visible;
    opacity: 1;
  }
`;

const TickTooltip = styled.span`
  visibility: hidden;
  opacity: 0;
  transition: opacity 0.2s;
  position: absolute;
  bottom: 120%;
  right: 0;
  background-color: #333;
  color: #fff;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 1;
`;

const Message: React.FC<MessageProps> = forwardRef<
  HTMLDivElement,
  MessageProps
>(({ message, isUser, isReply }, ref) => {
  const { client } = useXmppClient();
  const { user, config, langSource } = useChatSettingState();
  const { idSet } = useMessageHeapState();
  const interactionsDisabled = Boolean(config?.disableInteractions);
  const profilesDisabled = Boolean(config?.disableProfilesInteractions);

  // Read sender name live from usersSet so user-update stanzas trigger immediate re-render.
  const usersSet = useSelector((state: RootState) => state.rooms.usersSet);
  const senderUserId = message.user?.id ?? '';
  const senderLocal = senderUserId.split('@')[0];
  const senderEntry = usersSet[senderLocal] ?? usersSet[senderUserId];
  const senderDisplayName = senderEntry
    ? `${senderEntry.firstName ?? ''} ${senderEntry.lastName ?? ''}`.trim() || senderLocal
    : message.user?.name || senderLocal || 'Unknown';
  const referencedMessage = parseMessageReference(message.mainMessage);

  // Delivery/read tick status (XEP-0184/XEP-0333) - "seen" wins over
  // "delivered" wins over plain "sent". lastDisplayedByUser is a
  // room-level watermark (last message id each user has displayed), so
  // "seen" means some other user's watermark is at-or-after this message.
  const roomMessages = useSelector(
    (state: RootState) => state.rooms.rooms[message.roomJid]?.messages
  );
  const lastDisplayedByUser = useSelector(
    (state: RootState) =>
      state.rooms.rooms[message.roomJid]?.lastDisplayedByUser
  );
  const roomType = useSelector(
    (state: RootState) => state.rooms.rooms[message.roomJid]?.type
  );
  const isGroupRoom = roomType !== 'private';

  const tickInfo = useMemo(() => {
    const watermark = lastDisplayedByUser || {};
    const otherViewers = Object.keys(watermark).filter(
      (xmppUsername) => xmppUsername !== user?.xmppUsername
    );
    const thisIndex = roomMessages?.length
      ? roomMessages.findIndex((m) => m.id === message.id)
      : -1;
    const seenBy = otherViewers.filter((xmppUsername) => {
      if (thisIndex === -1) return false;
      const displayedIndex = roomMessages.findIndex(
        (m) => m.id === watermark[xmppUsername]
      );
      return displayedIndex >= thisIndex;
    });
    const receivedBy = Object.keys(message.receivedBy || {});

    const status: 'sent' | 'delivered' | 'seen' =
      seenBy.length > 0 ? 'seen' : receivedBy.length > 0 ? 'delivered' : 'sent';

    const nameOf = (xmppUsername: string) =>
      createUserNameFromSetUser(usersSet, xmppUsername);

    let tooltip: string;
    if (status === 'seen') {
      tooltip = isGroupRoom
        ? `Read by ${seenBy.map(nameOf).join(', ')}`
        : 'Read';
    } else if (status === 'delivered') {
      tooltip = isGroupRoom
        ? `Delivered to ${receivedBy.map(nameOf).join(', ')}`
        : 'Delivered';
    } else {
      tooltip = 'Sent';
    }

    return { status, tooltip };
  }, [
    message.id,
    message.receivedBy,
    roomMessages,
    lastDisplayedByUser,
    user?.xmppUsername,
    usersSet,
    isGroupRoom,
  ]);
  const readStatus = tickInfo.status;

  // Multiple files sent together share an albumId (see SendInput.tsx) and
  // render as one grid instead of N separate bubbles - only the first
  // message of the group actually renders it (isAlbumSibling below skips
  // every other one).
  const albumSiblings = useMemo(() => {
    if (!message.albumId || !roomMessages?.length) return null;
    const siblings = roomMessages.filter((m) => m.albumId === message.albumId);
    return siblings.length > 1 ? siblings : null;
  }, [message.albumId, roomMessages]);
  const isAlbumSibling = !!albumSiblings && albumSiblings[0]?.id !== message.id;

  const dispatch = useDispatch();
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
  } | null>(
    interactionsDisabled
      ? null
      : {
          visible: false,
          x: 0,
          y: 0,
        }
  );

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (message && message.body && typeof message.body === 'string') {
      const match = message.body.match(firstUrlRegex);
      setPreviewUrl(match ? match[0] : null);
    } else {
      setPreviewUrl(null);
    }
  }, [message?.body]);

  const handleContextMenu = (event: React.MouseEvent | React.TouchEvent) => {
    if (interactionsDisabled) return;

    event.preventDefault();
    const menuWidth = 240;
    const menuHeight = 310;

    const x = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const y = 'touches' in event ? event.touches[0].clientY : event.clientY;
    
    if (typeof window === "undefined") {
      setContextMenu({
        visible: true,
        x: x,
        y: y,
      });
      return;
    }

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
    if (profilesDisabled || user?.name === 'Deleted User') return;
    dispatch(setActiveModal(MODAL_TYPES.PROFILE));
    dispatch(setSelectedUser(user));
  };

  const handleMentionClick = (xmppUsername: string): void => {
    if (profilesDisabled) return;
    const member = usersSet[xmppUsername];
    const name = createUserNameFromSetUser(usersSet, xmppUsername);
    if (name === 'Deleted User') return;
    handleUserAvatarClick({
      ...member,
      id: xmppUsername,
      xmppUsername,
      name,
    } as IUser);
  };

  const handleReplyMessage = () => {
    dispatch(setEditAction({ isEdit: false }));

    if (!isReply && message.mainMessage) {
      const messageCore = parseMessageReference(message.mainMessage);
      if (!messageCore?.id || !messageCore?.roomJid) {
        return;
      }
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
      x: 0,
      y: 0,
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

  const isPending = idSet.has(message.id) || message?.pending || false;

  // Not the first tile of an album - the first one already rendered the
  // whole grid, this row contributes nothing to the DOM.
  if (isAlbumSibling) return null;

  return (
    <>
      <CustomMessageContainer
        key={message.id}
        $isUser={isUser}
        $reply={!!message?.reply?.length}
        $reaction={message?.reaction && !!Object.keys(message?.reaction)?.length}
        ref={ref}
      >
        {!isUser && (
          <CustomMessagePhotoContainer
            onClick={() =>
              senderDisplayName !== 'Deleted User'
                ? handleUserAvatarClick(message.user)
                : null
            }
          >
            {message.user?.profileImage && message.user.profileImage !== '' ? (
              <CustomMessagePhoto
                src={
                  message.user.profileImage 
                }
                alt="userIcon"
              />
            ) : (
              <Avatar
                username={senderDisplayName}
                style={{
                  cursor:
                    senderDisplayName !== 'Deleted User'
                      ? 'pointer'
                      : 'default',
                }}
              />
            )}
          </CustomMessagePhotoContainer>
        )}
        <CustomMessageBubble
          $deleted={message.isDeleted}
          $isUser={isUser}
          onContextMenu={!config?.disableInteractions ? handleContextMenu : undefined}
          onTouchStart={!config?.disableInteractions ? handleTouchStart : undefined}
          onTouchEnd={!config?.disableInteractions ? handleTouchEnd : undefined}
        >
          {!isUser && (
            <CustomUserName $isUser={isUser} $color={config?.colors?.primary}>
              {senderDisplayName}
            </CustomUserName>
          )}
          {!isReply && referencedMessage?.text && (
            <MessageReply
              handleReplyMessage={handleReplyMessage}
              isUser={isUser}
              text={referencedMessage.text}
              color={config?.colors?.primary}
            />
          )}
          {message?.isMediafile === 'true' && !message?.isDeleted ? (
            albumSiblings ? (
              <AlbumMediaGrid messages={albumSiblings} />
            ) : (
              <MediaStatusOverlay
                pending={message.pending}
                failed={message.sendFailed}
              >
                <MediaMessage
                  mimeType={message.mimetype}
                  locationPreview={message.locationPreview}
                  location={message?.location}
                  message={message}
                />
              </MediaStatusOverlay>
            )
          ) : (
            <CustomMessageText>
              {message.isDeleted && message.id !== 'delimiter-new' ? (
                <DeletedMessage />
              ) : (
                <div className="message-body">
                  {parseMessageBody({
                    text: config?.messageTextFilter?.enabled
                      ? config.messageTextFilter.filterFunction(message.body)
                      : message.body,
                    // Offsets are into the raw body - skip highlighting if a
                    // custom filter already reshaped the text around them.
                    mentions: config?.messageTextFilter?.enabled
                      ? undefined
                      : message.mentions,
                    currentXmppUsername: user?.xmppUsername,
                    onMentionClick: handleMentionClick,
                  })}
                </div>
              )}
            </CustomMessageText>
          )}

          {!isUser &&
            config?.translates?.enabled &&
            (config?.translates?.mode === 'on-demand' ? (
              <MessageTranslate
                message={message}
                config={config}
                isUser={isUser}
              />
            ) : (
              <MessageTranslations
                message={message}
                config={config}
                langSource={langSource}
                isUser={isUser}
              />
            ))}
          <CustomMessageTimestamp>
            {!config?.disableSentLogic && isUser && isPending && 'sending...'}
            {new Date(message.date).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
            {!config?.disableSentLogic && isUser && !isPending && (
              <TickStatusWrapper>
                {readStatus === 'sent' ? (
                  <SingleTick color="#8C8C8C" />
                ) : (
                  <DoubleTick
                    stroke={readStatus === 'seen' ? '#0052CD' : '#8C8C8C'}
                  />
                )}
                <TickTooltip className="tick-tooltip">
                  {tickInfo.tooltip}
                </TickTooltip>
              </TickStatusWrapper>
            )}
          </CustomMessageTimestamp>
          {previewUrl && !message.isDeleted && (
            <URLPreviewCard url={previewUrl} isUserMessage={isUser} />
          )}
        </CustomMessageBubble>
        <MessageFooter $isUser={isUser}>
          {message?.reply?.length && message?.reply?.length > 0 ? (
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
              changeReaction={
                interactionsDisabled ? () => undefined : handleReactionMessage
              }
              color={config.colors?.primary || '#0052CD'}
              userName={`${user.firstName} ${user.lastName}`}
            />
          )}
        </MessageFooter>
        {/* <button
          onClick={() =>
            resendMessage({
              originalMessageId: message.id,
              body: message.body,
              roomJid: message.roomJid,
              isReply:
                typeof message.isReply === 'boolean'
                  ? message.isReply
                  : !!message.isReply,
              showInChannel: message.showInChannel,
              mainMessage: message.mainMessage,
            })
          }
        >
          asdasdsd
        </button> */}
      </CustomMessageContainer>

      {!interactionsDisabled && (
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
