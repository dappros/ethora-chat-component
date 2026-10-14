import { describe, expect, it } from 'vitest';
import { getAlbumLayout, getTileBorderRadius, getTileCorners } from './albumLayout';

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

describe('album tile corners', () => {
  const radii = (count: number) => {
    const layout = getAlbumLayout(count);
    return layout.placements.map((_, position) => getTileBorderRadius(layout, position));
  };
  const outer = '12px';
  const inner = '3px';

  it('rounds only the outer corners of a 2-up pair', () => {
    expect(radii(2)).toEqual([
      `${outer} ${inner} ${inner} ${outer}`,
      `${inner} ${outer} ${outer} ${inner}`,
    ]);
  });

  it('rounds only the bubble corners of the 3-up hero layout', () => {
    expect(radii(3)).toEqual([
      `${outer} ${inner} ${inner} ${outer}`,
      `${inner} ${outer} ${inner} ${inner}`,
      `${inner} ${inner} ${outer} ${inner}`,
    ]);
  });

  it('rounds exactly one outer corner per tile of the 2 x 2 quad', () => {
    expect(radii(4)).toEqual([
      `${outer} ${inner} ${inner} ${inner}`,
      `${inner} ${outer} ${inner} ${inner}`,
      `${inner} ${inner} ${inner} ${outer}`,
      `${inner} ${inner} ${outer} ${inner}`,
    ]);
  });

  it('keeps the same quad corners for the +N layout', () => {
    expect(radii(6)).toHaveLength(4);
    expect(radii(6)).toEqual(radii(4));
  });

  it('gives the full-width single tile all four outer corners', () => {
    expect(radii(1)).toEqual([`${outer} ${outer} ${outer} ${outer}`]);
  });

  it('reports no outer corner for a position outside the layout', () => {
    expect(getTileCorners(getAlbumLayout(2), 5)).toEqual({
      topLeft: false,
      topRight: false,
      bottomRight: false,
      bottomLeft: false,
    });
  });
});
