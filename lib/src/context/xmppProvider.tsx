import React, {
  ReactNode,
  createContext,
  useContext,
  useState,
  useEffect,
} from 'react';
import XmppClient from '../networking/xmppClient';

// Declare XmppContext
interface XmppContextType {
  client: XmppClient;
  setClient: (client: XmppClient | null) => void;
  initializeClient: (password: string, email: string) => Promise<XmppClient>;
}

const XmppContext = createContext<XmppContextType | null>(null);

interface XmppProviderProps {
  children: ReactNode;
}

// Singleton reference for XmppClient
let singletonClient: XmppClient | null = null;

export const XmppProvider: React.FC<XmppProviderProps> = ({ children }) => {
  const [client, setClient] = useState<XmppClient | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState<number>(0);

  const initializeClient = async (
    password: string,
    email: string
  ): Promise<XmppClient> => {
    if (singletonClient) {
      console.log('Returning existing client.');
      setClient(singletonClient);
      return singletonClient;
    }

    try {
      const newClient = new XmppClient(password, email);
      singletonClient = newClient;

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
      singletonClient = null;
      throw error;
    }
  };

  const reconnectClient = () => {
    if (
      singletonClient &&
      singletonClient.status !== 'offline' &&
      reconnectAttempts < 3
    ) {
      console.log('Attempting to reconnect...');
      singletonClient.scheduleReconnect();
      setReconnectAttempts((prev) => prev + 1);
    } else if (singletonClient?.status === 'offline') {
      console.log('Client is offline. Not attempting to reconnect.');
    } else if (reconnectAttempts >= 3) {
      console.log(
        'Maximum reconnect attempts reached. Stopping further attempts.'
      );
    } else if (password && email) {
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
