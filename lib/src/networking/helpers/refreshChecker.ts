export const refreshHelper = (
  isEnabled: boolean,
  refreshFunc: any,
  logoutClb: any
) => {
  if (isEnabled) {
    try {
      refreshFunc();
    } catch (error) {
      logoutClb();
    }
  }
};
