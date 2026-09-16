/**
 * Builds the "open this chat" link that the QR modal encodes.
 *
 * Two rules matter here:
 *
 * 1. The link has to point back at a page that actually mounts <Chat>.
 *    The old fallback invented a `/app/chat/` path from the current origin
 *    (and, with no window, an even older `beta.ethora.com` build-time URL),
 *    so scanning the QR on any deployment whose chat does not live at
 *    `/app/chat/` landed on a blank page. The current page is the one the
 *    user is looking at the chat in, so its own origin + pathname is the
 *    only entry point we can honestly guarantee. A host that serves chat
 *    somewhere else still overrides everything via `config.qrUrl`.
 *
 * 2. The parameter is written with URLSearchParams so an existing query
 *    string on the page (locale switches, host params) survives instead of
 *    being clobbered, and the id is encoded.
 */
export const CHAT_LINK_PARAM = 'chatId';

export const buildChatShareLink = (
  chatJid: string,
  qrUrl?: string,
  currentHref?: string
): string => {
  const bareId = String(chatJid || '').split('@')[0];
  if (!bareId) return '';

  // `qrUrl` is documented as a prefix the chat id is appended to, so keep
  // that contract exactly: hosts already ship values ending in `?chatId=`.
  if (qrUrl) return `${qrUrl}${bareId}`;

  const href =
    currentHref ||
    (typeof window !== 'undefined' ? window.location.href : '');
  if (!href) return '';

  try {
    const url = new URL(href);
    url.hash = '';
    url.searchParams.set(CHAT_LINK_PARAM, bareId);
    return url.toString();
  } catch {
    return '';
  }
};
