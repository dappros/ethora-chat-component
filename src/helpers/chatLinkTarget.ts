import type React from 'react';
import { store } from '../roomStore';
import { resolveQrChatRoomJid } from '../hooks/useQRCodeChatHandler';
import { openRoomAtMessage } from './openRoomAtMessage';

const CHAT_LINK_PARAMS = ['chatId', 'qrChatId'] as const;
const MESSAGE_LINK_PARAMS = ['messageId', 'msgId'] as const;

export interface ChatLinkTarget {
  roomJID: string;
  messageId: string | null;
}

export const getChatLinkTarget = (
  href: string | undefined,
  conferenceServer?: string
): ChatLinkTarget | null => {
  if (!href) return null;

  let url: URL;
  try {
    const base =
      typeof window !== 'undefined' ? window.location.href : 'http://localhost/';
    url = new URL(href, base);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  let chatId = '';
  for (const param of CHAT_LINK_PARAMS) {
    const value = url.searchParams.get(param)?.trim();
    if (value) {
      chatId = value;
      break;
    }
  }
  const roomJID = resolveQrChatRoomJid(chatId, conferenceServer);
  if (!roomJID) return null;

  let messageId: string | null = null;
  for (const param of MESSAGE_LINK_PARAMS) {
    const value = url.searchParams.get(param)?.trim();
    if (value) {
      messageId = value;
      break;
    }
  }

  return { roomJID, messageId };
};

export const handleChatLinkClick = (
  event: React.MouseEvent<HTMLAnchorElement>,
  href: string | undefined
): void => {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  const conference = store.getState().chatSettingStore?.config?.xmppSettings?.conference;
  const target = getChatLinkTarget(href, conference);
  if (!target) return;
  event.preventDefault();
  openRoomAtMessage(store.dispatch, target.roomJID, target.messageId);
};
