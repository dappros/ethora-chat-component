import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import chatSettingsSlice from '../../roomStore/chatSettingsSlice';
import roomsSlice from '../../roomStore/roomsSlice';
import roomHeapSlice from '../../roomStore/roomHeapSlice';
import { sealFileForUpload } from '../../e2ee/fileEnvelope';
import MediaMessage from './MediaMessage';
import { IMessage } from '../../types/types';

// The ordinary renderer is stubbed so "did we show a preview?" is a direct
// assertion rather than a guess about how a PDF tile draws itself.
vi.mock('./AttachmentList', () => ({
  default: ({ attachments }: { attachments: any[] }) => (
    <div data-testid="preview-tiles">
      {attachments.map((a, i) => (
        <div key={i} data-testid={`tile-${i}`} data-location={a.location} />
      ))}
    </div>
  ),
}));

const renderWith = (message: Partial<IMessage>) => {
  const store = configureStore({
    reducer: { chatSettingStore: chatSettingsSlice, rooms: roomsSlice, roomHeapSlice },
    middleware: (d) => d({ serializableCheck: false, immutableCheck: false }),
  });
  return render(
    <Provider store={store}>
      <MediaMessage message={message as IMessage} />
    </Provider>
  );
};

const SEALED_URL = 'https://secure-files.example/bucket/9f2c';

const sealedMessage = (seal: Awaited<ReturnType<typeof sealFileForUpload>>) => ({
  location: SEALED_URL,
  locationPreview: '',
  mimetype: 'application/octet-stream',
  originalName: seal.filename,
  fileName: 'stored-9f2c',
  size: '2048',
  e2eeKeys: [seal.keyMaterial],
});

const makeSeal = () =>
  sealFileForUpload(new File(['bytes'], 'holiday.png', { type: 'image/png' }));

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('MediaMessage with a sealed attachment', () => {
  it('shows a download card instead of a preview, and fetches nothing up front', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const seal = await makeSeal();

    renderWith(sealedMessage(seal));

    expect(screen.queryByTestId('preview-tiles')).toBeNull();
    expect(screen.getByText('Encrypted file')).toBeTruthy();
    // Nothing is downloaded until the viewer asks for it.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sizes its icons, so the card stays a chip', async () => {
    // Regression: the shared DownloadIcon defaults to 800x800. Rendered
    // without an explicit size it blew the card out to fill the transcript.
    const seal = await makeSeal();
    const { container } = renderWith(sealedMessage(seal));

    const icons = container.querySelectorAll('svg');
    expect(icons.length).toBeGreaterThan(0);
    icons.forEach((icon) => {
      expect(icon.getAttribute('width')).toBe('18');
      expect(icon.getAttribute('height')).toBe('18');
    });
  });

  it('decrypts and saves under the real filename when clicked', async () => {
    const seal = await makeSeal();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        arrayBuffer: async () => seal.ciphertext.slice().buffer,
      }))
    );

    const saved: { name: string; type: string }[] = [];
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test/1');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      saved.push({ name: this.download, type: this.href });
    });

    renderWith(sealedMessage(seal));
    await userEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].name).toBe('holiday.png');
    // Once opened, the card can finally show the real name.
    await waitFor(() => expect(screen.getByText('holiday.png')).toBeTruthy());
  });

  it('reports a failed download and stays clickable', async () => {
    const seal = await makeSeal();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403 })));

    renderWith(sealedMessage(seal));
    await userEvent.click(screen.getByRole('button'));

    await waitFor(() =>
      expect(screen.getByText('Download failed — tap to retry')).toBeTruthy()
    );
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(false);
  });

  it('offers no button when the message never decrypted, so there is no key', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    renderWith({
      location: SEALED_URL,
      mimetype: 'application/octet-stream',
      originalName: 'opaque',
      // clientEncrypted was on the stanza but <body> would not decrypt.
      e2eeKeys: [''],
    });

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Encrypted attachment could not be opened')).toBeTruthy();
  });

  it('gives each attachment of a group its own card and key', async () => {
    const first = await sealFileForUpload(new File(['a'], 'a.txt', { type: 'text/plain' }));
    const second = await sealFileForUpload(new File(['b'], 'b.txt', { type: 'text/plain' }));

    renderWith({
      attachments: [
        { location: `${SEALED_URL}/1`, mimetype: 'application/octet-stream', originalName: 'o1' },
        { location: `${SEALED_URL}/2`, mimetype: 'application/octet-stream', originalName: 'o2' },
      ],
      e2eeKeys: [first.keyMaterial, second.keyMaterial],
    } as Partial<IMessage>);

    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});

describe('MediaMessage without sealing', () => {
  it('still renders the ordinary preview tiles', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    renderWith({
      location: 'https://files.example/photo.png',
      locationPreview: 'https://files.example/photo-thumb.png',
      mimetype: 'image/png',
      originalName: 'photo.png',
      fileName: 'stored-photo.png',
      size: '2048',
    });

    expect(screen.getByTestId('preview-tiles')).toBeTruthy();
    expect(screen.getByTestId('tile-0').getAttribute('data-location')).toBe(
      'https://files.example/photo.png'
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
