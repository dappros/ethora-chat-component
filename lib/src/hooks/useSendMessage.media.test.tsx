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

  it('uploads each file on its own and emits exactly one stanza', async () => {
    uploadFile.mockImplementation(async (form: FormData) => {
      const [file] = form.getAll('files') as File[];
      return { data: { results: [uploadResult(Number(file.name.charAt(0)))] } };
    });

    const { result } = setup();

    await act(async () => {
      await result.current.sendMedia(
        [makeFile('1.pdf'), makeFile('2.pdf'), makeFile('3.pdf')],
        'media',
        ROOM_JID
      );
    });

    expect(uploadFile).toHaveBeenCalledTimes(3);
    uploadFile.mock.calls.forEach(([form]) => {
      expect((form as FormData).getAll('files')).toHaveLength(1);
    });

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
    const releases: Array<(value: unknown) => void> = [];
    uploadFile.mockImplementation(
      () => new Promise((resolve) => {
        releases.push(resolve);
      })
    );

    const { store, result } = setup();

    let pending: Promise<boolean> | undefined;
    await act(async () => {
      pending = result.current.sendMedia(
        [makeFile('1.pdf'), makeFile('2.pdf')],
        'media',
        ROOM_JID
      );
    });

    const messages = roomMessages(store);
    expect(messages).toHaveLength(1);
    expect(messages[0].pending).toBe(true);
    expect(messages[0].attachments).toHaveLength(2);

    await act(async () => {
      releases.forEach((release, index) =>
        release({ data: { results: [uploadResult(index + 1)] } })
      );
      await pending;
    });
  });

  // A failed upload used to delete the bubble. Now the message is held with
  // the failed file marked, so nothing is sent incomplete and the user can
  // retry from the bubble.
  it('holds the message with the failed file marked when an upload fails', async () => {
    uploadFile.mockRejectedValue(new Error('network down'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { store, result } = setup();

    let delivered: boolean | undefined;
    await act(async () => {
      delivered = await result.current.sendMedia([makeFile('1.pdf')], 'media', ROOM_JID);
    });

    expect(delivered).toBe(false);
    expect(sendMediaMessageStanza).not.toHaveBeenCalled();
    const [message] = roomMessages(store);
    expect(message.failed).toBe(true);
    expect(message.pending).toBe(false);
    expect(message.attachments[0].uploadStatus).toBe('failed');
    consoleError.mockRestore();
  });

  it('holds the message as failed when the stanza never lands', async () => {
    uploadFile.mockResolvedValue({ data: { results: [uploadResult(1)] } });
    sendMediaMessageStanza.mockResolvedValue(false);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { store, result } = setup();

    let delivered: boolean | undefined;
    await act(async () => {
      delivered = await result.current.sendMedia([makeFile('1.pdf')], 'media', ROOM_JID);
    });

    expect(delivered).toBe(false);
    expect(roomMessages(store)[0].failed).toBe(true);
    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });

  it('ignores an empty selection', async () => {
    const { result } = setup();

    let delivered: boolean | undefined;
    await act(async () => {
      delivered = await result.current.sendMedia([], 'media', ROOM_JID);
    });

    expect(delivered).toBe(false);
    expect(uploadFile).not.toHaveBeenCalled();
  });
});
