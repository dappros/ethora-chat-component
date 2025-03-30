import { useEffect } from 'react';
import { useInitXmmpClient } from '../hooks/useInitXmmpClient';
import { IConfig } from '../types/types';

interface Props {
  config: IConfig;
}

const InitClientEffect = ({ config }: Props) => {
  const { initXmmpClient } = useInitXmmpClient({ config });

  useEffect(() => {
    if (config?.initBeforeLoad) {
      initXmmpClient();
    }
  }, [config]);

  return null;
};

export default InitClientEffect;
