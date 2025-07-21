import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { IConfig } from '../types/types';
import XmppClient from '../networking/xmppClient';
import { AppDispatch } from '../roomStore';
import { useXmppClient } from '../context/xmppProvider';
import { updatedChatLastTimestamps } from '../helpers/updatedChatLastTimestamps';
import { refresh } from '../networking/apiClient';
import { setLangSource, setConfig } from '../roomStore/chatSettingsSlice';
import { setCurrentRoom, setIsLoading } from '../roomStore/roomsSlice';
import { useChatSettingState } from './useChatSettingState';
import { isChatIdPresentInArray } from '../helpers/isChatIdPresentInArray';
import useGetNewArchRoom from './useGetNewArchRoom';
import { chatAutoEnterer } from '../helpers/chatAutoEntererAssistant';

interface useChatWrapperInitAssistantProps {
  roomJID: string | null | undefined;
  config: IConfig;
}

interface useChatWrapperInitAssistantResult {
  inited: boolean;
  isRetrying: boolean | 'norooms';
  showModal: boolean;
  setInited: React.Dispatch<React.SetStateAction<boolean>>;
  setShowModal: React.Dispatch<React.SetStateAction<boolean>>;
  client: XmppClient | null;
  setClient: React.Dispatch<React.SetStateAction<XmppClient | null>>;
}

const useChatWrapperInitAssistant = ({
  roomJID,
  config,
}: useChatWrapperInitAssistantProps): useChatWrapperInitAssistantResult => {
  const dispatch = useDispatch<AppDispatch>();
  const [inited, setInited] = useState<boolean>(false);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [isRetrying, setIsRetrying] = useState<boolean | 'norooms'>(false);

  const { client, initializeClient, setClient } = useXmppClient();

  const { user } = config.assistantMode;

  useEffect(() => {
    return () => {
      if (client && user.xmppPassword === '') {
        console.log('closing client');
        client.close();
        setClient(null);
      }
    };
  }, [user.xmppPassword]);

  const loadRooms = async (
    client: XmppClient,
    disableLoad: boolean = false
  ) => {
    !disableLoad &&
      dispatch(
        setIsLoading({ loading: true, loadingText: 'Loading rooms...' })
      );
    await client.getRoomsStanza();
    dispatch(setIsLoading({ loading: false, loadingText: undefined }));
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
          chatAutoEnterer({ roomJID, config, dispatch });
          console.log(!client, !!client);

          if (!client) {
            setInited(false);
            setShowModal(false);

            console.log('No client, so initing one');
            const newClient = await initializeClient(
              user.xmppUsername,
              user?.xmppPassword,
              config?.xmppSettings
            ).then((client) => {
              client.presenceInRoomStanza(roomJID);
              setInited(true);
              dispatch(setCurrentRoom({ roomJID: roomJID }));
              return client;
            });
          } else {
            setInited(true);
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
  }, [user.xmppPassword]);

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

export default useChatWrapperInitAssistant;
