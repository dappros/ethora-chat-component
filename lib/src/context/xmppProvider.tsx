import React, { ReactNode, createContext, useContext, useState } from "react";
import XmppClient from "../networking/xmppClient";

// Declare XmppContext with both client and initializeClient, ensuring client is not null
interface XmppContextType {
  client: XmppClient;
  setClient: (client: XmppClient | null) => void;
  initializeClient: (password: string, email: string) => Promise<XmppClient>;
}

const XmppContext = createContext<XmppContextType | null>(null);

interface XmppProviderProps {
  children: ReactNode;
}

// Provider component for XmppClient
export const XmppProvider: React.FC<XmppProviderProps> = ({ children }) => {
  const [client, setClient] = useState<XmppClient | null>(null);

  const initializeClient = async (password: string, email: string) => {
    try {
      const newClient = new XmppClient(password, email);

      await new Promise<void>((resolve, reject) => {
        const checkStatus = () => {
          if (newClient.status === "online") {
            resolve();
          } else if (newClient.status === "error") {
            reject(new Error("Failed to connect."));
          } else {
            setTimeout(checkStatus, 500);
          }
        };
        checkStatus();
      });

      return newClient;
    } catch (error) {
      console.log(error, "error with initializing client");
    }
  };

  return (
    <XmppContext.Provider
      value={{ client: client as XmppClient, initializeClient, setClient }}
    >
      {children}
    </XmppContext.Provider>
  );
};

// Hook to use XmppClient and initializeClient
export const useXmppClient = () => {
  const context = useContext(XmppContext);
  if (!context) {
    throw new Error("useXmppClient must be used within an XmppProvider");
  }
  return context;
};
