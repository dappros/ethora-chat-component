import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import MediaMessage from './MediaMessage';
import { IMessage, IRoom } from '../../types/types';
import { resetMediaProbeCaches } from '../../hooks/useMediaProbe';

vi.mock('../../hooks/usePdfThumbnail', () => ({
  usePdfThumbnail: () => ({ status: 'idle', retry: () => undefined }),
}));

// Regression: an image that failed to load used to be followed by a HEAD
// request, and a 404/410 answer dispatched deleteRoomMessage, which
// tombstones the message (persisted, attachments wiped). The QA/prod secure
// host answers 404 for freshly uploaded files that are perfectly alive, so
// every photo in the room turned into "This message was deleted". A failed
// load is now only ever the "Image unavailable" state.
const ROOM_JID = 'room@conference.xmpp.example';

const baseMessage = {
  id: 'm1',
  body: 'media',
  roomJid: ROOM_JID,
  date: new Date().toISOString(),
  user: { id: 'u1' },
  isMediafile: 'true',
  mimetype: 'image/png',
  location: 'https://secure-files.example/secure-media/a.png',
  locationPreview: 'https://secure-files.example/secure-media/a-thumb.png',
  originalName: 'a.png',
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

describe('MediaMessage never tombstones a message because its file failed to load', () => {
  const RealImage = globalThis.Image;
  const RealFetch = globalThis.fetch;
  let fetchSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    resetMediaProbeCaches();
    class FailingImage {
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      set src(_value: string) {
        setTimeout(() => this.onerror?.(), 0);
      }
    }
    globalThis.Image = FailingImage as unknown as typeof Image;
    // The storage host answering "not found" for everything.
    fetchSpy = vi.fn(async () => ({ status: 404 }));
    globalThis.fetch = fetchSpy as never;
  });
  afterEach(() => {
    globalThis.Image = RealImage;
    globalThis.fetch = RealFetch;
  });

  it.each([404, 410, 503])('keeps the message when the host answers %i', async (status) => {
    fetchSpy.mockImplementation(async () => ({ status }));
    const storeRef: { current: any } = { current: null };
    renderWithProviders(<MediaMessage message={baseMessage} />, {
      preloadedState: {
        chatSettingStore: { config: {} } as never,
        rooms: { rooms: { [ROOM_JID]: makeRoom() } } as any,
      },
      storeRef,
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    expect(await screen.findByRole('img', { name: 'Image unavailable' })).toBeInTheDocument();
    const message = storeRef.current.getState().rooms.rooms[ROOM_JID].messages[0];
    expect(message.isDeleted).toBeFalsy();
    expect(message.location).toBe(baseMessage.location);
    // No status probe at all: nothing to misread.
    expect(fetchSpy).not.toHaveBeenCalled();
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

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    const state = storeRef.current.getState();
    expect(state.rooms.rooms[ROOM_JID].messages).toHaveLength(1);
    expect(state.rooms.rooms[ROOM_JID].messages[0].isDeleted).toBe(true);
  });
});
