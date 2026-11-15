import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import chatSettingsSlice from '../roomStore/chatSettingsSlice';
import roomsSlice, { addRoom } from '../roomStore/roomsSlice';
import roomHeapSlice from '../roomStore/roomHeapSlice';
import { ToastProvider } from '../context/ToastContext';

const sendMediaMessageStanza = vi.fn(async () => true);
const uploadFile = vi.fn();

vi.mock('../context/xmppProvider', () => ({
  useXmppClient: () => ({
    client: {
      sendMediaMessageStanza,
      recoverRoomPresenceOnly: vi.fn(async () => true),
    },
  }),
}));

vi.mock('../networking/api-requests/auth.api', () => ({
  uploadFile: (...args: unknown[]) => uploadFile(...args),
}));

import { useSendMessage } from './useSendMessage';

const ROOM_JID = 'room@conference.xmpp.example';

const result = (index: number, extra: Record<string, unknown> = {}) => ({
  _id: `att-${index}`,
  location: `https://secure-files.example/b/${index}.png`,
  locationPreview: `https://secure-files.example/b/${index}-thumb.png`,
  mimetype: 'image/png',
  originalname: `${index}.png`,
  filename: `stored-${index}.png`,
  size: 1024,
  ...extra,
});

const makeFile = (name: string) => new File(['x'], name, { type: 'image/png' });

const setup = () => {
  const store = configureStore({
    reducer: { chatSettingStore: chatSettingsSlice, rooms: roomsSlice, roomHeapSlice },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(addRoom({ roomData: { jid: ROOM_JID, name: 'room', messages: [] } as never }));
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>
      <ToastProvider>{children}</ToastProvider>
    </Provider>
  );
  const hook = renderHook(() => useSendMessage(), { wrapper });
  return { store, result: hook.result };
};

const roomMessages = (store: ReturnType<typeof setup>['store']) =>
  (store.getState() as any).rooms.rooms[ROOM_JID]?.messages ?? [];

describe('sending media under Trust & Safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMediaMessageStanza.mockResolvedValue(true);
  });

  it('passes the upload verdict on to the stanza', async () => {
    uploadFile.mockImplementation(async (form: FormData) => {
      const [file] = form.getAll('files') as File[];
      const index = Number(file.name.charAt(0));
      return {
        data: {
          results: [
            result(index, index === 2 ? { sensitive: true, sensitiveCategory: 'nudity' } : {}),
          ],
        },
      };
    });
    const { result: hook } = setup();
    await act(async () => {
      await hook.current.sendMedia([makeFile('1.png'), makeFile('2.png')], 'image/png', ROOM_JID);
    });
    const [, payload] = sendMediaMessageStanza.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(payload.isSensitive).toBe('true');
    expect(payload.sensitiveCategory).toBe('nudity');
  });

  it('does not flag an ordinary upload', async () => {
    uploadFile.mockResolvedValue({ data: { results: [result(1)] } });
    const { result: hook } = setup();
    await act(async () => {
      await hook.current.sendMedia(makeFile('1.png'), 'image/png', ROOM_JID);
    });
    const [, payload] = sendMediaMessageStanza.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(payload.isSensitive).toBeUndefined();
  });

  it('a blocked upload is never sent: the bubble goes and the sender is told why', async () => {
    uploadFile.mockRejectedValue({
      response: { status: 422, data: { code: 'UPLOAD_BLOCKED_SENSITIVE' } },
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { store, result: hook } = setup();

    let delivered: boolean | undefined;
    await act(async () => {
      delivered = await hook.current.sendMedia(makeFile('1.png'), 'image/png', ROOM_JID);
    });

    expect(delivered).toBe(false);
    expect(sendMediaMessageStanza).not.toHaveBeenCalled();
    expect(roomMessages(store)).toHaveLength(0);
    expect(
      screen.getByText("This file can't be sent because it may contain explicit content.")
    ).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
