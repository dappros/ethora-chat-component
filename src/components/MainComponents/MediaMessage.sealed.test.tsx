import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import chatSettingsSlice from '../../roomStore/chatSettingsSlice';
import roomsSlice from '../../roomStore/roomsSlice';
import roomHeapSlice from '../../roomStore/roomHeapSlice';
import { sealFileForUpload } from '../../e2ee/fileEnvelope';
import { clearSealedAttachmentCache } from '../../helpers/sealedAttachments';
import MediaMessage from './MediaMessage';
import { IMessage } from '../../types/types';

// AttachmentList is the renderer under all of this; stub it so the assertions
// are about WHAT the tiles are handed, not about how a PDF tile draws itself.
vi.mock('./AttachmentList', () => ({
  default: ({ attachments }: { attachments: any[] }) => (
    <div data-testid="tiles">
      {attachments.map((a, i) => (
        <div
          key={i}
          data-testid={`tile-${i}`}
          data-location={a.location}
          data-mimetype={a.mimetype}
          data-name={a.originalName}
        />
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

beforeEach(() => {
  clearSealedAttachmentCache();
  vi.restoreAllMocks();
});

describe('MediaMessage with a sealed attachment', () => {
  it('renders the decrypted blob, real type and real filename', async () => {
    const seal = await sealFileForUpload(
      new File(['bytes'], 'holiday.png', { type: 'image/png' })
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        arrayBuffer: async () => seal.ciphertext.slice().buffer,
      }))
    );

    renderWith({
      location: SEALED_URL,
      locationPreview: '',
      mimetype: 'application/octet-stream',
      originalName: seal.filename,
      fileName: 'stored-9f2c',
      size: '99',
      e2eeKeys: [seal.keyMaterial],
    });

    await waitFor(() => {
      const tile = screen.getByTestId('tile-0');
      expect(tile.getAttribute('data-location')).toMatch(/^blob:/);
    });

    const tile = screen.getByTestId('tile-0');
    expect(tile.getAttribute('data-mimetype')).toBe('image/png');
    expect(tile.getAttribute('data-name')).toBe('holiday.png');
  });

  it('never hands a tile the ciphertext URL while it is still opening', async () => {
    // Rendering the sealed URL would draw a broken image for the whole
    // download; an empty location is what every tile already treats as
    // "not available yet".
    const seal = await sealFileForUpload(
      new File(['bytes'], 'holiday.png', { type: 'image/png' })
    );
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));

    renderWith({
      location: SEALED_URL,
      mimetype: 'application/octet-stream',
      originalName: seal.filename,
      e2eeKeys: [seal.keyMaterial],
    });

    expect(screen.getByTestId('tile-0').getAttribute('data-location')).toBe('');
  });

  it('says so when the attachment cannot be opened', async () => {
    const seal = await sealFileForUpload(
      new File(['bytes'], 'holiday.png', { type: 'image/png' })
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403 })));

    renderWith({
      location: SEALED_URL,
      mimetype: 'application/octet-stream',
      originalName: seal.filename,
      e2eeKeys: [seal.keyMaterial],
    });

    await waitFor(() =>
      expect(screen.getByText('Encrypted attachment could not be opened')).toBeTruthy()
    );
  });
});

describe('MediaMessage without sealing', () => {
  it('passes an ordinary attachment straight through', async () => {
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

    const tile = screen.getByTestId('tile-0');
    expect(tile.getAttribute('data-location')).toBe('https://files.example/photo.png');
    expect(tile.getAttribute('data-mimetype')).toBe('image/png');
    // Nothing to decrypt means nothing to download.
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
