import { describe, expect, it } from 'vitest';
import {
  canReaderChooseTranslateMode,
  resolveTranslateMode,
} from './translateModePolicy';

describe('canReaderChooseTranslateMode', () => {
  it('allows choosing by default (no translates config, or forceType unset)', () => {
    expect(canReaderChooseTranslateMode(undefined)).toBe(true);
    expect(canReaderChooseTranslateMode({ enabled: true })).toBe(true);
    expect(canReaderChooseTranslateMode({ enabled: true, forceType: false })).toBe(true);
  });

  it('forbids choosing when the host pinned forceType', () => {
    expect(
      canReaderChooseTranslateMode({ enabled: true, forceType: true, mode: 'manual' })
    ).toBe(false);
  });
});

describe('resolveTranslateMode', () => {
  it("defaults to 'auto' with no config and no reader pick", () => {
    expect(resolveTranslateMode(undefined, undefined)).toBe('auto');
  });

  it("falls back to the host's declared mode when the reader hasn't picked", () => {
    expect(resolveTranslateMode({ enabled: true, mode: 'manual' }, undefined)).toBe(
      'manual'
    );
  });

  it("the reader's own pick wins over the host default when not forced", () => {
    expect(resolveTranslateMode({ enabled: true, mode: 'auto' }, 'manual')).toBe(
      'manual'
    );
    expect(resolveTranslateMode({ enabled: true, mode: 'manual' }, 'auto')).toBe(
      'auto'
    );
  });

  // The whole point of forceType: a reader who picked 'manual' before the
  // host turned forcing on must not keep silently overriding it afterward.
  it('forceType wins unconditionally, even over an existing reader pick', () => {
    expect(
      resolveTranslateMode(
        { enabled: true, mode: 'auto', forceType: true },
        'manual'
      )
    ).toBe('auto');
    expect(
      resolveTranslateMode(
        { enabled: true, mode: 'manual', forceType: true },
        'auto'
      )
    ).toBe('manual');
  });

  it("forced with no explicit mode set still defaults to 'auto'", () => {
    expect(
      resolveTranslateMode({ enabled: true, forceType: true }, 'manual')
    ).toBe('auto');
  });
});
