import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { MODAL_TYPES } from '../../../helpers/constants/MODAL_TYPES';

vi.mock('../modalComponents', () => ({
  MODAL_COMPONENTS: {
    messagesearch: () => <div data-testid="search-panel" />,
  },
}));

import ModalContent from './ModalContent';

const renderContent = async (config: Record<string, unknown>) => {
  const result = renderWithProviders(
    <ModalContent modal={MODAL_TYPES.MESSAGE_SEARCH} setOpenModal={() => {}} />,
    {
      preloadedState: {
        chatSettingStore: { config, user: { token: 't' } } as any,
      },
    }
  );
  await act(async () => {
    await Promise.resolve();
  });
  return result;
};

describe('ModalContent and message search', () => {
  it('does not open the search panel by default', async () => {
    const { queryByTestId } = await renderContent({ appId: 'app' });
    expect(queryByTestId('search-panel')).toBeNull();
  });

  it('does not open it with the flag but no appId', async () => {
    const { queryByTestId } = await renderContent({
      enableMessageSearch: true,
    });
    expect(queryByTestId('search-panel')).toBeNull();
  });

  it('opens it with enableMessageSearch and an appId', async () => {
    const { queryByTestId } = await renderContent({
      appId: 'app',
      enableMessageSearch: true,
    });
    expect(queryByTestId('search-panel')).toBeTruthy();
  });

  it('does not open it when disableMessageSearch wins', async () => {
    const { queryByTestId } = await renderContent({
      appId: 'app',
      enableMessageSearch: true,
      disableMessageSearch: true,
    });
    expect(queryByTestId('search-panel')).toBeNull();
  });
});
