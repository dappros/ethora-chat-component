import { User } from './user.model';
import { xmppSettingsInterface } from './xmpp.model';
import { PartialRoomWithMandatoryKeys, ConfigRoom } from './room.model';
import { MessageBubble, MessageProps, IMessage } from './message.model';
import { Iso639_1Codes } from './language.model';
import React from 'react'; // Assuming React types are globally available or managed by the project's tsconfig

import { MessageNotificationToastProps } from '../../components/MessageNotification/MessageNotificationToast';

export interface FBConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

/**
 * A single self-hosted font file to register via an injected `@font-face`
 * rule. Use this for fonts that are not on Google Fonts — e.g. the Ukrainian
 * government "e-Ukraine" family distributed from thedigital.gov.ua. Host the
 * `.woff2`/`.ttf` somewhere reachable and point `src` at it.
 */
export interface FontFaceSource {
  /** The `font-family` name this file provides, e.g. "e-Ukraine". */
  family: string;
  /** Absolute or relative URL to the font file (`.woff2`, `.woff`, `.ttf`, `.otf`). */
  src: string;
  /** Numeric weight this file covers (e.g. 400, 500, 700). Default 400. */
  weight?: number | string;
  /** Style this file covers. Default "normal". */
  style?: 'normal' | 'italic';
  /** `font-display` strategy. Default "swap" to avoid invisible text. */
  display?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional';
}

/**
 * Font configuration for the chat UI. When omitted, the component keeps its
 * default system font stack, so existing integrations are unaffected.
 *
 * Two loading paths are supported and can be combined:
 *  - `googleFontsUrl` / `googleFontsFamily` → a Google Fonts stylesheet is
 *    injected at runtime (no host setup needed).
 *  - `fontFaces` → `@font-face` rules are injected for self-hosted files
 *    (e.g. e-Ukraine).
 *
 * `fontFamily` is the family actually applied to the chat (via the
 * `--ethora-font-family` CSS variable). It should match a family you loaded
 * above, optionally followed by fallbacks, e.g. "e-Ukraine, Inter, sans-serif".
 */
export interface TypographyConfig {
  /** Family applied to the chat UI, optionally with fallbacks. */
  fontFamily?: string;
  /** A full Google Fonts stylesheet URL, e.g.
   * "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap". */
  googleFontsUrl?: string;
  /** Convenience: a Google family name (e.g. "Inter"); a stylesheet URL is
   * built for the weights below. Ignored if `googleFontsUrl` is set. */
  googleFontsFamily?: string;
  /** Self-hosted `@font-face` sources (e.g. e-Ukraine .woff2 files). */
  fontFaces?: FontFaceSource[];
  /** Weight tokens used by the chat; also drives the generated Google URL. */
  weights?: {
    regular?: number;
    medium?: number;
    semibold?: number;
    bold?: number;
  };
}

export interface IConfig {
  appId?: string;
  disableHeader?: boolean;
  disableMedia?: boolean;
  colors?: { primary: string; secondary: string };
  /** Configurable font family / weights for the chat UI. See TypographyConfig. */
  typography?: TypographyConfig;
  /**
   * Custom screens shown instead of the built-in Ethora UI when the chat
   * cannot be displayed. Each value may be a plain string (rendered as
   * centered text) or any React node. When a value is omitted, the default
   * built-in UI for that state (e.g. the Ethora login form) is kept.
   */
  fallbackScreens?: {
    /** Replaces the default Ethora login form when there is no user session. */
    noUser?: React.ReactNode;
    /** Shown when the XMPP connection is lost / cannot be established. */
    noConnection?: React.ReactNode;
    /** Shown when the user has no chat room to display. */
    noRoom?: React.ReactNode;
  };
  /**
   * Hide specific rooms from the room list and unread counters without
   * leaving them. Useful to suppress auto-created rooms such as the default
   * "Main chat" created with a new Ethora app.
   */
  hiddenRooms?: {
    /** Case-insensitive exact room titles to hide, e.g. ["Main chat"]. */
    titles?: string[];
    /** Full room JIDs to hide. */
    jids?: string[];
  };
  googleLogin?: {
    enabled: boolean;
    firebaseConfig: FBConfig;
  };
  // Legacy compatibility path. This exchanges a client JWT via /v1/users/client.
  // Prefer userLogin or customLogin for new integrations.
  jwtLogin?: {
    token: string;
    enabled: boolean;
    handleBadlogin?: React.ReactElement;
  };
  userLogin?: {
    enabled: boolean;
    user: User | null;
  };
  // Preferred embedded integration path: provide the final Ethora user/session
  // from your own backend or app auth flow.
  customLogin?: {
    enabled: boolean;
    loginFunction: () => Promise<User | null>;
  };
  baseUrl?: string;
  customAppToken?: string;
  xmppSettings?: xmppSettingsInterface;
  disableRooms?: boolean;
  defaultLogin?: boolean;
  disableInteractions?: boolean;
  chatHeaderBurgerMenu?: boolean;
  forceSetRoom?: boolean;
  roomListStyles?: React.CSSProperties;
  chatRoomStyles?: React.CSSProperties;
  noMessagesPlaceholder?: React.ComponentType;
  setRoomJidInPath?: boolean;
  disableRoomMenu?: boolean;
  defaultRooms?: ConfigRoom[];
  refreshTokens?: {
    enabled: boolean;
    refreshFunction?: () => Promise<{
      accessToken: string;
      refreshToken?: string;
    } | null>;
  };
  backgroundChat?: {
    color?: string;
    image?: string | File;
  };
  bubleMessage?: MessageBubble;
  headerLogo?: string | React.ReactElement;
  headerMenu?: () => void;
  headerChatMenu?: () => void;
  customRooms?: {
    rooms: PartialRoomWithMandatoryKeys[];
    disableGetRooms?: boolean;
    singleRoom: boolean;
  };
  translates?: { enabled: boolean; translations?: Iso639_1Codes };
  disableRoomConfig?: boolean;
  disableProfilesInteractions?: boolean;
  disableUserCount?: boolean;
  clearStoreBeforeInit?: boolean;
  disableSentLogic?: boolean;
  initBeforeLoad?: boolean;
  initBeforeLoadAuth?: {
    myEndpoint?: string;
  };
  newArch?: boolean;
  disableLastRead?: boolean;
  qrUrl?: string;
  secondarySendButton?: {
    enabled: boolean;
    messageEdit: string;
    label?: React.ReactNode;
    buttonStyles?: React.CSSProperties;
    hideInputSendButton?: boolean;
    overwriteEnterClick?: true;
  };
  enableRoomsRetry?: { enabled: boolean; helperText: string };
  disableNewChatButton?: boolean;
  chatHeaderAdditional?: { enabled: boolean; element: any };
  botMessageAutoScroll?: boolean;
  messageTextFilter?: {
    enabled: boolean;
    filterFunction: (text: string) => string;
  };
  eventHandlers?: {
    onMessageSent?: (event: {
      message: string;
      roomJID: string;
      user: any;
      messageType: 'text' | 'media';
      metadata?: any;
    }) => void | Promise<void>;
    onMessageFailed?: (event: {
      message: string;
      roomJID: string;
      error: Error;
      messageType: 'text' | 'media';
    }) => void;
    onMessageEdited?: (event: {
      messageId: string;
      newMessage: string;
      roomJID: string;
      user: any;
    }) => void;
  };

  disableTypingIndicator?: boolean;
  blockMessageSendingWhenProcessing?:
    | boolean
    | {
        enabled: boolean;
        timeout?: number;
        onTimeout?: (roomJID: string) => void;
      };
  customTypingIndicator?: {
    enabled: boolean;
    text?: string | ((usersTyping: string[]) => string);
    position?: 'bottom' | 'top' | 'overlay' | 'floating';
    styles?: React.CSSProperties;
    customComponent?: React.ComponentType<{
      usersTyping: string[];
      text: string;
      isVisible: boolean;
    }>;
  };
  whitelistSystemMessage?: string[];
  customSystemMessage?: React.ComponentType<MessageProps>;
  disableChatInfo?: {
    disableHeader?: boolean;
    disableDescription?: boolean;
    disableType?: boolean;
    disableMembers?: boolean;
    hideMembers?: boolean;
    disableChatHeaderMenu?: boolean;
  };
  chatHeaderSettings?: {
    hide?: boolean;
    disableCreate?: boolean;
    disableMenu?: boolean;
    hideSearch?: boolean;
  };
  useStoreConsoleEnabled?: boolean;
  historyQoS?: {
    maxInFlightHistory?: number;
    softPauseAfterSendMs?: number;
    activeRoomBoostTtlMs?: number;
    activeSendBoostMs?: number;
    alwaysPrioritizeActiveRoom?: boolean;
    backgroundWhileCriticalSend?: boolean;
    preloadTopKRooms?: number;
    presenceFailureBackoffMs?: number;
    startupPrivateStoreTimeoutMs?: number;
    startupPrivateStoreTtlMs?: number;
    stagedPreloadEnabled?: boolean;
    stagedPreloadFirstPassSize?: number;
    stagedPreloadSecondPassSize?: number;
    stagedPreloadConcurrency?: number;
  };
  inAppNotifications?: {
    enabled?: boolean;
    showInContext?: boolean;
    position?: {
      horizontal?: 'left' | 'right' | 'center';
      vertical?: 'top' | 'bottom';
      offset?: {
        top?: number | string;
        bottom?: number | string;
        left?: number | string;
        right?: number | string;
      };
    };
    maxNotifications?: number;
    duration?: number;
    onClick?: (params: {
      roomJID: string;
      messageId: string;
      message: IMessage;
      roomName: string;
      senderName: string;
    }) => void | Promise<void>;
    customComponent?: React.ComponentType<MessageNotificationToastProps>;
  };

  pushNotifications?: {
    enabled?: boolean;
    vapidPublicKey?: string;
    firebaseConfig?: FBConfig;
    serviceWorkerPath?: string;
    serviceWorkerScope?: string;
    iconPath?: string;
    badgePath?: string;
    softAsk?: boolean;
    onClick?: (params: {
      roomJID?: string;
      messageId?: string;
      url?: string;
      data?: Record<string, any>;
      notification?: { title?: string; body?: string };
      source?: 'service_worker' | 'foreground';
    }) => void | Promise<void>;
  };
}
