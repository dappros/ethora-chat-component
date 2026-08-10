import React from 'react';
import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import OnlineUsersPopover from './OnlineUsersPopover';

const ME = 'me_1234@conf.example.com';
const PEER = 'peer_5678@conf.example.com';

describe('OnlineUsersPopover', () => {
  it('renders nothing when no one is online', () => {
    renderWithProviders(
      <OnlineUsersPopover onlineUsernames={[]} members={[]} myXmppUsername={ME} />
    );
    expect(screen.queryByText(/online/)).toBeNull();
  });

  it('shows the online count as the trigger, closed by default', () => {
    renderWithProviders(
      <OnlineUsersPopover
        onlineUsernames={[ME, PEER]}
        members={[]}
        myXmppUsername={ME}
      />
    );
    expect(screen.getByText('2 online')).toBeTruthy();
    expect(screen.queryByText('You')).toBeNull();
  });

  it('lists online users on click, labeling the current user "You"', () => {
    renderWithProviders(
      <OnlineUsersPopover
        onlineUsernames={[ME, PEER]}
        members={[
          {
            xmppUsername: PEER,
            firstName: 'Ada',
            lastName: 'Lovelace',
          } as any,
        ]}
        myXmppUsername={ME}
      />
    );

    fireEvent.click(screen.getByText('2 online'));

    expect(screen.getByText('You')).toBeTruthy();
    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
  });

  it('falls back to the bare local part when no name is known', () => {
    renderWithProviders(
      <OnlineUsersPopover
        onlineUsernames={[PEER]}
        members={[]}
        myXmppUsername={ME}
      />
    );

    fireEvent.click(screen.getByText('1 online'));

    expect(screen.getByText('peer_5678')).toBeTruthy();
  });

  it('closes when clicking outside the popover', () => {
    renderWithProviders(
      <div>
        <div data-testid="outside">outside</div>
        <OnlineUsersPopover
          onlineUsernames={[PEER]}
          members={[]}
          myXmppUsername={ME}
        />
      </div>
    );

    fireEvent.click(screen.getByText('1 online'));
    expect(screen.getByText('peer_5678')).toBeTruthy();

    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByText('peer_5678')).toBeNull();
  });
});
