import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useInitXmmpClient } from '../hooks/useInitXmmpClient';
import XmppClient from '../networking/xmppClient';
import { IConfig, xmppSettingsInterface } from '../types/types';
import InitClientEffect from './InitClientEffect.tsx';

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

export const useXmppClient = () => {
  const context = useContext(XmppContext);
  if (!context) throw new Error('useXmppClient must be used within an XmppProvider');
  return context;
};

interface InternalXmppProviderProps {
  children: ReactNode;
  config: IConfig;
}

export const XmppProvider: React.FC<InternalXmppProviderProps> = ({ children, config }) => {
  const [client, setClient] = useState<XmppClient | null>(null);

  const initializeClient = async (
    password: string,
    email: string,
    xmppSettings?: xmppSettingsInterface
  ): Promise<XmppClient> => {
    const newClient = new XmppClient(password, email, xmppSettings);
    setClient(newClient);

    await new Promise<void>((resolve, reject) => {
      const checkStatus = () => {
        if (newClient?.status === 'online') resolve();
        else if (newClient?.status === 'error') reject(new Error('Failed to connect.'));
        else setTimeout(checkStatus, 500);
      };
      checkStatus();
    });

    return newClient;
  };

  return (
    <XmppContext.Provider value={{ client: client ?? ({} as XmppClient), initializeClient, setClient }}>
      <InitClientEffect config={config} />
      {children}
    </XmppContext.Provider>
  );
};
