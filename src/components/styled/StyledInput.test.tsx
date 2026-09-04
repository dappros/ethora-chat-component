import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import InputWithLabel from './StyledInput';

// Regression: the internal styled.input/styled.span forwarded `error`
// straight to the DOM (not a valid HTML attribute for input/span). They are
// now transient `$error` props consumed only by styled-components.
describe('StyledInput prop leaks', () => {
  it('does not forward error to the DOM', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <InputWithLabel
        label="Name"
        helperText="Required"
        error
        value=""
        onChange={() => {}}
      />
    );

    expect(container.querySelector('[error]')).toBeNull();
    expect(
      spy.mock.calls.some((call) =>
        String(call[0]).includes('does not recognize')
      )
    ).toBe(false);

    spy.mockRestore();
  });
});
