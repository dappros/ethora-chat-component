import { useEffect, useState } from 'react';

const QR_CHAT_STORAGE_KEY = '@ethora/chat-component-qrChatId';

export const handleQRChatId = (): void => {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const qrChatId = urlParams.get('qrChatId');

    if (qrChatId) {
      localStorage.setItem(QR_CHAT_STORAGE_KEY, qrChatId);

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
    handleQRChatId();
  }, []);

  useEffect(() => {
    try {
      const qrChatId = localStorage.getItem(QR_CHAT_STORAGE_KEY);

      if (qrChatId) {
        const roomJID = conferenceServer
          ? `${qrChatId}@${conferenceServer}`
          : `${qrChatId}@conference.xmpp.ethoradev.com`;

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
