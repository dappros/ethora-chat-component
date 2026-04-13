import { useEffect, useState } from 'react';
import { VITE_APP_XMPP_CONFERENCE } from '../config';
import { localStorageConstants } from '../helpers/constants/LOCAL_STORAGE';

const QR_CHAT_STORAGE_KEY = localStorageConstants.ETHORA_QR_CHAT_ID;

export const handleQRChatId = (): void => {
  // Check if we're in browser environment
  if (typeof window === "undefined") {
    return;
  }

  try {
    const urlParams = new URLSearchParams(window.location.search);
    const qrChatId = urlParams.get('qrChatId');

    if (qrChatId) {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(QR_CHAT_STORAGE_KEY, qrChatId);
      }

      urlParams.delete('qrChatId');

      const newUrl =
        window.location.pathname +
        (urlParams.toString() ? `?${urlParams.toString()}` : '') +
        window.location.hash;

      window.history.replaceState({}, '', newUrl);
    }
  } catch (error) {
    console.error('Error handling QR chat ID:', error);
  }
};

export const useQRCodeChat = (
  setCurrentRoom: (params: { roomJID: string }) => void,
  conferenceServer?: string
) => {
  const [wasAutoSelected, setWasAutoSelected] = useState(false);

  useEffect(() => {
    // Only run on client-side
    if (typeof window !== "undefined") {
      handleQRChatId();
    }
  }, []);

  useEffect(() => {
    // Only run on client-side
    if (typeof window === "undefined" || typeof localStorage === "undefined") {
      return;
    }

    try {
      const qrChatId = localStorage.getItem(QR_CHAT_STORAGE_KEY);

      if (qrChatId) {
        const roomJID = conferenceServer
          ? `${qrChatId}@${conferenceServer}`
          : `${qrChatId}@${VITE_APP_XMPP_CONFERENCE}`;

        setCurrentRoom({ roomJID });

        localStorage.removeItem(QR_CHAT_STORAGE_KEY);

        setWasAutoSelected(true);
      }
    } catch (error) {
      console.error('Error using QR chat selection:', error);
    }
  }, [setCurrentRoom, conferenceServer]);

  return { wasAutoSelected };
};
