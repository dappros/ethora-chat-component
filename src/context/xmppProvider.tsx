import React, {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import XmppClient from "../networking/xmppClient";

// Declare XmppContext with both client and initializeClient, ensuring client is not null
interface XmppContextType {
  client: XmppClient;
  initializeClient: (password: string, email: string) => void;
}

const XmppContext = createContext<XmppContextType | null>(null);

interface XmppProviderProps {
  children: ReactNode;
}

// Provider component for XmppClient
export const XmppProvider: React.FC<XmppProviderProps> = ({ children }) => {
  const [client, setClient] = useState<XmppClient | null>(null);

  const initializeClient = async (password: string, email: string) => {
    const newClient = new XmppClient(password, email);
    setClient(newClient);
  };

  return (
    <XmppContext.Provider
      value={{ client: client as XmppClient, initializeClient }}
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
