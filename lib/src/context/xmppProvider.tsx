import React, {
  ReactNode,
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
} from 'react';
import XmppClient from '../networking/xmppClient';
import { setGlobalXmppClient } from '../utils/clientRegistry';
import { IConfig, IRoom, xmppSettingsInterface } from '../types/types';
import { getRooms } from '../networking/api-requests/rooms.api';
import { createRoomFromApi } from '../helpers/createRoomFromApi';
import { store } from '../roomStore';
import {
  addRoomViaApi,
  updateUsersSet,
} from '../roomStore/roomsSlice';
import { updatedChatLastTimestamps } from '../helpers/updatedChatLastTimestamps';
import { runHistoryPreloadScheduler } from '../helpers/historyPreloadScheduler';
import {
  applyResolvedUserToStore,
  resolveInitBeforeLoadUser,
} from '../helpers/resolveInitBeforeLoadUser';
import { setBaseURL } from '../networking/apiClient';
import { ethoraLogger } from '../helpers/ethoraLogger';

let initBeforeLoadPromise: Promise<void> | null = null;
// Declare XmppContext
interface XmppContextType {
  client: XmppClient;
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
}

export const XmppProvider: React.FC<XmppProviderProps> = ({
  children,
  config,
}) => {
  const [client, setClient] = useState<XmppClient | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState<number>(0);
  const initializingRef = useRef<Promise<XmppClient> | null>(null);

  const syncRoomsForPreload = async (
    targetClient: XmppClient,
    signal?: AbortSignal
  ) => {
    const roomsResponse = await getRooms();
    if (signal?.aborted || !roomsResponse?.items?.length) return;

    roomsResponse.items.forEach((room) => {
      if (signal?.aborted) return;
      store.dispatch(
        addRoomViaApi({
          room: createRoomFromApi(room, config?.xmppSettings?.conference),
          xmpp: targetClient,
        })
      );
    });
    store.dispatch(updateUsersSet({ rooms: roomsResponse.items }));
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
    if (client) {
      ethoraLogger.log('Returning existing client.');
      setClient(client);
      return client;
    }
    if (initializingRef.current) {
      return initializingRef.current;
    }

    try {
      const initPromise = (async () => {
        const createInstanceStart = Date.now();
        const newClient = new XmppClient(username, password, xmppSettings);
        ethoraLogger.log(
          `[InitTiming] initClient:create_instance ${Date.now() - createInstanceStart}ms`
        );
        setClient(newClient);
        setGlobalXmppClient(newClient);

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
        setClient(newClient);
        setReconnectAttempts(0);
        return newClient;
      })();
      initializingRef.current = initPromise;
      const created = await initPromise;
      initializingRef.current = null;
      return created;
    } catch (error) {
      console.error('Error initializing client:', error);
      setClient(null);
      setGlobalXmppClient(null);
      initializingRef.current = null;
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
    if (!config?.initBeforeLoad) return;
    if (config?.baseUrl) {
      setBaseURL(config.baseUrl, config.customAppToken);
    }

    const abortController = new AbortController();

    const runInitBeforeLoad = async () => {
      const resolvedUser = await resolveInitBeforeLoadUser({
        config,
        signal: abortController.signal,
      });
      if (abortController.signal.aborted || !resolvedUser) return;

      applyResolvedUserToStore(resolvedUser);

      const resolvedUsername =
        resolvedUser.xmppUsername ||
        resolvedUser.defaultWallet?.walletAddress;
      const resolvedPassword = resolvedUser.xmppPassword;

      if (!resolvedUsername || !resolvedPassword) return;

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
      if (!isOnline || abortController.signal.aborted) return;

      await syncRoomsForPreload(targetClient, abortController.signal);

      if (abortController.signal.aborted) return;

      const roomTimestampObject =
        await targetClient.getChatsPrivateStoreRequestStanza();
      if (abortController.signal.aborted) return;

      updatedChatLastTimestamps(
        roomTimestampObject as [jid: string, timestamp: string],
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
    };

    if (!initBeforeLoadPromise) {
      initBeforeLoadPromise = runInitBeforeLoad()
        .catch((error) => {
          console.warn('[initBeforeLoad] bootstrap failed', error);
        })
        .finally(() => {
          initBeforeLoadPromise = null;
        });
    }

    return () => {
      abortController.abort();
    };
  }, [
    config?.initBeforeLoad,
    config?.xmppSettings,
    config?.defaultRooms,
    config?.userLogin?.user?.xmppUsername,
    config?.userLogin?.user?.xmppPassword,
    config?.userLogin?.user?.defaultWallet?.walletAddress,
  ]);

  useEffect(() => {
    // Only set up event listeners in browser
    if (typeof window === "undefined") {
      return;
    }

    const handleLogout = () => {
      if (client) {
        ethoraLogger.log("XmppProvider: Disconnecting client due to logout event");
        client.disconnect();
        setClient(null);
      }
    };

    window.addEventListener("ethora-xmpp-logout", handleLogout);

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("ethora-xmpp-logout", handleLogout);
      }
    };
  }, [client]);

  return (
    <XmppContext.Provider
      value={{ client: client as XmppClient, initializeClient, setClient }}
      data-xmpp-provider="true"
    >
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
