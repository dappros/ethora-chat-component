import { describe, it, expect } from 'vitest';
import { renderWithProviders } from '../../test/renderWithProviders';
import { Avatar } from './Avatar';

// Regression: a name starting with a digit ("5test 5test") rendered as an
// empty circle in the message bubble - Avatar's own alphabetic-only regex
// rejected the leading digit, while the profile modal's
// ProfileImagePlaceholder (a wider [\p{L}\p{N}\p{P}] rule) correctly showed
// "55" for the same name. The two must agree.
describe('Avatar - getInitials', () => {
  it('builds initials from a name starting with a digit ("5test 5test" -> "55")', () => {
    const { container } = renderWithProviders(
      <Avatar firstName="5test" lastName="5test" />
    );
    expect(container.textContent).toBe('55');
  });

  it('still builds initials for a plain latin/cyrillic name', () => {
    const { container: latin } = renderWithProviders(
      <Avatar firstName="Alice" lastName="Doe" />
    );
    expect(latin.textContent).toBe('AD');

    const { container: cyrillic } = renderWithProviders(
      <Avatar firstName="фів" lastName="фів" />
    );
    expect(cyrillic.textContent).toBe('ФФ');
  });

  it('builds initials from a two-word username when no first/last name is given', () => {
    const { container } = renderWithProviders(<Avatar username="5test 5test" />);
    expect(container.textContent).toBe('55');
  });

  it('builds a single initial from a one-word username', () => {
    const { container } = renderWithProviders(<Avatar username="alice" />);
    expect(container.textContent).toBe('A');
  });

  it('falls back to "??" when there is nothing to derive initials from', () => {
    const { container } = renderWithProviders(<Avatar />);
    expect(container.textContent).toBe('??');
  });
});
