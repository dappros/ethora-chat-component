/**
 * Geometry for a multi-media album bubble. Pure data so the grid component
 * stays a dumb renderer and the layout rules can be tested without a DOM.
 *
 *   1 item   full width, 4:3
 *   2 items  side by side, square cells
 *   3 items  one large cell on the left, two stacked on the right
 *   4 items  2 x 2
 *   5+ items 2 x 2 showing the first four, the last cell carries "+N"
 */

export interface AlbumCellPlacement {
  /** CSS `grid-column` value. */
  column: string;
  /** CSS `grid-row` value. */
  row: string;
}

export interface AlbumLayout {
  kind: 'full' | 'pair' | 'hero' | 'quad';
  /** Number of tiles actually drawn. */
  visible: number;
  /** Items folded into the "+N" overlay on the last visible tile. */
  hidden: number;
  /** CSS `grid-template-columns`. */
  columns: string;
  /** CSS `grid-template-rows`. */
  rows: string;
  /** CSS `aspect-ratio` of the whole grid. */
  aspectRatio: string;
  /** One entry per visible tile, in order. */
  placements: AlbumCellPlacement[];
}

const LAYOUTS: Record<AlbumLayout['kind'], Omit<AlbumLayout, 'visible' | 'hidden'>> = {
  full: {
    kind: 'full',
    columns: '1fr',
    rows: '1fr',
    aspectRatio: '4 / 3',
    placements: [{ column: '1', row: '1' }],
  },
  pair: {
    kind: 'pair',
    columns: '1fr 1fr',
    rows: '1fr',
    aspectRatio: '2 / 1',
    placements: [
      { column: '1', row: '1' },
      { column: '2', row: '1' },
    ],
  },
  hero: {
    kind: 'hero',
    columns: '2fr 1fr',
    rows: '1fr 1fr',
    aspectRatio: '1 / 1',
    placements: [
      { column: '1', row: '1 / span 2' },
      { column: '2', row: '1' },
      { column: '2', row: '2' },
    ],
  },
  quad: {
    kind: 'quad',
    columns: '1fr 1fr',
    rows: '1fr 1fr',
    aspectRatio: '1 / 1',
    placements: [
      { column: '1', row: '1' },
      { column: '2', row: '1' },
      { column: '1', row: '2' },
      { column: '2', row: '2' },
    ],
  },
};

/** Layout for `count` media tiles. Counts below 1 are treated as 1. */
export const getAlbumLayout = (count: number): AlbumLayout => {
  const total = Math.max(1, Math.floor(Number.isFinite(count) ? count : 1));
  const kindFor = (): AlbumLayout['kind'] => {
    if (total === 1) return 'full';
    if (total === 2) return 'pair';
    if (total === 3) return 'hero';
    return 'quad';
  };
  const base = LAYOUTS[kindFor()];
  const visible = base.placements.length;
  return {
    ...base,
    placements: base.placements.map((cell) => ({ ...cell })),
    visible,
    hidden: Math.max(0, total - visible),
  };
};
