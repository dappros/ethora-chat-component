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

export interface IConfig {
  appId?: string;
  disableHeader?: boolean;
  disableMedia?: boolean;
  colors?: { primary: string; secondary: string };
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
