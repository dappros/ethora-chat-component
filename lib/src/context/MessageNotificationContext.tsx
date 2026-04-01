// Context for managing in-app notifications (Telegram-style)
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
import {
  shouldShowForegroundOsPush,
  buildNotificationUrl,
} from '../utils/notificationPolicy';
import { showBrowserNotification } from '../utils/notificationUtils';

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
  const contextConfig = useSelector(
    (state: RootState) => state.chatSettingStore?.config
  );
  
  // Use config from props, context, or defaults
  const config = propConfig || contextConfig;
  const notificationConfig = config?.inAppNotifications;
  const isEnabled = notificationConfig?.enabled === true;
  const showInContext = notificationConfig?.showInContext ?? true; // Default to true - show in chat context
  
  const MAX_NOTIFICATIONS = notificationConfig?.maxNotifications ?? DEFAULT_MAX_NOTIFICATIONS;
  const NOTIFICATION_DURATION = notificationConfig?.duration ?? DEFAULT_NOTIFICATION_DURATION;
  
  // Determine if we should render in-app notifications.
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

  // Request browser notification permission if in-app notifications are enabled
  useEffect(() => {
    if (isEnabled && typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        void Notification.requestPermission();
      }
    }
  }, [isEnabled]);

  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const navigateToMessage = useCallback(
    (roomJID: string, messageId: string, message: IMessage, roomName: string, senderName: string) => {
      clearNotificationsByRoom(roomJID);

      const customOnClick = notificationConfig?.onClick;
      if (customOnClick) {
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

      if (!roomJID) return;

      dispatch(setCurrentRoom({ roomJID }));

      setTimeout(() => {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
          messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          messageElement.classList.add('message-highlight');
          setTimeout(() => messageElement.classList.remove('message-highlight'), 2000);
        }
      }, 100);
    },
    [clearNotificationsByRoom, dispatch, notificationConfig]
  );

  const showToastNotification = useCallback(
    (message: IMessage, roomName: string, senderName: string, roomJID: string) => {
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
        const now = Date.now();
        const validNotifications = prev.filter((n) => now - n.timestamp < NOTIFICATION_DURATION);
        const updated = [...validNotifications, newNotification];
        return updated.length > MAX_NOTIFICATIONS ? updated.slice(-MAX_NOTIFICATIONS) : updated;
      });
    },
    [MAX_NOTIFICATIONS, NOTIFICATION_DURATION]
  );

  const showMessageNotification = useCallback(
    (message: IMessage, roomName: string, senderName: string, roomJID: string) => {
      if (isEnabled && isTabVisible) {
        showToastNotification(message, roomName, senderName, roomJID);
      }

      const osPushDecision = shouldShowForegroundOsPush({
        config,
        tabVisible: isTabVisible,
      });

      if (osPushDecision.show) {
        const title = roomName || 'New message';
        const body = message.body || 'You have a new message.';
        const url = buildNotificationUrl(
          { data: { jid: roomJID, msgID: message.id } },
          window.location.origin
        );

        void showBrowserNotification(
          title,
          {
            body: `${senderName}: ${body}`,
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            tag: 'ethora-notification',
            data: { url, roomJID, messageId: message.id },
          },
          config?.pushNotifications?.serviceWorkerScope || '/',
          () => {
            window.focus();
            navigateToMessage(roomJID, message.id, message, roomName, senderName);
          }
        );
      }
    },
    [config, isEnabled, isTabVisible, showToastNotification, navigateToMessage]
  );

  // Register the callback with the global manager
  useEffect(() => {
    if (!isEnabled) return;
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
    };
  }, [config?.useStoreConsoleEnabled, isEnabled, showMessageNotification]);

  return (
    <MessageNotificationContext.Provider value={{ showMessageNotification }}>
      {children}
      {shouldRender && (
        <div style={containerStyles} {...containerProps}>
          {notifications.map((notification) => {
            const NotificationComponent = notificationConfig?.customComponent || MessageNotificationToast;
            return (
              <div key={notification.id} style={{ pointerEvents: 'auto' }}>
                <NotificationComponent
                  {...notification}
                  onClose={() => removeNotification(notification.id)}
                  onNavigateToMessage={(roomJID, messageId, message, roomName, senderName) =>
                    navigateToMessage(roomJID, messageId, message, roomName, senderName)
                  }
                  duration={NOTIFICATION_DURATION}
                />
              </div>
            );
          })}
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
