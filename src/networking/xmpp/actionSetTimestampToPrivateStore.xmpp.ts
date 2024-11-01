import { Client } from '@xmpp/client';
import { getChatsPrivateStoreRequest } from './getChatsPrivateStoreRequest.xmpp';

export async function actionSetTimestampToPrivateStore(
  client: Client,
  chatId: string,
  timestamp: number
) {
  let storeObj: any = await getChatsPrivateStoreRequest(client);

  if (storeObj && typeof storeObj === 'object') {
    storeObj[chatId] = timestamp;

    const str = JSON.stringify(storeObj);
    await this.setChatsPrivateStoreRequestStanza(str);
    return true;
  } else {
    await this.setChatsPrivateStoreRequestStanza(
      JSON.stringify({ [chatId]: timestamp })
    );
    return true;
  }
}
