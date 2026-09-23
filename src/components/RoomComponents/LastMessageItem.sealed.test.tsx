import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import chatSettingsSlice from '../../roomStore/chatSettingsSlice';
import roomsSlice from '../../roomStore/roomsSlice';
import roomHeapSlice from '../../roomStore/roomHeapSlice';
import LastMessageItem from './LastMessageItem';
import { LastMessage } from '../../types/types';

const renderPreview = (lastMessage: Partial<LastMessage>) => {
  const store = configureStore({
    reducer: { chatSettingStore: chatSettingsSlice, rooms: roomsSlice, roomHeapSlice },
    middleware: (d) => d({ serializableCheck: false, immutableCheck: false }),
  });
  return render(
    <Provider store={store}>
      <LastMessageItem lastMessage={lastMessage as LastMessage} />
    </Provider>
  );
};

describe('room-list preview for a sealed attachment', () => {
  it('says "Encrypted file" rather than claiming the octet-stream is audio', () => {
    // Regression: voice notes also upload as application/octet-stream, so the
    // audio branch claimed every sealed attachment and rendered a play button.
    renderPreview({
      body: 'media',
      clientEncrypted: 'true',
      mimetype: 'application/octet-stream',
      originalName: '4a7d1ed414474e4033ac29ccb8653d9b',
      user: { id: 'u1', name: 'etest etest' } as never,
    });

    expect(screen.getByText('Encrypted file')).toBeTruthy();
    expect(screen.queryByText('audio')).toBeNull();
    // The opaque server-side name must never surface in the list.
    expect(screen.queryByText(/4a7d1ed4/)).toBeNull();
  });

  it('keeps the sender name line', () => {
    renderPreview({
      body: 'media',
      clientEncrypted: 'true',
      mimetype: 'application/octet-stream',
      user: { id: 'u1', name: 'etest etest' } as never,
    });

    expect(screen.getByText('etest etest:')).toBeTruthy();
  });

  it('still says so when the message body never decrypted', () => {
    // No keys, but `clientEncrypted` rides on <data> in the clear, so the
    // preview is still right about what arrived.
    renderPreview({
      body: 'Could not decrypt this message',
      clientEncrypted: 'true',
      mimetype: 'application/octet-stream',
      user: { id: 'u1', name: 'etest etest' } as never,
    });

    expect(screen.getByText('Encrypted file')).toBeTruthy();
  });
});

describe('room-list preview without sealing', () => {
  it('still treats a real voice note as audio', () => {
    renderPreview({
      body: 'media',
      mimetype: 'application/octet-stream',
      originalName: 'voice.ogg',
      user: { id: 'u1', name: 'etest etest' } as never,
    });

    expect(screen.queryByText('Encrypted file')).toBeNull();
    expect(screen.getByText('audio')).toBeTruthy();
  });

  it('still previews an ordinary image', () => {
    renderPreview({
      body: 'media',
      mimetype: 'image/png',
      originalName: 'photo.png',
      locationPreview: 'https://files.example/thumb.png',
      user: { id: 'u1', name: 'etest etest' } as never,
    });

    expect(screen.queryByText('Encrypted file')).toBeNull();
  });
});
