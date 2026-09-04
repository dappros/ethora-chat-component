// Telegram-style message notification toast component
import React from 'react';
import { useSelector } from 'react-redux';
import styled, { keyframes } from 'styled-components';
import { IMessage } from '../../types/models/message.model';
import { RootState } from '../../roomStore';

export interface MessageNotificationData {
  id: string;
  message: IMessage;
  roomName: string;
  senderName: string;
  roomJID: string;
  timestamp: number;
}

export interface MessageNotificationToastProps extends MessageNotificationData {
  onClose: () => void;
  onNavigateToMessage: (roomJID: string, messageId: string, message: IMessage, roomName: string, senderName: string) => void;
  duration: number;
}

const slideIn = keyframes`
  from {
    transform: translateX(-100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
`;

const slideOut = keyframes`
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(-100%);
    opacity: 0;
  }
`;

const slideInMobile = keyframes`
  from {
    transform: translateY(100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
`;

const slideOutMobile = keyframes`
  from {
    transform: translateY(0);
    opacity: 1;
  }
  to {
    transform: translateY(100%);
    opacity: 0;
  }
`;

const ToastContainer = styled.div<{ $isClosing: boolean }>`
  position: relative;
  background: var(--ethora-color-bg, #fff);
  border: 1px solid var(--ethora-color-border, #e6e8ec);
  border-radius: var(--ethora-radius-md, 12px);
  box-shadow: var(--ethora-shadow-lg, 0 12px 32px rgba(16, 24, 40, 0.18));
  padding: var(--ethora-space-3, 12px);
  margin-bottom: 8px;
  width: 320px;
  cursor: pointer;
  animation: ${({ $isClosing }) => ($isClosing ? slideOut : slideIn)} 0.3s var(--ethora-motion-ease, cubic-bezier(.2,.8,.2,1));
  transition: transform var(--ethora-motion-fast, 150ms);

  &:hover {
    transform: translateX(4px);
  }

  @media (max-width: 768px) {
    width: calc(100vw - 40px);
    max-width: 320px;
    padding: 10px;
    border-radius: var(--ethora-radius-sm, 10px);
    animation: ${({ $isClosing }) => ($isClosing ? slideOutMobile : slideInMobile)} 0.3s var(--ethora-motion-ease, cubic-bezier(.2,.8,.2,1));

    &:hover {
      transform: translateY(-2px);
    }
  }
`;

const CloseButton = styled.button`
  position: absolute;
  top: 8px;
  right: 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  color: var(--ethora-color-text-muted, #8c8c8c);
  font-size: 16px;
  line-height: 1;
  transition: background-color var(--ethora-motion-fast, 150ms), color var(--ethora-motion-fast, 150ms);

  &:hover {
    background-color: var(--ethora-color-bg-hover, #f0f2f5);
    color: var(--ethora-color-text, #141414);
  }

  &:active {
    background-color: rgba(0, 0, 0, 0.1);
  }
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  padding-right: 24px; /* Make room for close button */
`;

const RoomName = styled.div`
  font-weight: 600;
  font-size: var(--ethora-font-size-sm, 14px);
  color: var(--ethora-color-text, #141414);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;

  @media (max-width: 768px) {
    font-size: 13px;
  }
`;

const Timestamp = styled.div`
  font-size: 11px;
  color: var(--ethora-color-text-muted, #8c8c8c);
  margin-left: 8px;
  flex-shrink: 0;

  @media (max-width: 768px) {
    font-size: 10px;
  }
`;

const MessageContent = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
`;

const Avatar = styled.div<{ $photoURL?: string }>`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: ${({ $photoURL }) =>
    $photoURL
      ? `url(${$photoURL}) center/cover`
      : 'var(--ethora-color-icons-bg, #E7EDF9)'};
  flex-shrink: 0;

  @media (max-width: 768px) {
    width: 36px;
    height: 36px;
  }
`;

const MessageBody = styled.div`
  flex: 1;
  min-width: 0;
`;

const SenderName = styled.div`
  font-weight: 500;
  font-size: 13px;
  color: var(--ethora-color-text, #141414);
  margin-bottom: 4px;

  @media (max-width: 768px) {
    font-size: 12px;
    margin-bottom: 3px;
  }
`;

const MessageText = styled.div`
  font-size: 13px;
  color: var(--ethora-color-text-secondary, #5a5f66);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;

  @media (max-width: 768px) {
    font-size: 12px;
    line-height: 1.3;
  }
`;

const MediaIndicator = styled.div`
  font-size: 12px;
  color: var(--ethora-color-text-muted, #8c8c8c);
  font-style: italic;

  @media (max-width: 768px) {
    font-size: 11px;
  }
`;

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h`;
  return date.toLocaleDateString();
};

const getMessagePreview = (message: IMessage): string => {
  if (message.isMediafile === 'true') {
    if (message.mimetype?.startsWith('image/')) {
      return '📷 Photo';
    }
    if (message.mimetype?.startsWith('video/')) {
      return '🎥 Video';
    }
    if (message.mimetype?.startsWith('audio/')) {
      return '🎵 Audio';
    }
    return '📎 File';
  }
  if (message.isSystemMessage === 'true') {
    return message.body || 'System message';
  }
  return message.body || '';
};

const MessageNotificationToast: React.FC<MessageNotificationToastProps> = ({
  message,
  roomName,
  senderName,
  roomJID,
  timestamp,
  onClose,
  onNavigateToMessage,
  duration,
}) => {
  const [isClosing, setIsClosing] = React.useState(false);

  React.useEffect(() => {
    // Calculate remaining time based on when notification was created
    const elapsed = Date.now() - timestamp;
    const remaining = Math.max(0, duration - elapsed);

    if (remaining <= 0) {
      // Notification already expired
      setIsClosing(true);
      setTimeout(onClose, 300);
      return;
    }

    const timer = setTimeout(() => {
      setIsClosing(true);
      setTimeout(onClose, 300); // Wait for animation to complete
    }, remaining);

    return () => clearTimeout(timer);
  }, [duration, timestamp, onClose]);

  const handleClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking the close button
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    
    // Close this notification immediately
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      // Navigate to message (this will clear all notifications)
      onNavigateToMessage(roomJID, message.id, message, roomName, senderName);
    }, 100);
  };

  const handleCloseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsClosing(true);
    setTimeout(onClose, 300);
  };

  const messagePreview = getMessagePreview(message);
  // usersSet first - message.user's own photo field is frequently empty
  // (never persisted at all, and not every live message carries it either;
  // see Message.tsx for the same gap and a live measurement of how often
  // it's missing), while usersSet is the canonical, continuously-updated
  // store the rest of the app already resolves avatars through.
  const senderUserId = (message.user as any)?.id ?? '';
  const senderLocal = senderUserId.split('@')[0];
  const usersSet = useSelector((state: RootState) => state.rooms.usersSet) ?? {};
  const senderEntry = usersSet[senderLocal] ?? usersSet[senderUserId];
  const userPhotoURL =
    senderEntry?.profileImage ||
    (message.user as any)?.photoURL ||
    (message.user as any)?.profileImage;

  return (
    <ToastContainer $isClosing={isClosing} onClick={handleClick}>
      <CloseButton onClick={handleCloseClick} aria-label="Close notification">
        ×
      </CloseButton>
      <Header>
        <RoomName title={roomName}>{roomName}</RoomName>
        <Timestamp>{formatTime(timestamp)}</Timestamp>
      </Header>
      <MessageContent>
        <Avatar $photoURL={userPhotoURL} data-testid="notification-avatar" />
        <MessageBody>
          <SenderName>{senderName}</SenderName>
          {message.isMediafile === 'true' ? (
            <MediaIndicator>{messagePreview}</MediaIndicator>
          ) : (
            <MessageText>{messagePreview}</MessageText>
          )}
        </MessageBody>
      </MessageContent>
    </ToastContainer>
  );
};

export default MessageNotificationToast;
