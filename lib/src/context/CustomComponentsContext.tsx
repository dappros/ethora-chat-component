import React, { createContext, useContext, useRef } from 'react';
import { CustomComponentsContextValue } from '../types/models/customComponents.model';

const CustomComponentsContext = createContext<CustomComponentsContextValue>({});

interface CustomComponentsProviderProps
  extends CustomComponentsContextValue {
  children: React.ReactNode;
}

const shallowEqual = (
  a: CustomComponentsContextValue,
  b: CustomComponentsContextValue
): boolean => {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(
    (key) => (a as any)[key] === (b as any)[key]
  );
};

export const CustomComponentsProvider: React.FC<
  CustomComponentsProviderProps
> = ({ children, ...value }) => {
  // Keep the context value referentially stable while its contents are
  // unchanged: a fresh object per render forced every consumer to re-render
  // whenever the provider's parent re-rendered.
  const stableRef = useRef<CustomComponentsContextValue>(value);
  if (!shallowEqual(stableRef.current, value)) {
    stableRef.current = value;
  }
  return (
    <CustomComponentsContext.Provider value={stableRef.current}>
      {children}
    </CustomComponentsContext.Provider>
  );
};

export const useCustomComponents = () => useContext(CustomComponentsContext);
