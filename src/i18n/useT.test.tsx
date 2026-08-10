import React from 'react';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';
import { useT } from './useT';

const Probe: React.FC = () => {
  const t = useT();
  return <div data-testid="out">{t('action.send')}</div>;
};

const renderProbe = (chatSettingStore: any) =>
  renderWithProviders(<Probe />, { preloadedState: { chatSettingStore } });

describe('useT', () => {
  it('resolves from config.i18n.locale when the host sets it', () => {
    renderProbe({ config: { i18n: { locale: 'es' } } });
    expect(screen.getByTestId('out').textContent).toBe('Enviar');
  });

  // langSource is the same reader-language state the in-chat globe picker
  // and config.translates.readerLocale drive - falling back to it means
  // picking a language in the chat changes static captions too, not just
  // message translations, without the host having to separately manage
  // config.i18n.locale.
  it('falls back to langSource when config.i18n.locale is unset', () => {
    renderProbe({ config: {}, langSource: 'fr' });
    expect(screen.getByTestId('out').textContent).toBe('Envoyer');
  });

  it('an explicit config.i18n.locale wins over langSource', () => {
    renderProbe({ config: { i18n: { locale: 'es' } }, langSource: 'fr' });
    expect(screen.getByTestId('out').textContent).toBe('Enviar');
  });

  it('defaults to English when neither is set', () => {
    renderProbe({ config: {} });
    expect(screen.getByTestId('out').textContent).toBe('Send');
  });

  it('still honors config.i18n.strings overrides on top of the resolved locale', () => {
    renderProbe({
      config: { i18n: { locale: 'es', strings: { 'action.send': 'Custom' } } },
    });
    expect(screen.getByTestId('out').textContent).toBe('Custom');
  });
});
