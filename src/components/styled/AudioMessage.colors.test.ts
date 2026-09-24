import { describe, expect, it } from 'vitest';
import { resolveWaveColors } from './AudioMessage';

type Rgb = { r: number; g: number; b: number };

const parse = (value: string): Rgb => {
  const [r, g, b] = value
    .replace(/^rgb\(|\)$/g, '')
    .split(',')
    .map((part) => parseInt(part.trim(), 10));
  return { r, g, b };
};

const luminance = ({ r, g, b }: Rgb) => {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Measured in the running app with the default host theme: an own-message
// bubble is a tint of the host primary, and an incoming one is white.
const OWN_BUBBLE = { r: 236, g: 232, b: 251 };
const INCOMING_BUBBLE = { r: 255, g: 255, b: 255 };
const HOST_PRIMARY = '#5E3FDE';
const INK = 'rgb(20, 20, 20)';

describe('resolveWaveColors', () => {
  it('is visible on an own-message bubble, which is a tint of the brand colour', () => {
    const { wave, progress } = resolveWaveColors(HOST_PRIMARY, INK, OWN_BUBBLE);

    // This is the case the old neutral #E6E8EC wave failed at: 1.05:1
    // against this bubble, i.e. invisible.
    expect(contrast(parse(wave), OWN_BUBBLE)).toBeGreaterThan(1.6);
    expect(contrast(parse(progress), OWN_BUBBLE)).toBeGreaterThan(2.2);
  });

  it('keeps the same separation on an incoming (white) bubble', () => {
    const { wave, progress } = resolveWaveColors(
      HOST_PRIMARY,
      INK,
      INCOMING_BUBBLE
    );

    expect(contrast(parse(wave), INCOMING_BUBBLE)).toBeGreaterThan(1.6);
    expect(contrast(parse(progress), INCOMING_BUBBLE)).toBeGreaterThan(2.2);
  });

  it('drops the brand colour when it cannot be seen against the bubble', () => {
    // A host whose primary IS its bubble surface: the brand colour has
    // nothing to say here, so the bubble's own text colour takes over.
    const surface = { r: 94, g: 63, b: 222 };
    const { wave, progress } = resolveWaveColors(
      HOST_PRIMARY,
      'rgb(255, 255, 255)',
      surface
    );

    expect(progress).toBe('rgb(255, 255, 255)');
    expect(contrast(parse(wave), surface)).toBeGreaterThan(1.6);
  });

  it('falls back to the ink colour when the primary is not a colour at all', () => {
    const { progress } = resolveWaveColors('not-a-colour', INK, INCOMING_BUBBLE);

    expect(progress).toBe('rgb(20, 20, 20)');
  });
});
