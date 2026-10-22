import { localStorageConstants } from './constants/LOCAL_STORAGE';

/**
 * A push tap names the room the user wants. The address bar and the parked
 * QR / deep-link id may still name another one: a host that redirects `/` to
 * its saved last path lands the window on `/chat?chatId=<last room>`, and
 * `useQRCodeChat` re-asserts that room for as long as it is parked, which
 * used to undo the push a moment after it was applied.
 *
 * Call this right before opening the pushed room so every source of truth
 * agrees: a `chatId` already in the url is rewritten to the pushed room (the
 * way `useRoomUrl` writes it, without adding a history entry), and a parked
 * id is dropped. A url with no `chatId` is left alone.
 */
export const claimRoomForPush = (roomJid: string): void => {
  const chatId = String(roomJid || '').split('@')[0].trim();
  if (!chatId) return;

  if (typeof window !== 'undefined') {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('chatId') || url.searchParams.has('qrChatId')) {
        url.searchParams.set('chatId', chatId);
        url.searchParams.delete('qrChatId');
        window.history.replaceState(
          window.history.state,
          '',
          `${url.pathname}${url.search}${url.hash}`
        );
      }
    } catch {
      /* a url we cannot rewrite is not worth failing the tap over */
    }
  }

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(localStorageConstants.ETHORA_QR_CHAT_ID);
    }
  } catch {
    /* storage disabled - nothing parked */
  }
};
