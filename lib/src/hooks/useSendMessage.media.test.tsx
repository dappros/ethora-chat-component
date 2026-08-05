import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import chatSettingsSlice from '../roomStore/chatSettingsSlice';
import roomsSlice, { addRoom } from '../roomStore/roomsSlice';
import roomHeapSlice from '../roomStore/roomHeapSlice';

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
import { parseAttachments } from '../helpers/attachments';

const ROOM_JID = 'room@conference.xmpp.example';

const uploadResult = (index: number) => ({
  _id: `att-${index}`,
  location: `https://files.example/${index}.pdf`,
  locationPreview: '',
  mimetype: 'application/pdf',
  originalname: `${index}.pdf`,
  filename: `stored-${index}.pdf`,
  size: 1024,
  createdAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2027-01-01T00:00:00.000Z',
});

const makeFile = (name: string) =>
  new File(['x'], name, { type: 'application/pdf' });

const setup = () => {
  const store = configureStore({
    reducer: { chatSettingStore: chatSettingsSlice, rooms: roomsSlice, roomHeapSlice },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });

  store.dispatch(
    addRoom({ roomData: { jid: ROOM_JID, name: 'room', messages: [] } as never })
  );

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );

  const { result } = renderHook(() => useSendMessage(), { wrapper });
  return { store, result };
};

const roomMessages = (store: ReturnType<typeof setup>['store']) =>
  (store.getState() as any).rooms.rooms[ROOM_JID]?.messages ?? [];

describe('sendMedia with several files', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMediaMessageStanza.mockResolvedValue(true);
  });

  it('uploads the group in one request and emits exactly one stanza', async () => {
    uploadFile.mockResolvedValue({
      data: { results: [uploadResult(1), uploadResult(2), uploadResult(3)] },
    });

    const { result } = setup();

    await act(async () => {
      await result.current.sendMedia(
        [makeFile('1.pdf'), makeFile('2.pdf'), makeFile('3.pdf')],
        'media',
        ROOM_JID
      );
    });

    expect(uploadFile).toHaveBeenCalledTimes(1);
    const formData = uploadFile.mock.calls[0][0] as FormData;
    expect(formData.getAll('files')).toHaveLength(3);

    // One stanza, not one per file - that is what makes it one message.
    expect(sendMediaMessageStanza).toHaveBeenCalledTimes(1);

    const [, payload] = sendMediaMessageStanza.mock.calls[0] as unknown as [
      string,
      Record<string, string>,
    ];
    expect(parseAttachments(payload.attachments)).toHaveLength(3);
    // The flat fields still describe attachment #0 for older clients.
    expect(payload.location).toBe('https://files.example/1.pdf');
  });

  it('leaves the stanza free of the attachments payload for a single file', async () => {
    uploadFile.mockResolvedValue({ data: { results: [uploadResult(1)] } });

    const { result } = setup();

    await act(async () => {
      await result.current.sendMedia(makeFile('1.pdf'), 'media', ROOM_JID);
    });

    const [, payload] = sendMediaMessageStanza.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(payload.attachments).toBeUndefined();
  });

  it('shows one optimistic bubble covering every picked file', async () => {
    let release: (value: unknown) => void = () => undefined;
    uploadFile.mockImplementation(
      () => new Promise((resolve) => {
        release = resolve;
      })
    );

    const { store, result } = setup();

    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = result.current.sendMedia(
        [makeFile('1.pdf'), makeFile('2.pdf')],
        'media',
        ROOM_JID
      ) as Promise<void>;
    });

    const messages = roomMessages(store);
    expect(messages).toHaveLength(1);
    expect(messages[0].pending).toBe(true);
    expect(messages[0].attachments).toHaveLength(2);

    await act(async () => {
      release({ data: { results: [uploadResult(1), uploadResult(2)] } });
      await pending;
    });
  });

  // Before this, a failed upload left the bubble at "sending..." forever.
  it('removes the optimistic bubble when the upload fails', async () => {
    uploadFile.mockRejectedValue(new Error('network down'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { store, result } = setup();

    await act(async () => {
      await result.current.sendMedia([makeFile('1.pdf')], 'media', ROOM_JID);
    });

    await waitFor(() => expect(roomMessages(store)).toHaveLength(0));
    expect(sendMediaMessageStanza).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('removes the optimistic bubble when the stanza never lands', async () => {
    uploadFile.mockResolvedValue({ data: { results: [uploadResult(1)] } });
    sendMediaMessageStanza.mockResolvedValue(false);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { store, result } = setup();

    await act(async () => {
      await result.current.sendMedia([makeFile('1.pdf')], 'media', ROOM_JID);
    });

    await waitFor(() => expect(roomMessages(store)).toHaveLength(0));
    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });

  it('ignores an empty selection', async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.sendMedia([], 'media', ROOM_JID);
    });

    expect(uploadFile).not.toHaveBeenCalled();
  });
});
