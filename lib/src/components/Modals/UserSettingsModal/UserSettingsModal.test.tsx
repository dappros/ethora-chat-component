import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';
import UserSettingsModal from './UserSettingsModal';
import { MODAL_TYPES } from '../../../helpers/constants/MODAL_TYPES';

describe('UserSettingsModal', () => {
  it('groups its rows under a labelled section, each row explaining itself', () => {
    renderWithProviders(<UserSettingsModal handleCloseModal={() => {}} />, {
      preloadedState: {
        chatSettingStore: { config: {}, user: { token: 't' } } as any,
      },
    });

    // The section heading is what turns two loose buttons into a screen.
    expect(
      screen.getByRole('heading', { name: 'Privacy and data' })
    ).toBeTruthy();

    const manageData = screen.getByRole('button', { name: /Manage Data/ });
    expect(manageData.textContent).toContain(
      'Download a copy of your data, or delete your account'
    );
    const visibility = screen.getByRole('button', { name: /Visibility/ });
    expect(visibility.textContent).toContain(
      'Choose who can see your profile and documents'
    );
  });

  it('opens the sub-panel a row points at', () => {
    const { store } = renderWithProviders(
      <UserSettingsModal handleCloseModal={() => {}} />,
      {
        preloadedState: {
          chatSettingStore: { config: {}, user: { token: 't' } } as any,
        },
      }
    );

    fireEvent.click(screen.getByRole('button', { name: /Visibility/ }));
    expect(
      (store.getState() as any).chatSettingStore.activeModal
    ).toBe(MODAL_TYPES.VISIBILITY);
  });

  it('no longer offers the stub entries that had no backing API', () => {
    renderWithProviders(<UserSettingsModal handleCloseModal={() => {}} />, {
      preloadedState: {
        chatSettingStore: { config: {}, user: { token: 't' } } as any,
      },
    });

    expect(screen.queryByText(/Blocked Users/i)).toBeNull();
    expect(screen.queryByText(/Referrals/i)).toBeNull();
    expect(screen.queryByText(/Profile Shares/i)).toBeNull();
    expect(screen.queryByText(/Document Shares/i)).toBeNull();
  });
});
