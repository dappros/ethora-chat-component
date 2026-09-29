import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../../roomStore';
import { setConfig } from '../../roomStore/chatSettingsSlice';
import { HostConfigContext } from '../../styles/tokens';
import { ChatWrapperBox } from './ChatWrapperBox';

// The inner root used to theme itself from the STORE only. The host's config
// reaches the store one dispatch after the first paint, so for that first
// frame this element published LIGHT tokens over the dark ones it inherits
// from the outer root - a white flash across the whole chat pane, since
// ChatContainer's default background is a light gradient.
describe('ChatWrapperBox colour scheme', () => {
  it('uses the host config from context before the store has it', () => {
    store.dispatch(setConfig({ colors: { primary: '#0052CD' } } as any));

    const { container } = render(
      <Provider store={store}>
        <HostConfigContext.Provider value={{ colorScheme: 'dark' }}>
          <ChatWrapperBox />
        </HostConfigContext.Provider>
      </Provider>
    );

    const root = container.querySelector('[data-ethora-color-scheme]');
    expect(root?.getAttribute('data-ethora-color-scheme')).toBe('dark');
    // And the tokens it publishes are the dark ones, not just the attribute.
    expect((root as HTMLElement).style.getPropertyValue('--ethora-color-bg')).toBe(
      '#1A1C21'
    );
  });

  it('still falls back to the store when the host passes no config prop', () => {
    store.dispatch(
      setConfig({ colors: { primary: '#0052CD' }, colorScheme: 'dark' } as any)
    );

    const { container } = render(
      <Provider store={store}>
        <ChatWrapperBox />
      </Provider>
    );

    expect(
      container
        .querySelector('[data-ethora-color-scheme]')
        ?.getAttribute('data-ethora-color-scheme')
    ).toBe('dark');
  });
});
