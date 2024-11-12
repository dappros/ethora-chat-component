import { getChatsPrivateStoreRequest } from './getChatsPrivateStoreRequest.xmpp';
import { setChatsPrivateStoreRequest } from './setChatsPrivateStoreRequest.xmpp';

export async function actionSetTimestampToPrivateStore(
  client: any,
  chatId: string,
  timestamp: number
) {
  let storeObj: any = await getChatsPrivateStoreRequest(client);

  if (storeObj && typeof storeObj === 'object') {
    storeObj[chatId] = timestamp;

    const str = JSON.stringify(storeObj);
    await setChatsPrivateStoreRequest(client, str);
    return true;
  } else {
    await setChatsPrivateStoreRequest(
      client,
      JSON.stringify({ [chatId]: timestamp })
    );
    return true;
  }
}
