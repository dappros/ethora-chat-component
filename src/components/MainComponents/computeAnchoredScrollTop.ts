/**
 * Where to put scrollTop after content was added ABOVE the reader.
 *
 * `liveTop` must be the scrollTop at the moment the content arrived, not the
 * one captured when the request started: the reader keeps scrolling while a
 * page is in flight, and restoring the old value throws them back down by
 * however far they travelled meanwhile.
 */
export function computeAnchoredScrollTop(
  liveTop: number,
  heightBefore: number,
  heightAfter: number
): number {
  return liveTop + Math.max(0, heightAfter - heightBefore);
}
