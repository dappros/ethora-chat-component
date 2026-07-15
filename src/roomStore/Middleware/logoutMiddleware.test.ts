import { describe, expect, it, vi, afterEach } from 'vitest';

// Mocked (rather than importing the real module) to avoid pulling in
// clientRegistry.ts -> xmppClient.ts -> roomStore/index.ts, which
// re-imports this very middleware file - a circular import that only
// resolves correctly when roomStore/index.ts happens to load first, as it
// does in the real app boot order but not when this test file is the
// entry point.
let currentClient: any = null;
vi.mock('../../utils/clientRegistry', () => ({
  getGlobalXmppClient: () => currentClient,
  setGlobalXmppClient: (client: any) => {
    currentClient = client;
  },
}));
// ethoraLogger.ts itself imports the real store (roomStore/index.ts),
// which is the other leg of the same circular import - stub it too so
// this test never needs to load the real store module.
vi.mock('../../helpers/ethoraLogger', () => ({
  ethoraLogger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { logoutMiddleware } from './logoutMiddleware';
import { setGlobalXmppClient, getGlobalXmppClient } from '../../utils/clientRegistry';

// Regression coverage for: the old `document.querySelector('[data-xmpp-
// provider="true"]')` lookup this middleware used to do could never find
// anything (that attribute lives on a React Context.Provider, which
// renders no DOM node), so a logout() dispatched by anything other than
// the explicit "Logout" button (e.g. an automatic logout from a failed
// token refresh, in apiClient.ts) never actually disconnected the still-
// live XMPP socket - it kept delivering stanzas (and therefore browser
// notifications) for a user the UI already showed as logged out.
describe('logoutMiddleware', () => {
  afterEach(() => {
    setGlobalXmppClient(null);
    vi.restoreAllMocks();
  });

  const runMiddleware = (action: any) => {
    const next = vi.fn((a) => a);
    const storeAPI = { getState: vi.fn(), dispatch: vi.fn() };
    const result = logoutMiddleware(storeAPI as any)(next)(action);
    return { next, result };
  };

  it('disconnects the globally-registered XMPP client on a logout action', () => {
    const disconnect = vi.fn().mockResolvedValue(undefined);
    setGlobalXmppClient({ disconnect } as any);

    runMiddleware({ type: 'chatSettingStore/logout' });

    expect(disconnect).toHaveBeenCalledWith({ suppressReconnect: true });
    expect(getGlobalXmppClient()).toBeNull();
  });

  it('does not throw when no client is registered', () => {
    setGlobalXmppClient(null);
    expect(() => runMiddleware({ type: 'chatSettingStore/logout' })).not.toThrow();
  });

  it('leaves the client untouched for unrelated actions', () => {
    const disconnect = vi.fn();
    setGlobalXmppClient({ disconnect } as any);

    runMiddleware({ type: 'rooms/setCurrentRoom', payload: { roomJID: 'r1@conf' } });

    expect(disconnect).not.toHaveBeenCalled();
    expect(getGlobalXmppClient()).not.toBeNull();
  });

  it('still forwards the action to next()', () => {
    const action = { type: 'chatSettingStore/logout' };
    const { next } = runMiddleware(action);
    expect(next).toHaveBeenCalledWith(action);
  });
});
