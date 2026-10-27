import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';
import NewChatModal from './NewChatModal';

vi.mock('../../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: {} }),
}));

const usersSet = {
  alice: {
    _id: 'u1',
    xmppUsername: 'alice',
    firstName: 'Alice',
    lastName: 'A',
  },
  bob: {
    _id: 'u2',
    xmppUsername: 'bob',
    firstName: 'Bob',
    lastName: 'B',
  },
};

const openModal = () => {
  renderWithProviders(<NewChatModal />, {
    preloadedState: {
      chatSettingStore: { config: {}, user: { xmppUsername: 'me' } } as any,
      rooms: { usersSet } as any,
    },
  });
  fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
};

// This modal used to be a two-step flow: a "chat type" dropdown on step 1,
// and a separate full-screen "Add users" step (activeTab '1') you navigated
// to and back from. It is now a single screen: a Public/Group segmented
// control; picking "Private group" reveals a compact member-picker section
// that can be expanded on demand.
describe('NewChatModal chat-type segmented control', () => {
  it('renders Public and Private group options instead of a dropdown', () => {
    openModal();

    const group = screen.getByRole('radiogroup', { name: 'Select chat type' });
    expect(group).toBeTruthy();

    const publicOption = within(group).getByRole('radio', { name: 'Public' });
    const privateOption = within(group).getByRole('radio', {
      name: 'Private group',
    });
    expect(publicOption.getAttribute('aria-checked')).toBe('true');
    expect(privateOption.getAttribute('aria-checked')).toBe('false');
    expect(within(group).queryByRole('radio', { name: 'Private' })).toBeNull();
    expect(
      document.querySelector('[data-testid="new-chat-dialog-body"]')
    ).toBeTruthy();
    expect(
      document.querySelector('[data-testid="new-chat-dialog-footer"]')
    ).toBeTruthy();

    // No dropdown/select control on the page.
    expect(document.querySelector('select')).toBeNull();
  });

  it('reveals the member action when Private group is selected', () => {
    openModal();

    // Before selecting a private group, no user-search input and the modal's own
    // Create/Cancel buttons are visible (i.e. we're not on a separate
    // full-screen step).
    expect(screen.queryByPlaceholderText('Search users...')).toBeNull();
    expect(screen.getByText('Create')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: 'Private group' }));

    expect(screen.getByRole('radio', { name: 'Private group' }).id).toBe(
      'ethora-chattype-group'
    );

    // The member picker stays collapsed until explicitly opened; the
    // selected count and Create/Cancel actions remain on the same screen.
    expect(screen.queryByPlaceholderText('Search users...')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add members' })).toBeTruthy();
    expect(screen.getByPlaceholderText('Enter Room Name')).toBeTruthy();
    expect(screen.getByText('Create')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();

    // There is no more "Back to creation" step to navigate away from.
    expect(screen.queryByText('Back to creation')).toBeNull();
  });

  it('hides the user picker again when switching back to Public', () => {
    openModal();

    fireEvent.click(screen.getByRole('radio', { name: 'Private group' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add members' }));
    expect(screen.getByPlaceholderText('Search users...')).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: 'Public' }));
    expect(screen.queryByPlaceholderText('Search users...')).toBeNull();
  });

  it('selecting a user in the inline picker updates the selection', () => {
    openModal();
    fireEvent.click(screen.getByRole('radio', { name: 'Private group' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add members' }));

    const aliceRow = screen.getByText('Alice A').closest('[role="option"]')!;
    expect(aliceRow.getAttribute('aria-selected')).toBe('false');

    fireEvent.click(aliceRow);
    expect(aliceRow.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('button', { name: 'Add members' })).toBeTruthy();
  });

  it('supports arrow-key roving between Public and Group', () => {
    openModal();

    const group = screen.getByRole('radiogroup', { name: 'Select chat type' });
    const publicOption = within(group).getByRole('radio', { name: 'Public' });
    const privateOption = within(group).getByRole('radio', {
      name: 'Private group',
    });

    expect(publicOption.getAttribute('tabindex')).toBe('0');
    expect(privateOption.getAttribute('tabindex')).toBe('-1');

    fireEvent.keyDown(group, { key: 'ArrowRight' });

    expect(privateOption.getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(privateOption);
  });

  it('resets chat type and the picker back to Public after closing and reopening', () => {
    openModal();
    fireEvent.click(screen.getByRole('radio', { name: 'Private group' }));
    expect(screen.queryByPlaceholderText('Search users...')).toBeNull();

    fireEvent.click(screen.getByText('Cancel'));
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));

    expect(
      screen.getByRole('radio', { name: 'Public' }).getAttribute('aria-checked')
    ).toBe('true');
    expect(screen.queryByPlaceholderText('Search users...')).toBeNull();
  });
});
