import { useEffect, useRef, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { IConfig } from '../types/types';
import XmppClient from '../networking/xmppClient';
import { AppDispatch, RootState, persistor, store } from '../roomStore';
import { useXmppClient } from '../context/xmppProvider';
import { chatAutoEnterer } from '../helpers/chatAutoEnterer';
import { initRoomsPresence } from '../helpers/initRoomsPresence';
import { updatedChatLastTimestamps } from '../helpers/updatedChatLastTimestamps';
import { updateMessagesTillLast } from '../helpers/updateMessagesTillLast';
import { refresh } from '../networking/apiClient';
import { setLangSource, setConfig } from '../roomStore/chatSettingsSlice';
import {
  setCurrentRoom,
  setIsLoading,
  setLogoutState,
} from '../roomStore/roomsSlice';
import { useRoomState } from './useRoomState';
import { useChatSettingState } from './useChatSettingState';
import { isChatIdPresentInArray } from '../helpers/isChatIdPresentInArray';
import useGetNewArchRoom from './useGetNewArchRoom';
import { getRoomsWithRetry } from '../helpers/getRoomsWithRetry';
import { clearHeap } from '../roomStore/roomHeapSlice';
import { ensureScopedChatCache } from '../helpers/cacheScope';
import { ethoraLogger } from '../helpers/ethoraLogger';

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
  const { roomsList, activeRoomJID } = useRoomState();
  const { user } = useChatSettingState();
  const timingsRef = useRef<{ [k: string]: number }>({});
  const durationsRef = useRef<{ [k: string]: number }>({});

  const mark = (label: string) => {
    timingsRef.current[label] = Date.now();
  };

  const logDuration = (label: string, startLabel: string) => {
    const start = timingsRef.current[startLabel];
    if (!start) return;
    const ms = Date.now() - start;
    durationsRef.current[label] = ms;
    ethoraLogger.log(`[InitTiming] ${label} ${ms}ms`);
  };

  const scheduleStartupSummary = () => {
    if (startupSummaryTimeoutRef.current) return;
    startupSummaryTimeoutRef.current = setTimeout(() => {
      const points = timingsRef.current;
      const durations = durationsRef.current;
      const report: Record<string, number> = {};
      Object.keys(durations).forEach((key) => {
        report[key] = durations[key];
      });
      if (Object.keys(report).length === 0) {
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
      }
      ethoraLogger.log('[InitTiming] startup_summary', report);
    }, 10000);
  };

  const waitForClientOnline = async (
    targetClient: XmppClient,
    timeoutMs = 30000
  ): Promise<boolean> => {
    const startedAt = Date.now();
    return new Promise<boolean>((resolve) => {
      const check = () => {
        if (targetClient?.checkOnline?.()) {
          resolve(true);
          return;
        }
        if (Date.now() - startedAt > timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(check, 200);
      };
      check();
    });
  };

  const waitForPresencesReady = async (
    targetClient: XmppClient,
    timeoutMs = 12000
  ): Promise<boolean> => {
    const startedAt = Date.now();
    return new Promise<boolean>((resolve) => {
      const check = () => {
        if (targetClient.presencesReady) {
          resolve(true);
          return;
        }
        if (Date.now() - startedAt > timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(check, 150);
      };
      check();
    });
  };

  const runBackgroundTasks = (targetClient: XmppClient) => {
    const clientKey =
      targetClient.client?.jid?.toString() || targetClient.username || 'xmpp-client';

    void (async () => {
      const online = await waitForClientOnline(targetClient);
      if (!online) return;

      await waitForPresencesReady(targetClient);

      if (roomsList && Object.keys(roomsList).length > 0) {
        if (!presenceBootstrappedClientsRef.current.has(clientKey)) {
          presenceBootstrappedClientsRef.current.add(clientKey);
          mark('bg:initRoomsPresence:start');
          try {
            await initRoomsPresence(targetClient, roomsList);
            logDuration('bg:initRoomsPresence', 'bg:initRoomsPresence:start');
          } catch (error) {
            console.warn('[InitTiming] bg:initRoomsPresence:error', error);
          }
        }
      }

      mark('bg:getChatsPrivateStore:start');
      try {
        const roomTimestampObject =
          await targetClient.getChatsPrivateStoreRequestStanza();
        updatedChatLastTimestamps(
          roomTimestampObject as Record<string, string | number>,
          dispatch
        );
        logDuration('bg:getChatsPrivateStore', 'bg:getChatsPrivateStore:start');
      } catch (error) {
        console.warn('[InitTiming] bg:getChatsPrivateStore:error', error);
      }

      if (hasSyncedHistoryRef.current) return;
      mark('bg:updateMessagesTillLast:start');
      try {
        const latestRooms = store.getState().rooms.rooms || {};
        await updateMessagesTillLast(latestRooms, targetClient);
        hasSyncedHistoryRef.current = true;
        logDuration('bg:updateMessagesTillLast', 'bg:updateMessagesTillLast:start');
      } catch (error) {
        console.warn('[InitTiming] bg:updateMessagesTillLast:error', error);
      }
    })();
  };

  useEffect(() => {
    return () => {
      if (client && user.xmppPassword === '') {
        ethoraLogger.log('closing client');
        client.close();
        setClient(null);
      }
    };
  }, [client, setClient, user.xmppPassword]);

  useEffect(() => {
    dispatch(setConfig(config));
    const { changed } = ensureScopedChatCache(config);
    if (!changed) {
      return;
    }

    hasSyncedHistoryRef.current = false;
    presenceBootstrappedClientsRef.current.clear();

    dispatch(setLogoutState());
    dispatch(clearHeap());
    dispatch(setCurrentRoom({ roomJID: null }));

    void persistor.pause();
    void persistor
      .purge()
      .catch((error) => {
        console.warn('[CacheScope] Persist purge failed', error);
      })
      .finally(() => {
        void persistor.persist();
      });
  }, [config, dispatch]);

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

  const resolveRoomJid = useCallback((room?: { jid?: string; name?: string }) => {
    if (!room) return '';
    if (room.jid) return room.jid;
    const conference = config?.xmppSettings?.conference || '';
    return room.name && conference ? `${room.name}@${conference}` : '';
  }, [config?.xmppSettings?.conference]);

  const ensureActiveRoomSelected = useCallback((loadedRooms?: Array<{ jid?: string; name?: string }>) => {
    const available = (loadedRooms || []).map(resolveRoomJid).filter(Boolean);
    if (available.length === 0) return;

    if (activeRoomJID && available.includes(activeRoomJID)) {
      return;
    }

    const preferredFromProp = roomJID || null;
    const nextRoom =
      preferredFromProp && available.includes(preferredFromProp)
        ? preferredFromProp
        : null;

    if (nextRoom) {
      dispatch(setCurrentRoom({ roomJID: nextRoom }));
    }
  }, [activeRoomJID, dispatch, resolveRoomJid, roomJID]);

  useEffect(() => {
    let retryTimeout: NodeJS.Timeout;

    const initXmmpClient = async () => {
      if (config?.translates?.enabled && !config?.translates?.translations) {
        dispatch(setLangSource(config?.translates?.translations));
      }
      try {
        if (!user.xmppUsername) {
          setShowModal(true);
          ethoraLogger.log('Error, no user');
        } else {
          chatAutoEnterer({ roomJID, wasAutoSelected, config, dispatch });
          if (!client) {
            if (config?.initBeforeLoad) {
              dispatch(
                setIsLoading({ loading: true, loadingText: 'Connecting...' })
              );
              ethoraLogger.log(
                '[InitPolicy] initBeforeLoad=true, skip ChatWrapper init and wait for XmppProvider client'
              );
              retryTimeout = setTimeout(initXmmpClient, 500);
              return;
            }
            try {
              setInited(false);
              setShowModal(false);
              dispatch(
                setIsLoading({ loading: true, loadingText: 'Connecting...' })
              );

              ethoraLogger.log('No client, so initing one');
              mark('xmpp:initClient:start');
              mark('initClient:create_instance:start');
              mark('initClient:wait_online:start');
              const newClient = await initializeClient(
                user.xmppUsername || user?.defaultWallet?.walletAddress,
                user?.xmppPassword,
                {
                  ...(config?.xmppSettings || {}),
                  historyQoS: config?.historyQoS,
                },
                roomsList
              ).then((client) => {
                return client;
              });
              logDuration('xmpp:initClient', 'xmpp:initClient:start');
              logDuration('initClient:create_instance', 'initClient:create_instance:start');

              if (roomsList && Object.keys(roomsList).length > 0) {
                setInited(true);
              } else {
                if (config?.newArch === false) {
                  mark('xmpp:getRoomsStanza:start');
                  await newClient.getRoomsStanza();
                  logDuration('xmpp:getRoomsStanza', 'xmpp:getRoomsStanza:start');
                } else {
                  const loadedRooms = await loadRooms(newClient);
                  ensureActiveRoomSelected(loadedRooms as any);
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
              ethoraLogger.log('err', error);
              setConnectionLost(true);
              retryTimeout = setTimeout(initXmmpClient, 5000);
            }
          } else {
            if (config?.newArch !== false) {
              // const loadedRooms = await loadRooms(client, true);
              ensureActiveRoomSelected(Object.values(roomsList) as any);
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
        ethoraLogger.log(error);
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
  }, [user.xmppPassword, user.xmppUsername, client, config?.initBeforeLoad]);

  useEffect(() => {
    if (!client) return;
    if (!timingsRef.current['initClient:wait_online:start']) return;
    if (client.status === 'online') {
      logDuration('initClient:wait_online', 'initClient:wait_online:start');
    }
  }, [client?.status]);

  useEffect(() => {
    ensureActiveRoomSelected(Object.values(roomsList) as any);
  }, [roomsList, activeRoomJID, ensureActiveRoomSelected]);

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
