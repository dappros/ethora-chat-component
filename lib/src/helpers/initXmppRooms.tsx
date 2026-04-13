import { setCurrentRoom, setIsLoading } from '../roomStore/roomsSlice';
import { updatedChatLastTimestamps } from './updatedChatLastTimestamps';
import { initRoomsPresence } from './initRoomsPresence';
import XmppClient from '../networking/xmppClient';
import { IConfig, IRoom, User } from '../types/types';
import { store } from '../roomStore';
import { ethoraLogger } from './ethoraLogger';

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
      ethoraLogger.log('Error, no user');
      return;
    }

    if (!xmmpClient) {
      ethoraLogger.log('No xmmpClient, initializing one');

      if (rooms && Object.keys(rooms).length > 0) {
        await initRoomsPresence(xmmpClient, rooms);
      } else {
        if (config?.newArch !== false) {
          // const rooms = await getRooms();
          //     rooms.items.map((room) => {
          //       dispatch(
          //         addRoomViaApi({
          //           room: createRoomFromApi(
          //             room,
          //             config?.xmppSettings?.conference
          //           ),
          //           xmpp: newClient,
          //         })
          //       );
          //     });
          return;
        }
        const res = await xmmpClient.getRoomsStanza();
        ethoraLogger.log(res);
      }

      const roomTimestampObject =
        (await xmmpClient.getChatsPrivateStoreRequestStanza()) as
          | Record<string, string | number>
          | null
          | undefined;
      updatedChatLastTimestamps(roomTimestampObject, store.dispatch);
    } else {
      const roomTimestampObject =
        (await xmmpClient.getChatsPrivateStoreRequestStanza()) as
          | Record<string, string | number>
          | null
          | undefined;
      updatedChatLastTimestamps(roomTimestampObject, store.dispatch);
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
