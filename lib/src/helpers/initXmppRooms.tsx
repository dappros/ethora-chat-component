import { setCurrentRoom, setIsLoading } from '../roomStore/roomsSlice';
import { updatedChatLastTimestamps } from './updatedChatLastTimestamps';
import { initRoomsPresence } from './initRoomsPresence';
import { updateMessagesTillLast } from './updateMessagesTillLast';
import XmppClient from '../networking/xmppClient';
import { IConfig, User } from '../types/types';
import { store } from '../roomStore';

const initXmppRooms = async (
  user: User,
  config: IConfig,
  xmmpClient: XmppClient,
  roomJID?: string
) => {
  const roomsList = store.getState().rooms.rooms;

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

      if (roomsList && Object.keys(roomsList).length > 0) {
        await initRoomsPresence(xmmpClient, roomsList);
      } else {
        await xmmpClient.getRoomsStanza();
      }

      //@ts-ignore
      const roomTimestampObject: [jid: string, timestamp: string] =
        await xmmpClient.getChatsPrivateStoreRequestStanza();
      updatedChatLastTimestamps(roomTimestampObject, store.dispatch);
      await updateMessagesTillLast(roomsList, xmmpClient);
    } else {
      //@ts-ignore
      const roomTimestampObject: [jid: string, timestamp: string] =
        await xmmpClient.getChatsPrivateStoreRequestStanza();
      updatedChatLastTimestamps(roomTimestampObject, store.dispatch);
      await updateMessagesTillLast(roomsList, xmmpClient);
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
