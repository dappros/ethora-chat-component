import { describe, it, expect } from 'vitest';
import {
  computeTextareaFit,
  COMPOSER_LINE_HEIGHT,
  COMPOSER_MAX_HEIGHT,
} from './textareaFit';

// scrollHeight as measured by the browser: content + 14px single-line padding.
const sh = (lines: number) => lines * COMPOSER_LINE_HEIGHT + 14;

describe('computeTextareaFit', () => {
  it('keeps the single-line field at the base height (empty and one line)', () => {
    const base = computeTextareaFit(sh(1));
    expect(base).toEqual({ height: 34, multiline: false, scrollable: false });
    expect(computeTextareaFit(0).height).toBe(34);
  });

  it('two lines grow the field and switch to the compact padding', () => {
    const two = computeTextareaFit(sh(2));
    expect(two.multiline).toBe(true);
    expect(two.height).toBe(2 * COMPOSER_LINE_HEIGHT + 10);
    expect(two.height - computeTextareaFit(sh(1)).height).toBe(16);
  });

  it('keeps growing per line and caps at the max height', () => {
    expect(computeTextareaFit(sh(3)).height).toBe(70);
    const capped = computeTextareaFit(sh(20));
    expect(capped.height).toBe(COMPOSER_MAX_HEIGHT);
    expect(capped.scrollable).toBe(true);
    expect(computeTextareaFit(sh(5)).scrollable).toBe(false);
  });
});
