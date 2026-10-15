import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import MediaSurface from './MediaSurface';
import { resetMediaProbeCaches } from '../../hooks/useMediaProbe';

type Probe = {
  src: string;
  onload: null | (() => void);
  onerror: null | (() => void);
  naturalWidth: number;
  naturalHeight: number;
};
let probes: Probe[] = [];

const settle = (url: string, outcome: 'load' | 'error') => {
  const probe = probes.filter((p) => p.src === url).pop();
  act(() => {
    if (outcome === 'load') probe?.onload?.();
    else probe?.onerror?.();
  });
};

const RealImage = globalThis.Image;
const RealFetch = globalThis.fetch;

describe('MediaSurface never shows the native broken image', () => {
  beforeEach(() => {
    resetMediaProbeCaches();
    probes = [];
    class ProbeImage {
      src = '';
      naturalWidth = 640;
      naturalHeight = 480;
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      constructor() {
        probes.push(this as unknown as Probe);
      }
    }
    globalThis.Image = ProbeImage as unknown as typeof Image;
    globalThis.fetch = vi.fn(async () => ({ status: 200 })) as never;
  });
  afterEach(() => {
    globalThis.Image = RealImage;
    globalThis.fetch = RealFetch;
  });

  it('solo: the visible image erroring after a good probe flips to the compact unavailable card', async () => {
    const url = 'https://files.example/IMG_0006.jpg';
    renderWithProviders(
      <MediaSurface kind="image" variant="solo" src={url} alt="IMG_0006.jpg" pending={false} />,
    );
    settle(url, 'load');
    const image = await screen.findByAltText('IMG_0006.jpg');

    fireEvent.error(image);

    expect(await screen.findByTestId('media-unavailable')).toBeInTheDocument();
    expect(screen.queryByAltText('IMG_0006.jpg')).toBeNull();
    const surface = screen.getByTestId('media-surface');
    expect(surface).toHaveAttribute('data-state', 'error');
    expect(surface.style.width).toBe('min(280px, var(--ethora-media-w, 340px))');
    expect(surface.style.height).toBe('160px');
    expect(surface.style.aspectRatio).toBe('');
  });

  it('the erroring image is hidden at once, before React swaps it out', async () => {
    const url = 'https://files.example/a.jpg';
    renderWithProviders(
      <MediaSurface kind="image" variant="solo" src={url} alt="a.jpg" pending={false} />,
    );
    settle(url, 'load');
    const image = await screen.findByAltText('a.jpg');
    // Fire the handler without letting the swap happen first.
    act(() => {
      image.dispatchEvent(new Event('error'));
    });
    expect(image.style.visibility).toBe('hidden');
  });

  it('album tile: an image that errors after loading shows the compact unavailable state', async () => {
    const url = 'https://files.example/1d13d517.png';
    renderWithProviders(
      <div style={{ position: 'relative' }}>
        <MediaSurface kind="image" variant="fill" src={url} alt="1d13d517.png" />
      </div>,
    );
    settle(url, 'load');
    const image = await screen.findByAltText('1d13d517.png');

    fireEvent.error(image);

    expect(await screen.findByTestId('media-unavailable')).toBeInTheDocument();
    expect(screen.queryByAltText('1d13d517.png')).toBeNull();
  });

  it('a cached loaded URL that then errors flips to unavailable and is not resurrected', async () => {
    const url = 'https://files.example/cached.jpg';
    const first = renderWithProviders(
      <MediaSurface kind="image" variant="solo" src={url} alt="cached.jpg" pending={false} />,
    );
    settle(url, 'load');
    await screen.findByAltText('cached.jpg');
    first.unmount();

    // Remount: the module cache paints the image at once, with no probe.
    probes = [];
    renderWithProviders(
      <MediaSurface kind="image" variant="solo" src={url} alt="cached.jpg" pending={false} />,
    );
    const image = screen.getByAltText('cached.jpg');
    expect(probes).toHaveLength(0);

    fireEvent.error(image);
    expect(await screen.findByTestId('media-unavailable')).toBeInTheDocument();
    expect(screen.queryByAltText('cached.jpg')).toBeNull();

    // And a third mount does not paint the dead picture from the cache.
    probes = [];
    renderWithProviders(
      <MediaSurface kind="image" variant="solo" src={url} alt="cached.jpg" pending={false} />,
    );
    expect(screen.queryAllByAltText('cached.jpg')).toHaveLength(0);
  });

  it('preview that errors after loading falls back to the original instead of a broken picture', async () => {
    const full = 'https://files.example/full.png';
    const preview = 'https://files.example/thumb.png';
    renderWithProviders(
      <MediaSurface kind="image" variant="fill" src={full} previewSrc={preview} alt="full.png" />,
    );
    settle(preview, 'load');
    const image = await screen.findByAltText('full.png');
    fireEvent.error(image);

    expect(screen.queryByAltText('full.png')).toBeNull();
    expect(probes.map((p) => p.src)).toContain(full);
    settle(full, 'error');
    expect(await screen.findByTestId('media-unavailable')).toBeInTheDocument();
  });
});
