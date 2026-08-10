import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

// The chat's real bootstrap pulls in XMPP, push notifications and the
// persisted store's side effects - none of which this test is about. Stub
// everything below <ReduxWrapper>'s own enablers so the test isolates the
// one question that matters: does the HOST's config reach the redux store
// without a logged-in user?
vi.mock('./LoginWrapper.tsx', () => ({
  default: () => <div data-testid="login-wrapper" />,
}));
vi.mock('../../hooks/useInAppNotifications', () => ({
  useInAppNotifications: () => {},
}));
vi.mock('../../hooks/usePushNotifications', () => ({
  default: () => ({ requestPermission: vi.fn() }),
}));
vi.mock('../Notification/NotificationPermissionBanner', () => ({
  default: () => null,
}));

import { ReduxWrapper } from './ReduxWrapper';
import { store } from '../../roomStore';
import { setConfig } from '../../roomStore/chatSettingsSlice';
import { resolveIconColor } from '../../helpers/resolveIconColor';

const HOST_COLOR = '#5E3FDE';

// Reported by a host integrating 26.6.x: "the colour theme is not being
// applied (it uses Ethora's default colours for the icons, empty chat
// placeholder, etc.)".
//
// Root cause: two sources of truth. applyThemeColors reads the config PROP
// (so CSS-variable theming worked from first paint), but every component
// going through useChatSettingState + resolveIconColor reads the STORE - and
// the store was only populated by useChatWrapperInit, inside <ChatWrapper>,
// which LoginWrapper refuses to mount until there's a user with xmpp
// credentials. Before that (and forever, if login or the XMPP connection
// never completes) those components saw the slice's built-in default, whose
// primary is Ethora's own brand blue.
describe('ReduxWrapper - host config reaches the store before login', () => {
  beforeEach(() => {
    // Put the store back to the pre-bug-report state: the slice default,
    // which is what every affected component was actually rendering.
    store.dispatch(
      setConfig({ colors: { primary: '#0052CD', secondary: '#F3F6FC' } } as any)
    );
  });

  it('publishes the host colours to the store with no user logged in', async () => {
    expect(store.getState().chatSettingStore.user?.xmppUsername).toBeFalsy();

    render(<ReduxWrapper config={{ colors: { primary: HOST_COLOR } } as any} />);

    await waitFor(() => {
      expect(
        store.getState().chatSettingStore.config?.colors?.primary
      ).toBe(HOST_COLOR);
    });

    // What the affected components actually call.
    expect(resolveIconColor(store.getState().chatSettingStore.config)).toBe(
      HOST_COLOR
    );
  });

  it('leaves the slice default alone when the host passes no config', async () => {
    render(<ReduxWrapper />);

    await waitFor(() => {
      expect(screenHasRendered()).toBe(true);
    });

    // Never replaced with undefined - components dereference
    // config.colors.* unguarded, so blanking it would crash them.
    expect(
      store.getState().chatSettingStore.config?.colors?.primary
    ).toBe('#0052CD');
  });
});

// PersistGate renders a loader until rehydration finishes; children (and so
// the dispatch under test) only mount after it.
const screenHasRendered = () =>
  Boolean(document.querySelector('[data-testid="login-wrapper"]'));
