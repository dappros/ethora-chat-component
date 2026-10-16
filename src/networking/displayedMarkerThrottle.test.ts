import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DisplayedMarkerThrottle } from './displayedMarkerThrottle';

describe('DisplayedMarkerThrottle', () => {
  let sent: string[];
  beforeEach(() => {
    vi.useFakeTimers();
    sent = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const make = () =>
    new DisplayedMarkerThrottle({
      minIntervalMs: 3000,
      send: (id) => sent.push(id),
    });

  it('sends the first marker at once', () => {
    const t = make();
    t.mark('m1');
    expect(sent).toEqual(['m1']);
  });

  it('holds markers inside the 3s interval and sends only the newest at the end', () => {
    const t = make();
    t.mark('m1');
    vi.advanceTimersByTime(500);
    t.mark('m2');
    vi.advanceTimersByTime(500);
    t.mark('m3');
    expect(sent).toEqual(['m1']);
    vi.advanceTimersByTime(2000);
    expect(sent).toEqual(['m1', 'm3']);
  });

  it('sends again immediately once the interval has passed', () => {
    const t = make();
    t.mark('m1');
    vi.advanceTimersByTime(3000);
    t.mark('m2');
    expect(sent).toEqual(['m1', 'm2']);
  });

  it('dispose flushes a held marker and clears the timer', () => {
    const t = make();
    t.mark('m1');
    t.mark('m2');
    t.dispose();
    expect(sent).toEqual(['m1', 'm2']);
    expect(vi.getTimerCount()).toBe(0);
    t.mark('m3');
    vi.advanceTimersByTime(10000);
    expect(sent).toEqual(['m1', 'm2']);
  });
});
