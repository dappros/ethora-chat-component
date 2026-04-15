// Hook to detect if the browser tab is visible/active
import { useState, useEffect } from 'react';

export const useTabVisibility = (): boolean => {
  const [isVisible, setIsVisible] = useState<boolean>(() => {
    if (typeof document === 'undefined') {
      return false;
    }
    return !document.hidden;
  });

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return isVisible;
};
