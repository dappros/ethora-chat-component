import React from 'react';
import { describe, expect, it } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { LanguageSelectorButton } from './LanguageSelectorModal';
import { LANGUAGE_OPTIONS } from '../../helpers/constants/LANGUAGE_OPTIONS';

const renderButton = (langSource?: string, container?: HTMLElement) => {
  const storeRef: { current: any } = { current: null };
  const utils = renderWithProviders(<LanguageSelectorButton />, {
    preloadedState: {
      chatSettingStore: { langSource, config: {} } as any,
    },
    storeRef,
    ...(container ? { container } : {}),
  });
  return { ...utils, store: storeRef.current };
};

const renderWithTranslates = (
  translates: Record<string, unknown>,
  translateSendEnabled?: boolean,
  translateMode?: 'auto' | 'manual'
) => {
  const storeRef: { current: any } = { current: null };
  const utils = renderWithProviders(<LanguageSelectorButton />, {
    preloadedState: {
      chatSettingStore: {
        langSource: 'en',
        translateSendEnabled,
        translateMode,
        config: { translates },
      } as any,
    },
    storeRef,
  });
  return { ...utils, store: storeRef.current };
};

// The globe's own aria-label goes through t('language.select'), so it is
// NOT English once the selected language has a table. Looking it up by the
// English name used to "work" only because pt/ht/zh had no translations
// and fell back - i.e. the lookup was asserting the bug. Find it
// structurally instead: before the modal opens, the globe is the only
// button rendered.
const openPicker = () => {
  const globe = document.querySelector('button');
  if (!globe) throw new Error('language globe button not rendered');
  fireEvent.click(globe);
};

describe('LanguageSelectorButton', () => {
  it('renders as a closed icon button with no modal in the DOM', () => {
    renderButton();

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.querySelector('button')).toBeTruthy();
  });

  it('opens the modal on click and lists every language option', () => {
    renderButton();

    openPicker();

    const list = screen.getByRole('listbox');
    LANGUAGE_OPTIONS.forEach((option) => {
      expect(within(list).getByText(option.name)).toBeTruthy();
    });
  });

  it('marks the currently selected language', () => {
    renderButton('fr');

    openPicker();

    const selectedRow = screen.getByRole('option', { name: /Français/i });
    expect(selectedRow.getAttribute('aria-selected')).toBe('true');

    const otherRow = screen.getByRole('option', { name: /^English/i });
    expect(otherRow.getAttribute('aria-selected')).toBe('false');
  });

  it('dispatches setLangSource and closes the modal on pick', () => {
    const { store } = renderButton('en');

    openPicker();
    fireEvent.click(screen.getByRole('option', { name: /Français/i }));

    expect(store.getState().chatSettingStore.langSource).toBe('fr');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes on backdrop click without changing the selection', () => {
    const { store } = renderButton('en');

    openPicker();
    // The modal is portaled to document.body (see LanguageSelectorModal.tsx
    // - it has to escape ChatContainer's overflow:hidden), so it's no
    // longer a DOM sibling of the button that opened it. The backdrop is
    // two levels up from the listbox: list -> modal container -> backdrop.
    const backdrop = screen.getByRole('listbox').parentElement!
      .parentElement as HTMLElement;
    fireEvent.click(backdrop);

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(store.getState().chatSettingStore.langSource).toBe('en');
  });

  it('closes on the explicit close button', () => {
    renderButton();

    openPicker();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.queryByRole('listbox')).toBeNull();
  });

  // Regression: ChatHeader (where this button lives) sits inside
  // ChatContainer, which is `overflow: hidden`. That clips ANY
  // position:fixed descendant to ChatContainer's own box - including this
  // modal's dimmed backdrop - regardless of z-index, which is why the
  // backdrop only ever dimmed the chat column and left the room-list
  // sidebar (a sibling of ChatContainer) untouched. The fix is a portal to
  // document.body; assert the modal actually renders there, outside any
  // clipping ancestor, rather than merely asserting it's visible (which a
  // non-portaled but z-index-boosted modal would also pass).
  it('renders the modal via a portal to document.body, escaping an overflow:hidden ancestor', () => {
    const clippingAncestor = document.createElement('div');
    clippingAncestor.style.overflow = 'hidden';
    document.body.appendChild(clippingAncestor);

    renderButton(undefined, clippingAncestor);
    openPicker();

    const modal = screen.getByRole('listbox');
    expect(clippingAncestor.contains(modal)).toBe(false);
    expect(document.body.contains(modal)).toBe(true);

    clippingAncestor.remove();
  });
});

// The enable/disable-translates toggle: lets a reader opt in/out of their
// OWN outgoing messages being tagged for translation, independent of
// which reader-language is selected in the list below it.
describe('LanguageSelectorButton - translate toggle', () => {
  it('does not render the toggle when the host has not enabled translates', () => {
    renderButton();

    openPicker();

    expect(screen.queryByRole('button', { name: /aria-pressed/i })).toBeNull();
    expect(screen.queryByText(/translate my messages/i)).toBeNull();
  });

  it('shows the toggle ON by default - undefined reads as opted-in', () => {
    renderWithTranslates({ enabled: true }, undefined);

    openPicker();

    const toggle = screen.getByRole('button', { name: '', pressed: true }) as HTMLElement;
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the disclaimer next to the toggle', () => {
    renderWithTranslates({ enabled: true });

    openPicker();

    expect(
      screen.getByText(/only new messages sent from now on will be translated/i)
    ).toBeTruthy();
  });

  it('dispatches setTranslateSendEnabled(false) on click, without closing the modal', () => {
    const { store } = renderWithTranslates({ enabled: true }, true);

    openPicker();
    fireEvent.click(screen.getByRole('button', { name: '', pressed: true }));

    expect(store.getState().chatSettingStore.translateSendEnabled).toBe(false);
    // Toggling translate-sending isn't "pick a language and close" - the
    // reader may want to flip it back or also pick a language next.
    expect(screen.queryByRole('listbox')).toBeTruthy();
  });

  it('hides the language list when showLanguageList is false, keeping only the toggle', () => {
    renderWithTranslates({ enabled: true, showLanguageList: false });

    openPicker();

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByText(/translate my messages/i)).toBeTruthy();
  });

  it('shows the language list by default when showLanguageList is unset', () => {
    renderWithTranslates({ enabled: true });

    openPicker();

    expect(screen.queryByRole('listbox')).toBeTruthy();
  });
});

// The auto/manual switcher: lets a reader pick how translations DISPLAY
// (shown inline automatically, or behind a click), independent of the
// send-tagging toggle above it and of which reader-language is selected.
describe('LanguageSelectorButton - translate mode switcher', () => {
  it('does not render when the host has not enabled translates', () => {
    renderButton();

    openPicker();

    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('renders Auto and Manual options, defaulting to the host mode (auto)', () => {
    renderWithTranslates({ enabled: true, mode: 'auto' });

    openPicker();

    const group = screen.getByRole('radiogroup');
    const auto = within(group).getByRole('radio', { name: /auto/i });
    const manual = within(group).getByRole('radio', { name: /manual/i });
    expect(auto.getAttribute('aria-checked')).toBe('true');
    expect(manual.getAttribute('aria-checked')).toBe('false');
  });

  it("reflects the host's manual default when the reader hasn't picked", () => {
    renderWithTranslates({ enabled: true, mode: 'manual' });

    openPicker();

    const manual = screen.getByRole('radio', { name: /manual/i });
    expect(manual.getAttribute('aria-checked')).toBe('true');
  });

  it('dispatches setTranslateMode on click and reflects the reader pick over the host default', () => {
    const { store } = renderWithTranslates({ enabled: true, mode: 'auto' });

    openPicker();
    fireEvent.click(screen.getByRole('radio', { name: /manual/i }));

    expect(store.getState().chatSettingStore.translateMode).toBe('manual');
  });

  it('a prior reader pick shows as selected on open', () => {
    renderWithTranslates({ enabled: true, mode: 'auto' }, undefined, 'manual');

    openPicker();

    const manual = screen.getByRole('radio', { name: /manual/i });
    expect(manual.getAttribute('aria-checked')).toBe('true');
  });

  it('does not render at all when the host set forceType: true, even with a prior reader pick', () => {
    renderWithTranslates(
      { enabled: true, mode: 'auto', forceType: true },
      undefined,
      'manual'
    );

    openPicker();

    expect(screen.queryByRole('radiogroup')).toBeNull();
  });
});
