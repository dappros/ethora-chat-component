import { Middleware } from '@reduxjs/toolkit';

export const testMiddleware: Middleware =
  (storeAPI) => (next) => (action: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.group(`🔍 TestMiddleware - Action: ${action.type}`);
      console.log('📤 Action:', action);
      console.log('📊 Current State:', storeAPI.getState());
    }

    const result = next(action);

    if (process.env.NODE_ENV === 'development') {
      console.log('📥 Result:', result);
      console.log('🔄 New State:', storeAPI.getState());
      console.groupEnd();
    }

    return result;
  };
