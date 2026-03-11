// Telegram-style message notification toast component
import React from 'react';
import styled, { keyframes } from 'styled-components';
import { IMessage } from '../../types/models/message.model';

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
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 12px;
  margin-bottom: 8px;
  width: 320px;
  cursor: pointer;
  animation: ${({ $isClosing }) => ($isClosing ? slideOut : slideIn)} 0.3s ease-out;
  transition: transform 0.2s ease;

  &:hover {
    transform: translateX(4px);
  }

  @media (max-width: 768px) {
    width: calc(100vw - 40px);
    max-width: 320px;
    padding: 10px;
    border-radius: 10px;
    animation: ${({ $isClosing }) => ($isClosing ? slideOutMobile : slideInMobile)} 0.3s ease-out;
    
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
  color: #757575;
  font-size: 16px;
  line-height: 1;
  transition: background-color 0.2s ease, color 0.2s ease;

  &:hover {
    background-color: rgba(0, 0, 0, 0.05);
    color: #212121;
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
  font-size: 14px;
  color: #212121;
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
  color: #757575;
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

const Avatar = styled.div<{ photoURL?: string }>`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: ${({ photoURL }) =>
    photoURL
      ? `url(${photoURL}) center/cover`
      : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'};
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
  color: #212121;
  margin-bottom: 4px;

  @media (max-width: 768px) {
    font-size: 12px;
    margin-bottom: 3px;
  }
`;

const MessageText = styled.div`
  font-size: 13px;
  color: #616161;
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
  color: #757575;
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
  const userPhotoURL =
    (message.user as any)?.photoURL || (message.user as any)?.profileImage;

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
        <Avatar photoURL={userPhotoURL} />
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
