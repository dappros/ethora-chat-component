import { useEffect, useRef, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { IConfig, Iso639_1Codes } from '../types/types';
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
  setChatUiVisible,
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
import { runHistoryPreloadScheduler } from '../helpers/historyPreloadScheduler';
import { toBaseLanguage } from '../helpers/toBaseLanguage';

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

// Legacy single-locale config (`translates.translations`) only seeds
// langSource when the host actually set it - previously inverted
// (`!config?.translates?.translations`), which meant this fired
// `setLangSource(undefined)` on every XMPP init merely because translates
// was enabled, wiping out whatever the reader had picked via the profile
// modal's language picker or a host's own readerLocale-driven dispatch.
export const resolveLegacyTranslatesLangSource = (
  translatesConfig?: IConfig['translates']
): Iso639_1Codes | undefined =>
  translatesConfig?.enabled && translatesConfig?.translations
    ? translatesConfig.translations
    : undefined;

// A host drives the reader's language from OUTSIDE the chat component by
// setting config.translates.readerLocale (e.g. from their own app's
// language switcher). Only ever resolves when it's actually set, so a host
// that leaves it unset never overrides whatever the reader picked for
// themselves via the in-chat picker (LanguageSelectorButton) - the same
// "absence must not clobber a real choice" rule as the legacy resolver
// above.
export const resolveExternalReaderLocaleLangSource = (
  readerLocale?: string
): Iso639_1Codes | undefined =>
  readerLocale ? toBaseLanguage(readerLocale) : undefined;

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
  const privateStoreBootstrappedClientsRef = useRef<Set<string>>(new Set());
  const catchupBootstrappedClientsRef = useRef<Set<string>>(new Set());
  const startupSummaryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const {
    client,
    initializeClient,
    setClient,
    providerBootstrapStatus,
    initMode,
  } = useXmppClient();
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
          'bg:stagedPreload:start',
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

  const waitForActiveRoomReady = async (
    timeoutMs = 6000
  ): Promise<boolean> => {
    const startedAt = Date.now();
    return new Promise<boolean>((resolve) => {
      const check = () => {
        const state = store.getState().rooms;
        const jid = state.activeRoomJID;
        const room = jid ? state.rooms?.[jid] : null;
        if (!jid || !room) {
          resolve(true);
          return;
        }
        const hasMessages = (room.messages?.length || 0) > 0;
        const preloadFinished =
          room.historyPreloadState === 'done' || room.historyPreloadState === 'error';
        if (!room.isLoading || hasMessages || preloadFinished) {
          resolve(true);
          return;
        }
        if (Date.now() - startedAt > timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(check, 120);
      };
      check();
    });
  };

  const runBackgroundTasks = (targetClient: XmppClient) => {
    const clientKey =
      targetClient.client?.jid?.toString() || targetClient.username || 'xmpp-client';

    // Presence-join readiness (all rooms) and history preload used to run
    // strictly sequentially: preload waited on the ENTIRE presence sweep
    // finishing (up to a 12s poll) before fetching a single message. MAM
    // history fetches don't actually require the room to be joined first
    // (getHistoryStanza never checks `joinedRooms`), so the two are
    // independent XMPP operations sharing one connection — no reason to
    // serialize them. Presence readiness now runs as its own fire-and-forget
    // branch; the private-store + history-preload branch below starts
    // immediately once the client is online.
    void (async () => {
      const online = await waitForClientOnline(targetClient);
      if (!online) return;

      await waitForPresencesReady(targetClient);

      if (roomsList && Object.keys(roomsList).length > 0) {
        if (!presenceBootstrappedClientsRef.current.has(clientKey)) {
          presenceBootstrappedClientsRef.current.add(clientKey);
          // Dedup: sendAllPresencesAndMarkReady (fired from xmppClient `online`
          // event) already joins every room from the persisted store and
          // populates `joinedRooms`. If that pass completed, skip the legacy
          // initRoomsPresence sweep — it would re-iterate the same JIDs and
          // (for already-joined rooms) just no-op via the joinedRooms guard,
          // but still adds an N*35ms serial walk and listener churn.
          // Rooms that failed in the all-presences pass will be retried
          // lazily when the user opens them (presenceInRoomStanza in
          // useRoomInitialization) or by the existing roomPresenceBlockedUntil
          // backoff path.
          if (targetClient.presencesReady) {
            ethoraLogger.log(
              '[InitTiming] bg:initRoomsPresence:skipped reason=presences_already_sent'
            );
          } else {
            mark('bg:initRoomsPresence:start');
            try {
              await initRoomsPresence(targetClient, roomsList);
              logDuration('bg:initRoomsPresence', 'bg:initRoomsPresence:start');
            } catch (error) {
              console.warn('[InitTiming] bg:initRoomsPresence:error', error);
            }
          }
        }
      }
    })();

    void (async () => {
      const online = await waitForClientOnline(targetClient);
      if (!online) return;

      if (!privateStoreBootstrappedClientsRef.current.has(clientKey)) {
        if (!config?.disableLastRead) {
          privateStoreBootstrappedClientsRef.current.add(clientKey);
          mark('bg:getChatsPrivateStore:start');
          try {
            const roomTimestampObject = await targetClient.getChatsPrivateStoreRequestStanza();
            updatedChatLastTimestamps(
              roomTimestampObject as Record<string, string | number>,
              dispatch
            );
            logDuration('bg:getChatsPrivateStore', 'bg:getChatsPrivateStore:start');
          } catch (error) {
            privateStoreBootstrappedClientsRef.current.delete(clientKey);
            console.warn('[InitTiming] bg:getChatsPrivateStore:error', error);
          }
        } else {
          privateStoreBootstrappedClientsRef.current.add(clientKey);
        }
      }

      if (hasSyncedHistoryRef.current) return;
      if (catchupBootstrappedClientsRef.current.has(clientKey)) return;
      catchupBootstrappedClientsRef.current.add(clientKey);
      const stagedPreloadEnabled = Boolean(
        config?.historyQoS?.stagedPreloadEnabled
      );

      const stagedFirstPassSize = Math.max(
        1,
        Number(config?.historyQoS?.stagedPreloadFirstPassSize || 1)
      );
      const stagedSecondPassSize = Math.max(
        1,
        Number(config?.historyQoS?.stagedPreloadSecondPassSize || 15)
      );
      const stagedConcurrency = Math.max(
        1,
        Number(config?.historyQoS?.stagedPreloadConcurrency || 3)
      );
      const preloadTopKRooms = Math.max(
        1,
        Number(config?.historyQoS?.preloadTopKRooms || 20)
      );

      mark(
        stagedPreloadEnabled
          ? 'bg:stagedPreload:start'
          : 'bg:updateMessagesTillLast:start'
      );
      try {
        await waitForActiveRoomReady();

        if (stagedPreloadEnabled) {
          const defaultRoomJids = (config?.defaultRooms || []).map(
            (room) => room.jid
          );
          const hasActiveRoom = Boolean(store.getState().rooms.activeRoomJID);
          const firstPassConcurrency = hasActiveRoom ? 1 : stagedConcurrency;

          await runHistoryPreloadScheduler({
            client: targetClient,
            concurrency: firstPassConcurrency,
            pageSize: stagedFirstPassSize,
            retryLimit: 2,
            roomLimit: preloadTopKRooms,
            selectedRoomJid: store.getState().rooms.activeRoomJID || null,
            defaultRoomJids,
          });

          await runHistoryPreloadScheduler({
            client: targetClient,
            concurrency: stagedConcurrency,
            pageSize: stagedSecondPassSize,
            retryLimit: 2,
            selectedRoomJid: store.getState().rooms.activeRoomJID || null,
            defaultRoomJids,
          });
        } else {
          // Keep legacy catch-up path for cached rooms.
          const latestRooms = store.getState().rooms.rooms || {};
          const catchupBatchSize = store.getState().rooms.activeRoomJID ? 1 : 2;
          await updateMessagesTillLast(latestRooms, targetClient, catchupBatchSize);
        }

        hasSyncedHistoryRef.current = true;
        if (stagedPreloadEnabled) {
          logDuration('bg:stagedPreload', 'bg:stagedPreload:start');
        } else {
          logDuration('bg:updateMessagesTillLast', 'bg:updateMessagesTillLast:start');
        }
      } catch (error) {
        catchupBootstrappedClientsRef.current.delete(clientKey);
        console.warn(
          stagedPreloadEnabled
            ? '[InitTiming] bg:stagedPreload:error'
            : '[InitTiming] bg:updateMessagesTillLast:error',
          error
        );
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
    privateStoreBootstrappedClientsRef.current.clear();
    catchupBootstrappedClientsRef.current.clear();

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
        setIsLoading({ loading: true, loadingText: 'Loading chats...' })
      );
    mark('loadRooms:start');
    const rooms = await syncRooms(client, config);
    logDuration('loadRooms', 'loadRooms:start');
    await client.sendAllPresencesAndMarkReady();
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

    // Consumer-provided roomJID prop is authoritative — covers the
    // "patient switcher" case where a single mounted <Chat roomJID={x} />
    // swaps room without unmount/remount. Without this, a prop change is
    // silently ignored because the activeRoomJID early-return below wins
    // (since previous active room is still in the loaded list). The
    // existing useEffect that calls ensureActiveRoomSelected has roomJID
    // in its dep chain via this callback, so a prop swap re-fires this
    // function and the dispatch propagates.
    const preferredFromProp = roomJID || null;
    if (preferredFromProp && available.includes(preferredFromProp)) {
      if (activeRoomJID !== preferredFromProp) {
        dispatch(setCurrentRoom({ roomJID: preferredFromProp }));
      }
      return;
    }

    if (activeRoomJID && available.includes(activeRoomJID)) {
      return;
    }
  }, [activeRoomJID, dispatch, resolveRoomJid, roomJID]);

  // Lets a host drive the reader's language from OUTSIDE the chat
  // component: set config.translates.readerLocale from your own app (e.g.
  // your own language switcher) and this syncs it into the same
  // `langSource` the in-chat picker (LanguageSelectorButton) writes to -
  // driving both what the reader sees translated into (Message.tsx reads
  // readerLocale directly anyway) and the source language this reader
  // declares on their own outgoing messages (useSendMessage/xmppClient
  // read langSource, not readerLocale).
  //
  // Deliberately independent of the XMPP-init effect below (which only
  // runs the legacy `translates.translations` seed once per connect) -
  // this needs to re-fire on every readerLocale change even mid-session,
  // not just at connect time. And it only ever dispatches when readerLocale
  // is actually set, so a host that leaves it unset never overrides
  // whatever the reader picked for themselves via the in-chat picker.
  useEffect(() => {
    const resolved = resolveExternalReaderLocaleLangSource(
      config?.translates?.readerLocale
    );
    if (resolved) dispatch(setLangSource(resolved));
  }, [config?.translates?.readerLocale, dispatch]);

  useEffect(() => {
    let retryTimeout: NodeJS.Timeout;

    const initXmmpClient = async () => {
      const legacyLangSource = resolveLegacyTranslatesLangSource(config?.translates);
      if (legacyLangSource) {
        dispatch(setLangSource(legacyLangSource));
      }
      try {
        if (!user.xmppUsername) {
          setShowModal(false);
          dispatch(setIsLoading({ loading: false, loadingText: undefined }));
          ethoraLogger.log('No user yet, waiting for login');
          return;
        } else {
          chatAutoEnterer({ roomJID, wasAutoSelected, config, dispatch });
          if (!client) {
            if (
              config?.initBeforeLoad &&
              initMode === 'provider' &&
              providerBootstrapStatus !== 'idle'
            ) {
              if (providerBootstrapStatus === 'failed') {
                dispatch(setIsLoading({ loading: false, loadingText: undefined }));
                setConnectionLost(true);
                setInited(false);
                ethoraLogger.log(
                  '[InitPolicy] initBeforeLoad=true and provider bootstrap failed. ChatWrapper init is locked.'
                );
                retryTimeout = setTimeout(initXmmpClient, 2000);
                return;
              }

              dispatch(
                setIsLoading({ loading: true, loadingText: 'Connecting...' })
              );
              setConnectionLost(false);
              ethoraLogger.log(
                `[InitPolicy] initBeforeLoad=true, waiting provider client (status=${providerBootstrapStatus})`
              );
              retryTimeout = setTimeout(initXmmpClient, 400);
              return;
            }
            try {
              dispatch(
                setIsLoading({ loading: true, loadingText: 'Connecting...' })
              );
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
                  disableLastRead: Boolean(config?.disableLastRead),
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
                // Rooms came from redux-persist or a prior bootstrap.
                // Still refresh from /chats/my in the background so the
                // sidebar reflects the current server state — without it,
                // a re-login (or a multi-tenant App Switcher hop) keeps
                // showing stale rooms or, when the cache turned out
                // empty, never loads any rooms at all.
                if (config?.newArch !== false) {
                  void loadRooms(newClient, true).catch((error) => {
                    ethoraLogger.log('background loadRooms failed', error);
                  });
                }
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
              // Track the rooms set we just observed/loaded in THIS effect
              // run, not the `roomsList` closure (which is captured from
              // useSelector at effect-start and never updates mid-await).
              // The stale closure was the bug behind "Chat stuck on
              // Connecting..." until tab-switch: loadRooms had populated
              // the store, but the retry check still saw the empty
              // pre-load value and burnt up to 75s in getRoomsWithRetry.
              let currentRooms: any[] = [];
              if (!roomsList || Object.keys(roomsList).length === 0) {
                setInited(false);
                const loadedRooms = await loadRooms(client);
                ensureActiveRoomSelected(loadedRooms as any);
                currentRooms = Array.isArray(loadedRooms) ? loadedRooms : [];
              } else {
                ensureActiveRoomSelected(Object.values(roomsList) as any);
                currentRooms = Object.values(roomsList);
                // Background-refresh rehydrated rooms — see comment in the
                // first-time init branch above.
                void loadRooms(client, true).catch((error) => {
                  ethoraLogger.log('background loadRooms failed', error);
                });
              }
              if (config?.enableRoomsRetry?.enabled) {
                const isSelectedRoomPresent = isChatIdPresentInArray(
                  roomJID,
                  currentRooms
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
  }, [
    user.xmppPassword,
    user.xmppUsername,
    client,
    config?.initBeforeLoad,
    initMode,
    providerBootstrapStatus,
  ]);

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

  useEffect(() => {
    dispatch(setChatUiVisible(true));
    return () => {
      dispatch(setChatUiVisible(false));
    };
  }, [dispatch]);

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
