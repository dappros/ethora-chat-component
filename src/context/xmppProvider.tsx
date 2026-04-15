import React, {
  ReactNode,
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { Provider } from 'react-redux';
import XmppClient from '../networking/xmppClient';
import {
  buildXmppClientKey,
  getGlobalXmppClient,
  getGlobalXmppClientKey,
  getReusableXmppClientByKey,
  isXmppClientReusable,
  setGlobalXmppClient,
  withXmppClientInitLock,
} from '../utils/clientRegistry';
import { IConfig, IRoom, xmppSettingsInterface } from '../types/types';
import { getRooms } from '../networking/api-requests/rooms.api';
import { createRoomFromApi } from '../helpers/createRoomFromApi';
import { store } from '../roomStore';
import {
  addRoomViaApi,
  updateUsersSet,
} from '../roomStore/roomsSlice';
import { setConfig as setChatConfig } from '../roomStore/chatSettingsSlice';
import usePushNotifications from '../hooks/usePushNotifications';
import { updatedChatLastTimestamps } from '../helpers/updatedChatLastTimestamps';
import { runHistoryPreloadScheduler } from '../helpers/historyPreloadScheduler';
import {
  applyResolvedUserToStore,
  resolveInitBeforeLoadUser,
} from '../helpers/resolveInitBeforeLoadUser';
import { setBaseURL } from '../networking/apiClient';
import { ethoraLogger } from '../helpers/ethoraLogger';

// Declare XmppContext
interface XmppContextType {
  client: XmppClient | null;
  providerBootstrapStatus: 'idle' | 'running' | 'ready' | 'failed';
  initMode: 'provider' | 'chat';
  setClient: (client: XmppClient | null) => void;
  initializeClient: (
    username: string,
    password: string,
    xmppSettings?: xmppSettingsInterface,
    roomsList?: { [jid: string]: IRoom }
  ) => Promise<XmppClient>;
}

const XmppContext = createContext<XmppContextType | null>(null);

interface XmppProviderProps {
  children: ReactNode;
  config?: IConfig;
  pushNotifications?: IConfig['pushNotifications'];
}

const XmppProviderPushNotificationsEnabler: React.FC<{
  pushNotifications?: IConfig['pushNotifications'];
}> = ({ pushNotifications }) => {
  usePushNotifications({
    enabled: pushNotifications?.enabled,
    vapidPublicKey: pushNotifications?.vapidPublicKey,
    firebaseConfig: pushNotifications?.firebaseConfig,
    serviceWorkerPath: pushNotifications?.serviceWorkerPath,
    serviceWorkerScope: pushNotifications?.serviceWorkerScope,
    softAsk: pushNotifications?.softAsk,
    onClick: pushNotifications?.onClick,
  });

  return null;
};

export const XmppProvider: React.FC<XmppProviderProps> = ({
  children,
  config,
  pushNotifications,
}) => {
  const [client, setClient] = useState<XmppClient | null>(null);
  const [providerBootstrapStatus, setProviderBootstrapStatus] = useState<
    'idle' | 'running' | 'ready' | 'failed'
  >('idle');
  const [password, setPassword] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState<number>(0);
  const initializingRef = useRef<Promise<XmppClient> | null>(null);
  const initBeforeLoadPromiseRef = useRef<Promise<void> | null>(null);
  const clientRef = useRef<XmppClient | null>(null);

  useEffect(() => {
    clientRef.current = client;
  }, [client]);

  const resetProviderState = useCallback(() => {
    setClient(null);
    setGlobalXmppClient(null);
    setPassword(null);
    setEmail(null);
    setReconnectAttempts(0);
    initializingRef.current = null;
  }, []);

  const syncRoomsForPreload = async (
    targetClient: XmppClient,
    signal?: AbortSignal
  ) => {
    const roomsResponse = await getRooms();
    const items = roomsResponse?.items || [];
    if (signal?.aborted || !items.length) return;

    items.forEach((room) => {
      if (signal?.aborted) return;
      store.dispatch(
        addRoomViaApi({
          room: createRoomFromApi(room, config?.xmppSettings?.conference),
          xmpp: targetClient,
        })
      );
    });
    store.dispatch(updateUsersSet({ rooms: items }));
  };

  const waitForOnline = (xmppClient: XmppClient, timeoutMs = 30000) =>
    new Promise<void>((resolve, reject) => {
      const startedAt = Date.now();
      const checkStatus = () => {
        if (xmppClient.status === 'online') {
          resolve();
          return;
        }
        if (xmppClient.status === 'auth_failed') {
          reject(new Error('XMPP authentication failed'));
          return;
        }
        if (xmppClient.status === 'error') {
          reject(new Error('Failed to connect.'));
          return;
        }
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error('XMPP online timeout'));
          return;
        }
        setTimeout(checkStatus, 200);
      };
      checkStatus();
    });

  const initializeClient = async (
    username: string,
    password: string,
    xmppSettings?: xmppSettingsInterface,
    roomsList?: { [jid: string]: IRoom }
  ): Promise<XmppClient> => {
    const clientKey = buildXmppClientKey(username, xmppSettings);
    const reusableGlobalClient = getReusableXmppClientByKey(clientKey);
    if (reusableGlobalClient) {
      ethoraLogger.log('[InitPolicy] Reusing global XMPP client by key', {
        clientKey,
      });
      setClient(reusableGlobalClient);
      return reusableGlobalClient;
    }

    if (
      client &&
      isXmppClientReusable(client) &&
      getGlobalXmppClientKey() === clientKey
    ) {
      ethoraLogger.log('[InitPolicy] Reusing provider state XMPP client', {
        clientKey,
      });
      return client;
    }
    if (initializingRef.current) {
      return initializingRef.current;
    }

    try {
      const initPromise = withXmppClientInitLock(clientKey, async () => {
        const latestReusableClient = getReusableXmppClientByKey(clientKey);
        if (latestReusableClient) {
          setClient(latestReusableClient);
          return latestReusableClient;
        }

        const staleGlobalClient = getGlobalXmppClient();
        if (
          staleGlobalClient &&
          staleGlobalClient !== client &&
          !isXmppClientReusable(staleGlobalClient)
        ) {
          try {
            await staleGlobalClient.disconnect?.({ suppressReconnect: true });
          } catch (error) {
            console.warn(
              '[InitPolicy] Failed to disconnect stale global client',
              error
            );
          }
        }

        const createInstanceStart = Date.now();
        const newClient = new XmppClient(username, password, xmppSettings);
        ethoraLogger.log(
          `[InitTiming] initClient:create_instance ${Date.now() - createInstanceStart}ms`
        );
        setClient(newClient);
        setGlobalXmppClient(newClient, clientKey);

        waitForOnline(newClient)
          .then(() => {})
          .catch((error) => {
            console.warn(
              '[InitTiming] initClient:wait_online:error',
              error instanceof Error ? error.message : String(error)
            );
          });

        setPassword(password);
        setEmail(username);
        setReconnectAttempts(0);
        return newClient;
      });
      initializingRef.current = initPromise;
      const created = await initPromise;
      initializingRef.current = null;
      return created;
    } catch (error) {
      console.error('Error initializing client:', error);
      resetProviderState();
      throw error;
    }
  };

  const reconnectClient = () => {
    if (!client) return;
    if (
      (client.status === 'error' || client.status === 'offline') &&
      reconnectAttempts < 3
    ) {
      ethoraLogger.log('Attempting to reconnect...');
      client.reconnect();
      setReconnectAttempts((prev) => prev + 1);
    } else if (reconnectAttempts >= 3 && password && email) {
      ethoraLogger.log('Reinitializing XMPP client after failed reconnects...');
      initializeClient(email, password).catch((error) => {
        console.error('Reconnection failed:', error);
      });
    }
  };

  useEffect(() => {
    if (
      client &&
      (client.status === 'offline' || client.status === 'error') &&
      reconnectAttempts < 3
    ) {
      reconnectClient();
    }
    return () => {};
  }, [client?.status, reconnectAttempts]);

  useEffect(() => {
    store.dispatch(setChatConfig(config));
  }, [config]);

  useEffect(() => {
    if (!config?.initBeforeLoad) {
      setProviderBootstrapStatus('idle');
      return;
    }
    if (config?.baseUrl) {
      setBaseURL(config.baseUrl, config.customAppToken);
    }

    const abortController = new AbortController();

    const runInitBeforeLoad = async () => {
      setProviderBootstrapStatus('running');
      const resolvedUser = await resolveInitBeforeLoadUser({
        config,
        signal: abortController.signal,
      });
      if (abortController.signal.aborted) return;
      if (!resolvedUser) {
        setProviderBootstrapStatus('failed');
        return;
      }

      applyResolvedUserToStore(resolvedUser);

      const resolvedUsername =
        resolvedUser.xmppUsername ||
        resolvedUser.defaultWallet?.walletAddress;
      const resolvedPassword = resolvedUser.xmppPassword;

      if (!resolvedUsername || !resolvedPassword) {
        setProviderBootstrapStatus('failed');
        return;
      }

      const targetClient = await initializeClient(
        resolvedUsername,
        resolvedPassword,
        {
          ...(config?.xmppSettings || {}),
          historyQoS: config?.historyQoS,
        } as xmppSettingsInterface
      );

      if (abortController.signal.aborted) return;

      const isOnline = await waitForOnline(targetClient)
        .then(() => true)
        .catch((error) => {
          console.warn(
            '[initBeforeLoad] ws auth/connect failed, bootstrap stopped',
            error instanceof Error ? error.message : String(error)
          );
          return false;
        });
      if (abortController.signal.aborted) return;
      if (!isOnline) {
        setProviderBootstrapStatus('failed');
        return;
      }

      await syncRoomsForPreload(targetClient, abortController.signal);

      if (abortController.signal.aborted) return;

      const roomTimestampObject =
        await targetClient.getChatsPrivateStoreRequestStanza();
      if (abortController.signal.aborted) return;

      updatedChatLastTimestamps(
        roomTimestampObject as Record<string, string | number>,
        store.dispatch
      );

      void runHistoryPreloadScheduler({
        client: targetClient,
        signal: abortController.signal,
        concurrency: 3,
        pageSize: 10,
        retryLimit: 2,
        selectedRoomJid: store.getState().rooms.activeRoomJID || null,
        defaultRoomJids: (config?.defaultRooms || []).map((room) => room.jid),
      });
      setProviderBootstrapStatus('ready');
    };

    if (!initBeforeLoadPromiseRef.current) {
      initBeforeLoadPromiseRef.current = runInitBeforeLoad()
        .catch((error) => {
          console.warn('[initBeforeLoad] bootstrap failed', error);
          setProviderBootstrapStatus('failed');
        })
        .finally(() => {
          initBeforeLoadPromiseRef.current = null;
        });
    }

    return () => {
      abortController.abort();
      initBeforeLoadPromiseRef.current = null;
    };
  }, [
    config?.initBeforeLoad,
    config?.appId,
    config?.baseUrl,
    config?.customAppToken,
    config?.jwtLogin?.enabled,
    config?.jwtLogin?.token,
    config?.refreshTokens?.enabled,
    config?.refreshTokens?.refreshFunction,
    config?.initBeforeLoadAuth?.myEndpoint,
    config?.xmppSettings,
    config?.defaultRooms,
    config?.userLogin?.user?.xmppUsername,
    config?.userLogin?.user?.xmppPassword,
    config?.userLogin?.user?.defaultWallet?.walletAddress,
  ]);

  useEffect(() => {
    if (!config?.initBeforeLoad) return;
    if (client && (client.status === 'online' || client.status === 'connecting')) {
      setProviderBootstrapStatus('ready');
    }
  }, [client, client?.status, config?.initBeforeLoad]);

  useEffect(() => {
    // Only set up event listeners in browser
    if (typeof window === "undefined") {
      return;
    }

    const handleLogout = () => {
      const activeClient = client;
      resetProviderState();
      if (!activeClient) return;

      void (async () => {
        try {
          ethoraLogger.log("XmppProvider: Disconnecting client due to logout event");
          await activeClient.disconnect({ suppressReconnect: true });
        } catch (error) {
          console.warn('XmppProvider: client disconnect failed on logout', error);
        }
      })();
    };

    window.addEventListener("ethora-xmpp-logout", handleLogout);

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("ethora-xmpp-logout", handleLogout);
      }
    };
  }, [client, resetProviderState]);

  useEffect(() => {
    return () => {
      const ownClient = clientRef.current;
      const globalClient = getGlobalXmppClient();
      initBeforeLoadPromiseRef.current = null;
      initializingRef.current = null;
      if (globalClient && ownClient && globalClient === ownClient) {
        setGlobalXmppClient(null);
      }
      if (!ownClient) return;
      void ownClient.disconnect?.({ suppressReconnect: true }).catch((error) => {
        console.warn('XmppProvider: client disconnect failed on unmount', error);
      });
    };
  }, []);

  return (
    <XmppContext.Provider
      value={{
        client,
        providerBootstrapStatus,
        initMode: config?.initBeforeLoad ? 'provider' : 'chat',
        initializeClient,
        setClient,
      }}
      data-xmpp-provider="true"
    >
      <Provider store={store}>
        <XmppProviderPushNotificationsEnabler
          pushNotifications={pushNotifications}
        />
      </Provider>
      {children}
    </XmppContext.Provider>
  );
};

export const useXmppClient = () => {
  const context = useContext(XmppContext);
  if (!context) {
    throw new Error('useXmppClient must be used within an XmppProvider');
  }
  return context;
};
