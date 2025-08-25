import React, {
  ReactNode,
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
} from 'react';
import XmppClient from '../networking/xmppClient';
import { IConfig, IRoom, xmppSettingsInterface } from '../types/types';
import initXmppRooms from '../helpers/initXmppRooms';
import { walletToUsername } from '../helpers/walletUsername';
import { initRoomsPresence } from '../helpers/initRoomsPresence';
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

  const initializeClient = async (
    username: string,
    password: string,
    xmppSettings?: xmppSettingsInterface,
    roomsList?: { [jid: string]: IRoom }
  ): Promise<XmppClient> => {
    if (client) {
      console.log('Returning existing client.');
      setClient(client);
      return client;
    }
    if (initializingRef.current) {
      return initializingRef.current;
    }

    try {
      const initPromise = (async () => {
        const newClient = new XmppClient(username, password, xmppSettings);
        setClient(newClient);

        await new Promise<void>((resolve, reject) => {
          const checkStatus = () => {
            if (newClient.status === 'online') {
              resolve();
            } else if (newClient.status === 'error') {
              reject(new Error('Failed to connect.'));
            } else {
              setTimeout(checkStatus, 300);
            }
          };
          checkStatus();
        });

        setPassword(password);
        setEmail(username);
        setClient(newClient);
        setReconnectAttempts(0);
        if (roomsList) {
          await initRoomsPresence(newClient, roomsList);
        }
        return newClient;
      })();
      initializingRef.current = initPromise;
      const created = await initPromise;
      initializingRef.current = null;
      return created;
    } catch (error) {
      console.error('Error initializing client:', error);
      setClient(null);
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
      console.log('Attempting to reconnect...');
      client.reconnect();
      setReconnectAttempts((prev) => prev + 1);
    } else if (reconnectAttempts >= 3 && password && email) {
      console.log('Reinitializing XMPP client after failed reconnects...');
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
    const initBeforeLoad = async () => {
      initializeClient(
        walletToUsername(config?.userLogin?.user?.defaultWallet?.walletAddress),
        config?.userLogin?.user?.xmppPassword,
        config?.xmppSettings
      ).then(async (client) => {
        await initXmppRooms(
          config?.userLogin?.user,
          config,
          client
          // store?.getState()?.rooms?.rooms
        );
      });
    };

    if (config?.initBeforeLoad) {
      initBeforeLoad();
    }
    return () => {};
  }, [config?.initBeforeLoad]);

  useEffect(() => {
    const handleLogout = () => {
      if (client) {
        console.log('XmppProvider: Disconnecting client due to logout event');
        client.disconnect();
        setClient(null);
      }
    };

    window.addEventListener('ethora-xmpp-logout', handleLogout);

    return () => {
      window.removeEventListener('ethora-xmpp-logout', handleLogout);
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
