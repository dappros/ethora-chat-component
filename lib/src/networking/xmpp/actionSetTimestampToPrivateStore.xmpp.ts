import { getChatsPrivateStoreRequest } from './getChatsPrivateStoreRequest.xmpp';

export async function actionSetTimestampToPrivateStore(
  client: any,
  chatId: string,
  timestamp: number
) {
  let storeObj: any = await getChatsPrivateStoreRequest(client);

  if (storeObj && typeof storeObj === 'object') {
    storeObj[chatId] = timestamp;

    const str = JSON.stringify(storeObj);
    await client.setChatsPrivateStoreRequestStanza(str);
    return true;
  } else {
    await client.setChatsPrivateStoreRequestStanza(
      JSON.stringify({ [chatId]: timestamp })
    );
    return true;
  }
}
