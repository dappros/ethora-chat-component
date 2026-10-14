import React, { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { useModalDismiss } from '../../../hooks/useModalDismiss';
import FilePreviewModal from './FilePreviewModal';
import { downloadFile } from '../../../helpers/downloadFile';

vi.mock('../../../helpers/downloadFile', () => ({
  downloadFile: vi.fn(() => Promise.resolve('blob')),
}));

// Behaviour of the full-screen viewer chrome: keyboard, backdrop, thumbnails,
// the error state, and focus. Escape and focus restore belong to the modal
// layer; the harness below mounts the viewer the same way ModalContent does
// (useModalDismiss around the content) so those contracts are exercised here.

const ROOM = 'room@conference.xmpp.example.com';
const SECURE = 'https://secure-files.example.com';

const imageMessage = (id: string, file: string) => ({
  id,
  body: '',
  roomJid: ROOM,
  date: `2026-01-0${id}T10:00:00.000Z`,
  user: {
    id: `u${id}`,
    username: `user${id}`,
    firstName: 'Ada',
    lastName: 'Lovelace',
  },
  location: `${SECURE}/${file}`,
  locationPreview: `${SECURE}/preview-${file}`,
  mimetype: 'image/png',
  originalName: file,
});

const MESSAGES = [
  imageMessage('1', 'one.png'),
  imageMessage('2', 'two.png'),
  imageMessage('3', 'three.png'),
];

const stateWith = (activeFile?: Record<string, string>) => ({
  chatSettingStore: {
    activeFile,
    user: { fileToken: 'TOKEN-1' },
    config: {},
  },
  rooms: {
    activeRoomJID: ROOM,
    rooms: { [ROOM]: { jid: ROOM, messages: MESSAGES } },
  },
});

const openFile = (file: string) => ({
  fileName: file,
  fileURL: `${SECURE}/${file}`,
  mimetype: 'image/png',
});

/** Mounts the viewer the way ModalContent does: dismiss layer around it. */
const ViewerHarness: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  useModalDismiss({ enabled: true, onClose, containerRef });
  return (
    <div ref={containerRef}>
      <FilePreviewModal handleCloseModal={onClose} />
    </div>
  );
};

describe('FilePreviewModal viewer', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.style.overflow = '';
  });

  it('closes on Escape through the modal dismiss layer', () => {
    const onClose = vi.fn();
    renderWithProviders(<ViewerHarness onClose={onClose} />, {
      preloadedState: stateWith(openFile('two.png')),
    });

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keyboard arrows move through the gallery and update the counter', () => {
    const storeRef: { current: any } = { current: null };
    renderWithProviders(<FilePreviewModal handleCloseModal={vi.fn()} />, {
      preloadedState: stateWith(openFile('two.png')),
      storeRef,
    });

    expect(screen.getByTestId('lightbox-position')).toHaveTextContent('2 of 3');

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(storeRef.current.getState().chatSettingStore.activeFile.fileName).toBe(
      'three.png'
    );
    expect(screen.getByTestId('lightbox-position')).toHaveTextContent('3 of 3');

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(storeRef.current.getState().chatSettingStore.activeFile.fileName).toBe(
      'three.png'
    );

    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(storeRef.current.getState().chatSettingStore.activeFile.fileName).toBe(
      'one.png'
    );
    expect(screen.getByTestId('lightbox-position')).toHaveTextContent('1 of 3');
  });

  it('a thumbnail click changes the shown item and marks it current', () => {
    renderWithProviders(<FilePreviewModal handleCloseModal={vi.fn()} />, {
      preloadedState: stateWith(openFile('one.png')),
    });

    expect(screen.getByLabelText('Show item 1 of 3')).toHaveAttribute(
      'aria-current',
      'true'
    );

    fireEvent.click(screen.getByLabelText('Show item 3 of 3'));

    expect(screen.getByTestId('image-lightbox-image')).toHaveAttribute(
      'src',
      expect.stringContaining('three.png')
    );
    expect(screen.getByLabelText('Show item 3 of 3')).toHaveAttribute(
      'aria-current',
      'true'
    );
    expect(screen.getByTestId('lightbox-position')).toHaveTextContent('3 of 3');
  });

  it('shows the sender and the file name in the header', () => {
    renderWithProviders(<FilePreviewModal handleCloseModal={vi.fn()} />, {
      preloadedState: stateWith(openFile('two.png')),
    });

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText(/two\.png/)).toBeInTheDocument();
  });

  it('a click on the empty backdrop closes, a click on the media does not', () => {
    const onClose = vi.fn();
    renderWithProviders(<FilePreviewModal handleCloseModal={onClose} />, {
      preloadedState: stateWith(openFile('one.png')),
    });

    fireEvent.click(screen.getByTestId('image-lightbox-image'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('file-viewer-stage'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the error state with retry and download when the image fails', () => {
    const onClose = vi.fn();
    renderWithProviders(<FilePreviewModal handleCloseModal={onClose} />, {
      preloadedState: stateWith(openFile('one.png')),
    });

    fireEvent.error(screen.getByTestId('image-lightbox-image'));

    const panel = screen.getByTestId('file-viewer-error');
    expect(panel).toHaveTextContent('This file is unavailable');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument();
    // The failure must not be replaced by a remote placeholder picture.
    expect(panel.querySelectorAll('img')).toHaveLength(0);
    expect(screen.queryByTestId('image-lightbox-image')).not.toBeInTheDocument();
  });

  it('try again re-mounts the picture with a cache-busting marker', () => {
    renderWithProviders(<FilePreviewModal handleCloseModal={vi.fn()} />, {
      preloadedState: stateWith(openFile('one.png')),
    });

    fireEvent.error(screen.getByTestId('image-lightbox-image'));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.queryByTestId('file-viewer-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('image-lightbox-image')).toHaveAttribute(
      'src',
      expect.stringContaining('retry=1')
    );
  });

  it('download in the error state saves through the shared helper', () => {
    renderWithProviders(<FilePreviewModal handleCloseModal={vi.fn()} />, {
      preloadedState: stateWith(openFile('one.png')),
    });

    fireEvent.error(screen.getByTestId('image-lightbox-image'));
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    expect(downloadFile).toHaveBeenCalledWith(
      expect.stringContaining(`${SECURE}/one.png`),
      'one.png'
    );
  });

  it('locks page scroll while open and restores it on close', () => {
    document.body.style.overflow = 'auto';
    const { unmount } = renderWithProviders(
      <FilePreviewModal handleCloseModal={vi.fn()} />,
      { preloadedState: stateWith(openFile('one.png')) }
    );
    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('restores focus to the opener when the viewer closes', () => {
    const opener = document.createElement('button');
    opener.textContent = 'open';
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { unmount } = renderWithProviders(
      <ViewerHarness onClose={vi.fn()} />,
      { preloadedState: stateWith(openFile('one.png')) }
    );
    expect(
      document.querySelector('[data-testid="file-viewer"]')?.contains(
        document.activeElement
      )
    ).toBe(true);

    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('Tab wraps inside the viewer instead of leaving it', () => {
    renderWithProviders(<FilePreviewModal handleCloseModal={vi.fn()} />, {
      preloadedState: stateWith(openFile('two.png')),
    });

    const surface = screen.getByTestId('file-viewer');
    const buttons = Array.from(surface.querySelectorAll('button:not([disabled])'));
    const last = buttons[buttons.length - 1] as HTMLElement;
    const first = buttons[0] as HTMLElement;

    last.focus();
    fireEvent.keyDown(surface, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
  });
});
