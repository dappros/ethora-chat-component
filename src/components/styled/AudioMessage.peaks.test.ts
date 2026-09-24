import { describe, expect, it } from 'vitest';
import { buildWaveformPeaks } from './AudioMessage';

// Numbers taken from a real QA voice note (2.58s, WebM/Opus, 24 buckets):
// two transients at 0.98 / 0.99 while the speech around them sits at an RMS
// of 0.002 to 0.058. Drawn against the peak - which is what wavesurfer does
// on its own - those two samples own the whole box and everything else is a
// hairline, which is what these bubbles used to look like.
const makeClip = (): Float32Array => {
  const samples = new Float32Array(24_000);
  for (let i = 0; i < samples.length; i += 1) {
    const bucket = Math.floor(i / 1000);
    // Speech, quiet.
    samples[i] = (bucket % 3 === 0 ? 0.05 : 0.02) * (i % 2 ? 1 : -1);
    // Two clipping transients.
    if (i === 6_500 || i === 13_500) samples[i] = 0.99;
  }
  return samples;
};

describe('buildWaveformPeaks', () => {
  it('keeps the quiet body of a clip visible next to a clipping transient', () => {
    const peaks = buildWaveformPeaks(makeClip(), 24);

    expect(peaks).toHaveLength(24);
    // The whole clip reads, rather than two bars and a flat line: every bar
    // is well clear of the floor.
    expect(peaks.every((value) => value > 0.3)).toBe(true);
    expect(Math.max(...peaks)).toBeLessThanOrEqual(1);
  });

  it('never returns a bar shorter than the floor or taller than the box', () => {
    const peaks = buildWaveformPeaks(makeClip(), 40);

    expect(Math.min(...peaks)).toBeGreaterThanOrEqual(0.08);
    expect(Math.max(...peaks)).toBeLessThanOrEqual(1);
  });

  it('draws silence as the floor instead of dividing by zero', () => {
    const peaks = buildWaveformPeaks(new Float32Array(1000), 20);

    expect(peaks).toHaveLength(20);
    expect(peaks.every((value) => value === 0.08)).toBe(true);
  });

  it('survives a clip with fewer samples than bars', () => {
    const peaks = buildWaveformPeaks(new Float32Array(4), 32);

    expect(peaks).toHaveLength(32);
    expect(peaks.every((value) => Number.isFinite(value))).toBe(true);
  });
});
