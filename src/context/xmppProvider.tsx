import React, {
  ReactNode,
  createContext,
  useContext,
  useState,
  useEffect,
} from 'react';
import XmppClient from '../networking/xmppClient';
import { IConfig, xmppSettingsInterface } from '../types/types';
import initXmppRooms from '../helpers/initXmppRooms';
import { walletToUsername } from '../helpers/walletUsername';
import { store } from '../roomStore';
// Declare XmppContext
interface XmppContextType {
  client: XmppClient;
  setClient: (client: XmppClient | null) => void;
  initializeClient: (
    password: string,
    email: string,
    xmppSettings?: xmppSettingsInterface
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

  const initializeClient = async (
    password: string,
    email: string,
    xmppSettings?: xmppSettingsInterface
  ): Promise<XmppClient> => {
    if (client) {
      console.log('Returning existing client.');
      setClient(client);
      return client;
    }

    try {
      const newClient = new XmppClient(password, email, xmppSettings);
      setClient(newClient);

      await new Promise<void>((resolve, reject) => {
        const checkStatus = () => {
          if (newClient.status === 'online') {
            resolve();
          } else if (newClient.status === 'error') {
            reject(new Error('Failed to connect.'));
          } else {
            setTimeout(checkStatus, 500);
          }
        };
        checkStatus();
      });

      setPassword(password);
      setEmail(email);
      setClient(newClient);
      setReconnectAttempts(0);
      return newClient;
    } catch (error) {
      console.error('Error initializing client:', error);
      setClient(null);
      throw error;
    }
  };

  const reconnectClient = () => {
    if (client && client.status !== 'offline' && reconnectAttempts < 3) {
      console.log('Attempting to reconnect...');
      client.reconnect();
      setReconnectAttempts((prev) => prev + 1);
    } else if (client?.status === 'offline') {
      console.log('Client is offline. Not attempting to reconnect.');
    } else if (reconnectAttempts >= 3) {
      console.log(
        'Maximum reconnect attempts reached. Stopping further attempts.'
      );
    } else if (password && email && reconnectAttempts >= 3) {
      console.log('No active client found. Reinitializing...');
      initializeClient(password, email).catch((error) => {
        console.error('Reconnection failed:', error);
      });
    }
  };

  useEffect(() => {
    if (client && client.status === 'offline' && reconnectAttempts < 3) {
      reconnectClient();
    }
    return () => {};
  }, [client, reconnectAttempts]);

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

  return (
    <XmppContext.Provider
      value={{ client: client as XmppClient, initializeClient, setClient }}
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
