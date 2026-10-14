import React from 'react';
import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import AttachmentList from './AttachmentList';
import type { IAttachment } from '../../types/types';

const emittedCss = () =>
  Array.from(document.querySelectorAll('style'))
    .map((style) => style.textContent ?? '')
    .join('')
    .replace(/\s+/g, '');

const declarationsFor = (el: Element) => {
  const classes = el.className.split(' ').filter((name) => name && !name.startsWith('sc-'));
  const decls: string[] = [];
  for (const cls of classes) {
    for (const match of emittedCss().matchAll(new RegExp(`\\.${cls}\\{([^}]*)\\}`, 'g'))) decls.push(match[1]);
  }
  return decls.join(';');
};

const img = (n: number): IAttachment => ({
  location: `https://files.example/${n}.png`,
  mimetype: 'image/png',
  originalName: `photo-${n}.png`,
  width: 1600,
  height: 900,
});
const video: IAttachment = { location: 'https://files.example/v.mp4', mimetype: 'video/mp4', originalName: 'clip.mp4' };
const svg: IAttachment = { location: 'https://files.example/logo.svg', mimetype: 'image/svg+xml', originalName: 'logo.svg', size: '2048' };
const pdf: IAttachment = { location: 'https://files.example/doc.pdf', mimetype: 'application/pdf', originalName: 'doc.pdf', size: '4096' };

const block = () => screen.getByTestId('media-block');

describe('AttachmentList media block', () => {
  it('sizes an album from the shared media width and stretches cards to it', () => {
    renderWithProviders(<AttachmentList attachments={[video, img(1), svg, pdf]} />);
    expect(block()).toHaveAttribute('data-mode', 'album');
    expect(declarationsFor(block())).toContain('width:var(--ethora-media-w');
    const cards = within(block()).getAllByRole('button').filter((b) => b.getAttribute('title')?.match(/logo\.svg|doc\.pdf/));
    expect(cards).toHaveLength(2);
    cards.forEach((card) => {
      const css = declarationsFor(card);
      expect(css).toContain('min-width:100%');
      expect(css).toContain('max-width:100%');
    });
  });

  it('wraps a solo picture and its cards in a block no wider than the media width', () => {
    renderWithProviders(<AttachmentList attachments={[img(1), pdf]} />);
    expect(block()).toHaveAttribute('data-mode', 'solo');
    const css = declarationsFor(block());
    expect(css).toContain('width:fit-content');
    expect(css).toContain('var(--ethora-media-w');
  });

  it('caps a lone file card at 360px', () => {
    renderWithProviders(<AttachmentList attachments={[pdf]} />);
    expect(block()).toHaveAttribute('data-mode', 'files');
    expect(declarationsFor(block())).toContain('width:min(var(--ethora-media-w,340px),360px)');
  });

  it('applies the same variable to the grid tiles box and the solo stage', () => {
    renderWithProviders(<AttachmentList attachments={[img(1), img(2), img(3)]} />);
    expect(screen.getByTestId('album-grid')).toHaveAttribute('data-layout', 'hero');
    expect(declarationsFor(block())).toContain('var(--ethora-media-w');
  });

  it('leaves voice notes at their own width', () => {
    renderWithProviders(
      <AttachmentList attachments={[{ location: 'https://files.example/v.ogg', mimetype: 'audio/ogg', originalName: 'v.ogg' }]} />,
    );
    expect(block()).toHaveAttribute('data-mode', 'plain');
  });

  it('renders every picture and video as one album ahead of the cards, in picked order', () => {
    // Picked: svg, picture, pdf, video, picture.
    renderWithProviders(<AttachmentList attachments={[svg, img(1), pdf, video, img(2)]} />);
    const grid = screen.getByTestId('album-grid');
    expect(grid.querySelectorAll('button')).toHaveLength(3);
    const cards = within(block()).getAllByRole('button').filter((b) => b.getAttribute('title')?.match(/logo\.svg|doc\.pdf/));
    expect(cards.map((c) => c.getAttribute('title'))).toEqual(['logo.svg', 'doc.pdf']);
    cards.forEach((card) => {
      expect(grid.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  it('shows a PDF card with its size and no page count', () => {
    renderWithProviders(<AttachmentList attachments={[{ ...pdf, size: '331469' }]} />);
    expect(screen.getByText('323.7 KB')).toBeTruthy();
    expect(screen.queryByText(/\bpages?\b/i)).toBeNull();
  });
});
