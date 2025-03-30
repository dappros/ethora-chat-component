import { useEffect, useState } from 'react';
import { setConfig, setUser } from '../roomStore/chatSettingsSlice';
import { refresh, setBaseURL } from '../networking/apiClient';
import { initRoomsPresence } from '../helpers/initRoomsPresence';
import { updatedChatLastTimestamps } from '../helpers/updatedChatLastTimestamps';
import { updateMessagesTillLast } from '../helpers/updateMessagesTillLast';
import { setIsLoading, addRoomViaApi, updateUsersSet } from '../roomStore/roomsSlice';
import { useDispatch, useSelector } from 'react-redux';
import { useRoomState } from './useRoomState';
import { RootState } from '../roomStore';
import { IConfig, User } from '../types/types';
import { useXmppClient } from '../context/xmppProvider';
import { getRooms } from '../networking/api-requests/rooms.api';
import { createRoomFromApi } from '../helpers/createRoomFromApi';

interface UseInitXmmpClientProps {
  config: IConfig;
  setShowModal?: (modal: boolean) => void;
  setInited?: (init: boolean) => void;
}

export const useInitXmmpClient = ({
                                    config,
                                    setShowModal,
                                    setInited,
                                  }: UseInitXmmpClientProps) => {
  const dispatch = useDispatch();
  const [user, setInitUser] = useState<User>();
  const { client, initializeClient, setClient } = useXmppClient();
  const { roomsList } = useRoomState();
  const { rooms } = useSelector((state: RootState) => state.rooms);

  const initXmmpClient = async () => {
    dispatch(setConfig(config));

    try {
      if (!user?.xmppUsername && !user?.defaultWallet?.walletAddress) {
        setShowModal?.(true);
        console.log('Error, no user');
        return;
      }

      setShowModal?.(false);

      const identifier = user?.xmppUsername || user?.defaultWallet?.walletAddress;
      const password = user?.xmppPassword;

      if (!client) {
        console.log('No client, so initing one');

        const newClient = await initializeClient(
          identifier,
          password,
          config?.xmppSettings
        ).then((client) => {
          setInited?.(true);
          return client;
        });

        if (roomsList && Object.keys(roomsList).length > 0) {
          await initRoomsPresence(newClient, roomsList);
        } else {
          if (config?.newArch) {
            const rooms = await getRooms();
            rooms.items.forEach((room) => {
              dispatch(
                addRoomViaApi({
                  room: createRoomFromApi(room, config?.xmppSettings?.conference),
                  xmpp: newClient,
                })
              );
            });
            dispatch(updateUsersSet({ rooms: rooms.items }));
          } else {
            await newClient.getRoomsStanza();
          }
        }

        await newClient.getChatsPrivateStoreRequestStanza().then(
          async (roomTimestampObject: [jid: string, timestamp: string]) => {
            updatedChatLastTimestamps(roomTimestampObject, dispatch);
            await updateMessagesTillLast(rooms, newClient);
            setClient(newClient);
          }
        );

        if (config?.refreshTokens?.enabled) refresh();
      } else {
        setInited?.(true);

        await client
          .getChatsPrivateStoreRequestStanza()
          .then(async (roomTimestampObject: [jid: string, timestamp: string]) => {
            updatedChatLastTimestamps(roomTimestampObject, dispatch);
            await updateMessagesTillLast(rooms, client);
            setClient(client);
          });

        if (config?.refreshTokens?.enabled) refresh();
      }

      dispatch(setIsLoading({ loading: false }));
    } catch (error) {
      setShowModal?.(true);
      setInited?.(false);
      dispatch(setIsLoading({ loading: false }));
      console.error('initXmmpClient error:', error);
    }
  };

  useEffect(() => {
    if (config?.baseUrl) setBaseURL(config?.baseUrl);

    if (config?.userLogin?.enabled && config?.userLogin?.user) {
      setInitUser(config.userLogin.user);
      dispatch(setUser(config.userLogin.user));
    }
  }, [config?.userLogin?.enabled, config?.userLogin?.user, config?.baseUrl]);

  return {
    initXmmpClient,
  };
};
