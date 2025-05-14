import { ApiRoom } from '../types/types';
import { isChatIdPresentInArray } from './isChatIdPresentInArray';

export async function getRoomsWithRetry(
  client: any,
  config: any,
  syncRoomsFunction: (arg0: any, arg1: any) => any[] | PromiseLike<any[]>,
  activeChatJid?: string,
  maxRetries = 10,
  delayBetweenRetriesMs = 7500
): Promise<ApiRoom[] | null> {
  let attempts = 0;
  let rooms = [];

  while (attempts <= maxRetries) {
    try {
      rooms = await syncRoomsFunction(client, config);

      if (activeChatJid && Array.isArray(rooms)) {
        const isSelectedRoomPresent = isChatIdPresentInArray(
          activeChatJid,
          rooms
        );
        if (isSelectedRoomPresent) {
          return rooms;
        }
      } else if (Array.isArray(rooms) && rooms.length > 0) {
        return rooms;
      }
    } catch (error) {
      console.error(`Error during attempt ${attempts + 1}:`, error);
    }

    attempts++;
    if (attempts <= maxRetries) {
      await delay(delayBetweenRetriesMs);
    }
  }

  return null;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
