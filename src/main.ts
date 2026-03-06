import './index.css';

if (typeof window !== 'undefined') {
  (window as any)._ethoraAppLoadTime = Date.now();
}

/**
 * Main entry point for the Ethora Chat Component.
 */
export { XmppProvider } from './context/xmppProvider';
export { ReduxWrapper as Chat } from './components/MainComponents/ReduxWrapper';
export { useUnread } from './hooks/useUnreadMessagesCounter';
export { logoutService } from './hooks/useLogout';
export { useQRCodeChat, handleQRChatId } from './hooks/useQRCodeChatHandler';
export { useInAppNotifications } from './hooks/useInAppNotifications';
export { default as usePushNotifications } from './hooks/usePushNotifications';
export { resendMessage } from './utils/resendMessage';
