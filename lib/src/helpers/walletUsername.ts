export function walletToUsername(string: string) {
  if (string) {
    return string.replaceAll(/([A-Z])/g, '_$1').toLowerCase();
  }
  return '';
}

export function usernameToWallet(string: string) {
  return string.replaceAll(/_([a-z])/gm, (m1: string, m2: string) => {
    return m2.toUpperCase();
  });
}
