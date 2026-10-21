import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';

// A new look for a connected chat must not start the connection again, clear
// the cache or log anyone out. The hook that owns all that is driven here
// with the XMPP provider replaced by a recording stand-in.
const xmpp = vi.hoisted(() => ({
  client: null as any,
  initializeClient: vi.fn(),
  setClient: vi.fn(),
  syncRooms: vi.fn(),
}));
vi.mock('../context/xmppProvider', () => ({
  useXmppClient: () => ({
    client: xmpp.client,
    initializeClient: xmpp.initializeClient,
    setClient: xmpp.setClient,
    providerBootstrapStatus: 'idle',
    initMode: 'chat',
  }),
}));
vi.mock('./useGetNewArchRoom', () => ({ default: () => xmpp.syncRooms }));
vi.mock('../helpers/chatAutoEnterer', () => ({ chatAutoEnterer: vi.fn() }));
vi.mock('../networking/authRefresh', async (orig) => ({
  ...(await orig<typeof import('../networking/authRefresh')>()),
  refreshAuthTokensQuietly: vi.fn(),
}));

import useChatWrapperInit from './useChatWrapperInit';
import { store, persistor } from '../roomStore';
import { setConfig, setUser } from '../roomStore/chatSettingsSlice';
import { addRoom } from '../roomStore/roomsSlice';
import { buildCacheScope } from '../helpers/cacheScope';

const APP = '646cc8dc96d4a4dc8f7b2f2d';
const ROOM = `${APP}_room@conference.xmpp.example.com`;

const makeClient = () => ({
  status: 'online',
  username: `${APP}_me`,
  checkOnline: () => false,
  sendAllPresencesAndMarkReady: vi.fn().mockResolvedValue(undefined),
  client: { jid: { toString: () => `${APP}_me@xmpp.example.com/web` } },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <Provider store={store}>{children}</Provider>
);

const base = {
  appId: APP,
  baseUrl: 'https://api.example.test',
  xmppSettings: { host: 'xmpp.example.com', devServer: 'wss://xmpp.example.com/ws', conference: 'conference.xmpp.example.com' },
  colors: { primary: '#111111' },
} as any;

beforeEach(() => {
  xmpp.client = null;
  xmpp.initializeClient.mockReset().mockImplementation(async () => {
    const c = makeClient();
    xmpp.client = c;
    return c;
  });
  xmpp.setClient.mockReset();
  xmpp.syncRooms.mockReset().mockResolvedValue([]);
  store.dispatch(setConfig(base));
  store.dispatch(setUser({ _id: 'me', xmppUsername: `${APP}_me`, xmppPassword: 'pw', token: 't', refreshToken: 'r' } as any));
  store.dispatch(
    addRoom({ roomData: { jid: ROOM, name: 'R', title: 'R', members: [], messages: [{ id: 'm1', body: 'hi' }], unreadMessages: 0 } } as any)
  );
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('useChatWrapperInit - config changes that only restyle', () => {
  it('connects once, and a visual change afterwards reconnects nothing and clears nothing', async () => {
    const purge = vi.spyOn(persistor, 'purge');
    const { rerender } = renderHook(
      ({ config }) => useChatWrapperInit({ roomJID: undefined, wasAutoSelected: false, config }),
      { wrapper, initialProps: { config: base } }
    );
    await waitFor(() => expect(xmpp.initializeClient).toHaveBeenCalledTimes(1));
    // the provider now holds the client it just created
    rerender({ config: base });
    await waitFor(() => expect(xmpp.setClient).toHaveBeenCalled());

    const roomsBefore = (store.getState() as any).rooms.rooms;
    const userBefore = (store.getState() as any).chatSettingStore.user;
    const calls = xmpp.initializeClient.mock.calls.length;
    // let the connect-time room load settle before counting
    await new Promise((r) => setTimeout(r, 50));
    const loads = xmpp.syncRooms.mock.calls.length;

    const restyled = {
      ...base,
      colors: { primary: '#0052cd', inputBackground: '#fafafa' },
      colorScheme: 'dark',
      disableMedia: true,
      disableRooms: true,
      typography: { fontFamily: 'Inter' },
      backgroundChat: { color: '#101820' },
      customTypingIndicator: { enabled: true, text: 'Thinking' },
    };
    rerender({ config: restyled });
    rerender({ config: { ...restyled, colors: { primary: '#aa0000' } } });

    // the new look reached the store ...
    await waitFor(() => expect((store.getState() as any).chatSettingStore.config.colors.primary).toBe('#aa0000'));
    expect((store.getState() as any).chatSettingStore.config.disableMedia).toBe(true);
    // ... and nothing else moved
    await new Promise((r) => setTimeout(r, 50));
    expect(xmpp.initializeClient).toHaveBeenCalledTimes(calls);
    // no second room load either: the init effect did not run again
    expect(xmpp.syncRooms).toHaveBeenCalledTimes(loads);
    expect(purge).not.toHaveBeenCalled();
    expect((store.getState() as any).rooms.rooms).toBe(roomsBefore);
    expect((store.getState() as any).chatSettingStore.user).toBe(userBefore);
    expect((store.getState() as any).rooms.rooms[ROOM].messages).toHaveLength(1);
  });

  it('the cache scope does not depend on any live key', () => {
    const scope = buildCacheScope(base);
    expect(
      buildCacheScope({
        ...base,
        colors: { primary: '#0052cd' },
        colorScheme: 'dark',
        disableMedia: true,
        disableRooms: true,
        typography: { fontFamily: 'Inter', fontSize: 18 },
        backgroundChat: { color: '#101820' },
        chatHeaderBurgerMenu: true,
        customTypingIndicator: { enabled: true },
        translates: { enabled: true },
      })
    ).toBe(scope);
    // while the connection fields do move it
    expect(buildCacheScope({ ...base, baseUrl: 'https://other.example.test' })).not.toBe(scope);
    expect(buildCacheScope({ ...base, appId: 'someotherapp' })).not.toBe(scope);
  });
});
