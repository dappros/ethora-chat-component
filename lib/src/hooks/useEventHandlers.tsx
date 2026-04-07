import { useCallback } from 'react';
import { IConfig } from '../types/models/config.model';
import { ethoraLogger } from '../helpers/ethoraLogger';

interface EventHandlersHook {
  handleMessageSent: (event: {
    message: string;
    roomJID: string;
    user: any;
    messageType: 'text' | 'media';
    metadata?: any;
  }) => Promise<void>;
  handleMessageFailed: (event: {
    message: string;
    roomJID: string;
    error: Error;
    messageType: 'text' | 'media';
  }) => void;
  handleMessageEdited: (event: {
    messageId: string;
    newMessage: string;
    roomJID: string;
    user: any;
  }) => void;
}

export const useEventHandlers = (config?: IConfig): EventHandlersHook => {
  const handleMessageSent = useCallback(
    async (event: {
      message: string;
      roomJID: string;
      user: any;
      messageType: 'text' | 'media';
      metadata?: any;
    }) => {
      try {
        // Call the event handler if available
        if (config?.eventHandlers?.onMessageSent) {
          await config.eventHandlers.onMessageSent(event);
        }
      } catch (error) {
        console.error('Error in message sent handler:', error);
        // Re-throw the error so the calling function can handle it
        throw error;
      }
    },
    [config]
  );

  const handleMessageFailed = useCallback(
    (event: {
      message: string;
      roomJID: string;
      error: Error;
      messageType: 'text' | 'media';
    }) => {
      try {
        // Call the error handler if available
        if (config?.eventHandlers?.onMessageFailed) {
          config.eventHandlers.onMessageFailed(event);
        }

        // Log additional error details for debugging
        console.error('Message failed details:', {
          message: event.message,
          roomJID: event.roomJID,
          messageType: event.messageType,
          error: event.error.message,
          stack: event.error.stack,
          timestamp: new Date().toISOString(),
        });
      } catch (handlerError) {
        console.error('Error in message failed handler:', handlerError);
        // Don't throw here to avoid infinite error loops
      }
    },
    [config]
  );

  const handleMessageEdited = useCallback(
    (event: {
      messageId: string;
      newMessage: string;
      roomJID: string;
      user: any;
    }) => {
      try {
        // Call the edit handler if available
        if (config?.eventHandlers?.onMessageEdited) {
          config.eventHandlers.onMessageEdited(event);
        }

        // Log edit details for debugging
        ethoraLogger.log('Message edited:', {
          messageId: event.messageId,
          newMessage: event.newMessage,
          roomJID: event.roomJID,
          user: event.user?.id || event.user?.xmppUsername,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Error in message edited handler:', error);
        // Don't throw here to avoid breaking the edit flow
      }
    },
    [config]
  );

  return {
    handleMessageSent,
    handleMessageFailed,
    handleMessageEdited,
  };
};
