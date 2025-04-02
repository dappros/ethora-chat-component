import { useEffect } from 'react';
import { useInitXmmpClient } from '../hooks/useInitXmmpClient';
import { IConfig, User } from '../types/types';

interface Props {
  config: IConfig;
  user?: User;
}

const InitClientEffect = ({ config, user }: Props) => {
  const { initXmmpClient } = useInitXmmpClient({ 
    config,
    setInited: () => {},
  });

  useEffect(() => {
    if (config?.initBeforeLoad && user?.defaultWallet?.walletAddress) {
      initXmmpClient();
    }
  }, [config, user]);

  return null;
};

export default InitClientEffect;
