import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import MediaSurface from './MediaSurface';
import { resetMediaProbeCaches } from '../../hooks/useMediaProbe';

type Probe = { src: string; onload: null | (() => void); onerror: null | (() => void); naturalWidth: number; naturalHeight: number };
let probes: Probe[] = [];
const RealImage = globalThis.Image;
const realMatchMedia = window.matchMedia;

const load = (url: string, width = 400, height = 300) => {
  const probe = probes.filter((p) => p.src === url).pop();
  if (!probe) throw new Error(`no probe for ${url}`);
  probe.naturalWidth = width;
  probe.naturalHeight = height;
  act(() => probe.onload?.());
};

const setReducedMotion = (reduce: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
};

const FULL = 'https://files.example/party.gif';
const PREVIEW = 'https://files.example/party-preview.jpg';

describe('MediaSurface shared media width', () => {
  beforeEach(() => {
    resetMediaProbeCaches();
    probes = [];
    class ProbeImage {
      src = '';
      naturalWidth = 0;
      naturalHeight = 0;
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      constructor() {
        probes.push(this as unknown as Probe);
      }
    }
    globalThis.Image = ProbeImage as unknown as typeof Image;
    setReducedMotion(false);
  });
  afterEach(() => {
    globalThis.Image = RealImage;
    window.matchMedia = realMatchMedia;
  });

  it('caps a solo picture by its own size, the shared media width and the height cap', async () => {
    renderWithProviders(
      <MediaSurface kind="image" variant="solo" src="https://files.example/a.png" alt="a.png" dims={{ width: 1600, height: 900 }} pending={false} />,
    );
    const width = (screen.getByTestId('media-surface') as HTMLElement).style.width;
    expect(width).toContain('560px');
    expect(width).toContain('var(--ethora-media-w');
    expect(width).toMatch(/60vh/);
  });

  it('draws an animated GIF from the full file, not the static preview', async () => {
    renderWithProviders(
      <MediaSurface kind="image" variant="solo" src={FULL} previewSrc={PREVIEW} mimetype="image/gif" alt="party.gif" pending={false} />,
    );
    // The original is requested at once, alongside the blur-up preview.
    expect(probes.some((p) => p.src === FULL)).toBe(true);
    load(PREVIEW);
    load(FULL);
    const shown = await screen.findAllByAltText('party.gif');
    expect(shown.some((img) => img.getAttribute('src') === FULL)).toBe(true);
    expect(shown.every((img) => img.getAttribute('src') !== PREVIEW || img.getAttribute('data-media-layer') !== 'full')).toBe(true);
    expect(screen.getByText('GIF')).toBeInTheDocument();
  });

  it('detects a GIF by its file name when the mimetype is missing', () => {
    renderWithProviders(
      <MediaSurface kind="image" variant="fill" src={FULL} previewSrc={PREVIEW} alt="party.gif" />,
    );
    expect(probes.some((p) => p.src === FULL)).toBe(true);
  });

  it('shows the still preview, with the GIF chip, under reduced motion', async () => {
    setReducedMotion(true);
    renderWithProviders(
      <MediaSurface kind="image" variant="solo" src={FULL} previewSrc={PREVIEW} mimetype="image/gif" alt="party.gif" pending={false} />,
    );
    expect(probes.some((p) => p.src === FULL)).toBe(false);
    load(PREVIEW);
    const img = await screen.findByAltText('party.gif');
    expect(img).toHaveAttribute('src', PREVIEW);
    expect(screen.getByText('GIF')).toBeInTheDocument();
  });

  it('leaves a non-GIF picture on the preview, with no chip', async () => {
    renderWithProviders(
      <MediaSurface kind="image" variant="solo" src="https://files.example/p.png" previewSrc="https://files.example/p-small.jpg" mimetype="image/png" alt="p.png" pending={false} />,
    );
    expect(probes.some((p) => p.src === 'https://files.example/p.png')).toBe(false);
    load('https://files.example/p-small.jpg');
    const img = await screen.findByAltText('p.png');
    expect(img).toHaveAttribute('src', 'https://files.example/p-small.jpg');
    expect(screen.queryByText('GIF')).toBeNull();
  });
});
