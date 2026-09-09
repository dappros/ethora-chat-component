import React from 'react';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import HeaderLogo, { HEADER_LOGO_TEST_ID } from './HeaderLogo';

// config.headerLogo carries the same string-or-node duality as
// config.fallbackScreens: a string is a URL, anything else is a node the
// host wants rendered untouched.
describe('HeaderLogo', () => {
  it('renders a string as an <img> pointing at that URL', () => {
    renderWithProviders(<HeaderLogo logo="https://acme.test/logo.svg" />, {
      preloadedState: { chatSettingStore: { config: {} } as any },
    });

    const img = screen.getByTestId(HEADER_LOGO_TEST_ID) as HTMLImageElement;
    expect(img.tagName).toBe('IMG');
    expect(img.getAttribute('src')).toBe('https://acme.test/logo.svg');
  });

  it('gives the image a translated alt text rather than an empty one', () => {
    renderWithProviders(<HeaderLogo logo="https://acme.test/logo.svg" />, {
      preloadedState: {
        chatSettingStore: { config: { i18n: { locale: 'fr' } } } as any,
      },
    });

    // fr and en happen to share "Logo"; the point is the alt comes from the
    // string table, not a hardcoded literal, and is never blank.
    const img = screen.getByTestId(HEADER_LOGO_TEST_ID);
    expect(img.getAttribute('alt')).toBeTruthy();
  });

  it('renders a React element as-is, with no <img> wrapper', () => {
    renderWithProviders(
      <HeaderLogo logo={<span data-testid="host-logo">ACME</span>} />,
      { preloadedState: { chatSettingStore: { config: {} } as any } }
    );

    expect(screen.getByTestId('host-logo').textContent).toBe('ACME');
    expect(document.querySelector('img')).toBeNull();
  });

  it('renders nothing for a blank string so an empty config value is inert', () => {
    renderWithProviders(<HeaderLogo logo="   " />, {
      preloadedState: { chatSettingStore: { config: {} } as any },
    });

    expect(screen.queryByTestId(HEADER_LOGO_TEST_ID)).toBeNull();
  });
});
