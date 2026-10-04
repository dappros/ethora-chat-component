import { describe, expect, it } from 'vitest';
import { anchorScrollDelta, pickAnchorRow } from './scrollAnchor';

const rows = [
  { id: 'a', top: -30, bottom: 40 },
  { id: 'b', top: 40, bottom: 120 },
  { id: 'c', top: 120, bottom: 200 },
  { id: 'd', top: 200, bottom: 400 },
];

describe('pickAnchorRow', () => {
  it('prefers the first row fully inside the viewport', () => {
    expect(pickAnchorRow(0, 300, rows)).toEqual({ id: 'b', offset: 40 });
  });

  it('falls back to the first intersecting row when none fits', () => {
    expect(pickAnchorRow(0, 100, [{ id: 'x', top: -50, bottom: 500 }])).toEqual(
      { id: 'x', offset: -50 }
    );
  });

  it('ignores rows above and below the viewport', () => {
    const all = [
      { id: 'gone', top: -200, bottom: -100 },
      ...rows,
      { id: 'below', top: 900, bottom: 950 },
    ];
    expect(pickAnchorRow(0, 300, all)?.id).toBe('b');
    expect(pickAnchorRow(1000, 1100, all)).toBeNull();
  });
});

describe('anchorScrollDelta', () => {
  it('is how far the anchor row moved relative to the scroller', () => {
    const anchor = { id: 'b', offset: 40 };
    expect(anchorScrollDelta(anchor, 540, 0)).toBe(500);
    expect(anchorScrollDelta(anchor, 40, 0)).toBe(0);
    expect(anchorScrollDelta(anchor, 30, 0)).toBe(-10);
  });
});
