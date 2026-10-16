/**
 * Auto-sizing for the composer textarea.
 *
 * The field is sized from its real content (soft wraps included), not from
 * the newline count. One line keeps the original 40px field (34px textarea
 * plus the 6px wrapper border and padding). Two lines or more use a tighter
 * vertical padding so the text hugs the field, and the textarea scrolls
 * internally once it reaches the cap.
 */
export const COMPOSER_LINE_HEIGHT = 20;
/** Vertical padding per side for a single line (keeps the 40px field). */
export const COMPOSER_PAD_SINGLE = 7;
/** Vertical padding per side once the text wraps to two lines or more. */
export const COMPOSER_PAD_MULTI = 5;
/** Textarea box cap (about five lines), after which it scrolls. */
export const COMPOSER_MAX_HEIGHT = 140;

export interface TextareaFit {
  /** Textarea border-box height in px. */
  height: number;
  /** True when the text occupies two lines or more. */
  multiline: boolean;
  /** True when the content is taller than the cap and must scroll. */
  scrollable: boolean;
}

/**
 * @param scrollHeight the textarea's scrollHeight, measured with height:auto
 *   and the single-line padding applied (so it is content + 14px).
 */
export function computeTextareaFit(scrollHeight: number): TextareaFit {
  const singlePad = COMPOSER_PAD_SINGLE * 2;
  const contentH = Math.max(scrollHeight - singlePad, COMPOSER_LINE_HEIGHT);
  const lines = Math.max(1, Math.round(contentH / COMPOSER_LINE_HEIGHT));
  const multiline = lines >= 2;
  const pad = multiline ? COMPOSER_PAD_MULTI * 2 : singlePad;
  const natural = lines * COMPOSER_LINE_HEIGHT + pad;
  return {
    height: Math.min(natural, COMPOSER_MAX_HEIGHT),
    multiline,
    scrollable: natural > COMPOSER_MAX_HEIGHT,
  };
}

/** Re-measures a textarea from its content and applies the result to the DOM. */
export function fitTextareaToContent(el: HTMLTextAreaElement): TextareaFit {
  el.style.height = 'auto';
  el.removeAttribute('data-multiline');
  const fit = computeTextareaFit(el.scrollHeight);
  el.toggleAttribute('data-multiline', fit.multiline);
  el.toggleAttribute('data-scrollable', fit.scrollable);
  el.style.height = `${fit.height}px`;
  return fit;
}
