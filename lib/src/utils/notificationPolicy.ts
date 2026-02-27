import { IConfig, IRoom } from '../types/types';

export interface PushPayloadLike {
  messageId?: string;
  notification?: {
    title?: string;
    body?: string;
    image?: string;
  };
  data?: Record<string, any>;
}

const toLocal = (value?: string): string => {
  if (!value) return '';
  return String(value).split('@')[0];
};

export const isSystemPayload = (payload: PushPayloadLike): boolean => {
  const data = payload?.data ?? {};
  return !data.msgID && !data.jid && !!data.userJid;
};

export const isActiveRoom = (activeRoomJid?: string, roomJid?: string): boolean =>
  !!activeRoomJid && !!roomJid && activeRoomJid === roomJid;

export const isCurrentUserMessage = (
  messageUserId?: string,
  currentXmppUsername?: string
): boolean => toLocal(messageUserId) !== '' && toLocal(messageUserId) === toLocal(currentXmppUsername);

export const buildNotificationUrl = (
  payload: PushPayloadLike,
  origin: string
): string => {
  const data = payload?.data ?? {};
  if (isSystemPayload(payload)) return origin;
  if (data.url) return data.url;
  if (!data.jid) return origin;
  const chatId = toLocal(data.jid);
  return `${origin}/chat?chatId=${encodeURIComponent(chatId)}`;
};

export interface XmppToastDecisionInput {
  config?: IConfig;
  tabVisible: boolean;
  activeRoom: boolean;
  currentUserMessage: boolean;
  isSystem: boolean;
  isHistory?: boolean;
  xmppOnline?: boolean;
}

export interface DecisionResult {
  show: boolean;
  reason: string;
}

export const shouldShowXmppToast = ({
  config,
  tabVisible,
  activeRoom,
  currentUserMessage,
  isSystem,
  isHistory,
}: XmppToastDecisionInput): DecisionResult => {
  const inAppEnabled = config?.messageNotifications?.enabled !== false;
  if (isHistory) return { show: false, reason: 'historical_message' };
  if (!inAppEnabled) return { show: false, reason: 'in_app_disabled' };
  if (currentUserMessage && !isSystem) {
    return { show: false, reason: 'current_user_exact_match' };
  }
  if (activeRoom) return { show: true, reason: 'ok_active_room_allowed' };
  return { show: true, reason: 'ok' };
};

export interface ForegroundPushToastInput {
  config?: IConfig;
  tabVisible: boolean;
  alreadyInStore: boolean;
  deduped: boolean;
  isSystem: boolean;
  isHistory?: boolean;
}

export const shouldShowForegroundPushToast = ({
  config,
  tabVisible,
  alreadyInStore,
  deduped,
  isSystem,
  isHistory,
}: ForegroundPushToastInput): DecisionResult => {
  const inAppEnabled = config?.messageNotifications?.enabled !== false;
  if (isHistory) return { show: false, reason: 'historical_message' };
  if (!inAppEnabled) return { show: false, reason: 'in_app_disabled' };
  if (isSystem && !deduped) return { show: true, reason: 'system_ok' };
  if (alreadyInStore) return { show: false, reason: 'already_in_store' };
  if (deduped) return { show: false, reason: 'deduped' };
  return { show: true, reason: 'ok' };
};

export interface ForegroundOsPushInput {
  config?: IConfig;
  tabVisible: boolean;
  xmppOnline: boolean;
}

export const shouldShowForegroundOsPush = ({
  config,
  tabVisible,
  xmppOnline,
}: ForegroundOsPushInput): DecisionResult => {
  const pushEnabled = config?.webPush?.enabled === true;
  if (!pushEnabled) return { show: false, reason: 'push_disabled' };
  if (!tabVisible) return { show: true, reason: 'tab_hidden' };
  if (!xmppOnline) return { show: true, reason: 'xmpp_offline' };
  return { show: false, reason: 'visible_and_xmpp_online' };
};

export const hasMessageInRooms = (
  roomsMap: Record<string, IRoom>,
  messageId?: string
): boolean => {
  if (!messageId) return false;
  return Object.values(roomsMap || {}).some((room) =>
    room?.messages?.some((msg) => msg.id === messageId || msg.xmppId === messageId)
  );
};
