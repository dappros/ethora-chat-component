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
export { useRoomPresence, useIsUserOnline } from './hooks/useRoomPresence';
export { logoutService } from './hooks/useLogout';
export { useQRCodeChat, handleQRChatId } from './hooks/useQRCodeChatHandler';
export { useInAppNotifications } from './hooks/useInAppNotifications';
export { default as usePushNotifications } from './hooks/usePushNotifications';
export { resendMessage } from './utils/resendMessage';

// Per-chat mute: optimistic toggle + rollback over PUT/DELETE
// /v1/chats/my/{chatName}/mute. `isSupported` only flips true once the
// backend has actually reported a `muted` boolean for that room (not live on
// prod yet), so a host building its own mute UI should gate on it the same
// way the built-in chat header menu and room profile do.
export { useRoomMute } from './hooks/useRoomMute';
export type { UseRoomMuteResult } from './hooks/useRoomMute';

// Bot buttons ("quick replies"): the parser for the `quickReplies` wire
// format. Exported so a host embedding the chat can build the same buttons
// into its own message renderer, and so the bot/agent side has one
// definition of the format to serialise against.
export { parseQuickReplies } from './helpers/quickReplies';
export type { QuickReply } from './helpers/quickReplies';

// Font configuration: types + the runtime loader, so hosts can also apply
// a font outside the <Chat> tree if needed.
export { applyTypography, clearTypography } from './helpers/applyTypography';
export { useTypography } from './hooks/useTypography';
export type {
  TypographyConfig,
  FontFaceSource,
} from './types/models/config.model';

// Crash handling: the shape passed to `config.eventHandlers.onError` and to
// the `config.fallbackScreens.error` render function, so hosts can type their
// own crash reporter / replacement screen.
export type {
  ChatErrorInfo,
  ChatErrorScope,
  ChatErrorFallbackRenderer,
} from './types/models/config.model';

// Stable `data-testid` constants - exposed so host apps that consume
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

// Auth-token rotation. Exposed so hosts can drive a refresh themselves
// (it is deduped, and shares the SDK's Web Lock across tabs) and, more
// importantly, so they can tell a dead session from a transient
// failure: only `RefreshFatalError` means "log the user out". Every
// other rejection - network, 5xx, a lost REFRESH_IN_PROGRESS race -
// must leave the session alone.
export {
  refreshAuthTokens,
  refreshAuthTokensQuietly,
  RefreshFatalError,
  isRefreshFatalError,
} from './networking/authRefresh';
export type {
  RefreshErrorCode,
  RefreshResult,
  RefreshOptions,
} from './networking/authRefresh';

// Public type surface.
//
// Until now `main.ts` exported 18 runtime symbols and not a single type,
// so a TypeScript host had no way to name `<Chat>`'s own props without
// deep-importing `@ethora/chat-component/dist/types/...` - a path that is
// an implementation detail and has broken before. Everything a consumer
// needs to type the component tree is re-exported here from its real
// source module.

// The props of the exported `<Chat>` component, plus the pieces its
// fields are made of.
export type { ChatWrapperProps as ChatProps } from './components/MainComponents/ReduxWrapper';
export type { IConfig } from './types/models/config.model';
export type {
  VideoCallsConfig,
  VideoCallIcons,
  FBConfig,
} from './types/models/config.model';
export type {
  User,
  IUser,
  ConfigUser,
  StorageUser,
} from './types/models/user.model';
export type {
  IMessage,
  IReply,
  LastMessage,
  MessageProps,
  MediaMessageType,
  ReactionMessage,
} from './types/models/message.model';
export type {
  IRoom,
  RoomMember,
  RoomLastMessage,
  ConfigRoom,
  ChatAccessOption,
} from './types/models/room.model';
export type { MediaFile } from './types/models/media.model';
export type {
  Iso639_1Codes,
  Language,
  LanguageOptions,
} from './types/models/language.model';

// Prop types for the `Custom*Component` slots on `<Chat>`. A host that
// passes `CustomScrollableArea` etc. has to be able to type its own
// component against the same contract we call it with.
export type {
  CustomComponentsContextValue,
  CustomScrollableAreaProps,
  DaySeparatorProps,
  NewMessageLabelProps,
  DecoratedMessage,
  ScrollControllerApi,
} from './types/models/customComponents.model';
export type { SendInputProps } from './components/styled/SendInput';

// XMPP surface: `<XmppProvider>`'s settings shape and the client handle
// hosts get back from it.
export type {
  xmppSettingsInterface,
  XmppClientInterface,
  MediaUploadData,
} from './types/models/xmpp.model';

// End-to-end encryption (OMEMO 2). Enabled through `config.e2ee.enabled`;
// these exports exist for hosts that want to show fingerprints or manage
// per-device trust themselves. `omemo()` is undefined while encryption is
// off or the device's keys are still being published.
export { omemo, isE2eeEnabled, formatFingerprint } from './e2ee';
export type { DeviceInfo, Trust } from './e2ee';
