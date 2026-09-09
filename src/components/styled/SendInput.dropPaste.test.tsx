import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import SendInput from './SendInput';
import { IConfig } from '../../types/types';

vi.mock('../../hooks/usePdfThumbnail', () => ({
  usePdfThumbnail: () => ({ status: 'idle', retry: () => undefined }),
}));

// lastModified is pinned because it is part of the dedup key: the same file
// arriving twice (picked then dropped) must look like one file.
const makeFile = (name: string, type: string, size = 1024) => {
  const file = new File(['x'], name, { type, lastModified: 1_700_000_000_000 });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

/**
 * jsdom has no DragEvent and no DataTransfer, and RTL copies unknown
 * properties straight onto the event it dispatches - so a plain object with
 * the two fields the handlers read is exactly what the code sees.
 */
const dataTransfer = (files: File[], types: string[] = ['Files']) => ({
  files,
  types,
  dropEffect: 'none',
});

const setup = (config?: IConfig) => {
  const sendMedia = vi.fn();
  const sendMessage = vi.fn();

  const { container } = renderWithProviders(
    <SendInput
      sendMessage={sendMessage}
      sendMedia={sendMedia}
      isLoading={false}
      config={config}
      multiline
    />,
    { preloadedState: { chatSettingStore: { config: config || {} } } as never }
  );

  const input = container.querySelector(
    'input[type="file"]'
  ) as HTMLInputElement;
  const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
  // Nothing above the composer is marked as a drop zone here, so the
  // composer itself is the zone (this is also the thread-composer case).
  const zone = container.firstElementChild as HTMLElement;
  return { sendMedia, sendMessage, input, textarea, zone, container };
};

const dropFiles = (zone: HTMLElement, files: File[]) => {
  fireEvent.dragEnter(zone, { dataTransfer: dataTransfer(files) });
  fireEvent.dragOver(zone, { dataTransfer: dataTransfer(files) });
  return fireEvent.drop(zone, { dataTransfer: dataTransfer(files) });
};

const previewCount = (container: HTMLElement) =>
  container.querySelectorAll('img, video').length;

describe('SendInput drag-and-drop attachments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds dropped files to the attachment tray', () => {
    const { zone, container } = setup();

    dropFiles(zone, [
      makeFile('one.png', 'image/png'),
      makeFile('two.png', 'image/png'),
    ]);

    expect(previewCount(container)).toBe(2);
  });

  it('shows the drop target while a file drag is over the zone, and clears it after the drop', () => {
    const { zone } = setup();
    const files = [makeFile('one.png', 'image/png')];

    expect(screen.queryByText('Drop files here to attach')).toBeNull();

    fireEvent.dragEnter(zone, { dataTransfer: dataTransfer(files) });
    expect(screen.getByText('Drop files here to attach')).toBeTruthy();

    fireEvent.drop(zone, { dataTransfer: dataTransfer(files) });
    expect(screen.queryByText('Drop files here to attach')).toBeNull();
  });

  // Dragging selected text or a link out of the transcript is not an
  // attachment drag and must not light the target up.
  it('ignores a drag that carries no files', () => {
    const { zone, container } = setup();

    fireEvent.dragEnter(zone, {
      dataTransfer: dataTransfer([], ['text/plain']),
    });
    expect(screen.queryByText('Drop files here to attach')).toBeNull();

    fireEvent.drop(zone, { dataTransfer: dataTransfer([], ['text/plain']) });
    expect(previewCount(container)).toBe(0);
  });

  // dragenter/dragleave fire per element crossed; a single drag across the
  // transcript must not flicker the target off.
  it('keeps the drop target up across nested enter/leave pairs', () => {
    const { zone } = setup();
    const files = [makeFile('one.png', 'image/png')];

    fireEvent.dragEnter(zone, { dataTransfer: dataTransfer(files) });
    fireEvent.dragEnter(zone, { dataTransfer: dataTransfer(files) });
    fireEvent.dragLeave(zone, { dataTransfer: dataTransfer(files) });
    expect(screen.getByText('Drop files here to attach')).toBeTruthy();

    fireEvent.dragLeave(zone, { dataTransfer: dataTransfer(files) });
    expect(screen.queryByText('Drop files here to attach')).toBeNull();
  });

  it('applies the same count limit and notice the picker does', () => {
    const { zone, container } = setup({ attachments: { maxFiles: 2 } } as IConfig);

    dropFiles(zone, [
      makeFile('a.png', 'image/png'),
      makeFile('b.png', 'image/png'),
      makeFile('c.png', 'image/png'),
    ]);

    expect(previewCount(container)).toBe(2);
    expect(
      screen.getByText('You can attach up to 2 files per message.')
    ).toBeTruthy();
  });

  it('applies the same size limit and notice the picker does', () => {
    const { zone, container } = setup({
      attachments: { maxFileSizeMb: 1 },
    } as IConfig);

    dropFiles(zone, [makeFile('huge.png', 'image/png', 5 * 1024 * 1024)]);

    expect(previewCount(container)).toBe(0);
    expect(screen.getByText(/Skipped huge\.png/)).toBeTruthy();
  });

  it('dedups a dropped file that is already in the tray', () => {
    const { zone, input, container } = setup();
    const file = makeFile('same.png', 'image/png');

    fireEvent.change(input, { target: { files: [file] } });
    expect(previewCount(container)).toBe(1);

    dropFiles(zone, [makeFile('same.png', 'image/png')]);
    expect(previewCount(container)).toBe(1);
  });

  it('does nothing when media is disabled', () => {
    const { zone, container } = setup({ disableMedia: true } as IConfig);

    dropFiles(zone, [makeFile('one.png', 'image/png')]);

    expect(screen.queryByText('Drop files here to attach')).toBeNull();
    expect(previewCount(container)).toBe(0);
  });

  // A file dropped outside the chat would otherwise make the browser
  // navigate to it and throw the session away.
  it('cancels a stray file drop elsewhere on the page', () => {
    setup();

    const files = [makeFile('stray.png', 'image/png')];
    const notCancelled = fireEvent.drop(document.body, {
      dataTransfer: dataTransfer(files),
    });

    // fireEvent returns false when the event was cancelled.
    expect(notCancelled).toBe(false);
  });
});

describe('SendInput paste attachments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('attaches an image pasted into the composer', () => {
    const { textarea, container } = setup();

    fireEvent.paste(textarea, {
      clipboardData: { files: [makeFile('screenshot.png', 'image/png')] },
    });

    expect(previewCount(container)).toBe(1);
  });

  it('leaves a plain-text paste alone', () => {
    const { textarea, container } = setup();

    const notCancelled = fireEvent.paste(textarea, {
      clipboardData: {
        files: [],
        getData: () => 'just some text',
      },
    });

    expect(previewCount(container)).toBe(0);
    // Not cancelled, so the browser performs its normal text insertion.
    expect(notCancelled).toBe(true);
  });

  it('runs a pasted image through the same size limit as the picker', () => {
    const { textarea, container } = setup({
      attachments: { maxFileSizeMb: 1 },
    } as IConfig);

    fireEvent.paste(textarea, {
      clipboardData: {
        files: [makeFile('big.png', 'image/png', 5 * 1024 * 1024)],
      },
    });

    expect(previewCount(container)).toBe(0);
    expect(screen.getByText(/Skipped big\.png/)).toBeTruthy();
  });

  it('does not attach a pasted non-image file', () => {
    const { textarea, container } = setup();

    const notCancelled = fireEvent.paste(textarea, {
      clipboardData: { files: [makeFile('notes.txt', 'text/plain')] },
    });

    expect(previewCount(container)).toBe(0);
    expect(notCancelled).toBe(true);
  });
});
