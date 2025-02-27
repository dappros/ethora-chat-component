import { getChatsPrivateStoreRequest } from './getChatsPrivateStoreRequest.xmpp';
import { setChatsPrivateStoreRequest } from './setChatsPrivateStoreRequest.xmpp';

const populateChats = (chats: string[], timestamp: string): string => {
  const populatedData = chats.reduce(
    (acc, chat) => {
      acc[chat] = timestamp;
      return acc;
    },
    {} as Record<string, string>
  );

  return JSON.stringify(populatedData);
};

export async function actionSetTimestampToPrivateStore(
  client: any,
  chatId: string,
  timestamp: number,
  chats?: string[]
) {
  let storeObj: any = await getChatsPrivateStoreRequest(client);

  if (storeObj && typeof storeObj === 'object') {
    storeObj[chatId] = timestamp;

    console.log(storeObj);

    const str = JSON.stringify(storeObj);
    await setChatsPrivateStoreRequest(client, str);
    return true;
  } else {
    console.log(storeObj);

    await setChatsPrivateStoreRequest(
      client,
      populateChats(chats, timestamp.toString())
    );
    return true;
  }
}
