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
const isE2eeRoom = vi.fn();

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

vi.mock('../e2ee', () => ({
  isE2eeRoom: (...args: unknown[]) => isE2eeRoom(...args),
}));

import { useSendMessage } from './useSendMessage';
import { openSealedFile } from '../e2ee/fileEnvelope';

const ROOM_JID = 'room@conference.xmpp.example';

// The backend echoes back what a sealed upload declared, not the real file.
const sealedUploadResult = (index: number) => ({
  _id: `att-${index}`,
  location: `https://secure-files.example/bucket/${index}`,
  locationPreview: '',
  mimetype: 'application/octet-stream',
  originalname: `opaque-${index}`,
  filename: `stored-${index}`,
  size: 2048,
  createdAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2027-01-01T00:00:00.000Z',
});

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

/** Pull the files back out of the FormData the hook built. */
const uploadedFiles = () =>
  (uploadFile.mock.calls[0][0] as FormData).getAll('files') as File[];

const uploadOptions = () => uploadFile.mock.calls[0][2];

beforeEach(() => {
  vi.clearAllMocks();
  sendMediaMessageStanza.mockResolvedValue(true);
  uploadFile.mockResolvedValue({
    data: { results: [sealedUploadResult(0)] },
  });
});

describe('sendMedia in an e2ee room', () => {
  beforeEach(() => isE2eeRoom.mockReturnValue(true));

  it('uploads ciphertext under an opaque name and flags it clientEncrypted', async () => {
    const { result } = setup();
    const file = new File(['the actual contents'], 'contract-final.pdf', {
      type: 'application/pdf',
    });

    await act(async () => {
      await result.current.sendMedia(file, ROOM_JID, 'application/pdf');
    });

    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(1));

    const [sent] = uploadedFiles();
    expect(sent.type).toBe('application/octet-stream');
    expect(sent.name).not.toContain('contract');
    expect(sent.name).not.toContain('.pdf');
    expect(uploadOptions()).toEqual({ clientEncrypted: true });

    // The bytes on the wire are not the file.
    const onTheWire = new TextDecoder().decode(await sent.arrayBuffer());
    expect(onTheWire).not.toContain('the actual contents');
  });

  it('hands the stanza keys that open the uploaded bytes back to the original file', async () => {
    const { result } = setup();
    const file = new File(['the actual contents'], 'contract-final.pdf', {
      type: 'application/pdf',
    });

    await act(async () => {
      await result.current.sendMedia(file, ROOM_JID, 'application/pdf');
    });

    await waitFor(() => expect(sendMediaMessageStanza).toHaveBeenCalledTimes(1));

    const payload = sendMediaMessageStanza.mock.calls[0][1] as any;
    expect(payload.e2eeKeys).toHaveLength(1);

    const [sent] = uploadedFiles();
    const ciphertext = new Uint8Array(await sent.arrayBuffer());
    const opened = openSealedFile(ciphertext, payload.e2eeKeys[0]);

    expect(opened.meta.originalname).toBe('contract-final.pdf');
    expect(opened.meta.mimetype).toBe('application/pdf');
    expect(new TextDecoder().decode(opened.bytes)).toBe('the actual contents');
  });

  it('seals every file of a group with its own key', async () => {
    uploadFile.mockResolvedValue({
      data: { results: [sealedUploadResult(0), sealedUploadResult(1)] },
    });
    const { result } = setup();
    const files = [
      new File(['first'], 'a.txt', { type: 'text/plain' }),
      new File(['second'], 'b.txt', { type: 'text/plain' }),
    ];

    await act(async () => {
      await result.current.sendMedia(files, ROOM_JID, 'text/plain');
    });

    await waitFor(() => expect(sendMediaMessageStanza).toHaveBeenCalledTimes(1));

    const payload = sendMediaMessageStanza.mock.calls[0][1] as any;
    expect(payload.e2eeKeys).toHaveLength(2);
    expect(payload.e2eeKeys[0]).not.toBe(payload.e2eeKeys[1]);

    const sent = uploadedFiles();
    const opened = await Promise.all(
      sent.map(async (f, i) =>
        openSealedFile(new Uint8Array(await f.arrayBuffer()), payload.e2eeKeys[i])
      )
    );
    expect(opened.map((o) => o.meta.originalname)).toEqual(['a.txt', 'b.txt']);
  });
});

describe('sendMedia in a plain room', () => {
  beforeEach(() => isE2eeRoom.mockReturnValue(false));

  it('uploads the file untouched and sets no flag', async () => {
    uploadFile.mockResolvedValue({
      data: {
        results: [
          {
            ...sealedUploadResult(0),
            mimetype: 'application/pdf',
            originalname: 'contract-final.pdf',
          },
        ],
      },
    });
    const { result } = setup();
    const file = new File(['the actual contents'], 'contract-final.pdf', {
      type: 'application/pdf',
    });

    await act(async () => {
      await result.current.sendMedia(file, ROOM_JID, 'application/pdf');
    });

    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(1));

    const [sent] = uploadedFiles();
    expect(sent.name).toBe('contract-final.pdf');
    expect(sent.type).toBe('application/pdf');
    expect(uploadOptions()).toEqual({ clientEncrypted: false });

    const payload = sendMediaMessageStanza.mock.calls[0][1] as any;
    expect(payload.e2eeKeys).toBeUndefined();
  });
});
