import { User } from './user.model';
import { xmppSettingsInterface } from './xmpp.model';
import { PartialRoomWithMandatoryKeys, ConfigRoom } from './room.model';
import { MessageBubble, MessageProps, IMessage } from './message.model';
import { Iso639_1Codes } from './language.model';
import React from 'react'; // Assuming React types are globally available or managed by the project's tsconfig

import { MessageNotificationToastProps } from '../../components/MessageNotification/MessageNotificationToast';

/**
 * Override the icons used by the in-call control bar and the incoming-call
 * ring screen. Each value is any React node (an <svg>, an <img>, an icon
 * component element). When omitted, the chat's built-in icon is used. The
 * mic/camera/screen-share toggles take separate on/off icons so the host can
 * express the active vs muted state however they like.
 */
export interface VideoCallIcons {
  micOn?: React.ReactNode;
  micOff?: React.ReactNode;
  cameraOn?: React.ReactNode;
  cameraOff?: React.ReactNode;
  screenShareOn?: React.ReactNode;
  screenShareOff?: React.ReactNode;
  hangup?: React.ReactNode;
  accept?: React.ReactNode;
  decline?: React.ReactNode;
}

export interface VideoCallsConfig {
  enabled: boolean;
  livekitUrl: string;
  allowedRoomTypes?: Array<'private'>;
  /**
   * Show the audio-only call button next to the video-call button. Off by
   * default: it's a separate opt-in feature. An audio call uses the same call
   * backend as video (no server changes needed); the client just starts the
   * session with `kind: 'audio'` so no camera track is published, and the
   * callee learns the kind from the direct `call-invite` signal. Requires
   * `enabled` and a `livekitUrl` like video calls.
   */
  enableAudioCalls?: boolean;
  /** Start a video call with the camera already on. Default true. */
  startWithCameraOn?: boolean;
  /** Start a call with the microphone already on. Default true. */
  startWithMicOn?: boolean;
  /** Show the screen-share control. Default true. */
  showScreenShare?: boolean;
  /** Custom icons for the call control bar / ring screen. See VideoCallIcons. */
  icons?: VideoCallIcons;
}

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
  /**
   * Base font size for chat text. A number is treated as pixels (e.g. `18`),
   * a string is used verbatim if it carries a unit (`"1.1rem"`, `"18px"`) or
   * parsed as pixels otherwise. Published as the `--ethora-font-size` CSS
   * variable (plus derived `-xs` / `-sm` / `-lg` variants) which the chat's
   * text styles read, so message text, sender names, timestamps, inputs,
   * room names and badges all scale proportionally. Default 16px.
   */
  fontSize?: number | string;
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
  colors?: {
    primary: string;
    secondary: string;
    /**
     * Default colour applied to the chat's icons (attach, microphone, send,
     * file, empty-state illustrations, etc.). When omitted, icons fall back
     * to `primary`. Set to a specific colour to decouple icons from the
     * primary theme colour.
     */
    icons?: string;
    /**
     * Background colour of the chat's icon "chips" (attach, send, microphone,
     * file preview, etc.). When omitted, falls back to `secondary` and then to
     * white. Set to decouple the icon backgrounds from `secondary`.
     */
    iconsBg?: string;
    /** Background colour of the user's own message bubbles. Default #E7EDF9. */
    ownMessageBackground?: string;
    /** Background colour of other users' message bubbles. Default #FFFFFF. */
    otherMessageBackground?: string;
    /** Background colour of the message input bar. Default #FFFFFF. */
    inputBackground?: string;
    colorInput?: string;
  };
  /** Configurable font family / size / weights for the chat UI. See TypographyConfig. */
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
  translates?: {
    enabled: boolean;
    translations?: Iso639_1Codes;
    /**
     * 'auto' shows the translation inline automatically (legacy behaviour).
     * 'on-demand' shows a "Translate" link the reader clicks (LinkedIn-style),
     * then renders the result inline with a "Show original" toggle. Default 'auto'.
     */
    mode?: 'auto' | 'on-demand';
    /**
     * Locales a message is pre-translated into BEFORE it is sent (e.g.
     * ["en-CA", "fr-CA", "es-US"]). The sender calls the translation service
     * (see `endpoint`) and embeds the result in the stanza as
     * `<translations value='...'/>`, so every recipient receives the message
     * already translated and renders it with the existing parser - no
     * ejabberd module needed.
     *
     * Keep this to the locales actually present in the room: every extra target
     * is one more translation shipped per message. Leave empty to disable
     * pre-translation (the on-demand `onTranslate` path still works).
     */
    targets?: string[];
    /**
     * Translation service URL for pre-translation (GET ?source=&text=,
     * responding `{translates:[{translatedText, language, languageName}]}`).
     * Defaults to Ethora's hosted service; point it at your own deployment
     * for self-hosted setups.
     */
    endpoint?: string;
    /**
     * Reader's full locale (BCP-47, e.g. "fr-CA"). Falls back to
     * `config.i18n.locale`. The region is passed through to `onTranslate` so
     * the service can distinguish fr-CA vs fr-FR; the Translate button
     * visibility comparison ignores the region (en-US vs en-CA => no button).
     */
    readerLocale?: string;
    /**
     * Host-provided translation function. When set, the Translate action calls
     * this - wire it to your own endpoint (or Google / OpenAI). When omitted,
     * the component falls back to server-provided translations parsed onto the
     * message (`message.translations`).
     */
    onTranslate?: (
      text: string,
      ctx: { sourceLocale?: string; targetLocale: string; message: IMessage }
    ) => Promise<string>;
    /**
     * Host predicate deciding whether to show the Translate action for a given
     * message. When omitted, the component compares base languages (message
     * source vs reader, region ignored) and shows the action when they differ.
     */
    showTranslateForMessage?: (message: IMessage) => boolean;
  };
  /**
   * Static UI i18n (interface captions like "Search...", "Type message").
   * `locale` is a BCP-47 tag the host passes from the device/user (e.g. "en",
   * "fr-CA", "es-US"); captions resolve to its base language. `strings`
   * overrides or extends any built-in caption by key (see src/i18n/strings.ts).
   * Built-in languages: en, fr, es. Independent from `translates` (dynamic
   * per-message translation).
   */
  i18n?: {
    locale?: string;
    strings?: Record<string, string>;
  };
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
    /**
     * In-app banner that nudges the user to turn on browser notifications.
     * Off by default. The banner renders one of two states automatically from
     * the current `Notification.permission`:
     *  - "default" (never asked) → an "Enable notifications" card with a button
     *    that triggers the browser permission prompt;
     *  - "denied" (blocked) → a "Notifications are blocked" card explaining how
     *    to re-allow it from the browser's site settings.
     * It hides itself entirely once permission is "granted", when the browser
     * has no Notification API, or when `pushNotifications.enabled` is not true.
     * Every label is overridable so it can be localised.
     */
    permissionBanner?: {
      /** Master switch for the banner. Default false (opt-in). */
      enabled?: boolean;
      /** Show the prompt while permission is "default". Default true. */
      showWhenDefault?: boolean;
      /**
       * Show the notice while permission is "denied". Default false: a blocked
       * state can only be fixed by hand in the browser's site settings, so by
       * default we don't nag. Set true to opt back into the reminder.
       */
      showWhenBlocked?: boolean;
      /** Render a dismiss (×) control. Default true. Dismissal lasts the tab session. */
      dismissible?: boolean;
      /** Where the fixed banner is anchored. Default "bottom-right". */
      position?:
        | 'top-left'
        | 'top-right'
        | 'top-center'
        | 'bottom-left'
        | 'bottom-right'
        | 'bottom-center';
      /** Title for the "enable" state. Default "Enable notifications". */
      enableTitle?: string;
      /** Description for the "enable" state. */
      enableDescription?: string;
      /** Button label for the "enable" state. Default "Enable notifications". */
      enableButtonLabel?: string;
      /** Title for the "blocked" state. Default "Notifications are blocked". */
      blockedTitle?: string;
      /** Description for the "blocked" state. */
      blockedDescription?: string;
      /** Inline style overrides merged onto the banner container. */
      style?: React.CSSProperties;
    };
    onClick?: (params: {
      roomJID?: string;
      messageId?: string;
      url?: string;
      data?: Record<string, any>;
      notification?: { title?: string; body?: string };
      source?: 'service_worker' | 'foreground';
    }) => void | Promise<void>;
  };
  videoCalls?: VideoCallsConfig;
}
