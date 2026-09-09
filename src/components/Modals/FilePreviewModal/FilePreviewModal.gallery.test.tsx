import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';
import FilePreviewModal from './FilePreviewModal';

// The PDF branch loads pdf.js and measures a canvas; neither is meaningful
// here and both are noisy in JSDOM. The point of the PDF case below is only
// that the viewer still routes to it and grows no gallery chrome.
vi.mock('./PdfView', () => ({
  default: ({ pdfUrl }: { pdfUrl: string }) => (
    <div data-testid="pdf-viewer">{pdfUrl}</div>
  ),
}));

const ROOM = 'room@conference.xmpp.example.com';
const SECURE = 'https://secure-files.example.com';

const imageMessage = (id: string, file: string) => ({
  id,
  body: '',
  roomJid: ROOM,
  date: `2026-01-0${id}T00:00:00.000Z`,
  user: { id: 'u1' },
  location: `${SECURE}/${file}`,
  mimetype: 'image/png',
  originalName: file,
});

const stateWith = (
  activeFile: Record<string, string> | undefined,
  messages: unknown[] = [
    imageMessage('1', 'one.png'),
    imageMessage('2', 'two.png'),
    imageMessage('3', 'three.png'),
  ]
) => ({
  chatSettingStore: {
    activeFile,
    user: { fileToken: 'TOKEN-1' },
    config: {},
  },
  rooms: {
    activeRoomJID: ROOM,
    rooms: { [ROOM]: { jid: ROOM, messages } },
  },
});

describe('FilePreviewModal gallery navigation', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    }));
  });

  it('shows the position in the gallery for an image', () => {
    renderWithProviders(<FilePreviewModal handleCloseModal={vi.fn()} />, {
      preloadedState: stateWith({
        fileName: 'two.png',
        fileURL: `${SECURE}/two.png`,
        mimetype: 'image/png',
      }),
    });

    expect(screen.getByTestId('lightbox-position')).toHaveTextContent('2 of 3');
  });

  it('the next control moves to the following image and re-appends the ?ft= token', () => {
    const storeRef: { current: any } = { current: null };
    renderWithProviders(<FilePreviewModal handleCloseModal={vi.fn()} />, {
      preloadedState: stateWith({
        fileName: 'one.png',
        fileURL: `${SECURE}/one.png`,
        mimetype: 'image/png',
      }),
      storeRef,
    });

    // The single-file view's secure-URL treatment must survive navigation.
    expect(screen.getByTestId('image-lightbox-image')).toHaveAttribute(
      'src',
      `${SECURE}/one.png?ft=TOKEN-1`
    );

    fireEvent.click(screen.getByLabelText('Next image'));

    expect(storeRef.current.getState().chatSettingStore.activeFile.fileURL).toBe(
      `${SECURE}/two.png`
    );
    expect(screen.getByTestId('lightbox-position')).toHaveTextContent('2 of 3');
    expect(screen.getByTestId('image-lightbox-image')).toHaveAttribute(
      'src',
      `${SECURE}/two.png?ft=TOKEN-1`
    );
  });

  it('finds its place when the opened URL already carries a ?ft= token', () => {
    // What a secure room actually puts in the store: the bubble hands over a
    // URL with a (possibly already stale) per-viewer token attached.
    renderWithProviders(<FilePreviewModal handleCloseModal={vi.fn()} />, {
      preloadedState: stateWith({
        fileName: 'two.png',
        fileURL: `${SECURE}/two.png?ft=STALE-TOKEN`,
        mimetype: 'image/png',
      }),
    });

    expect(screen.getByTestId('lightbox-position')).toHaveTextContent('2 of 3');
    // and the rendered URL carries the viewer's current token, not the stale one
    expect(screen.getByTestId('image-lightbox-image')).toHaveAttribute(
      'src',
      `${SECURE}/two.png?ft=TOKEN-1`
    );
  });

  it('stops at the ends of the loaded set instead of wrapping', () => {
    renderWithProviders(<FilePreviewModal handleCloseModal={vi.fn()} />, {
      preloadedState: stateWith({
        fileName: 'one.png',
        fileURL: `${SECURE}/one.png`,
        mimetype: 'image/png',
      }),
    });

    expect(screen.getByLabelText('Previous image')).toBeDisabled();
    expect(screen.getByLabelText('Next image')).not.toBeDisabled();

    fireEvent.click(screen.getByLabelText('Next image'));
    fireEvent.click(screen.getByLabelText('Next image'));

    expect(screen.getByTestId('lightbox-position')).toHaveTextContent('3 of 3');
    expect(screen.getByLabelText('Next image')).toBeDisabled();
  });

  it('left and right arrow keys navigate', () => {
    renderWithProviders(<FilePreviewModal handleCloseModal={vi.fn()} />, {
      preloadedState: stateWith({
        fileName: 'two.png',
        fileURL: `${SECURE}/two.png`,
        mimetype: 'image/png',
      }),
    });

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(screen.getByTestId('lightbox-position')).toHaveTextContent('3 of 3');

    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(screen.getByTestId('lightbox-position')).toHaveTextContent('1 of 3');
  });

  it('leaves Escape to the modal layer instead of handling it here', () => {
    const handleCloseModal = vi.fn();
    renderWithProviders(<FilePreviewModal handleCloseModal={handleCloseModal} />, {
      preloadedState: stateWith({
        fileName: 'two.png',
        fileURL: `${SECURE}/two.png`,
        mimetype: 'image/png',
      }),
    });

    fireEvent.keyDown(document, { key: 'Escape' });

    // Dismissal belongs to Modal.tsx's useModalDismiss; this component adding
    // its own Escape handling would double-close and fight the focus restore.
    expect(handleCloseModal).not.toHaveBeenCalled();
  });

  it('a PDF keeps the old single-file view and grows no gallery chrome', () => {
    renderWithProviders(<FilePreviewModal handleCloseModal={vi.fn()} />, {
      preloadedState: stateWith({
        fileName: 'report.pdf',
        fileURL: `${SECURE}/report.pdf`,
        mimetype: 'application/pdf',
      }),
    });

    expect(screen.getByTestId('pdf-viewer')).toHaveTextContent(
      `${SECURE}/report.pdf?ft=TOKEN-1`
    );
    expect(screen.queryByTestId('lightbox-position')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Next image')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Zoom in')).not.toBeInTheDocument();
  });

  it('shows no navigation when the room holds a single image', () => {
    renderWithProviders(<FilePreviewModal handleCloseModal={vi.fn()} />, {
      preloadedState: stateWith(
        {
          fileName: 'one.png',
          fileURL: `${SECURE}/one.png`,
          mimetype: 'image/png',
        },
        [imageMessage('1', 'one.png')]
      ),
    });

    expect(screen.queryByLabelText('Next image')).not.toBeInTheDocument();
    // Zoom still applies to a lone image.
    expect(screen.getByLabelText('Zoom in')).toBeInTheDocument();
  });

  it('keeps the download action working after navigating', () => {
    renderWithProviders(<FilePreviewModal handleCloseModal={vi.fn()} />, {
      preloadedState: stateWith({
        fileName: 'one.png',
        fileURL: `${SECURE}/one.png`,
        mimetype: 'image/png',
      }),
    });

    fireEvent.click(screen.getByLabelText('Next image'));
    fireEvent.click(screen.getByLabelText('Save'));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`${SECURE}/two.png`),
      expect.anything()
    );
  });

  it('names the dialog', () => {
    renderWithProviders(<FilePreviewModal handleCloseModal={vi.fn()} />, {
      preloadedState: stateWith({
        fileName: 'one.png',
        fileURL: `${SECURE}/one.png`,
        mimetype: 'image/png',
      }),
    });

    expect(screen.getByRole('dialog')).toHaveAccessibleName('File preview');
  });

  it('falls back to a described alt when the image carries no name', () => {
    renderWithProviders(<FilePreviewModal handleCloseModal={vi.fn()} />, {
      preloadedState: stateWith({
        fileName: '',
        fileURL: `${SECURE}/one.png`,
        mimetype: 'image/png',
      }),
    });

    expect(screen.getByTestId('image-lightbox-image')).toHaveAttribute(
      'alt',
      'Shared image'
    );
  });
});
