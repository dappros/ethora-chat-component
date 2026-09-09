import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../../../test/renderWithProviders';

const deleteMe = vi.fn();
const performLogout = vi.fn();

vi.mock('../../../../networking/api-requests/user.api', () => ({
  deleteMe: (...args: unknown[]) => deleteMe(...args),
  getExportMyData: vi.fn().mockResolvedValue({ data: '' }),
}));

vi.mock('../../../../hooks/useLogout', () => ({
  logoutService: { performLogout: (...args: unknown[]) => performLogout(...args) },
}));

import ManageDataModal from './ManageDataModal';

const renderModal = () =>
  renderWithProviders(<ManageDataModal handleCloseModal={() => {}} />, {
    preloadedState: {
      chatSettingStore: { config: {}, user: { token: 't' } } as any,
    },
  });

// "Delete my account" shipped with no onClick at all: it looked like a
// working destructive control and did nothing, while deleteMe() sat unused
// in user.api.ts. It is wired now - but a one-click irreversible account
// deletion would be worse than the dead button, so the confirmation step is
// part of the contract these tests protect.
describe('ManageDataModal - delete my account', () => {
  beforeEach(() => {
    deleteMe.mockReset().mockResolvedValue(undefined);
    performLogout.mockReset().mockResolvedValue(undefined);
  });

  it('asks for confirmation instead of deleting on the first click', () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Delete My Account' }));

    expect(deleteMe).not.toHaveBeenCalled();
    expect(screen.getByText('Delete your account?')).toBeTruthy();
  });

  it('deletes and tears the session down once confirmed', async () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Delete My Account' }));
    const confirm = screen
      .getAllByRole('button', { name: 'Delete My Account' })
      .at(-1) as HTMLElement;

    await act(async () => {
      fireEvent.click(confirm);
    });

    expect(deleteMe).toHaveBeenCalledTimes(1);
    expect(performLogout).toHaveBeenCalledTimes(1);
  });

  it('leaves the account alone when the confirmation is dismissed', () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Delete My Account' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(deleteMe).not.toHaveBeenCalled();
    expect(screen.queryByText('Delete your account?')).toBeNull();
  });
});
