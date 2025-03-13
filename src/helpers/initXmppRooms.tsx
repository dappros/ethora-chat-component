import { setCurrentRoom, setIsLoading } from '../roomStore/roomsSlice';
import { updatedChatLastTimestamps } from './updatedChatLastTimestamps';
import { initRoomsPresence } from './initRoomsPresence';
import { updateMessagesTillLast } from './updateMessagesTillLast';
import XmppClient from '../networking/xmppClient';
import { IConfig, IRoom, User } from '../types/types';
import { store } from '../roomStore';

const initXmppRooms = async (
  user: User,
  config: IConfig,
  xmmpClient: XmppClient,
  rooms?: { [key: string]: IRoom },
  roomJID?: string
) => {
  if (roomJID) {
    store.dispatch(setCurrentRoom({ roomJID: roomJID }));
  }

  try {
    if (!user.defaultWallet || !user.defaultWallet.walletAddress) {
      console.log('Error, no user');
      return;
    }

    if (!xmmpClient) {
      console.log('No xmmpClient, initializing one');

      if (rooms && Object.keys(rooms).length > 0) {
        await initRoomsPresence(xmmpClient, rooms);
      } else {
        const res = await xmmpClient.getRoomsStanza();
        console.log(res);
      }

      //@ts-ignore
      const roomTimestampObject: [jid: string, timestamp: string] =
        await xmmpClient.getChatsPrivateStoreRequestStanza();
      updatedChatLastTimestamps(roomTimestampObject, store.dispatch);
      await updateMessagesTillLast(rooms, xmmpClient);
    } else {
      //@ts-ignore
      const roomTimestampObject: [jid: string, timestamp: string] =
        await xmmpClient.getChatsPrivateStoreRequestStanza();
      updatedChatLastTimestamps(roomTimestampObject, store.dispatch);
      await updateMessagesTillLast(rooms, xmmpClient);
    }

    if (config?.refreshTokens?.enabled) {
      config?.refreshTokens?.refreshFunction();
    }
  } catch (error) {
    console.error(error);
  } finally {
    store.dispatch(setIsLoading({ loading: false }));
  }
};

export default initXmppRooms;
