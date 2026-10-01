import { describe, expect, it } from 'vitest';
import { computeAnchoredScrollTop } from './computeAnchoredScrollTop';

describe('computeAnchoredScrollTop', () => {
  it('keeps the reader in place using their live position, not the stale one', () => {
    // Request started at top 1914, reader scrolled on up to 914 while the page
    // loaded, and the page added 10049px above them.
    expect(computeAnchoredScrollTop(914, 10658, 20707)).toBe(10963);
  });

  it('never moves the reader when the list did not grow', () => {
    expect(computeAnchoredScrollTop(500, 8000, 8000)).toBe(500);
    expect(computeAnchoredScrollTop(500, 8000, 7000)).toBe(500);
  });
});
