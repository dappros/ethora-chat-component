import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import chatSettingsSlice from '../../roomStore/chatSettingsSlice';
import roomsSlice from '../../roomStore/roomsSlice';
import roomHeapSlice from '../../roomStore/roomHeapSlice';
import { sealFileForUpload } from '../../e2ee/fileEnvelope';
import MediaMessage from './MediaMessage';
import { IMessage } from '../../types/types';

// wavesurfer needs a real canvas; the player itself is not what is under test.
vi.mock('../styled/AudioMessage', () => ({
  default: ({ src }: { src: string }) => <div data-testid="player" data-src={src} />,
}));
vi.mock('./AttachmentList', () => ({
  default: () => <div data-testid="preview-tiles" />,
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

const serve = (ciphertext: Uint8Array) =>
  vi.fn(async () => ({
    ok: true,
    status: 200,
    arrayBuffer: async () => ciphertext.slice().buffer,
  }));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test/1');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

describe('a sealed voice note', () => {
  it('decrypts on mount and plays in place', async () => {
    // A voice note is a bare Blob: no name, no type. The type that routes it
    // here comes from the encrypted body, not from the seal.
    const seal = await sealFileForUpload(new Blob(['fake audio']));
    vi.stubGlobal('fetch', serve(seal.ciphertext));

    renderWith({
      location: SEALED_URL,
      mimetype: 'application/octet-stream',
      originalName: seal.filename,
      e2eeKeys: [seal.keyMaterial],
      e2eeTypes: ['audio/'],
    });

    await waitFor(() => expect(screen.getByTestId('player')).toBeTruthy());
    expect(screen.getByTestId('player').getAttribute('data-src')).toBe('blob:test/1');
  });

  it('revokes the decrypted audio when the bubble goes away', async () => {
    const seal = await sealFileForUpload(new Blob(['fake audio']));
    vi.stubGlobal('fetch', serve(seal.ciphertext));

    const { unmount } = renderWith({
      location: SEALED_URL,
      mimetype: 'application/octet-stream',
      e2eeKeys: [seal.keyMaterial],
      e2eeTypes: ['audio/'],
    });

    await waitFor(() => expect(screen.getByTestId('player')).toBeTruthy());
    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test/1');
  });

  it('says so when the voice note will not open', async () => {
    const seal = await sealFileForUpload(new Blob(['fake audio']));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403 })));

    renderWith({
      location: SEALED_URL,
      mimetype: 'application/octet-stream',
      e2eeKeys: [seal.keyMaterial],
      e2eeTypes: ['audio/'],
    });

    await waitFor(() =>
      expect(screen.getByText('Encrypted attachment could not be opened')).toBeTruthy()
    );
  });

  it('leaves a sealed document as a download chip, not a player', async () => {
    const seal = await sealFileForUpload(
      new File(['doc'], 'contract.pdf', { type: 'application/pdf' })
    );
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    renderWith({
      location: SEALED_URL,
      mimetype: 'application/octet-stream',
      originalName: seal.filename,
      e2eeKeys: [seal.keyMaterial],
      e2eeTypes: ['application/pdf'],
    });

    expect(screen.queryByTestId('player')).toBeNull();
    expect(screen.getByText('Encrypted file')).toBeTruthy();
    // Documents are still not fetched until asked for.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falls back to a download chip when the sender sent no types', async () => {
    // An older sender's body carries `keys` but no `types`.
    const seal = await sealFileForUpload(new Blob(['fake audio']));
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    renderWith({
      location: SEALED_URL,
      mimetype: 'application/octet-stream',
      e2eeKeys: [seal.keyMaterial],
    });

    expect(screen.queryByTestId('player')).toBeNull();
    expect(screen.getByText('Encrypted file')).toBeTruthy();
  });
});
