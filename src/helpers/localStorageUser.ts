import { getStoredUser } from './authStorage';

export const getLocalStorageUser = () => {
  return getStoredUser();
};
