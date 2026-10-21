import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';

// LoginWrapper is where the session and the XMPP connection hang. A probe in
// its place counts mounts and keeps the config it was handed, so the test can
// say "the part that owns the connection was not touched".
const probe = vi.hoisted(() => ({ mounts: 0, unmounts: 0, config: undefined as any, renders: 0 }));
vi.mock('./LoginWrapper.tsx', async () => {
  const R = await import('react');
  const LoginWrapperProbe = ({ config }: { config?: any }) => {
    probe.config = config;
    probe.renders += 1;
    R.useEffect(() => {
      probe.mounts += 1;
      return () => {
        probe.unmounts += 1;
      };
    }, []);
    return R.createElement('div', { 'data-testid': 'login-wrapper' });
  };
  return { default: LoginWrapperProbe };
});
vi.mock('../../hooks/useInAppNotifications', () => ({ useInAppNotifications: () => {} }));
vi.mock('../../hooks/usePushNotifications', () => ({
  default: () => ({ requestPermission: vi.fn() }),
}));
vi.mock('../Notification/NotificationPermissionBanner', () => ({ default: () => null }));

import { ReduxWrapper } from './ReduxWrapper';
import { store } from '../../roomStore';
import { setConfig, setRemoteConfig, setUser } from '../../roomStore/chatSettingsSlice';
import { addRoom, setCurrentRoom } from '../../roomStore/roomsSlice';
import { publishChatComponentConfigUpdated, resetChatComponentConfigListeners } from '../../helpers/chatComponentConfigEvents';
import { clearTypography } from '../../helpers/applyTypography';

const APP = '646cc8dc96d4a4dc8f7b2f2d';
const ROOM = `${APP}_room@conference.xmpp.example.com`;
const root = () => document.documentElement;
const cssVar = (name: string) => root().style.getPropertyValue(name);
const storeConfig = () => (store.getState() as any).chatSettingStore.config;

beforeEach(() => {
  probe.mounts = 0;
  probe.unmounts = 0;
  probe.renders = 0;
  probe.config = undefined;
  resetChatComponentConfigListeners();
  store.dispatch(setRemoteConfig(null));
  store.dispatch(setConfig({ appId: APP, colors: { primary: '#0052CD', secondary: '#F3F6FC' } } as any));
  clearTypography();
  ['--ethora-icon-color', '--ethora-input-bg', '--ethora-chat-bg'].forEach((v) =>
    root().style.removeProperty(v)
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a mounted chat takes a new look live', () => {
  it('re-themes from a changed config prop without touching the session, the rooms or the connection owner', async () => {
    store.dispatch(setUser({ _id: 'me', xmppUsername: `${APP}_me`, xmppPassword: 'pw', token: 't' } as any));
    store.dispatch(
      addRoom({ roomData: { jid: ROOM, name: 'R', title: 'R', members: [], messages: [{ id: 'm1', body: 'hi' }], unreadMessages: 0 } } as any)
    );
    store.dispatch(setCurrentRoom({ roomJID: ROOM }));
    const before = store.getState() as any;

    const host = { appId: APP, colors: { primary: '#111111' }, disableMedia: false } as any;
    const { container, rerender } = render(<ReduxWrapper config={host} />);
    await waitFor(() => expect(probe.mounts).toBe(1));
    expect(storeConfig().colors.primary).toBe('#111111');
    expect(cssVar('--ethora-icon-color')).toBe('#111111');

    rerender(
      <ReduxWrapper
        config={{
          ...host,
          colors: { primary: '#0052cd', inputBackground: '#fafafa', ownMessageBackground: '#e0f0ff' },
          colorScheme: 'dark',
          disableMedia: true,
          backgroundChat: { color: '#101820' },
          typography: { fontFamily: 'Inter', fontSize: 15 },
        }}
      />
    );

    await waitFor(() => expect(storeConfig().colors.primary).toBe('#0052cd'));
    expect(storeConfig().disableMedia).toBe(true);
    expect(storeConfig().colorScheme).toBe('dark');
    expect(cssVar('--ethora-icon-color')).toBe('#0052cd');
    expect(cssVar('--ethora-input-bg')).toBe('#fafafa');
    expect(cssVar('--ethora-chat-bg')).toBe('#101820');
    expect(cssVar('--ethora-font-family')).toContain('Inter');
    expect(cssVar('--ethora-font-size')).toBe('15px');
    expect(container.querySelector('[data-ethora-color-scheme]')?.getAttribute('data-ethora-color-scheme')).toBe('dark');

    // The connection owner was re-rendered with the new config, never re-mounted
    expect(probe.mounts).toBe(1);
    expect(probe.unmounts).toBe(0);
    expect(probe.config.colors.primary).toBe('#0052cd');

    // Nothing in the session or the room state was replaced
    const after = store.getState() as any;
    expect(after.rooms.rooms).toBe(before.rooms.rooms);
    expect(after.rooms.activeRoomJID).toBe(ROOM);
    expect(after.chatSettingStore.user).toBe(before.chatSettingStore.user);
  });

  it('puts the default look back when the host removes colours and typography', async () => {
    const { rerender } = render(
      <ReduxWrapper
        config={{
          appId: APP,
          colors: { primary: '#0052cd', inputBackground: '#fafafa' },
          typography: { fontFamily: 'Inter', fontSize: 16, googleFontsFamily: 'Inter' },
          backgroundChat: { color: '#101820' },
        } as any}
      />
    );
    await waitFor(() => expect(cssVar('--ethora-input-bg')).toBe('#fafafa'));
    expect(cssVar('--ethora-font-family')).toContain('Inter');
    expect(document.getElementById('ethora-typography-google')).not.toBeNull();

    rerender(<ReduxWrapper config={{ appId: APP, colors: { primary: '#0052cd' } } as any} />);

    await waitFor(() => expect(cssVar('--ethora-input-bg')).toBe(''));
    expect(cssVar('--ethora-chat-bg')).toBe('');
    expect(cssVar('--ethora-font-family')).toBe('');
    expect(cssVar('--ethora-font-size')).toBe('');
    expect(document.getElementById('ethora-typography-google')).toBeNull();
    expect(probe.mounts).toBe(1);
    expect(probe.unmounts).toBe(0);
  });
});

describe('config.remoteAppearance', () => {
  const answer = (config: Record<string, unknown>, version: string) =>
    ({ ok: true, status: 200, json: async () => ({ ok: true, config, version }) }) as any;

  it('holds the first paint for the first read, lays the saved look over the config, and follows the server event', async () => {
    let release!: (r: any) => void;
    const first = new Promise((res) => (release = res));
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce(answer({ 'colors.primary': '#aa0000', disableRooms: true }, '12'));
    vi.stubGlobal('fetch', fetchMock);

    const host = {
      appId: APP,
      baseUrl: 'https://api.example.test/v1',
      colors: { primary: '#111111', secondary: '#222222' },
      remoteAppearance: { appId: APP },
    } as any;
    const { queryByTestId } = render(<ReduxWrapper config={host} />);

    // waiting: the chat has not started
    expect(queryByTestId('login-wrapper')).toBeNull();
    expect(probe.mounts).toBe(0);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `https://api.example.test/v2/chat-component/config?appId=${APP}`
    );

    await act(async () => release(answer({ 'colors.primary': '#0052cd', colorScheme: 'dark' }, '11')));
    await waitFor(() => expect(queryByTestId('login-wrapper')).not.toBeNull());
    expect(probe.mounts).toBe(1);
    // the server wins for the keys it holds, siblings stay
    expect(probe.config.colors).toEqual({ primary: '#0052cd', secondary: '#222222' });
    expect(probe.config.colorScheme).toBe('dark');
    expect(storeConfig().colors.primary).toBe('#0052cd');
    expect(cssVar('--ethora-icon-color')).toBe('#0052cd');

    // the admin saves again; the server announces version 12
    await act(async () => publishChatComponentConfigUpdated({ appId: APP, version: '12' }));
    await waitFor(() => expect(storeConfig().colors.primary).toBe('#aa0000'));
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      `https://api.example.test/v2/chat-component/config?appId=${APP}&v=12`
    );
    expect(storeConfig().disableRooms).toBe(true);
    // the previous saved colour scheme is gone from the record, so the host default is back
    expect(storeConfig().colorScheme).toBeUndefined();
    expect(cssVar('--ethora-icon-color')).toBe('#aa0000');
    expect(probe.config.disableRooms).toBe(true);

    // no restart of the part that owns the connection
    expect(probe.mounts).toBe(1);
    expect(probe.unmounts).toBe(0);
  });

  it('another writer of config (the provider) cannot undo the saved look', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer({ 'colors.primary': '#0052cd', disableMedia: true }, '3')));
    render(
      <ReduxWrapper
        config={{ appId: APP, baseUrl: 'https://api.example.test', colors: { primary: '#111111' }, remoteAppearance: { appId: APP } } as any}
      />
    );
    await waitFor(() => expect(storeConfig().colors.primary).toBe('#0052cd'));

    act(() => {
      store.dispatch(setConfig({ appId: APP, colors: { primary: '#111111', secondary: '#333333' } } as any));
    });
    expect(storeConfig().colors).toEqual({ primary: '#0052cd', secondary: '#333333' });
    expect(storeConfig().disableMedia).toBe(true);
  });

  it('a failed first read starts the chat with the host look; a later failure keeps the shown look', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('502'));
    vi.stubGlobal('fetch', fetchMock);
    const { queryByTestId } = render(
      <ReduxWrapper
        config={{ appId: APP, baseUrl: 'https://api.example.test', colors: { primary: '#111111' }, remoteAppearance: { appId: APP } } as any}
      />
    );
    await waitFor(() => expect(queryByTestId('login-wrapper')).not.toBeNull());
    expect(probe.config.colors.primary).toBe('#111111');
    await act(async () => publishChatComponentConfigUpdated({ appId: APP, version: '2' }));
    expect(probe.config.colors.primary).toBe('#111111');
    expect(probe.mounts).toBe(1);
  });

  it('without remoteAppearance nothing is fetched and the chat starts at once', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { queryByTestId } = render(<ReduxWrapper config={{ appId: APP } as any} />);
    await waitFor(() => expect(queryByTestId('login-wrapper')).not.toBeNull());
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
