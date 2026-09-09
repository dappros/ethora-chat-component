import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import {
  ArrowButton,
  ContainerInteractions,
  ContextMenu,
  Delimeter,
  MenuItem,
  Overlay,
  ReactionBadge,
  ReactionContainer,
} from '../ContextMenu/ContextMenuComponents';
import { useSelector } from 'react-redux';
import { RootState } from '../../roomStore';
import {
  MESSAGE_INTERACTIONS,
  MESSAGE_INTERACTIONS_ICONS,
} from '../../helpers/constants/MESSAGE_INTERACTIONS';
import { IMessage } from '../../types/types';
import { DownArrowIcon } from '../../assets/icons';
import Picker from '../EmojiPicker/LazyEmojiPicker';
import { getEmojiNativeById, useEmojiData } from '../../helpers/lazyEmoji';
import { fadeInAnimation, scaleInAnimation } from '../../styles/motion';
import { useT } from '../../i18n/useT';

import '../../index.css';
import { APPLE_EMOJI_CLASS } from '../../styles/classNames';

// Local overrides on top of the shared ContextMenu primitives: fade/scale-in
// on open instead of the hard show/hide the plain conditional render gives
// it, and a tokenized surface so the menu matches the rest of the polished
// bubble instead of a flat white card.
const AnimatedOverlay = styled(Overlay)`
  ${fadeInAnimation}
`;

const StyledContextMenu = styled(ContextMenu)`
  background-color: var(--ethora-color-bg, #ffffff);
  border-radius: var(--ethora-radius-md, 12px);
  box-shadow: var(--ethora-shadow-md, 0 4px 12px rgba(16, 24, 40, 0.1));
  ${scaleInAnimation}
`;

const fixedEmojiIds = ['joy', 'heart', 'fire', '+1', 'smile', 'scream'];
import { useRoomState } from '../../hooks/useRoomState';
import { ethoraLogger } from '../../helpers/ethoraLogger';

interface MessageInteractionsProps {
  isReply?: boolean;
  isUser?: boolean;
  message: IMessage;
  contextMenu: { visible: boolean; x: number; y: number } | null;
  setContextMenu: ({ visible, x, y }) => void;
  handleReplyMessage: () => void;
  handleDeleteMessage: () => void;
  handleEditMessage: () => void;
  handleReactionMessage: (reaction) => void;
}

const MessageInteractions: React.FC<MessageInteractionsProps> = ({
  isReply,
  isUser,
  message,
  contextMenu,
  setContextMenu,
  handleReplyMessage: replyMessage,
  handleDeleteMessage: deleteMessage,
  handleEditMessage,
  handleReactionMessage,
}) => {
  const { roomsList, activeRoomJID } = useRoomState();
  const [showPicker, setShowPicker] = useState(false);
  useEmojiData();
  const t = useT();

  const config = useSelector(
    (state: RootState) => state.chatSettingStore.config
  );

  const closeMenu = () => {
    if (!config?.disableInteractions) {
      setContextMenu({ visible: false, x: 0, y: 0 });
    }
  };

  const closeContextMenu = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeMenu();
    }
  };

  const handleCopyMessage = (text: string) => {
    navigator.clipboard.writeText(text);
    closeMenu();
  };

  const handleReplyMessage = () => {
    replyMessage();
    closeMenu();
  };

  const handleDeleteMessage = () => {
    deleteMessage();
    closeMenu();
  };

  const handleEmojiSelect = (emoji, e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) {
      ethoraLogger.log('emoji', emoji);
      handleReactionMessage(emoji.id);
      closeMenu();
    }
  };

  const handleReactionClick = (reaction: string, e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleReactionMessage(reaction);
      closeMenu();
    }
  };

  const getEmojiById = getEmojiNativeById;

  const calculatePickerPosition = (x: number, y: number) => {
    const pickerWidth = 320;
    const pickerHeight = 435;

    if (typeof window === "undefined") {
      return { adjustedX: x, adjustedY: y };
    }

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    let adjustedX = x;
    let adjustedY = y;

    if (x + pickerWidth > windowWidth) {
      adjustedX = windowWidth - pickerWidth - 10;
    }

    if (y + pickerHeight > windowHeight) {
      adjustedY = windowHeight - pickerHeight - 10;
    }

    return { adjustedX, adjustedY };
  };

  useEffect(() => {
    if (typeof window === "undefined" || !contextMenu) {
      return;
    }

    const handleScroll = () => {
      if (showPicker) {
        const { adjustedX, adjustedY } = calculatePickerPosition(
          contextMenu.x,
          contextMenu.y
        );
        setContextMenu({ visible: true, x: adjustedX, y: adjustedY });
      }
    };

    window.addEventListener('scroll', handleScroll);

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener('scroll', handleScroll);
      }
    };
  }, [showPicker, contextMenu?.x, contextMenu?.y]);

  if (!contextMenu || config?.disableInteractions || !contextMenu.visible) return null;

  return (
    <>
      {!message.isDeleted && (
        <AnimatedOverlay onClick={closeContextMenu}>
          <ContainerInteractions
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <ReactionContainer>
              {fixedEmojiIds.map((id) => (
                <ReactionBadge
                  key={id}
                  className={APPLE_EMOJI_CLASS}
                  onClick={(e) => handleReactionClick(id, e)}
                >
                  {getEmojiById(id)}
                </ReactionBadge>
              ))}
              <ArrowButton
                role="button"
                tabIndex={0}
                aria-label={t('action.moreOptions')}
                aria-expanded={showPicker}
                $isRotated={showPicker}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    (e.currentTarget as HTMLElement).click();
                  }
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  const { adjustedX, adjustedY } = calculatePickerPosition(
                    contextMenu.x,
                    contextMenu.y
                  );
                  setContextMenu({
                    visible: true,
                    x: adjustedX,
                    y: adjustedY,
                  });
                  setShowPicker(!showPicker);
                }}
              >
                <DownArrowIcon />
              </ArrowButton>
            </ReactionContainer>

            {showPicker && (
              <Picker
                skinTonePosition="none"
                searchPosition="static"
                onEmojiSelect={(emoji, e) => handleEmojiSelect(emoji, e)}
                title="Pick emoji"
                emoji="point_up"
                theme="light"
                previewPosition="none"
                style={{
                  maxWidth: '320px',
                  maxHeight: '360px',
                  overflowY: 'auto',
                }}
              />
            )}

            <StyledContextMenu onClick={closeContextMenu}>
              {/* <MenuItem onClick={() => ethoraLogger.log(MESSAGE_INTERACTIONS.SEND_COINS)}>
            {MESSAGE_INTERACTIONS.SEND_COINS}
            <MESSAGE_INTERACTIONS_ICONS.SEND_COINS />{' '}
          </MenuItem>
          <Delimeter />
          <MenuItem onClick={() => ethoraLogger.log(MESSAGE_INTERACTIONS.SEND_ITEM)}>
            {MESSAGE_INTERACTIONS.SEND_ITEM}
            <MESSAGE_INTERACTIONS_ICONS.SEND_ITEM />{' '}
          </MenuItem> */}
              {/* <Delimeter /> */}
              {!isReply && (
                <>
                  <MenuItem onClick={handleReplyMessage}>
                    {MESSAGE_INTERACTIONS.REPLY}
                    <MESSAGE_INTERACTIONS_ICONS.REPLY />{' '}
                  </MenuItem>
                  <Delimeter />
                </>
              )}
              <MenuItem onClick={() => handleCopyMessage(message.body)}>
                {MESSAGE_INTERACTIONS.COPY}
                <MESSAGE_INTERACTIONS_ICONS.COPY />
              </MenuItem>
              {(isUser ||
                roomsList?.[activeRoomJID].role === 'moderator') && (
                <Delimeter />
              )}
              {isUser && (
                <>
                  <MenuItem onClick={handleEditMessage}>
                    {MESSAGE_INTERACTIONS.EDIT}
                    <MESSAGE_INTERACTIONS_ICONS.EDIT />{' '}
                  </MenuItem>
                  <Delimeter />
                </>
              )}
              {(isUser || roomsList?.[activeRoomJID].role === 'moderator') && (
                <MenuItem onClick={handleDeleteMessage}>
                  {MESSAGE_INTERACTIONS.DELETE}
                  <MESSAGE_INTERACTIONS_ICONS.DELETE />{' '}
                </MenuItem>
              )}
              {/* <Delimeter />
          <MenuItem onClick={() => ethoraLogger.log(MESSAGE_INTERACTIONS.REPORT)}>
            {MESSAGE_INTERACTIONS.REPORT}
            <MESSAGE_INTERACTIONS_ICONS.REPORT />{' '}
          </MenuItem> */}
            </StyledContextMenu>
          </ContainerInteractions>
        </AnimatedOverlay>
      )}
    </>
  );
};

export default MessageInteractions;
