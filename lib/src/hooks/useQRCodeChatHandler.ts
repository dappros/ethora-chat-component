import { useEffect, useRef, useState } from 'react';
import { localStorageConstants } from '../helpers/constants/LOCAL_STORAGE';

const QR_CHAT_STORAGE_KEY = localStorageConstants.ETHORA_QR_CHAT_ID;

// Both spellings are in the wild: the QR modal (and every host that reads
// `config.setRoomJidInPath`) writes `chatId`, while the original QR handler
// only ever looked for `qrChatId`. Parking either one is what lets the id
// survive a login round trip, which is the whole point of parking it.
const CHAT_ID_PARAMS = ['qrChatId', 'chatId'] as const;

// Only `qrChatId` is stripped from the URL. `chatId` is left alone on
// purpose: `chatAutoEnterer` still reads it live, and `useRoomUrl` writes it
// back whenever `config.setRoomJidInPath` is on, so removing it here would
// just start a tug of war over the address bar.
const STRIPPED_PARAMS = ['qrChatId'] as const;

const readStorage = (): string | null => {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(QR_CHAT_STORAGE_KEY);
  } catch {
    return null;
  }
};

const clearStorage = (): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(QR_CHAT_STORAGE_KEY);
  } catch {
    /* storage disabled - nothing to clean up */
  }
};

export const handleQRChatId = (): void => {
  // Check if we're in browser environment
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const urlParams = new URLSearchParams(window.location.search);

    let qrChatId: string | null = null;
    for (const param of CHAT_ID_PARAMS) {
      const value = urlParams.get(param);
      if (value) {
        qrChatId = value;
        break;
      }
    }

    if (!qrChatId) return;

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(QR_CHAT_STORAGE_KEY, qrChatId);
      } catch {
        /* storage disabled - the live URL param still drives entry */
      }
    }

    let stripped = false;
    for (const param of STRIPPED_PARAMS) {
      if (urlParams.has(param)) {
        urlParams.delete(param);
        stripped = true;
      }
    }
    if (!stripped) return;

    const newUrl =
      window.location.pathname +
      (urlParams.toString() ? `?${urlParams.toString()}` : '') +
      window.location.hash;

    window.history.replaceState({}, '', newUrl);
  } catch (error) {
    console.error('Error handling QR chat ID:', error);
  }
};

/**
 * Turns whatever the link carried into a room JID.
 *
 * Accepts a bare chat id (`<appId>_<chatId>`) or an already-qualified JID,
 * so a QR that encodes either form lands in the same room.
 *
 * Returns '' when no conference server is known. That is deliberate: the
 * hook used to fall back to the build-time `VITE_APP_XMPP_CONFERENCE`, which
 * is baked into the published bundle and is empty in this package's own
 * build. In a multi-tenant deploy that produced a JID for the wrong tenant
 * (or the malformed `<id>@`), so an unknown conference now means "wait",
 * never "guess".
 */
export const resolveQrChatRoomJid = (
  qrChatId?: string | null,
  conferenceServer?: string
): string => {
  const raw = (qrChatId || '').trim();
  if (!raw) return '';
  if (raw.includes('@')) {
    const [node, domain] = raw.split('@');
    return node && domain ? raw : '';
  }
  const conference = (conferenceServer || '').trim();
  if (!conference) return '';
  return `${raw}@${conference}`;
};

interface QRCodeChatOptions {
  /** Rooms currently known to the store, keyed by JID. */
  rooms?: Record<string, unknown> | null;
  /** The room the store currently has selected. */
  activeRoomJID?: string | null;
  /**
   * True once the client is connected and the room list has settled, i.e.
   * once "the room is still not here" is a real answer rather than "not
   * loaded yet".
   */
  isReady?: boolean;
}

export const useQRCodeChat = (
  setCurrentRoom: (params: { roomJID: string }) => void,
  conferenceServer?: string,
  options?: QRCodeChatOptions
) => {
  const [wasAutoSelected, setWasAutoSelected] = useState(false);
  const [notFoundRoomJID, setNotFoundRoomJID] = useState<string | null>(null);

  const rooms = options?.rooms;
  const activeRoomJID = options?.activeRoomJID;
  const isReady = options?.isReady;

  // `setCurrentRoom` is usually an inline arrow at the call site, so it is a
  // new function on every render. Keeping it in a ref lets the effect below
  // depend on the things that actually matter (the parked id, the rooms, the
  // ready flag) without re-running on every parent render.
  const setCurrentRoomRef = useRef(setCurrentRoom);
  setCurrentRoomRef.current = setCurrentRoom;

  useEffect(() => {
    // Only run on client-side
    if (typeof window !== 'undefined') {
      handleQRChatId();
    }
  }, []);

  useEffect(() => {
    // Only run on client-side
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const qrChatId = readStorage();
      if (!qrChatId) return;

      const roomJID = resolveQrChatRoomJid(qrChatId, conferenceServer);
      if (!roomJID) {
        // No conference server yet (config still arriving, or the host never
        // configured one). Keep the id parked and try again when it lands.
        return;
      }

      // Re-assert the selection for as long as the id is parked. The old
      // code dispatched once, immediately, and deleted the id in the same
      // breath - so anything that selected a room later (the rooms list
      // settling after login, a route sync) silently won, and the link
      // opened the wrong chat with no way to recover.
      if (activeRoomJID !== roomJID) {
        setCurrentRoomRef.current({ roomJID });
      }
      setWasAutoSelected(true);

      // Both halves matter. The room being in the list is not enough: the
      // selection can still be stolen afterwards (a cache-scope reset that
      // nulls the active room, then a room-discovery stanza defaulting to
      // whichever room arrived first). Hold the parked id until the
      // selection has actually settled on the room the link asked for.
      const isOpened =
        Boolean(rooms && rooms[roomJID]) && activeRoomJID === roomJID;

      if (isOpened) {
        // Landed. Drop the id so the next reload doesn't yank the user back
        // into this room forever.
        clearStorage();
        setNotFoundRoomJID(null);
        return;
      }

      if (isReady) {
        // Rooms have settled and this one is not among them: the user is not
        // a member, or the id is stale. Stop forcing the selection (that
        // would pin them to a room they cannot open) and let the UI say so.
        clearStorage();
        setNotFoundRoomJID(roomJID);
      }
    } catch (error) {
      console.error('Error using QR chat selection:', error);
    }
  }, [conferenceServer, rooms, activeRoomJID, isReady]);

  return { wasAutoSelected, notFoundRoomJID };
};
