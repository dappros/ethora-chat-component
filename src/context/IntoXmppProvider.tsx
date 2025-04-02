// XmppProvider.tsx
import React, { ReactNode, useState, useMemo, useEffect } from 'react';
import { Provider } from 'react-redux';
import { Store } from 'redux';
import { createEthoraStore } from '../roomStore';
import { XmppProvider } from './xmppProvider.tsx';
import { IConfig, User } from '../types/types.ts';
import InitClientEffect from './InitClientEffect.tsx';
import { RootState } from '../roomStore';

interface XmppProviderProps {
  children: ReactNode;
  config?: IConfig;
  store?: Store<RootState>;
  user?: User;
}

export const IntoXmppProvider: React.FC<XmppProviderProps> = ({ children, config, store: externalStore, user }) => {
  const [storeInstance] = useState(() => externalStore || createEthoraStore());

  return (
    <Provider store={storeInstance}>
      <XmppProvider config={config} user={user}>
        {children}
      </XmppProvider>
    </Provider>
  );
};
