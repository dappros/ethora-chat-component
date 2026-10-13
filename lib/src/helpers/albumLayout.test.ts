import { describe, expect, it } from 'vitest';
import { getAlbumLayout } from './albumLayout';

describe('getAlbumLayout', () => {
  it('lays out 1 item full width', () => {
    const layout = getAlbumLayout(1);
    expect(layout).toMatchObject({ kind: 'full', visible: 1, hidden: 0, columns: '1fr', rows: '1fr' });
    expect(layout.placements).toEqual([{ column: '1', row: '1' }]);
  });

  it('lays out 2 items side by side', () => {
    const layout = getAlbumLayout(2);
    expect(layout).toMatchObject({ kind: 'pair', visible: 2, hidden: 0, columns: '1fr 1fr' });
    expect(layout.placements).toEqual([
      { column: '1', row: '1' },
      { column: '2', row: '1' },
    ]);
  });

  it('lays out 3 items as one large cell and two stacked', () => {
    const layout = getAlbumLayout(3);
    expect(layout).toMatchObject({ kind: 'hero', visible: 3, hidden: 0, columns: '2fr 1fr' });
    expect(layout.placements[0]).toEqual({ column: '1', row: '1 / span 2' });
    expect(layout.placements[1]).toEqual({ column: '2', row: '1' });
    expect(layout.placements[2]).toEqual({ column: '2', row: '2' });
  });

  it('lays out 4 items as a 2 x 2 grid', () => {
    const layout = getAlbumLayout(4);
    expect(layout).toMatchObject({ kind: 'quad', visible: 4, hidden: 0 });
    expect(layout.placements).toHaveLength(4);
  });

  it('shows four cells and counts the rest for 5 items', () => {
    const layout = getAlbumLayout(5);
    expect(layout).toMatchObject({ kind: 'quad', visible: 4, hidden: 1 });
    expect(layout.placements).toHaveLength(4);
  });

  it('keeps the same 2 x 2 grid for 6 items and counts two hidden', () => {
    const layout = getAlbumLayout(6);
    expect(layout).toMatchObject({ kind: 'quad', visible: 4, hidden: 2 });
  });

  it('never hands out shared placement objects', () => {
    const first = getAlbumLayout(4);
    first.placements[0].column = 'mutated';
    expect(getAlbumLayout(4).placements[0].column).toBe('1');
  });

  it('treats nonsense counts as a single item', () => {
    expect(getAlbumLayout(0).visible).toBe(1);
    expect(getAlbumLayout(Number.NaN).visible).toBe(1);
  });
});
