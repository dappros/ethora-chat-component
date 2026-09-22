import React, { useLayoutEffect, useRef, useState } from 'react';
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
import { useModalDismiss } from '../../hooks/useModalDismiss';

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
import { stripBotMarkup } from '../../helpers/botMarkup';

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
  const menuContainerRef = useRef<HTMLDivElement>(null);
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

  // Where the menu actually ends up on screen. Starts pinned to the
  // click/tap point (`contextMenu.x/y`) and gets corrected below once we can
  // measure the rendered container - its height varies a lot (Reply/Copy/
  // Edit/Delete are conditional, and the emoji picker adds ~350px), so a
  // fixed "menu height" guess (the previous approach) was always wrong for
  // some combination of rows.
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (typeof window === 'undefined' || !contextMenu?.visible) {
      return;
    }

    const margin = 8; // keep the menu clear of the viewport edge

    const reposition = () => {
      const el = menuContainerRef.current;
      if (!el) return;

      const { offsetWidth: width, offsetHeight: height } = el;
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      let top = contextMenu.y;
      if (top + height + margin > windowHeight) {
        // Doesn't fit below the click point - flip it above the anchor.
        const flippedTop = contextMenu.y - height;
        top =
          flippedTop >= margin
            ? flippedTop
            : Math.max(margin, windowHeight - height - margin);
      }
      if (top < margin) top = margin;

      let left = contextMenu.x;
      if (left + width + margin > windowWidth) {
        left = windowWidth - width - margin;
      }
      if (left < margin) left = margin;

      setMenuPosition((prev) =>
        prev.top === top && prev.left === left ? prev : { top, left }
      );
    };

    reposition();

    // The emoji picker can grow after it mounts (its data loads lazily), and
    // the menu itself can change height as rows come and go, so watch the
    // container's actual size rather than only reacting to state we know
    // about.
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined' && menuContainerRef.current) {
      observer = new ResizeObserver(reposition);
      observer.observe(menuContainerRef.current);
    }

    // Mobile browsers resize the viewport (address bar show/hide) on scroll,
    // and the window can resize directly - both can strand the menu.
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition);
    };
  }, [contextMenu?.visible, contextMenu?.x, contextMenu?.y, showPicker]);

  // Same shared layer stack the dropdowns and modals use: Escape closes this
  // menu when it is the topmost layer, and opening any other menu or modal
  // dismisses it, so a message context menu can never be left stranded
  // behind a newly opened menu. Outside presses stay with the existing
  // full-screen Overlay's onClick.
  useModalDismiss({
    enabled: Boolean(
      contextMenu?.visible && !config?.disableInteractions && !message.isDeleted
    ),
    onClose: closeMenu,
    kind: 'menu',
    containerRef: menuContainerRef,
  });

  if (!contextMenu || config?.disableInteractions || !contextMenu.visible) return null;

  return (
    <>
      {!message.isDeleted && (
        <AnimatedOverlay onClick={closeContextMenu}>
          <ContainerInteractions
            ref={menuContainerRef}
            style={{ top: menuPosition.top, left: menuPosition.left }}
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
                  // Toggling the picker changes the container's height; the
                  // reposition effect above (keyed on `showPicker`) re-clamps
                  // it once the picker has actually mounted/unmounted.
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
              <MenuItem
                onClick={() =>
                  handleCopyMessage(
                    isUser ? message.body : stripBotMarkup(message.body)
                  )
                }
              >
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
