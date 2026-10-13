import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import MediaSurface from './MediaSurface';
import FileCard from './FileCard';
import { ImageUnavailableArt } from '../MainComponents/ImageUnavailable';

// Controllable preloader: the test decides when each URL loads or fails.
type Probe = { src: string; onload: null | (() => void); onerror: null | (() => void); naturalWidth: number; naturalHeight: number };
let probes: Probe[] = [];

const settle = (url: string, outcome: 'load' | 'error') => {
  const probe = probes.filter((p) => p.src === url).pop();
  act(() => {
    if (outcome === 'load') probe?.onload?.();
    else probe?.onerror?.();
  });
};

const emittedCss = () =>
  Array.from(document.querySelectorAll('style'))
    .map((style) => style.textContent ?? '')
    .join('')
    .replace(/\s+/g, '');

const generatedClasses = (el: Element) =>
  el.className.split(' ').filter((name) => name && !name.startsWith('sc-'));

const declarationsFor = (el: Element) => {
  const decls: string[] = [];
  for (const cls of generatedClasses(el)) {
    const re = new RegExp(`\\.${cls}\\{([^}]*)\\}`, 'g');
    for (const match of emittedCss().matchAll(re)) decls.push(match[1]);
  }
  return decls.join(';');
};

const RealImage = globalThis.Image;
const RealFetch = globalThis.fetch;

describe('MediaSurface loading and unavailable states', () => {
  beforeEach(() => {
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

  it('shows a skeleton first, then fades the real image in once it has loaded', async () => {
    const url = 'https://files.example/photo.png';
    renderWithProviders(
      <MediaSurface kind="image" variant="solo" src={url} alt="photo.png" pending={false} />,
    );

    expect(screen.getByTestId('media-surface')).toHaveAttribute('data-state', 'loading');
    expect(screen.queryByAltText('photo.png')).toBeNull();

    settle(url, 'load');
    const image = await screen.findByAltText('photo.png');
    expect(image).toHaveAttribute('src', url);
    expect(image).toHaveAttribute('data-media-layer', 'full');
    expect(declarationsFor(image)).toMatch(/animation:.*180ms/);
  });

  it('blurs the preview while the full file is still loading, then swaps to the full image', async () => {
    const full = 'https://files.example/full.png';
    const preview = 'https://files.example/thumb.png';
    const { container } = renderWithProviders(
      <MediaSurface kind="image" variant="fill" src={full} previewSrc={preview} alt="full.png" />,
    );

    settle(preview, 'load');
    const blurred = await waitFor(() => {
      const el = container.querySelector('[data-media-layer="preview"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(declarationsFor(blurred)).toMatch(/blur\(14px/);

    settle(full, 'load');
    const image = await screen.findByAltText('full.png');
    expect(image).toHaveAttribute('src', full);
    expect(image).toHaveAttribute('data-media-layer', 'full');
  });

  it('renders the unavailable state with no image and no external request', async () => {
    const url = 'https://files.example/gone.png';
    const { container } = renderWithProviders(
      <MediaSurface kind="image" variant="solo" src={url} alt="gone.png" pending={false} />,
    );

    settle(url, 'error');

    const box = await screen.findByRole('img', { name: 'Image unavailable' });
    expect(box).toBeInTheDocument();
    expect(screen.getByText('Image unavailable')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toMatch(/ftcdn/);
  });

  it('hides the caption on tiny tiles through a container query', async () => {
    const url = 'https://files.example/tiny.png';
    renderWithProviders(<MediaSurface kind="image" variant="fill" src={url} alt="tiny.png" />);
    settle(url, 'error');

    await screen.findByRole('img', { name: 'Image unavailable' });
    expect(emittedCss()).toMatch(/@container\(max-width:119px\)/);
  });

  it('reports the file as gone only when the server confirms it', async () => {
    const url = 'https://files.example/deleted.png';
    const onGone = vi.fn();
    globalThis.fetch = vi.fn(async () => ({ status: 404 })) as never;
    renderWithProviders(
      <MediaSurface kind="image" variant="solo" src={url} alt="deleted.png" onGone={onGone} />,
    );

    settle(url, 'error');

    await waitFor(() => expect(onGone).toHaveBeenCalledTimes(1));
  });

  it('does not report a file as gone on a transient failure', async () => {
    const url = 'https://files.example/flaky.png';
    const onGone = vi.fn();
    globalThis.fetch = vi.fn(async () => ({ status: 503 })) as never;
    renderWithProviders(
      <MediaSurface kind="image" variant="solo" src={url} alt="flaky.png" onGone={onGone} />,
    );

    settle(url, 'error');

    await screen.findByRole('img', { name: 'Image unavailable' });
    expect(onGone).not.toHaveBeenCalled();
  });

  it('sizes a solo image from its natural ratio, clamped to 320 x 380', async () => {
    const url = 'https://files.example/tall.png';
    renderWithProviders(
      <MediaSurface kind="image" variant="solo" src={url} alt="tall.png" dims={{ width: 600, height: 1200 }} />,
    );
    settle(url, 'load');
    await screen.findByAltText('tall.png');

    const stage = screen.getByTestId('media-surface') as HTMLElement;
    expect(stage.style.aspectRatio).toBe('190 / 380');
  });

  it('shows a flat neutral box, not a shimmer, for an upload that has no URL and is not pending', () => {
    renderWithProviders(
      <MediaSurface kind="image" variant="fill" src="" alt="idle.png" pending={false} />,
    );
    const stage = screen.getByTestId('media-surface');
    expect(stage.firstElementChild).not.toHaveStyle({ animation: 'none' });
    expect(declarationsFor(stage.firstElementChild as Element)).not.toMatch(/shimmer/);
  });
});

describe('MediaSurface video', () => {
  it('shows the glass play button and the duration chip', () => {
    renderWithProviders(
      <MediaSurface kind="video" variant="fill" src="https://files.example/clip.mp4" alt="clip.mp4" duration="75" />,
    );
    expect(screen.getByText('1:15')).toBeInTheDocument();
    const stage = screen.getByTestId('media-surface');
    expect(declarationsFor(stage.querySelector('span[aria-hidden="true"]') as Element)).toMatch(
      /backdrop-filter/,
    );
  });

  it('hides the chrome when asked, as on the +N cell', () => {
    renderWithProviders(
      <MediaSurface kind="video" variant="fill" src="https://files.example/clip.mp4" alt="clip.mp4" duration="75" chrome={false} />,
    );
    expect(screen.queryByText('1:15')).toBeNull();
  });
});

describe('FileCard', () => {
  it('shows the full name, its meta and opens the file on click', () => {
    const onOpen = vi.fn();
    renderWithProviders(
      <FileCard
        name="a-very-long-contract-name-that-needs-an-ellipsis.docx"
        meta={['DOCX', '2.00 KB', undefined]}
        icon={<span>icon</span>}
        onOpen={onOpen}
      />,
    );

    const name = screen.getByText('a-very-long-contract-name-that-needs-an-ellipsis.docx');
    expect(declarationsFor(name)).toMatch(/text-overflow:ellipsis/);
    expect(screen.getByText('DOCX')).toBeInTheDocument();
    expect(screen.getByText('2.00 KB')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe('ImageUnavailableArt', () => {
  it('renders an inline svg with no raster image and no external href', () => {
    const { container } = renderWithProviders(<ImageUnavailableArt size={96} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(container.querySelector('image')).toBeNull();
    expect(container.querySelector('[href], [xlink\\:href]')).toBeNull();
    expect(container.innerHTML).not.toMatch(/https?:\/\//);
  });
});
