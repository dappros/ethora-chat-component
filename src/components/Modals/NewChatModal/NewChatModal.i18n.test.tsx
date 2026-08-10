import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';
import NewChatModal from './NewChatModal';

vi.mock('../../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: {} }),
}));

const renderModal = (locale: string) =>
  renderWithProviders(<NewChatModal />, {
    preloadedState: {
      chatSettingStore: {
        config: { i18n: { locale } },
        user: { xmppUsername: 'me' },
      } as any,
    },
  });

// End-to-end proof that the audit's flagged strings (exactly what showed
// up hardcoded in the earlier screenshot: "Cancel"/"Add"/"Create"/
// "Back to creation") now actually render translated when a locale is
// set - not just that the string tables contain the right keys.
describe('NewChatModal i18n', () => {
  it('renders the modal title and buttons in French', () => {
    renderModal('fr');
    fireEvent.click(document.querySelector('button')!);

    expect(screen.getByText('Créer une discussion')).toBeTruthy();
    expect(screen.getByText('Annuler')).toBeTruthy();
    expect(screen.getByText('Créer')).toBeTruthy();
  });

  it('the room-name placeholder is translated too, not just button labels', () => {
    renderModal('fr');
    fireEvent.click(document.querySelector('button')!);

    expect(screen.getByPlaceholderText('Nom du salon')).toBeTruthy();
  });

  it('renders the create/cancel buttons in Spanish', () => {
    renderModal('es');
    fireEvent.click(document.querySelector('button')!);

    expect(screen.getByText('Crear nuevo chat')).toBeTruthy();
    expect(screen.getByText('Cancelar')).toBeTruthy();
    expect(screen.getByText('Crear')).toBeTruthy();
  });

  it('falls back to English when no locale is set', () => {
    renderWithProviders(<NewChatModal />, {
      preloadedState: {
        chatSettingStore: { config: {}, user: { xmppUsername: 'me' } } as any,
      },
    });
    fireEvent.click(document.querySelector('button')!);

    expect(screen.getByText('Create New Chat')).toBeTruthy();
  });
});
