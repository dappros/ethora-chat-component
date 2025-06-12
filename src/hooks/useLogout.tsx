import { useDispatch } from 'react-redux';
import { store } from '../roomStore';
import { logout } from '../roomStore/chatSettingsSlice';
import { setLogoutState } from '../roomStore/roomsSlice';
import { useCallback } from 'react';

const logoutService = {
  performLogout: () => {
    store.dispatch(logout());
    store.dispatch(setLogoutState());
  },
};
export const useLogout = () => {
  const dispatch = useDispatch();

  const handleLogout = useCallback(() => {
    logoutService.performLogout();
  }, []);

  return handleLogout;
};

export { logoutService };
