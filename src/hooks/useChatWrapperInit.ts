import { useEffect, useRef, useState } from 'react';
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
  isConnectionLost: boolean;
}

const useChatWrapperInit = ({
  roomJID,
  wasAutoSelected,
  config,
}: useChatWrapperInitProps): useChatWrapperInitResult => {
  const dispatch = useDispatch<AppDispatch>();
  const [inited, setInited] = useState<boolean>(false);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [isConnectionLost, setConnectionLost] = useState<boolean>(false);
  const [isRetrying, setIsRetrying] = useState<boolean | 'norooms'>(false);
  const hasSyncedHistoryRef = useRef<boolean>(false);
  const presenceBootstrappedClientsRef = useRef<Set<string>>(new Set());
  const startupSummaryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { client, initializeClient, setClient } = useXmppClient();
  const syncRooms = useGetNewArchRoom();

  const rooms = useSelector((state: RootState) => state.rooms.rooms);
  const { roomsList } = useRoomState();
  const { user } = useChatSettingState();
  const timingsRef = useRef<{ [k: string]: number }>({});

  const mark = (label: string) => {
    timingsRef.current[label] = Date.now();
  };

  const logDuration = (label: string, startLabel: string) => {
    const start = timingsRef.current[startLabel];
    if (!start) return;
    const ms = Date.now() - start;
    console.log(`[InitTiming] ${label} ${ms}ms`);
  };

  const scheduleStartupSummary = () => {
    if (startupSummaryTimeoutRef.current) return;
    startupSummaryTimeoutRef.current = setTimeout(() => {
      const points = timingsRef.current;
      const report: Record<string, number> = {};
      [
        'xmpp:initClient:start',
        'initClient:create_instance:start',
        'initClient:wait_online:start',
        'online:send_presence:start',
        'online:all_room_presences:start',
        'bg:initRoomsPresence:start',
        'bg:getChatsPrivateStore:start',
        'bg:updateMessagesTillLast:start',
      ].forEach((key) => {
        if (points[key]) {
          report[key] = Date.now() - points[key];
        }
      });
      console.log('[InitTiming] startup_summary', report);
    }, 10000);
  };

  const runBackgroundTasks = (targetClient: XmppClient) => {
    const clientKey =
      targetClient.client?.jid?.toString() || targetClient.username || 'xmpp-client';

    setTimeout(() => {
      if (!(roomsList && Object.keys(roomsList).length > 0)) return;
      if (presenceBootstrappedClientsRef.current.has(clientKey)) return;
      presenceBootstrappedClientsRef.current.add(clientKey);

      mark('bg:initRoomsPresence:start');
      initRoomsPresence(targetClient, roomsList)
        .then(() => {
          logDuration('bg:initRoomsPresence', 'bg:initRoomsPresence:start');
        })
        .catch((error) => {
          console.warn('[InitTiming] bg:initRoomsPresence:error', error);
        });
    }, 0);

    setTimeout(() => {
      mark('bg:getChatsPrivateStore:start');
      targetClient
        .getChatsPrivateStoreRequestStanza()
        .then(async (roomTimestampObject: [jid: string, timestamp: string]) => {
          updatedChatLastTimestamps(roomTimestampObject, dispatch);
          logDuration('bg:getChatsPrivateStore', 'bg:getChatsPrivateStore:start');
        })
        .catch((error) => {
          console.warn('[InitTiming] bg:getChatsPrivateStore:error', error);
        });
    }, 0);

    setTimeout(() => {
      if (hasSyncedHistoryRef.current) return;
      mark('bg:updateMessagesTillLast:start');
      updateMessagesTillLast(rooms, targetClient)
        .then(() => {
          hasSyncedHistoryRef.current = true;
          logDuration('bg:updateMessagesTillLast', 'bg:updateMessagesTillLast:start');
        })
        .catch((error) => {
          console.warn('[InitTiming] bg:updateMessagesTillLast:error', error);
        });
    }, 0);
  };

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
    mark('loadRooms:start');
    const rooms = await syncRooms(client, config);
    logDuration('loadRooms', 'loadRooms:start');
    dispatch(setIsLoading({ loading: false, loadingText: undefined }));
    return rooms;
  };

  useEffect(() => {
    let retryTimeout: NodeJS.Timeout;

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
            try {
              setInited(false);
              setShowModal(false);

              console.log('No client, so initing one');
              mark('xmpp:initClient:start');
              mark('initClient:create_instance:start');
              mark('initClient:wait_online:start');
              const newClient = await initializeClient(
                user.xmppUsername || user?.defaultWallet?.walletAddress,
                user?.xmppPassword,
                config?.xmppSettings,
                roomsList
              ).then((client) => {
                return client;
              });
              logDuration('xmpp:initClient', 'xmpp:initClient:start');
              logDuration('initClient:create_instance', 'initClient:create_instance:start');
              logDuration('initClient:wait_online', 'initClient:wait_online:start');

              if (roomsList && Object.keys(roomsList).length > 0) {
                setInited(true);
              } else {
                if (config?.newArch) {
                  const loadedRooms = await loadRooms(newClient);
                  if (config?.enableRoomsRetry?.enabled) {
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
                  mark('xmpp:getRoomsStanza:start');
                  await newClient.getRoomsStanza();
                  logDuration('xmpp:getRoomsStanza', 'xmpp:getRoomsStanza:start');
                }
              }
              // Background tasks to avoid blocking UI
              setClient(newClient);
              setConnectionLost(false);
              dispatch(setIsLoading({ loading: false }));
              scheduleStartupSummary();

              runBackgroundTasks(newClient);

              {
                config?.refreshTokens?.enabled && refresh();
              }
            } catch (error) {
              console.log('err', error);
              setConnectionLost(true);
              retryTimeout = setTimeout(initXmmpClient, 5000);
            }
          } else {
            if (config?.newArch) {
              // const loadedRooms = await loadRooms(client, true);
              if (config?.enableRoomsRetry?.enabled) {
                const isSelectedRoomPresent = isChatIdPresentInArray(
                  roomJID,
                  roomsList
                );
                if (!isSelectedRoomPresent) {
                  await getRoomsWithRertyRequest();
                }
              }
            }
            setInited(true);
            setClient(client);
            setConnectionLost(false);
            dispatch(setIsLoading({ loading: false }));
            scheduleStartupSummary();

            runBackgroundTasks(client);
            {
              config?.refreshTokens?.enabled && refresh();
            }
          }
        }
        dispatch(setIsLoading({ loading: false }));
      } catch (error) {
        setShowModal(false);
        setConnectionLost(true);
        setInited(false);
        dispatch(setIsLoading({ loading: false }));
        console.log(error);
        retryTimeout = setTimeout(initXmmpClient, 5000);
      }
    };

    initXmmpClient();

    return () => {
      clearTimeout(retryTimeout);
      if (startupSummaryTimeoutRef.current) {
        clearTimeout(startupSummaryTimeoutRef.current);
        startupSummaryTimeoutRef.current = null;
      }
    };
  }, [user.xmppPassword, user.xmppUsername]);

  return {
    client,
    inited,
    isRetrying,
    showModal,
    isConnectionLost,
    setClient,
    setInited,
    setShowModal,
  };
};

export default useChatWrapperInit;
