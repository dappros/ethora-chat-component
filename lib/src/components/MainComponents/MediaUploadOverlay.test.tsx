import React from 'react';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { MediaUploadOverlay } from './MediaUploadOverlay';

// Minified CSS of every rule for a class, the same read-back the skeleton
// tests use: styled-components emits into a <style> tag.
const emittedCss = () =>
  Array.from(document.querySelectorAll('style'))
    .map((style) => style.textContent ?? '')
    .join('')
    .replace(/\s+/g, '');

// Generated classes only (the sc-* component ids are not styled). An
// extended styled component carries its base's class too, so this is a list.
const generatedClasses = (el: Element) =>
  el.className.split(' ').filter((name) => name && !name.startsWith('sc-'));

// Every declaration block that targets any of the element's generated classes.
const declarationsFor = (el: Element) => {
  const decls: string[] = [];
  for (const cls of generatedClasses(el)) {
    const re = new RegExp(`\\.${cls}\\{([^}]*)\\}`, 'g');
    for (const match of emittedCss().matchAll(re)) decls.push(match[1]);
  }
  return decls.join(';');
};

describe('MediaUploadOverlay spinner', () => {
  it('renders the spinner as a fixed circle that a flex column cannot squash', () => {
    const { container } = renderWithProviders(
      <MediaUploadOverlay status="uploading" progress={40} />,
    );
    const spinner = container.querySelector('span[aria-hidden="true"]:empty') as HTMLElement;
    const decls = declarationsFor(spinner);

    expect(spinner).not.toBeNull();
    expect(decls).toMatch(/flex:none/);
    expect(decls).toMatch(/width:24px/);
    expect(decls).toMatch(/height:24px/);
    expect(decls).toMatch(/border-radius:50%/);
  });

  it('hides the spinner on tiny tiles via the scrim container query', () => {
    const { container } = renderWithProviders(
      <MediaUploadOverlay status="uploading" progress={40} />,
    );
    const scrim = screen.getByRole('status');
    const spinner = container.querySelector('span[aria-hidden="true"]:empty') as HTMLElement;

    expect(declarationsFor(scrim)).toMatch(/container-type:size/);
    expect(declarationsFor(spinner)).toMatch(/display:none/);
    const classAlternation = generatedClasses(spinner).join('|');
    expect(emittedCss()).toMatch(
      new RegExp(
        `@container\\(min-width:48px\\)and\\(min-height:48px\\)\\{\\.(${classAlternation})\\{display:block;\\}\\}`,
      ),
    );
  });

  it('keeps the percentage readout while uploading', () => {
    renderWithProviders(<MediaUploadOverlay status="uploading" progress={40.4} />);

    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('shows no spinner for a failed upload', () => {
    const { container } = renderWithProviders(<MediaUploadOverlay status="failed" />);

    expect(container.querySelector('span[aria-hidden="true"]:empty')).toBeNull();
  });
});
