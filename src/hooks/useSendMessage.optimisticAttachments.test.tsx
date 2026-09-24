import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import chatSettingsSlice from '../roomStore/chatSettingsSlice';
import roomsSlice, { addRoom, addRoomMessage } from '../roomStore/roomsSlice';
import roomHeapSlice from '../roomStore/roomHeapSlice';
import { getMessageAttachments } from '../helpers/attachments';

const sendMediaMessageStanza = vi.fn(async () => true);
const uploadFile = vi.fn();
const isE2eeRoom = vi.fn(() => false);

vi.mock('../context/xmppProvider', () => ({
  useXmppClient: () => ({
    client: { sendMediaMessageStanza, recoverRoomPresenceOnly: vi.fn(async () => true) },
  }),
}));
vi.mock('../networking/api-requests/auth.api', () => ({
  uploadFile: (...a: unknown[]) => uploadFile(...a),
}));
vi.mock('../e2ee', () => ({ isE2eeRoom: (...a: unknown[]) => isE2eeRoom(...(a as [string])) }));

import { useSendMessage } from './useSendMessage';

const ROOM = 'room@conference.xmpp.example';
const REAL_URL = 'https://secure-files.example/bucket/9f2c';

const setup = () => {
  const store = configureStore({
    reducer: { chatSettingStore: chatSettingsSlice, rooms: roomsSlice, roomHeapSlice },
    middleware: (d) => d({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(addRoom({ roomData: { jid: ROOM, name: 'r', messages: [] } as never }));
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const { result } = renderHook(() => useSendMessage(), { wrapper });
  return { store, result };
};

const messageIn = (store: ReturnType<typeof setup>['store']) =>
  (store.getState() as any).rooms.rooms[ROOM].messages[0];

beforeEach(() => {
  vi.clearAllMocks();
  isE2eeRoom.mockReturnValue(false);
  sendMediaMessageStanza.mockResolvedValue(true);
  uploadFile.mockResolvedValue({
    data: {
      results: [
        {
          _id: 'att-1',
          location: REAL_URL,
          locationPreview: '',
          mimetype: 'application/octet-stream',
          originalname: 'a1b2c3',
          filename: 'stored-9f2c',
          size: 51393,
        },
      ],
    },
  });
});

describe('the bubble after its own upload lands', () => {
  it('reads the uploaded URL, not the optimistic placeholder', async () => {
    // Regression: the optimistic bubble carries an `attachments` array whose
    // location is '' (there is no URL yet). A single-file echo does not carry
    // `attachments`, and the store merges echoes key-by-key, so that stale
    // array outlived the echo and the bubble kept reading ''. It only fixed
    // itself on reload, when the optimistic remnant was gone.
    const { store, result } = setup();

    await act(async () => {
      await result.current.sendMedia(
        new File(['x'], 'Screenshot.png', { type: 'image/png' }),
        'image/png',
        ROOM
      );
    });

    await waitFor(() => expect(sendMediaMessageStanza).toHaveBeenCalled());
    await waitFor(() =>
      expect(getMessageAttachments(messageIn(store))[0]?.location).toBe(REAL_URL)
    );
  });

  it('survives the echo arriving afterwards', async () => {
    // The echo carries the flat fields and no `attachments`; it must not put
    // the placeholder back.
    const { store, result } = setup();

    await act(async () => {
      await result.current.sendMedia(
        new File(['x'], 'Screenshot.png', { type: 'image/png' }),
        'image/png',
        ROOM
      );
    });
    await waitFor(() => expect(sendMediaMessageStanza).toHaveBeenCalled());

    const id = messageIn(store).id;
    act(() => {
      store.dispatch(
        addRoomMessage({
          roomJID: ROOM,
          message: {
            id,
            xmppId: id,
            body: 'media',
            roomJid: ROOM,
            date: new Date().toISOString(),
            user: { id: 'u1', name: 'me' },
            isMediafile: 'true',
            location: REAL_URL,
            mimetype: 'application/octet-stream',
            originalName: 'a1b2c3',
            e2eeKeys: ['k'],
          } as never,
        })
      );
    });

    expect(getMessageAttachments(messageIn(store))[0]?.location).toBe(REAL_URL);
  });

  it('does the same for a sealed attachment, which reported it as an error', async () => {
    isE2eeRoom.mockReturnValue(true);
    const { store, result } = setup();

    await act(async () => {
      await result.current.sendMedia(
        new File(['x'], 'Screenshot.png', { type: 'image/png' }),
        'image/png',
        ROOM
      );
    });

    await waitFor(() => expect(sendMediaMessageStanza).toHaveBeenCalled());
    await waitFor(() =>
      expect(getMessageAttachments(messageIn(store))[0]?.location).toBe(REAL_URL)
    );
  });
});
