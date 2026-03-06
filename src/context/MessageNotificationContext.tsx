// Context for managing message notifications (Telegram-style)
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useEffect,
} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { IMessage } from '../types/models/message.model';
import { MessageNotificationData } from '../components/MessageNotification/MessageNotificationToast';
import MessageNotificationToast from '../components/MessageNotification/MessageNotificationToast';
import { messageNotificationManager } from '../utils/messageNotificationManager';
import { useTabVisibility } from '../hooks/useTabVisibility';
import { setCurrentRoom } from '../roomStore/roomsSlice';
import { IConfig } from '../types/types';
import { RootState } from '../roomStore';

interface MessageNotificationContextType {
  showMessageNotification: (
    message: IMessage,
    roomName: string,
    senderName: string,
    roomJID: string
  ) => void;
}

const MessageNotificationContext = createContext<
  MessageNotificationContextType | undefined
>(undefined);

const DEFAULT_MAX_NOTIFICATIONS = 3;
const DEFAULT_NOTIFICATION_DURATION = 30000; // 30 seconds

export const MessageNotificationProvider: React.FC<{
  children: ReactNode;
  config?: IConfig;
}> = ({ children, config: propConfig }) => {
  const [notifications, setNotifications] = useState<MessageNotificationData[]>(
    []
  );
  const isTabVisible = useTabVisibility();
  const dispatch = useDispatch();
  const activeRoomJID = useSelector((state: RootState) => state.rooms.activeRoomJID);
  
  // Try to get config from Redux, handle case where Provider might not be available yet
  let contextConfig: IConfig | undefined;
  try {
    contextConfig = useSelector((state: RootState) => state.chatSettingStore?.config);
  } catch {
    // Context not available, that's okay
    contextConfig = undefined;
  }
  
  // Use config from props, context, or defaults
  const config = propConfig || contextConfig;
  const notificationConfig = config?.messageNotifications;
  const isEnabled = notificationConfig?.enabled !== false; // Default to true
  const showInContext = notificationConfig?.showInContext ?? true; // Default to true - show in chat context
  
  const MAX_NOTIFICATIONS = notificationConfig?.maxNotifications ?? DEFAULT_MAX_NOTIFICATIONS;
  const NOTIFICATION_DURATION = notificationConfig?.duration ?? DEFAULT_NOTIFICATION_DURATION;
  
  // Determine if we should render notifications
  // If showInContext is false, we might want to skip rendering here (for global-only mode)
  // But for now, we'll always render if enabled - the showInContext can be used for other logic
  const shouldRender = isEnabled;
  
  // Get position from config
  const position = notificationConfig?.position || {};
  const horizontal = position.horizontal || 'left';
  const vertical = position.vertical || 'bottom';
  const offset = position.offset || {};
  
  // Calculate container styles based on position
  const containerStyles: React.CSSProperties = {
    position: 'fixed',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 10000,
    pointerEvents: 'none',
    width: 'auto',
  };
  
  // Set vertical position
  if (vertical === 'top') {
    containerStyles.top = offset.top ?? 20;
    containerStyles.bottom = 'auto';
  } else {
    containerStyles.bottom = offset.bottom ?? 20;
    containerStyles.top = 'auto';
  }
  
  // Set horizontal position
  if (horizontal === 'left') {
    containerStyles.left = offset.left ?? 20;
    containerStyles.right = 'auto';
    containerStyles.alignItems = 'flex-start';
  } else if (horizontal === 'right') {
    containerStyles.right = offset.right ?? 20;
    containerStyles.left = 'auto';
    containerStyles.alignItems = 'flex-end';
  } else {
    // center
    containerStyles.left = '50%';
    containerStyles.right = 'auto';
    containerStyles.transform = 'translateX(-50%)';
    containerStyles.alignItems = 'center';
  }
  
  // Add mobile responsive styles
  const containerClassName = 'message-notification-container';
  
  // Add data attributes for CSS targeting
  const containerProps = {
    className: containerClassName,
    'data-position-horizontal': horizontal,
    'data-position-vertical': vertical,
  };

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // Remove expired notifications (older than NOTIFICATION_DURATION)
  const removeExpiredNotifications = useCallback(() => {
    const now = Date.now();
    setNotifications((prev) =>
      prev.filter((n) => now - n.timestamp < NOTIFICATION_DURATION)
    );
  }, [NOTIFICATION_DURATION]);

  // Check for expired notifications periodically
  useEffect(() => {
    const interval = setInterval(() => {
      // If tab is hidden, we might want to keep notifications longer so the user sees them when they return
      if (isTabVisible) {
        removeExpiredNotifications();
      }
    }, 1000); // Check every second

    return () => clearInterval(interval);
  }, [isTabVisible, removeExpiredNotifications]);

  // When tab becomes visible, remove expired notifications
  useEffect(() => {
    if (isTabVisible) {
      removeExpiredNotifications();
    }
  }, [isTabVisible, removeExpiredNotifications]);

  const clearNotificationsByRoom = useCallback((roomJID: string | null | undefined) => {
    if (!roomJID) return;
    setNotifications((prev) => prev.filter((n) => n.roomJID !== roomJID));
  }, []);
  
  useEffect(() => {
    if (!activeRoomJID) return;
    clearNotificationsByRoom(activeRoomJID);
  }, [activeRoomJID, clearNotificationsByRoom]);

  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const navigateToMessage = useCallback(
    (roomJID: string, messageId: string, message: IMessage, roomName: string, senderName: string) => {
      clearNotificationsByRoom(roomJID);

      // Check if custom onClick handler is provided
      const customOnClick = notificationConfig?.onClick;
      if (customOnClick) {
        // Use custom onClick handler
        Promise.resolve(customOnClick({
          roomJID,
          messageId,
          message,
          roomName,
          senderName,
        })).catch((error) => {
          console.error('Error in custom notification onClick handler:', error);
        });
        return;
      }

      // System notifications can be shown in-app without chat navigation.
      if (!roomJID) {
        return;
      }

      // Default behavior: Set the active room and scroll to message
      dispatch(setCurrentRoom({ roomJID }));

      // Wait for the room to be set and messages to render, then scroll to message
      setTimeout(() => {
        const messageElement = document.querySelector(
          `[data-message-id="${messageId}"]`
        );
        if (messageElement) {
          // Scroll to message
          messageElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });

          // Add highlight effect for 2 seconds
          messageElement.classList.add('message-highlight');
          setTimeout(() => {
            messageElement.classList.remove('message-highlight');
          }, 2000);
        } else {
          // If message not found, try again after a short delay (messages might still be loading)
          setTimeout(() => {
            const retryElement = document.querySelector(
              `[data-message-id="${messageId}"]`
            );
            if (retryElement) {
              retryElement.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
              });
              retryElement.classList.add('message-highlight');
              setTimeout(() => {
                retryElement.classList.remove('message-highlight');
              }, 2000);
            }
          }, 500);
        }
      }, 100);
    },
    [clearNotificationsByRoom, dispatch, notificationConfig]
  );

  const showMessageNotification = useCallback(
    (message: IMessage, roomName: string, senderName: string, roomJID: string) => {
      // Always create notification, regardless of tab visibility
      const notificationId = `msg-notification-${message.id}-${Date.now()}`;

      const newNotification: MessageNotificationData = {
        id: notificationId,
        message,
        roomName,
        senderName,
        roomJID,
        timestamp: Date.now(),
      };

      setNotifications((prev) => {
        // Remove expired notifications first
        const now = Date.now();
        const validNotifications = prev.filter(
          (n) => now - n.timestamp < NOTIFICATION_DURATION
        );

        // Keep only the 3 newest notifications
        const updated = [...validNotifications, newNotification];
        if (updated.length > MAX_NOTIFICATIONS) {
          // Remove oldest notifications (keep only the newest 3)
          return updated.slice(-MAX_NOTIFICATIONS);
        }
        return updated;
      });
    },
    [MAX_NOTIFICATIONS, NOTIFICATION_DURATION]
  );

  // Register the callback with the global manager
  useEffect(() => {
    const unsubscribe = messageNotificationManager.addCallback(
      showMessageNotification
    );
    if (config?.useStoreConsoleEnabled) {
      console.log(
        `[NotifyPolicy] source=in_app action=callback_registered count=${messageNotificationManager.getCallbackCount()}`
      );
    }
    return () => {
      unsubscribe();
      if (
        config?.useStoreConsoleEnabled &&
        isEnabled &&
        messageNotificationManager.getCallbackCount() === 0
      ) {
        console.warn('[NotifyPolicy] source=in_app action=callbacks_empty');
      }
    };
  }, [config?.useStoreConsoleEnabled, isEnabled, showMessageNotification]);

  return (
    <MessageNotificationContext.Provider value={{ showMessageNotification }}>
      {children}
      {shouldRender && (
        <div style={containerStyles} {...containerProps}>
          {notifications.map((notification) => (
            <div key={notification.id} style={{ pointerEvents: 'auto' }}>
              <MessageNotificationToast
                {...notification}
                onClose={() => removeNotification(notification.id)}
                onNavigateToMessage={(roomJID, messageId, message, roomName, senderName) =>
                  navigateToMessage(roomJID, messageId, message, roomName, senderName)
                }
                duration={NOTIFICATION_DURATION}
              />
            </div>
          ))}
          {notifications.length > 2 && (
            <div style={{ pointerEvents: 'auto', width: '100%' }}>
              <button
                type="button"
                onClick={clearAllNotifications}
                style={{
                  marginTop: 4,
                  width: '100%',
                  border: 'none',
                  borderRadius: 10,
                  padding: '8px 10px',
                  fontSize: 12,
                  lineHeight: 1.2,
                  cursor: 'pointer',
                  background: '#efefef',
                  color: '#2f2f2f',
                }}
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </MessageNotificationContext.Provider>
  );
};

export const useMessageNotification = () => {
  const context = useContext(MessageNotificationContext);
  if (!context) {
    throw new Error(
      'useMessageNotification must be used within a MessageNotificationProvider'
    );
  }
  return context;
};
