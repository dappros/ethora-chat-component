import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import CustomTypingIndicator from './CustomTypingIndicator';

/**
 * The `overlay` and `floating` variants interpolate a `keyframes` object (and,
 * since the motion refresh, a `css` block) into the position switch. Returning
 * a plain template literal from that switch makes styled-components v4+ throw
 * "interpolating a keyframe declaration into an untagged string", so both
 * variants crashed at render. Each branch has to return `css\`...\``.
 */
describe('CustomTypingIndicator - every position variant renders', () => {
  const positions = ['bottom', 'top', 'overlay', 'floating'] as const;

  it.each(positions)('renders with position="%s"', (position) => {
    const { container } = render(
      <CustomTypingIndicator
        usersTyping={['Ann']}
        isVisible
        position={position}
      />
    );
    expect(container.textContent).toContain('Ann');
  });

  it('does not leak the position prop to the DOM', () => {
    const { container } = render(
      <CustomTypingIndicator usersTyping={['Ann']} isVisible position="top" />
    );
    expect(container.querySelector('[position]')).toBeNull();
  });
});
