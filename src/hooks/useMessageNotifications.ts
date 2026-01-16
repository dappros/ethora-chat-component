// Hook to enable message notifications - can be imported and used anywhere
// Similar to logout service pattern
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../roomStore';
import { messageNotificationManager } from '../utils/messageNotificationManager';
import { IMessage } from '../types/models/message.model';
import { createUserNameFromSetUser } from '../helpers/createUserNameFromSetUser';
import { setCurrentRoom } from '../roomStore/roomsSlice';

/**
 * Hook to enable message notifications globally
 * Call this hook in your app root or XMPP provider to enable notifications
 * even when the chat component isn't mounted
 * 
 * @example
 * ```tsx
 * import { useMessageNotifications } from '@ethora/chat-component';
 * 
 * function App() {
 *   useMessageNotifications();
 *   return <YourApp />;
 * }
 * ```
 */
export const useMessageNotifications = () => {
  const dispatch = useDispatch();
  const { rooms, activeRoomJID, usersSet } = useSelector(
    (state: RootState) => ({
      rooms: state.rooms.rooms,
      activeRoomJID: state.rooms.activeRoomJID,
      usersSet: state.rooms.usersSet,
    })
  );

  // This hook enables the notification system
  // The actual filtering and display is handled by MessageNotificationProvider
  // This hook is mainly for ensuring the system is active
  // The manager itself now handles active room filtering
  useEffect(() => {
    // Hook is active - notifications will work via the manager
    // The MessageNotificationProvider handles the actual display
    return () => {
      // Cleanup if needed
    };
  }, []);

  // Return navigation function that can be used externally if needed
  return {
    navigateToMessage: (roomJID: string, messageId: string) => {
      dispatch(setCurrentRoom({ roomJID }));
      setTimeout(() => {
        const messageElement = document.querySelector(
          `[data-message-id="${messageId}"]`
        );
        if (messageElement) {
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
          // Retry if message not found (might still be loading)
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
  };
};
