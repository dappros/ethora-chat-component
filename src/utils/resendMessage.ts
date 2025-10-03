import { requireXmppClient } from './clientRegistry';
import { store } from '../roomStore';
import { addRoomMessage } from '../roomStore/roomsSlice';
import { v4 as uuidv4 } from 'uuid';
import { IMessage } from '../types/types';

type ResendOptions = {
  respectTranslateConfig?: boolean;
};

export async function resendMessage(
  message: Pick<IMessage, 'body' | 'roomJid'> & {
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

  return id;
}

export default resendMessage;
