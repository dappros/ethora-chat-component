import { AnyAction } from '@reduxjs/toolkit';

export const isValidAction = (action: any): action is AnyAction => {
  if (typeof action !== 'object' || action === null) {
    console.error('Action is not a plain object:', action);
    return false;
  }

  if (!action.type) {
    console.error('Action missing type property:', action);
    return false;
  }

  return true;
};

export const createSafeDispatch = (dispatch: any) => {
  return (action: any) => {
    if (!isValidAction(action)) {
      console.error('Invalid action being dispatched:', action);
      throw new Error('Invalid action: ' + JSON.stringify(action));
    }
    return dispatch(action);
  };
};

export const createAsyncAction = (
  asyncFunction: (...args: any[]) => Promise<any>
) => {
  return (...args: any[]) =>
    async (dispatch: any, getState: any) => {
      try {
        const result = await asyncFunction(...args);
        return result;
      } catch (error) {
        console.error('Async action error:', error);
        throw error;
      }
    };
};
