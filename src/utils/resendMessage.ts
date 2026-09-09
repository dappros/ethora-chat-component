import { requireXmppClient } from './clientRegistry';
import { store } from '../roomStore';
import {
  addRoomMessage,
  deleteRoomMessage,
  setMessageSendRetrying,
} from '../roomStore/roomsSlice';
import {
  addMessageToHeap,
  removeMessageFromHeapById,
} from '../roomStore/roomHeapSlice';
import {
  armSendFailureWatchdog,
  beginSendRetry,
  endSendRetry,
} from '../helpers/sendFailureWatchdog';
import { v4 as uuidv4 } from 'uuid';
import { IMessage } from '../types/types';

type ResendOptions = {
  respectTranslateConfig?: boolean;
  /**
   * Re-send under the ORIGINAL message id instead of minting a new one.
   *
   * This is what the "not delivered - retry" control in the message bubble
   * uses, and it is the only duplicate-safe way to retry:
   *
   *  - the id is the client id carried on the stanza, so if the first
   *    attempt WAS accepted after all, its late echo reconciles onto the
   *    same message entry instead of appearing as a second bubble;
   *  - the original message is left in place (no local delete, and no
   *    `deleteMessageStanza` broadcast to the room), so a recipient who
   *    already received the first attempt does not see it retracted and
   *    then re-sent;
   *  - xmppClient's send queue de-duplicates by id, so a retry issued while
   *    the first attempt is still queued (the offline case) is absorbed
   *    rather than putting a second copy on the wire.
   *
   * Default `false` keeps the pre-existing "resend as a brand new message"
   * behaviour for hosts already calling this utility directly.
   */
  preserveMessageId?: boolean;
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
  const reuseId = options.preserveMessageId === true;

  // Single-writer rule for a message id. A second tap on Retry (or a
  // duplicate render of the same bubble) finds the slot taken and returns
  // the id without sending anything - RN defect #31's "tapping retry
  // delivered the message a second time" cannot happen here.
  if (reuseId && !beginSendRetry(originalId)) {
    return originalId;
  }

  if (!reuseId) {
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
  }

  const id = reuseId ? originalId : `resend-text-message-${uuidv4()}`;
  const optimisticTimestamp = Date.now();
  const optimisticDate = new Date(optimisticTimestamp).toISOString();

  if (reuseId) {
    // Back to "sending" on the SAME entry: no new bubble, no new id.
    store.dispatch(
      setMessageSendRetrying({ roomJID: activeRoomJID, messageId: id })
    );
    // The outbound queue entry survives an unacknowledged send (it is only
    // dropped when the echo arrives), so re-adding it here would make the
    // reconnect drain send this message twice.
    const alreadyQueued = store
      .getState()
      .roomHeapSlice.messageHeap.some((m) => m.id === id);
    if (!alreadyQueued) {
      store.dispatch(
        addMessageToHeap({
          id,
          user: {
            ...user,
            id: user.xmppUsername,
            name: user.firstName + ' ' + user.lastName,
          },
          date: optimisticDate,
          messageTimestampMs: optimisticTimestamp,
          body: message.body,
          roomJid: activeRoomJID,
          xmppFrom: `${activeRoomJID}/${user.xmppUsername}`,
          isReply: message.isReply || false,
          showInChannel: (message.showInChannel as any) || ('false' as any),
          mainMessage: message.mainMessage || '',
        })
      );
    }
  } else {
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
          date: optimisticDate,
          messageTimestampMs: optimisticTimestamp,
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
  }

  const useTranslate = !!(
    options.respectTranslateConfig && config?.translates?.enabled
  );

  // Armed BEFORE the send, not after it. `sendMessage` resolves only once
  // the outbound queue actually processes the entry, and while the socket
  // is down that never happens - which is precisely the "stuck on sending
  // forever" case this whole feature exists to end. Arming first means the
  // watchdog runs on wall-clock time from the moment the bubble goes back
  // to sending, whether or not the send promise ever settles.
  if (reuseId) {
    armSendFailureWatchdog({
      roomJID: activeRoomJID,
      messageId: id,
      body: message.body,
    });
  }

  try {
    const sent = useTranslate
      ? client.sendTextMessageWithTranslateTagStanza(
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
        )
      : client.sendMessage(
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

    if (reuseId) {
      // Release the single-writer slot as soon as this attempt is off our
      // hands. Not awaited on purpose - see the arming comment above; the
      // watchdog releases it too, so a promise that never settles cannot
      // wedge the retry control shut.
      Promise.resolve(sent)
        .catch(() => undefined)
        .finally(() => endSendRetry(id));
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
    if (reuseId) {
      // A synchronous throw means nothing was handed to the queue at all,
      // so nothing will ever settle the promise above.
      endSendRetry(id);
    }
  }

  return id;
}

export default resendMessage;
