import { ApiRoom } from '../types/types';

export function isChatIdPresentInArray(
  chatIdToFind: string,
  chatList: ApiRoom[]
): boolean {
  if (!chatList || chatList.length === 0) {
    return false;
  }

  const trimmedId = chatIdToFind.split('@')[0].trim();

  console.log('trimmedId', trimmedId);

  for (const chatObject of chatList) {
    console.log('check', trimmedId === chatObject.name);

    if (
      chatObject &&
      typeof chatObject.name === 'string' &&
      chatObject.name === trimmedId
    ) {
      return true;
    }
  }
  return false;
}
