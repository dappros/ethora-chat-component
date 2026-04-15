import { requireXmppClient } from './clientRegistry';
import { store } from '../roomStore';
import { addRoomMessage, deleteRoomMessage } from '../roomStore/roomsSlice';
import { removeMessageFromHeapById } from '../roomStore/roomHeapSlice';
import { v4 as uuidv4 } from 'uuid';
import { IMessage } from '../types/types';

type ResendOptions = {
  respectTranslateConfig?: boolean;
};

export async function resendMessage(
  message: Pick<IMessage, 'body' | 'roomJid'> & {
    originalMessageId: string;
    isReply?: boolean;
    showInChannel?: string;
    mainMessage?: string;
  },
  options: ResendOptions = {}
): Promise<string> {
  const client = requireXmppClient();
  const state = store.getState();
  const user = state.chatSettingStore.user;
  const config = state.chatSettingStore.config;
  const activeRoomJID = message.roomJid;
  const originalId = message.originalMessageId;

  try {
    client.deleteMessageStanza(activeRoomJID, originalId);
  } catch (e) {
    console.warn('Failed to send delete stanza for original message:', e);
  }

  try {
    store.dispatch(
      deleteRoomMessage({ roomJID: activeRoomJID, messageId: originalId })
    );
  } catch {
    // Local delete may fail if the message is already gone from the store.
  }
  try {
    store.dispatch(removeMessageFromHeapById(originalId));
  } catch {
    // Heap cleanup is best-effort only.
  }

  const id = `resend-text-message-${uuidv4()}`;

  store.dispatch(
    addRoomMessage({
      roomJID: activeRoomJID,
      message: {
        id,
        user: {
          ...user,
          id: user.xmppUsername,
          name: user.firstName + ' ' + user.lastName,
        },
        date: new Date().toISOString(),
        body: message.body,
        roomJid: activeRoomJID,
        xmppFrom: `${activeRoomJID}/${user.xmppUsername}`,
        pending: true,
        isReply: message.isReply || false,
        showInChannel: (message.showInChannel as any) || ('false' as any),
        mainMessage: message.mainMessage || '',
      },
    })
  );

  const useTranslate = !!(
    options.respectTranslateConfig && config?.translates?.enabled
  );

  try {
    if (useTranslate) {
      client.sendTextMessageWithTranslateTagStanza(
        activeRoomJID,
        user.firstName,
        user.lastName,
        '',
        user.walletAddress,
        message.body,
        '',
        message.isReply || false,
        message.showInChannel === 'true' || false,
        message.mainMessage || '',
        (state.chatSettingStore.langSource as any) || 'en',
        id
      );
    } else {
      client.sendMessage(
        activeRoomJID,
        user.firstName,
        user.lastName,
        '',
        user.walletAddress,
        message.body,
        '',
        message.isReply || false,
        message.showInChannel === 'true' || false,
        message.mainMessage || '',
        id
      );
    }

    try {
      if (config?.eventHandlers?.onMessageSent) {
        await config.eventHandlers.onMessageSent({
          message: message.body,
          roomJID: activeRoomJID,
          user,
          messageType: 'text',
          metadata: {
            isReply: message.isReply || false,
            isChecked: message.showInChannel === 'true' || false,
            mainMessage: message.mainMessage || '',
            translateEnabled: useTranslate,
            messageId: id,
            originalMessageId: originalId,
            resend: true,
          },
        });
      }
    } catch (handlerError) {
      console.error('Error in message sent handler:', handlerError);
      throw handlerError;
    }
  } catch (error) {
    console.error('Error resending message:', error);
    try {
      if (config?.eventHandlers?.onMessageFailed) {
        config.eventHandlers.onMessageFailed({
          message: message.body,
          roomJID: activeRoomJID,
          error: error as Error,
          messageType: 'text',
        });
      }
    } catch (handlerError) {
      console.error('Error in message failed handler:', handlerError);
    }
  }

  return id;
}

export default resendMessage;
