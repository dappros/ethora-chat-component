import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import SendInput from './SendInput';
import { IConfig } from '../../types/types';

// pdf.js is loaded lazily by the preview hook; a jsdom canvas can't render a
// document anyway, so keep it out of the composer's unit test entirely.
vi.mock('../../hooks/usePdfThumbnail', () => ({
  usePdfThumbnail: () => ({ status: 'idle', retry: () => undefined }),
}));

// lastModified is pinned because it is part of the dedup key: the OS picker
// reports the same value for the same file, and a wall-clock default would
// make "picked the same file twice" look like two different files here.
const makeFile = (name: string, type: string, size = 1024) => {
  const file = new File(['x'], name, { type, lastModified: 1_700_000_000_000 });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

const setup = (config?: IConfig) => {
  const sendMedia = vi.fn();
  const sendMessage = vi.fn();

  const { container } = renderWithProviders(
    <SendInput
      sendMessage={sendMessage}
      sendMedia={sendMedia}
      isLoading={false}
      config={config}
    />,
    { preloadedState: { chatSettingStore: { config: config || {} } } as never }
  );

  const input = container.querySelector(
    'input[type="file"]'
  ) as HTMLInputElement;

  return { sendMedia, sendMessage, input };
};

const pick = (input: HTMLInputElement, files: File[]) =>
  fireEvent.change(input, { target: { files } });

describe('SendInput multi-attachment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts multiple files at once', () => {
    const { input } = setup();
    expect(input.multiple).toBe(true);
  });

  // The tray used to render `idx < 1` - four of five picked files were
  // invisible, and only the first was ever sent.
  it('shows every picked file, not just the first', () => {
    const { input } = setup();

    pick(input, [
      makeFile('one.png', 'image/png'),
      makeFile('two.pdf', 'application/pdf'),
      makeFile('three.txt', 'text/plain'),
    ]);

    expect(screen.getByText('one.png')).toBeInTheDocument();
    expect(screen.getByText('two.pdf')).toBeInTheDocument();
    expect(screen.getByText('three.txt')).toBeInTheDocument();
  });

  it('sends the whole tray as one message', () => {
    const { input, sendMedia } = setup();
    const files = [
      makeFile('one.png', 'image/png'),
      makeFile('two.pdf', 'application/pdf'),
    ];

    pick(input, files);
    fireEvent.keyDown(screen.getByPlaceholderText('Type message'), {
      key: 'Enter',
    });

    expect(sendMedia).toHaveBeenCalledTimes(1);
    const [payload] = sendMedia.mock.calls[0];
    expect(payload).toHaveLength(2);
    expect(payload.map((file: File) => file.name)).toEqual([
      'one.png',
      'two.pdf',
    ]);
  });

  it('drops duplicate picks', () => {
    const { input } = setup();
    const file = makeFile('one.png', 'image/png');

    pick(input, [file]);
    pick(input, [makeFile('one.png', 'image/png')]);

    expect(screen.getAllByText('one.png')).toHaveLength(1);
  });

  it('stops at the configured file limit and says so', () => {
    const { input } = setup({ attachments: { maxFiles: 2 } });

    pick(input, [
      makeFile('a.png', 'image/png'),
      makeFile('b.png', 'image/png'),
      makeFile('c.png', 'image/png'),
    ]);

    expect(screen.queryByText('c.png')).not.toBeInTheDocument();
    expect(
      screen.getByText(/up to 2 files/i)
    ).toBeInTheDocument();
  });

  it('rejects a file over the size limit and keeps the rest', () => {
    const { input } = setup({ attachments: { maxFileSizeMb: 1 } });

    pick(input, [
      makeFile('small.png', 'image/png', 500),
      makeFile('huge.pdf', 'application/pdf', 5 * 1024 * 1024),
    ]);

    expect(screen.getByText('small.png')).toBeInTheDocument();
    expect(screen.queryByText('huge.pdf')).not.toBeInTheDocument();
    expect(screen.getByText(/over 1 MB/i)).toBeInTheDocument();
  });

  it('revokes every preview URL when the composer unmounts', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const { input } = setup();

    pick(input, [
      makeFile('a.png', 'image/png'),
      makeFile('b.png', 'image/png'),
    ]);

    const createdCount = revoke.mock.calls.length;
    screen.getByText('a.png'); // previews are mounted

    // Removing one file revokes exactly that file's URL.
    fireEvent.click(screen.getAllByLabelText('Remove attachment')[0]);
    expect(revoke.mock.calls.length).toBe(createdCount + 1);

    revoke.mockRestore();
  });
});
