import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';

// The room list only needs a client for logout; nothing here talks XMPP.
vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: null, setClient: vi.fn() }),
}));

import RoomList from './RoomList';

const renderList = (config: Record<string, unknown>) =>
  renderWithProviders(<RoomList chats={[]} />, {
    preloadedState: {
      chatSettingStore: { config } as any,
      rooms: { rooms: {}, activeRoomJID: null } as any,
    },
  });

// The burger is the first button inside the chats tab panel, both in the
// built-in dropdown and in the host-handler variant, so click it structurally
// rather than by a label that only one of the two branches has. Scoping to the
// panel matters: the sidebar renders the Chats/Files tab buttons (and a mobile
// chat-list button) ahead of it, so the first button on the page is not it.
const clickTheBurger = () => {
  const panel = document.querySelector('#ethora-chats-tabpanel');
  if (!panel) throw new Error('chats tab panel not rendered');
  const button = panel.querySelector('button');
  if (!button) throw new Error('burger button not rendered');
  fireEvent.click(button);
};

describe('room list burger menu (config.headerMenu)', () => {
  it('opens the built-in Profile/Settings/Logout dropdown by default', () => {
    renderList({ chatHeaderSettings: { disableCreate: true } });

    clickTheBurger();

    expect(screen.getByText('Profile')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByText('Logout')).toBeTruthy();
  });

  it('calls the host handler instead of opening the dropdown', () => {
    const headerMenu = vi.fn();
    renderList({ headerMenu, chatHeaderSettings: { disableCreate: true } });

    clickTheBurger();

    expect(headerMenu).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Profile')).toBeNull();
    expect(screen.queryByText('Settings')).toBeNull();
    expect(screen.queryByText('Logout')).toBeNull();
  });

  it('keeps the burger labelled through i18n so it stays reachable', () => {
    renderList({
      headerMenu: vi.fn(),
      i18n: { locale: 'es' },
      chatHeaderSettings: { disableCreate: true },
    });

    expect(screen.getByLabelText('Menú')).toBeTruthy();
  });

  it('still respects the existing switches that hide the menu entirely', () => {
    renderList({
      headerMenu: vi.fn(),
      disableRoomMenu: true,
      chatHeaderSettings: { disableCreate: true, hideSearch: true },
    });

    // Scoped to the panel for the same reason as clickTheBurger: the tab
    // strip and the mobile chat-list button always render.
    const panel = document.querySelector('#ethora-chats-tabpanel');
    expect(panel?.querySelector('button')).toBeFalsy();
  });
});
