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

const ringArc = (container: HTMLElement) =>
  container.querySelector('[data-testid="upload-ring-arc"]') as SVGCircleElement;

describe('MediaUploadOverlay progress ring', () => {
  it('draws the ring as a fixed 40px square that a flex column cannot squash', () => {
    const { container } = renderWithProviders(
      <MediaUploadOverlay status="uploading" progress={40} />,
    );
    const ring = container.querySelector('.upload-ring') as HTMLElement;
    const decls = declarationsFor(ring);

    expect(ring).not.toBeNull();
    expect(decls).toMatch(/flex:none/);
    expect(decls).toMatch(/width:40px/);
    expect(decls).toMatch(/height:40px/);
    expect(decls).toMatch(/aspect-ratio:1\/1/);
    expect(ring.querySelector('svg')).toHaveAttribute('viewBox', '0 0 40 40');
  });

  it('moves the arc with the stroke dash offset as the upload advances', () => {
    const { container, rerender } = renderWithProviders(
      <MediaUploadOverlay status="uploading" progress={0} />,
    );
    const circumference = 2 * Math.PI * ((40 - 3) / 2);
    expect(Number(ringArc(container).getAttribute('stroke-dashoffset'))).toBeCloseTo(circumference, 3);

    rerender(<MediaUploadOverlay status="uploading" progress={50} />);
    expect(Number(ringArc(container).getAttribute('stroke-dashoffset'))).toBeCloseTo(circumference / 2, 3);
  });

  it('hides the ring on tiny boxes via the scrim container query', () => {
    const { container } = renderWithProviders(
      <MediaUploadOverlay status="uploading" progress={40} />,
    );
    const scrim = screen.getByRole('status');

    expect(declarationsFor(scrim)).toMatch(/container-type:size/);
    expect(emittedCss()).toMatch(/@container\(max-width:63px\)/);
    expect(container.querySelector('.upload-ring')).not.toBeNull();
  });

  it('keeps the percentage readout while uploading', () => {
    renderWithProviders(<MediaUploadOverlay status="uploading" progress={40.4} />);

    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('shows no ring for a failed upload, only the retry prompt', () => {
    const { container } = renderWithProviders(<MediaUploadOverlay status="failed" />);

    expect(container.querySelector('.upload-ring')).toBeNull();
    expect(screen.getByText('Upload failed')).toBeInTheDocument();
  });
});
