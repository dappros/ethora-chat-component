import React from 'react';
import { setConfig } from '../roomStore/chatSettingsSlice.ts';
import { refresh, setBaseURL } from '../networking/apiClient.ts';
import { initRoomsPresence } from '../helpers/initRoomsPresence.ts';
import { updatedChatLastTimestamps } from '../helpers/updatedChatLastTimestamps.ts';
import { updateMessagesTillLast } from '../helpers/updateMessagesTillLast.tsx';
import { setIsLoading } from '../roomStore/roomsSlice.ts';
import { useDispatch, useSelector } from 'react-redux';
import { useChatSettingState } from './useChatSettingState.tsx';
import { useXmppClient } from '../context/xmppProvider.tsx';
import { useRoomState } from './useRoomState.tsx';
import { RootState } from '../roomStore';
import { IConfig } from '../types/types.ts';

interface UseInitXmmpClientProps {
  config: IConfig,
  setShowModal?: (modal: boolean) => void,
  setInited?: (init: boolean) => void,
}

export const useInitXmmpClient = ({
                                    config,
                                    setShowModal,
                                    setInited
                                  }: UseInitXmmpClientProps) => {
  const dispatch = useDispatch();
  const { user } = useChatSettingState();
  const { client, initializeClient, setClient } = useXmppClient();
  const { roomsList } = useRoomState();

  const { rooms } = useSelector(
    (state: RootState) => state.rooms
  );

  const initXmmpClient = async () => {
    dispatch(setConfig(config));
    setBaseURL(config?.baseUrl);
    try {
      if (!user.defaultWallet || user?.defaultWallet.walletAddress === '') {
        setShowModal && setShowModal(true);
        console.log('Error, no user');
      } else {
        if (!client) {
          setShowModal && setShowModal(false);

          console.log('No client, so initing one');
          const newClient = await initializeClient(
            user?.defaultWallet?.walletAddress,
            user?.xmppPassword,
            config?.xmppSettings
          ).then((client) => {
            setInited && setInited(true);
            return client;
          });

          if (roomsList && Object.keys(roomsList).length > 0) {
            await initRoomsPresence(newClient, roomsList);
          } else {
            await newClient.getRoomsStanza();
          }
          await newClient
            .getChatsPrivateStoreRequestStanza()
            .then(
              async (
                roomTimestampObject: [jid: string, timestamp: string]
              ) => {
                updatedChatLastTimestamps(roomTimestampObject, dispatch);
                // newClient.setVCardStanza(
                //   `${user.firstName} ${user.lastName}`
                // );
                await updateMessagesTillLast(rooms, newClient);
                setClient(newClient);
              }
            );

          {
            config?.refreshTokens?.enabled && refresh();
          }
        } else {
          setInited && setInited(true);
          await client
            .getChatsPrivateStoreRequestStanza()
            .then(
              async (
                roomTimestampObject: [jid: string, timestamp: string]
              ) => {
                updatedChatLastTimestamps(roomTimestampObject, dispatch);
                await updateMessagesTillLast(rooms, client);
                setClient(client);
              }
            );
          {
            config?.refreshTokens?.enabled && refresh();
          }
        }
      }
      dispatch(setIsLoading({ loading: false }));
    } catch (error) {
      setShowModal && setShowModal(true);
      setInited && setInited(false);
      dispatch(setIsLoading({ loading: false }));
      console.log(error);
    }
  };

  return {
    initXmmpClient,
  };
};
