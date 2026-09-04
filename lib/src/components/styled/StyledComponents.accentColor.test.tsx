import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { AlsoCheckbox } from './StyledComponents';

// Regression: AlsoCheckbox (used by ThreadWrapper's "Also send to" toggle)
// forwarded `accentColor` straight to the DOM. Despite rendering on a real
// checkbox <input>, React does not recognize `accentColor` as a valid DOM
// attribute (it fires "React does not recognize the `accentColor` prop"),
// so it still needed the same $-prefixed transient-prop treatment as the
// other leaks, not an exemption.
describe('AlsoCheckbox prop leak', () => {
  it('does not forward accentColor to the DOM', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <AlsoCheckbox type="checkbox" $accentColor="#0052CD" readOnly />
    );

    expect(container.querySelector('[accentcolor]')).toBeNull();
    expect(
      spy.mock.calls.some((call) =>
        String(call[0]).includes('does not recognize')
      )
    ).toBe(false);

    spy.mockRestore();
  });
});
