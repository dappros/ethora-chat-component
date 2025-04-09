import { useEffect, useState } from 'react';

const QR_CHAT_STORAGE_KEY = '@ethora/chat-component-qrChatId';

/**
 * Checks for qrChatId in URL and stores it in localStorage
 */
export const handleQRChatId = (): void => {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const qrChatId = urlParams.get('qrChatId');
    
    if (qrChatId) {
      localStorage.setItem(QR_CHAT_STORAGE_KEY, qrChatId);
      
      // Remove the parameter from URL to keep it clean
      urlParams.delete('qrChatId');
      
      // Update URL without refreshing page
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

/**
 * Hook to automate chat room selection based on QR code scanning.
 * This hook handles both checking for qrChatId in the URL and using it if stored in localStorage.
 * 
 * @param setCurrentRoom - Function to set the current active room
 * @param conferenceServer - XMPP conference server domain
 * @returns Object containing information about whether a room was selected via QR code
 */
export const useQRCodeChat = (
  setCurrentRoom: (params: { roomJID: string }) => void,
  conferenceServer?: string
) => {
  const [wasAutoSelected, setWasAutoSelected] = useState(false);
  
  // Check URL for qrChatId on mount
  useEffect(() => {
    handleQRChatId();
  }, []);
  
  // Check localStorage and select room if needed
  useEffect(() => {
    try {
      const qrChatId = localStorage.getItem(QR_CHAT_STORAGE_KEY);
      
      if (qrChatId) {
        // If conferenceServer is provided, use it to form the full JID
        const roomJID = conferenceServer 
          ? `${qrChatId}@${conferenceServer}`
          : qrChatId;
          
        setCurrentRoom({ roomJID });
        
        // Remove from localStorage after use
        localStorage.removeItem(QR_CHAT_STORAGE_KEY);
        
        setWasAutoSelected(true);
      }
    } catch (error) {
      console.error('Error using QR chat selection:', error);
    }
  }, [setCurrentRoom, conferenceServer]);
  
  return { wasAutoSelected };
}; 