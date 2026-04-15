import { getChatsPrivateStoreRequest } from './getChatsPrivateStoreRequest.xmpp';
import { setChatsPrivateStoreRequest } from './setChatsPrivateStoreRequest.xmpp';

export async function actionSetTimestampToPrivateStore(
  client: any,
  chatId: string,
  timestamp: number,
  chats?: string[]
) {
  if (!chatId) return false;

  let storeObj: any = await getChatsPrivateStoreRequest(client);
  const ts = String(timestamp);

  if (storeObj && typeof storeObj === 'object') {
    storeObj[chatId] = ts;

    const str = JSON.stringify(storeObj);
    await setChatsPrivateStoreRequest(client, str);
    return true;
  } else {
    const bootstrapPayload: Record<string, string> = { [chatId]: ts };
    if (Array.isArray(chats)) {
      chats.forEach((jid) => {
        if (!jid || jid === chatId || bootstrapPayload[jid]) return;
        bootstrapPayload[jid] = '0';
      });
    }

    await setChatsPrivateStoreRequest(client, JSON.stringify(bootstrapPayload));
    return true;
  }
}
