import { describe, expect, it } from 'vitest';
import { buildThemeTokens } from './tokens';

/**
 * WCAG 2.x contrast sweep over the *default* token palette.
 *
 * This does not depend on `DEFAULTS` directly - it reads the same
 * `--ethora-*` CSS variable map every component actually consumes, via
 * `buildThemeTokens()` with no host `config.colors` passed in. That is the
 * palette every screen renders with out of the box, so a regression here
 * (someone editing a default color in tokens.ts without checking contrast)
 * fails this test instead of shipping a WCAG finding.
 *
 * A host that supplies its own `config.colors` is free to pick whatever it
 * wants, including low-contrast colors - that is the host's call, and is
 * intentionally NOT enforced here (see tokens.test.ts for the "does not
 * clamp a host's primary" coverage).
 *
 * Contrast math (WCAG 2.x relative luminance / contrast ratio), written out
 * directly rather than pulling in a dependency:
 *   https://www.w3.org/TR/WCAG21/#contrast-minimum
 */

const hexToRgb = (hex: string): [number, number, number] => {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const num = parseInt(h, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
};

const relativeLuminance = (hex: string): number => {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG contrast ratio between two colors, always >= 1. */
const contrastRatio = (hexA: string, hexB: string): number => {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
};

// WCAG 2.x thresholds. 4.5:1 for normal text; 3:1 for large text (18pt/24px
// regular, or 14pt/~18.66px bold) and for non-text UI components/graphical
// objects (SC 1.4.11), such as the online presence dot.
const AA_NORMAL_TEXT = 4.5;
const AA_LARGE_TEXT_OR_GRAPHIC = 3;

describe.each(['light', 'dark'] as const)(
  'default %s token palette meets WCAG AA contrast',
  (scheme) => {
  const tokens = buildThemeTokens(undefined, undefined, scheme);

  const color = (name: string): string => {
    const value = tokens[name];
    if (!value) throw new Error(`Missing token: ${name}`);
    return value;
  };

  // [foreground token, background token, threshold, human label]
  const pairs: Array<[string, string, number, string]> = [
    // Body/secondary text on the two neutral surfaces it actually renders
    // on (the plain background and the "subtle" panel/card background).
    ['--ethora-color-text', '--ethora-color-bg', AA_NORMAL_TEXT, 'text on bg'],
    ['--ethora-color-text', '--ethora-color-bg-subtle', AA_NORMAL_TEXT, 'text on bg-subtle'],
    ['--ethora-color-text-secondary', '--ethora-color-bg', AA_NORMAL_TEXT, 'textSecondary on bg'],
    ['--ethora-color-text-secondary', '--ethora-color-bg-subtle', AA_NORMAL_TEXT, 'textSecondary on bg-subtle'],

    // Muted text (message timestamps, hints): also has to hold up on
    // bg-hover, since it renders inside hovered list rows.
    ['--ethora-color-text-muted', '--ethora-color-bg', AA_NORMAL_TEXT, 'textMuted on bg'],
    ['--ethora-color-text-muted', '--ethora-color-bg-subtle', AA_NORMAL_TEXT, 'textMuted on bg-subtle'],
    ['--ethora-color-text-muted', '--ethora-color-bg-hover', AA_NORMAL_TEXT, 'textMuted on bg-hover'],

    // White text set on the primary-filled surfaces (buttons, headers).
    ['--ethora-color-text-on-primary', '--ethora-color-primary', AA_NORMAL_TEXT, 'textOnPrimary on primary'],

    // Danger (destructive actions/errors): plain, on the subtle surface,
    // and on bg-hover - it renders red on hover for dropdown items like
    // "Leave"/"Delete"/"Block".
    ['--ethora-color-danger', '--ethora-color-bg', AA_NORMAL_TEXT, 'danger on bg'],
    ['--ethora-color-danger', '--ethora-color-bg-subtle', AA_NORMAL_TEXT, 'danger on bg-subtle'],
    ['--ethora-color-danger', '--ethora-color-bg-hover', AA_NORMAL_TEXT, 'danger on bg-hover'],

    // Primary as text on its own soft tint - how sender names and the
    // active/selected room row render.
    ['--ethora-color-primary-text', '--ethora-color-primary-soft', AA_NORMAL_TEXT, 'primary-text on primary-soft'],
    ['--ethora-color-primary-text', '--ethora-color-bg', AA_NORMAL_TEXT, 'primary-text on bg'],

    // Online/success green as real text: the "N online" header/popover
    // label and the online row in a member list, on both the plain
    // background and the hovered-row background.
    ['--ethora-color-online', '--ethora-color-bg', AA_NORMAL_TEXT, 'online text on bg'],
    ['--ethora-color-online', '--ethora-color-bg-hover', AA_NORMAL_TEXT, 'online text on bg-hover'],

    // The white glyph inside Toast's success icon badge is real (small,
    // non-bold) text set on the success fill, so it needs the text
    // threshold too, not just the graphic one below.
    ['--ethora-color-text-on-primary', '--ethora-color-success', AA_NORMAL_TEXT, 'textOnPrimary on success (toast badge glyph)'],
  ];

  it.each(pairs)('%s vs %s (>= %s:1): %s', (fg, bg, threshold, label) => {
    const ratio = contrastRatio(color(fg), color(bg));
    expect(ratio, `${label}: ${color(fg)} on ${color(bg)} = ${ratio.toFixed(2)}:1, needs >= ${threshold}:1`).toBeGreaterThanOrEqual(threshold);
  });

  it('the online/success presence dot clears the 3:1 non-text graphic threshold', () => {
    // The same --ethora-color-online value also fills the presence dot
    // (OnlineUsersPopover's Dot, ProfileImagePlaceholder's online marker),
    // which is a graphic rather than text, so SC 1.4.11's looser 3:1
    // applies. It already clears the stricter 4.5:1 text threshold above,
    // so this is a floor, not a new constraint.
    const ratio = contrastRatio(color('--ethora-color-online'), color('--ethora-color-bg'));
    expect(ratio).toBeGreaterThanOrEqual(AA_LARGE_TEXT_OR_GRAPHIC);
  });

  it('--ethora-color-online and --ethora-color-success: shared in light, split in dark', () => {
    // Light: one default green backs both CSS variables. Dark deliberately
    // splits them (see DARK_DEFAULTS in tokens.ts): no single green is both
    // readable as text on the dark surface and dark enough for a white
    // glyph on top of it.
    if (scheme === 'light') {
      expect(color('--ethora-color-online')).toBe(color('--ethora-color-success'));
    } else {
      expect(color('--ethora-color-online')).not.toBe(color('--ethora-color-success'));
    }
  });
});
