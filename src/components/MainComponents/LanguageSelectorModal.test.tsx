import React from 'react';
import { describe, expect, it } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { LanguageSelectorButton } from './LanguageSelectorModal';
import { LANGUAGE_OPTIONS } from '../../helpers/constants/LANGUAGE_OPTIONS';

const renderButton = (langSource?: string) => {
  const storeRef: { current: any } = { current: null };
  const utils = renderWithProviders(<LanguageSelectorButton />, {
    preloadedState: {
      chatSettingStore: { langSource, config: {} } as any,
    },
    storeRef,
  });
  return { ...utils, store: storeRef.current };
};

describe('LanguageSelectorButton', () => {
  it('renders as a closed icon button with no modal in the DOM', () => {
    renderButton();

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('button', { name: /select language/i })).toBeTruthy();
  });

  it('opens the modal on click and lists every language option', () => {
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: /select language/i }));

    const list = screen.getByRole('listbox');
    LANGUAGE_OPTIONS.forEach((option) => {
      expect(within(list).getByText(option.name)).toBeTruthy();
    });
  });

  it('marks the currently selected language', () => {
    renderButton('pt');

    fireEvent.click(screen.getByRole('button', { name: /select language/i }));

    const selectedRow = screen.getByRole('option', { name: /Portuguese/i });
    expect(selectedRow.getAttribute('aria-selected')).toBe('true');

    const otherRow = screen.getByRole('option', { name: /^English/i });
    expect(otherRow.getAttribute('aria-selected')).toBe('false');
  });

  it('dispatches setLangSource and closes the modal on pick', () => {
    const { store } = renderButton('en');

    fireEvent.click(screen.getByRole('button', { name: /select language/i }));
    fireEvent.click(screen.getByRole('option', { name: /Portuguese/i }));

    expect(store.getState().chatSettingStore.langSource).toBe('pt');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes on backdrop click without changing the selection', () => {
    const { store } = renderButton('en');

    fireEvent.click(screen.getByRole('button', { name: /select language/i }));
    // The backdrop is the listbox's outermost ancestor within the modal
    // subtree - everything past the button that opened it.
    const backdrop = screen.getByRole('button', {
      name: /select language/i,
    }).nextElementSibling as HTMLElement;
    fireEvent.click(backdrop);

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(store.getState().chatSettingStore.langSource).toBe('en');
  });

  it('closes on the explicit close button', () => {
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: /select language/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
