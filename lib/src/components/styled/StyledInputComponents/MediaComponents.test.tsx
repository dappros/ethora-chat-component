import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MediaLoadingSkeleton, MEDIA_SPINNER_MIN_BOX_PX } from './MediaComponents';

// styled-components writes its rules into a <style> tag. Read them back and
// strip whitespace so the patterns below match the minified output exactly.
const emittedCss = () =>
  Array.from(document.querySelectorAll('style'))
    .map((style) => style.textContent ?? '')
    .join('')
    .replace(/\s+/g, '');

// The element's hashed class is its last class name (the first is sc-*).
const hashedClass = (el: Element) => el.className.split(' ').pop() as string;

// Every declaration block that targets this class, joined.
const declarationsFor = (className: string) => {
  const re = new RegExp(`\\.${className}\\{([^}]*)\\}`, 'g');
  return Array.from(emittedCss().matchAll(re))
    .map((match) => match[1])
    .join(';');
};

describe('MediaLoadingSkeleton', () => {
  it('reserves the real aspect ratio of a non-square box', () => {
    const { container } = render(<MediaLoadingSkeleton $width={150} $height={200} />);
    const box = container.firstElementChild as HTMLElement;

    expect(declarationsFor(hashedClass(box))).toMatch(/aspect-ratio:150\/200/);
  });

  it('uses a rounded rectangle, never a 50% radius, on a non-square box', () => {
    const { container } = render(<MediaLoadingSkeleton $width={300} $height={200} />);
    const box = container.firstElementChild as HTMLElement;
    const decls = declarationsFor(hashedClass(box));

    expect(decls).toMatch(/border-radius:var\(--ethora-radius-md,16px\)/);
    expect(decls).not.toMatch(/border-radius:50%/);
  });

  it('falls back to a 3:4 default when the dimensions are unknown', () => {
    const { container } = render(<MediaLoadingSkeleton />);
    const box = container.firstElementChild as HTMLElement;

    expect(declarationsFor(hashedClass(box))).toMatch(/aspect-ratio:3\/4/);
  });

  it('makes the box its own size container for the spinner query', () => {
    const { container } = render(<MediaLoadingSkeleton $width={150} $height={200} />);
    const box = container.firstElementChild as HTMLElement;

    expect(declarationsFor(hashedClass(box))).toMatch(/container-type:size/);
  });

  it('hides the spinner by default and shows it only in boxes at least 48px', () => {
    expect(MEDIA_SPINNER_MIN_BOX_PX).toBe(48);
    const { container } = render(<MediaLoadingSkeleton $width={150} $height={200} />);
    const spinner = container.querySelector('span[aria-hidden="true"]') as HTMLElement;
    const cls = hashedClass(spinner);

    expect(declarationsFor(cls)).toMatch(/display:none/);
    expect(emittedCss()).toMatch(
      new RegExp(
        `@container\\(min-width:48px\\)and\\(min-height:48px\\)\\{\\.${cls}\\{display:block;\\}\\}`,
      ),
    );
  });

  it('draws the spinner as a fixed, never-squashed circle', () => {
    const { container } = render(<MediaLoadingSkeleton $width={150} $height={200} />);
    const spinner = container.querySelector('span[aria-hidden="true"]') as HTMLElement;
    const decls = declarationsFor(hashedClass(spinner));

    expect(decls).toMatch(/flex:none/);
    expect(decls).toMatch(/width:24px/);
    expect(decls).toMatch(/height:24px/);
    expect(decls).toMatch(/aspect-ratio:1\/1/);
    expect(decls).toMatch(/border-radius:50%/);
  });
});
