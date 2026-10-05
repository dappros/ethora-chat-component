export interface AnchorRowRect {
  id: string;
  top: number;
  bottom: number;
}

export interface ScrollAnchor {
  id: string;
  /** Row top relative to the scroller's top edge. */
  offset: number;
}

/**
 * The row to hold still while content changes around it: the first row that
 * is fully inside the viewport, or, when none is (a row taller than the
 * viewport, or the viewport cuts every row), the first one that intersects it.
 * `rows` must be in document order.
 */
export function pickAnchorRow(
  viewTop: number,
  viewBottom: number,
  rows: AnchorRowRect[]
): ScrollAnchor | null {
  let firstIntersecting: AnchorRowRect | null = null;
  for (const row of rows) {
    if (row.bottom <= viewTop + 1) continue;
    if (row.top >= viewBottom) break;
    if (!firstIntersecting) firstIntersecting = row;
    if (row.top >= viewTop && row.bottom <= viewBottom) {
      return { id: row.id, offset: row.top - viewTop };
    }
  }
  return firstIntersecting
    ? { id: firstIntersecting.id, offset: firstIntersecting.top - viewTop }
    : null;
}

/** How far scrollTop must move for the anchor row to sit at its old offset. */
export function anchorScrollDelta(
  anchor: ScrollAnchor,
  rowTop: number,
  viewTop: number
): number {
  return rowTop - viewTop - anchor.offset;
}
