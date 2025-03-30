// XmppProvider.tsx
import React, { ReactNode, useState, useMemo, useEffect } from 'react';
import { Provider } from 'react-redux';
import { createEthoraStore } from '../roomStore';
import { XmppProvider } from './xmppProvider.tsx';
import { IConfig } from '../types/types.ts';
import InitClientEffect from './InitClientEffect.tsx';

interface XmppProviderProps {
  children: ReactNode;
  config?: IConfig;
}

export const IntoXmppProvider: React.FC<XmppProviderProps> = ({ children, config }) => {
  const [storeInstance] = useState(() => createEthoraStore());

  return (
    <Provider store={storeInstance}>
      <XmppProvider config={config}>
        {children}
      </XmppProvider>
    </Provider>
  );
};
