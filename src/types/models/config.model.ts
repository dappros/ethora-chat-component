import { User } from './user.model';
import { xmppSettingsInterface } from './xmpp.model';
import { PartialRoomWithMandatoryKeys, ConfigRoom } from './room.model';
import { MessageBubble } from './message.model';
import { Iso639_1Codes } from './language.model';
import React from 'react'; // Assuming React types are globally available or managed by the project's tsconfig

export interface FBConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface IConfig {
  disableHeader?: boolean;
  disableMedia?: boolean;
  colors?: { primary: string; secondary: string };
  googleLogin?: {
    enabled: boolean;
    firebaseConfig: FBConfig;
  };
  jwtLogin?: {
    token: string;
    enabled: boolean;
    handleBadlogin?: React.ReactElement;
  };
  userLogin?: {
    enabled: boolean;
    user: User | null;
  };
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
      token: string;
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
  newArch?: boolean;
  qrUrl?: string;
  secondarySendButton?: {
    enabled: boolean;
    messageEdit: string;
    buttonText: string;
    buttonStyles?: React.CSSProperties;
  };
  enableRoomsRetry?: { enabled: boolean; helperText: string };
  disableNewChatButton?: boolean;
}
