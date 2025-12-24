import React, { createContext, useContext } from 'react';
import { CustomComponentsContextValue } from '../types/models/customComponents.model';

const CustomComponentsContext = createContext<CustomComponentsContextValue>({});

interface CustomComponentsProviderProps
  extends CustomComponentsContextValue {
  children: React.ReactNode;
}

export const CustomComponentsProvider: React.FC<
  CustomComponentsProviderProps
> = ({ children, ...value }) => (
  <CustomComponentsContext.Provider value={{ ...value }}>
    {children}
  </CustomComponentsContext.Provider>
);

export const useCustomComponents = () => useContext(CustomComponentsContext);

