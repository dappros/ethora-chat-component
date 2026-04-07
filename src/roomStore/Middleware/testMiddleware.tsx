import { Middleware } from '@reduxjs/toolkit';
import { ethoraLogger } from '../../helpers/ethoraLogger';

export const testMiddleware: Middleware =
  (storeAPI) => (next) => (action: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.group(`🔍 TestMiddleware - Action: ${action.type}`);
      ethoraLogger.log('📤 Action:', action);
      ethoraLogger.log('📊 Current State:', storeAPI.getState());
    }

    const result = next(action);

    if (process.env.NODE_ENV === 'development') {
      ethoraLogger.log('📥 Result:', result);
      ethoraLogger.log('🔄 New State:', storeAPI.getState());
      console.groupEnd();
    }

    return result;
  };
