import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import MediaMessage from './MediaMessage';
import { IMessage, IRoom } from '../../types/types';

vi.mock('../../hooks/usePdfThumbnail', () => ({
  usePdfThumbnail: () => ({ status: 'idle', retry: () => undefined }),
}));

// Bug: deleting a file from the Files panel left any chat message the
// panel couldn't match (a different room's history not loaded locally, or
// a backend that doesn't round-trip attachmentId - see
// findMessagesForFile.ts) stuck showing a broken "No image available"
// bubble forever, because the image genuinely 404ing was never connected
// back to the message's `isDeleted` state. This is the last-resort path:
// once the browser confirms the URL is truly dead, flip the message to the
// normal deleted placeholder.
const ROOM_JID = 'room@conference.xmpp.example';

const baseMessage = {
  id: 'm1',
  body: 'media',
  roomJid: ROOM_JID,
  date: new Date().toISOString(),
  user: { id: 'u1' },
  isMediafile: 'true',
  mimetype: 'image/png',
  // Deliberately not a secure-files.* host: isSecureFileUrl(...) is false,
  // so CustomMessageImage goes straight to 'failed' with no fileToken
  // recovery attempt in between.
  location: 'https://files.example/deleted.png',
  locationPreview: 'https://files.example/deleted-thumb.png',
  originalName: 'deleted.png',
} as unknown as IMessage;

const makeRoom = (): IRoom =>
  ({
    jid: ROOM_JID,
    name: ROOM_JID,
    title: 'Room',
    usersCnt: 0,
    messages: [baseMessage],
    isLoading: false,
    roomBg: null,
  }) as IRoom;

describe('MediaMessage - broken media falls back to the deleted placeholder', () => {
  const RealImage = globalThis.Image;
  beforeEach(() => {
    class FailingImage {
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      set src(_value: string) {
        setTimeout(() => this.onerror?.(), 0);
      }
    }
    globalThis.Image = FailingImage as unknown as typeof Image;
  });
  afterEach(() => {
    globalThis.Image = RealImage;
  });

  it('dispatches deleteRoomMessage once the image is confirmed unreachable', async () => {
    const storeRef: { current: any } = { current: null };
    renderWithProviders(
      <MediaMessage message={baseMessage} />,
      {
        preloadedState: {
          chatSettingStore: { config: {} } as never,
          rooms: { rooms: { [ROOM_JID]: makeRoom() } } as any,
        },
        storeRef,
      }
    );

    await waitFor(() => {
      const state = storeRef.current.getState();
      expect(state.rooms.rooms[ROOM_JID].messages[0].isDeleted).toBe(true);
    });
  });

  it('does nothing once the message is already marked deleted', async () => {
    const storeRef: { current: any } = { current: null };
    const deletedMessage = { ...baseMessage, isDeleted: true };
    const room = { ...makeRoom(), messages: [deletedMessage] };

    renderWithProviders(<MediaMessage message={deletedMessage} />, {
      preloadedState: {
        chatSettingStore: { config: {} } as never,
        rooms: { rooms: { [ROOM_JID]: room } } as any,
      },
      storeRef,
    });

    // Give the (stubbed) image load a tick to resolve either way.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    const state = storeRef.current.getState();
    // Still exactly one message, untouched by a redundant dispatch.
    expect(state.rooms.rooms[ROOM_JID].messages).toHaveLength(1);
    expect(state.rooms.rooms[ROOM_JID].messages[0].isDeleted).toBe(true);
  });
});
