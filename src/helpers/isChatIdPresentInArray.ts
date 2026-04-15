import { ApiRoom, IRoom } from '../types/types';
import { ethoraLogger } from './ethoraLogger';

export function isChatIdPresentInArray(
  chatIdToFind: string,
  chatList: ApiRoom[] | { [jid: string]: IRoom }
): boolean {
  if (!chatList) {
    return false;
  }

  if (Array.isArray(chatList)) {
    if (chatList.length === 0) {
      return false;
    }
  } else {
    if (Object.keys(chatList).length === 0) {
      return false;
    }
  }

  const trimmedId = chatIdToFind.split('@')[0].trim();

  if (Array.isArray(chatList)) {
    for (const chatObject of chatList) {
      ethoraLogger.log('check', trimmedId === chatObject.name);

      if (
        chatObject &&
        typeof chatObject.name === 'string' &&
        chatObject.name === trimmedId
      ) {
        return true;
      }
    }
  } else {
    for (const jid in chatList) {
      const chatObject = chatList[jid];

      if (
        chatObject &&
        typeof chatObject.name === 'string' &&
        chatObject.name === trimmedId
      ) {
        return true;
      }
    }
  }

  return false;
}
