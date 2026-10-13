import { describe, expect, it } from 'vitest';
import { fitMediaBox, formatDuration, parseDimension } from './mediaBox';

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
