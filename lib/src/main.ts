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

// Font configuration: types + the runtime loader, so hosts can also apply
// a font outside the <Chat> tree if needed.
export { applyTypography, clearTypography } from './helpers/applyTypography';
export { useTypography } from './hooks/useTypography';
export type {
  TypographyConfig,
  FontFaceSource,
} from './types/models/config.model';

// Stable `data-testid` constants — exposed so host apps that consume
// this package (e.g. ethora-app-reactjs) can resolve chat-component
// nodes in their own Playwright / Cypress tests without re-typing
// magic strings, and so the values stay in lockstep with Android's
// `*TestTags` Kotlin objects and iOS's `*AccessibilityID` Swift
// enums. Cross-platform parity table: see README "Testing".
export {
  ChatInputTestIds,
  MessageBubbleTestIds,
  RoomListTestIds,
  AuthTestIds,
} from './testIds';
