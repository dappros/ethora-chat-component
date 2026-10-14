import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import AttachmentList from './AttachmentList';
import { SCRIM_FADE_MS } from './MediaUploadOverlay';
import type { IAttachment } from '../../types/types';

type Probe = { src: string; onload: null | (() => void); naturalWidth: number; naturalHeight: number };
let probes: Probe[] = [];
const RealImage = globalThis.Image;

const load = (url: string, width: number, height: number) => {
  const probe = probes.filter((p) => p.src === url).pop();
  if (!probe) throw new Error(`no probe for ${url}`);
  probe.naturalWidth = width;
  probe.naturalHeight = height;
  act(() => probe.onload?.());
};

const LOCAL = 'blob:ethora-test/solo';
const base: IAttachment = { location: '', mimetype: 'image/png', originalName: 'me.png', localUrl: LOCAL };

describe('solo image upload', () => {
  beforeEach(() => {
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
  });
  afterEach(() => {
    globalThis.Image = RealImage;
    vi.useRealTimers();
  });

  it('shows the local picture at its real ratio under the progress scrim', async () => {
    renderWithProviders(
      <AttachmentList attachments={[{ ...base, uploadStatus: 'uploading', uploadProgress: 40 }]} />,
    );
    load(LOCAL, 600, 1200);
    expect(await screen.findByAltText('me.png')).toHaveAttribute('src', LOCAL);
    expect((screen.getByTestId('media-surface') as HTMLElement).style.aspectRatio).toBe('392 / 784');
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('fades the scrim out for 180ms once the upload is done, keeping the same picture', async () => {
    vi.useFakeTimers();
    const view = renderWithProviders(
      <AttachmentList attachments={[{ ...base, uploadStatus: 'uploading', uploadProgress: 100 }]} />,
    );
    load(LOCAL, 800, 600);
    const image = screen.getByAltText('me.png');

    view.rerender(<AttachmentList attachments={[{ ...base, location: 'https://files.example/me.png' }]} />);
    // Same instance: the picture was not remounted, the scrim is still there, fading.
    expect(screen.getByAltText('me.png')).toBe(image);
    expect(screen.getByRole('status')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(SCRIM_FADE_MS + 20);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('keeps the tinted scrim with a retry control when the upload failed', () => {
    const onRetry = vi.fn();
    renderWithProviders(
      <AttachmentList attachments={[{ ...base, uploadStatus: 'failed' }]} onRetryAttachment={onRetry} />,
    );
    expect(screen.getByText('Upload failed')).toBeInTheDocument();
    screen.getByRole('button', { name: /retry/i }).click();
    expect(onRetry).toHaveBeenCalledWith(0);
  });
});
