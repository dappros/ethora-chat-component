import { VITE_APP_WEB_URL, VITE_APP_XMPP_BASEDOMAIN, VITE_APP_XMPP_CONFERENCE } from '../../config';

export const CONFERENCE_DOMAIN = `@${VITE_APP_XMPP_CONFERENCE}`;
export const CHAT_DOMAIN = `@${VITE_APP_XMPP_BASEDOMAIN}`;
export const QRCODE_URL = VITE_APP_WEB_URL
  ? `${VITE_APP_WEB_URL}/app/chat/?chatId=`
  : 'https://beta.ethora.com/app/chat/?chatId=';
