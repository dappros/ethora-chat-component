import { describe, expect, it } from 'vitest';
import { computeSoloBox, fitMediaBox, formatDuration, parseDimension } from './mediaBox';

describe('fitMediaBox', () => {
  it('keeps a picture inside 320 x 380 at its aspect ratio', () => {
    expect(fitMediaBox(1600, 900)).toEqual({ width: 320, height: 180 });
  });

  it('clamps a tall picture to the max height', () => {
    expect(fitMediaBox(600, 1200)).toEqual({ width: 190, height: 380 });
  });

  it('never upscales a picture smaller than the box', () => {
    expect(fitMediaBox(200, 100)).toEqual({ width: 200, height: 100 });
  });

  it('returns null when a dimension is missing or not positive', () => {
    expect(fitMediaBox(undefined, 100)).toBeNull();
    expect(fitMediaBox(100, 0)).toBeNull();
    expect(fitMediaBox(Number.NaN, 100)).toBeNull();
  });
});

describe('parseDimension', () => {
  it('accepts numbers and numeric strings', () => {
    expect(parseDimension(640)).toBe(640);
    expect(parseDimension('480')).toBe(480);
  });

  it('drops anything that is not a positive size', () => {
    expect(parseDimension('abc')).toBeUndefined();
    expect(parseDimension(-3)).toBeUndefined();
    expect(parseDimension(undefined)).toBeUndefined();
  });
});

describe('formatDuration', () => {
  it('formats seconds as m:ss', () => {
    expect(formatDuration('75')).toBe('1:15');
    expect(formatDuration(9)).toBe('0:09');
  });

  it('switches to h:mm:ss past an hour', () => {
    expect(formatDuration('3725')).toBe('1:02:05');
  });

  it('returns an empty string when the duration is unknown', () => {
    expect(formatDuration(undefined)).toBe('');
    expect(formatDuration('0')).toBe('');
    expect(formatDuration('soon')).toBe('');
  });
});

describe('computeSoloBox size policy', () => {
  it('draws a tiny picture at natural size, never upscaled, on a 64px minimum frame', () => {
    expect(computeSoloBox(24, 24)).toEqual({
      width: 64, height: 64, imageWidth: 24, imageHeight: 24, mode: 'natural',
    });
    expect(computeSoloBox(64, 64)).toMatchObject({ width: 64, height: 64, imageWidth: 64, mode: 'natural' });
    expect(computeSoloBox(100, 20)).toMatchObject({ width: 100, height: 64, imageWidth: 100, imageHeight: 20, mode: 'natural' });
  });

  it('keeps a small picture at its natural size without a tile', () => {
    expect(computeSoloBox(120, 90)).toMatchObject({ width: 120, height: 90, mode: 'fit' });
    expect(computeSoloBox(200, 200)).toMatchObject({ width: 200, height: 200, mode: 'fit' });
    expect(computeSoloBox(320, 240)).toMatchObject({ width: 320, height: 240, mode: 'fit' });
    expect(computeSoloBox(500, 375)).toMatchObject({ width: 500, height: 375, mode: 'fit' });
  });

  it('fits large pictures into the 560 x 784 reference box at their ratio', () => {
    expect(computeSoloBox(800, 600)).toMatchObject({ width: 560, height: 420 });
    expect(computeSoloBox(1600, 900)).toMatchObject({ width: 560, height: 315 });
    expect(computeSoloBox(1200, 1200)).toMatchObject({ width: 560, height: 560 });
  });

  it('caps a phone screenshot and a tall strip at 784 high', () => {
    expect(computeSoloBox(390, 844)).toMatchObject({ width: 362, height: 784, mode: 'fit' });
    expect(computeSoloBox(600, 1800)).toMatchObject({ width: 261, height: 784, mode: 'fit' });
  });

  it('treats exactly 3:1 as a normal wide picture', () => {
    expect(computeSoloBox(1200, 400)).toMatchObject({ width: 560, height: 187, mode: 'fit' });
  });

  it('lifts the short side of an extreme ratio to 96px and crops from the centre', () => {
    expect(computeSoloBox(6000, 600)).toEqual({
      width: 560, height: 96, imageWidth: 560, imageHeight: 96, mode: 'cover',
    });
    expect(computeSoloBox(600, 6000)).toMatchObject({ width: 96, height: 784, mode: 'cover' });
  });

  it('does not blow a small extreme strip up past 1.5x', () => {
    expect(computeSoloBox(400, 50)).toMatchObject({
      width: 400, height: 96, imageWidth: 400, imageHeight: 50, mode: 'natural',
    });
  });

  it('takes the max box as a parameter', () => {
    expect(computeSoloBox(1600, 900, { maxWidth: 320, maxHeight: 380 })).toMatchObject({ width: 320, height: 180 });
    expect(computeSoloBox(600, 1200, { maxWidth: 320, maxHeight: 380 })).toMatchObject({ width: 190, height: 380 });
    expect(computeSoloBox(1600, 900, { maxWidth: 400, maxHeight: 400 })).toMatchObject({ width: 400, height: 225 });
  });

  it('is null while the size is unknown', () => {
    expect(computeSoloBox(undefined, undefined)).toBeNull();
    expect(computeSoloBox(300, 0)).toBeNull();
  });

  it('scales a preview-sized ratio up to the real box', () => {
    expect(computeSoloBox(150, 112, { ratioOnly: true })).toMatchObject({ width: 560, height: 418, mode: 'fit' });
    expect(computeSoloBox(112, 150, { ratioOnly: true })).toMatchObject({ height: 750 });
  });
});
