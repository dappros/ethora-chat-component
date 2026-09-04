import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/renderWithProviders';
import Select from './Select';

// Regression: SelectBox/Icon forwarded `isOpen`/`borderColor` straight to
// the DOM. They are now transient `$`-prefixed props consumed only by
// styled-components, so the raw attribute names must never land on the DOM.
describe('Select prop leaks', () => {
  it('does not forward isOpen/borderColor to the DOM', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = renderWithProviders(
      <Select
        options={[{ name: 'One', id: '1' }]}
        placeholder="Pick one"
        onSelect={() => {}}
        accentColor="#123456"
      />,
      { preloadedState: { chatSettingStore: { config: {} } as any } }
    );

    expect(container.querySelector('[isopen]')).toBeNull();
    expect(container.querySelector('[bordercolor]')).toBeNull();
    expect(
      spy.mock.calls.some((call) =>
        String(call[0]).includes('does not recognize')
      )
    ).toBe(false);

    spy.mockRestore();
  });
});
