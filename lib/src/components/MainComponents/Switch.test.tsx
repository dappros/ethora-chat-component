import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import Switch from './Switch';

// Regression: SwitchContainer/Toggle forwarded `isOn`/`bgColor` straight to
// the DOM (React dev-mode "does not recognize the `isOn` prop" warnings).
// They are now transient `$`-prefixed props consumed only by
// styled-components, so the raw attribute names must never land on the DOM.
describe('Switch prop leaks', () => {
  it('does not forward isOn/bgColor to the DOM', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <Switch onToggle={() => {}} bgColor="#123456" checked />
    );

    expect(container.querySelector('[isOn]')).toBeNull();
    expect(container.querySelector('[bgcolor]')).toBeNull();
    expect(
      spy.mock.calls.some((call) =>
        String(call[0]).includes('does not recognize')
      )
    ).toBe(false);

    spy.mockRestore();
  });
});
