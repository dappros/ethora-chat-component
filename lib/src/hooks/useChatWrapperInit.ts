import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { IConfig } from '../types/types';
import XmppClient from '../networking/xmppClient';
import { AppDispatch, RootState } from '../roomStore';
import { useXmppClient } from '../context/xmppProvider';
import { chatAutoEnterer } from '../helpers/chatAutoEnterer';
import { initRoomsPresence } from '../helpers/initRoomsPresence';
import { updatedChatLastTimestamps } from '../helpers/updatedChatLastTimestamps';
import { updateMessagesTillLast } from '../helpers/updateMessagesTillLast';
import { refresh } from '../networking/apiClient';
import { setLangSource, setConfig } from '../roomStore/chatSettingsSlice';
import { setIsLoading } from '../roomStore/roomsSlice';
import { useRoomState } from './useRoomState';
import { useChatSettingState } from './useChatSettingState';
import { isChatIdPresentInArray } from '../helpers/isChatIdPresentInArray';
import useGetNewArchRoom from './useGetNewArchRoom';
import { getRoomsWithRetry } from '../helpers/getRoomsWithRetry';

interface useChatWrapperInitProps {
  roomJID: string | null | undefined;
  wasAutoSelected: boolean;
  config: IConfig;
}

interface useChatWrapperInitResult {
  inited: boolean;
  isRetrying: boolean | 'norooms';
  showModal: boolean;
  setInited: React.Dispatch<React.SetStateAction<boolean>>;
  setShowModal: React.Dispatch<React.SetStateAction<boolean>>;
  client: XmppClient | null;
  setClient: React.Dispatch<React.SetStateAction<XmppClient | null>>;
}

const useChatWrapperInit = ({
  roomJID,
  wasAutoSelected,
  config,
}: useChatWrapperInitProps): useChatWrapperInitResult => {
  const dispatch = useDispatch<AppDispatch>();
  const [inited, setInited] = useState<boolean>(false);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [isRetrying, setIsRetrying] = useState<boolean | 'norooms'>(false);

  const { client, initializeClient, setClient } = useXmppClient();
  const syncRooms = useGetNewArchRoom();

  const { rooms } = useSelector((state: RootState) => state.rooms);
  const { roomsList } = useRoomState();
  const { user } = useChatSettingState();

  useEffect(() => {
    return () => {
      if (client && user.xmppPassword === '') {
        console.log('closing client');
        client.close();
        setClient(null);
      }
    };
  }, [user.xmppPassword]);

  const getRoomsWithRertyRequest = async () => {
    setIsRetrying(true);
    const retryRooms = await getRoomsWithRetry(
      client,
      config,
      syncRooms,
      roomJID
    );
    if (!retryRooms) {
      setIsRetrying('norooms');
      return;
    }
    setIsRetrying(false);
  };

  const loadRooms = async (
    client: XmppClient,
    disableLoad: boolean = false
  ) => {
    !disableLoad &&
      dispatch(
        setIsLoading({ loading: true, loadingText: 'Loading rooms...' })
      );
    const rooms = await syncRooms(client, config);
    dispatch(setIsLoading({ loading: false, loadingText: undefined }));
    return rooms;
  };

  useEffect(() => {
    const initXmmpClient = async () => {
      if (config?.translates?.enabled && !config?.translates?.translations) {
        dispatch(setLangSource(config?.translates?.translations));
      }
      dispatch(setConfig(config));
      try {
        if (!user.xmppUsername) {
          setShowModal(true);
          console.log('Error, no user');
        } else {
          chatAutoEnterer({ roomJID, wasAutoSelected, config, dispatch });

          if (!client) {
            setInited(false);
            setShowModal(false);

            console.log('No client, so initing one');
            const newClient = await initializeClient(
              user.xmppUsername || user?.defaultWallet?.walletAddress,
              user?.xmppPassword,
              config?.xmppSettings,
              roomsList
            ).then((client) => {
              return client;
            });

            if (roomsList && Object.keys(roomsList).length > 0) {
              setInited(true);
              await initRoomsPresence(newClient, roomsList);
            } else {
              if (config?.newArch) {
                const loadedRooms = await loadRooms(newClient);
                if (config?.enableRoomsRetry.enabled) {
                  const isSelectedRoomPresent = isChatIdPresentInArray(
                    roomJID,
                    loadedRooms
                  );
                  if (!isSelectedRoomPresent) {
                    await getRoomsWithRertyRequest();
                  }
                }
                setInited(true);
              } else {
                await newClient.getRoomsStanza();
              }
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
            if (config?.newArch) {
              const loadedRooms = await loadRooms(client, true);
              if (config?.enableRoomsRetry.enabled && loadedRooms?.length) {
                const isSelectedRoomPresent = isChatIdPresentInArray(
                  roomJID,
                  loadedRooms
                );
                if (!isSelectedRoomPresent) {
                  await getRoomsWithRertyRequest();
                }
              }
            }
            setInited(true);
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
        setShowModal(true);
        setInited(false);
        dispatch(setIsLoading({ loading: false }));
        console.log(error);
      }
    };

    initXmmpClient();
  }, [user.xmppPassword, user.defaultWallet?.walletAddress]);

  return {
    client,
    inited,
    isRetrying,
    showModal,
    setClient,
    setInited,
    setShowModal,
  };
};

export default useChatWrapperInit;
