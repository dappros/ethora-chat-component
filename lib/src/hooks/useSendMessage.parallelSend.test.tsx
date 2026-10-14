import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import chatSettingsSlice from '../roomStore/chatSettingsSlice';
import roomsSlice, { addRoom } from '../roomStore/roomsSlice';
import roomHeapSlice from '../roomStore/roomHeapSlice';
import { parseAttachments } from '../helpers/attachments';
import { hasMediaRetry, retryMediaSend } from '../helpers/mediaSendRetry';

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

import { useSendMessage, MEDIA_UPLOAD_CONCURRENCY } from './useSendMessage';

const ROOM_JID = 'room@conference.xmpp.example';

/** One pending upload, addressed by the file name it carries. */
interface PendingUpload {
  name: string;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

let pendingUploads: PendingUpload[] = [];

const resultFor = (name: string) => ({
  data: {
    results: [
      {
        _id: `att-${name}`,
        location: `https://files.example/${name}`,
        locationPreview: '',
        mimetype: 'application/pdf',
        originalname: name,
        filename: `stored-${name}`,
        size: 1024,
        createdAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2027-01-01T00:00:00.000Z',
      },
    ],
  },
});

const makeFile = (name: string) => new File(['x'], name, { type: 'application/pdf' });

const setup = () => {
  const store = configureStore({
    reducer: { chatSettingStore: chatSettingsSlice, rooms: roomsSlice, roomHeapSlice },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(addRoom({ roomData: { jid: ROOM_JID, name: 'room', messages: [] } as never }));
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const { result } = renderHook(() => useSendMessage(), { wrapper });
  return { store, result };
};

const roomMessages = (store: ReturnType<typeof setup>['store']) =>
  (store.getState() as any).rooms.rooms[ROOM_JID]?.messages ?? [];

const settle = async (name: string, succeed = true) => {
  const upload = pendingUploads.find((item) => item.name === name && !(item as any).done);
  if (!upload) throw new Error(`no pending upload for ${name}`);
  (upload as any).done = true;
  await act(async () => {
    if (succeed) upload.resolve(resultFor(name));
    else upload.reject(new Error('network down'));
  });
};

const uploadsFor = (name: string) => pendingUploads.filter((item) => item.name === name);

const sentAttachmentNames = () => {
  const [, payload] = sendMediaMessageStanza.mock.calls[0] as unknown as [
    string,
    Record<string, string>,
  ];
  return parseAttachments(payload.attachments).map((item) => item.originalName);
};

beforeEach(() => {
  vi.clearAllMocks();
  pendingUploads = [];
  sendMediaMessageStanza.mockResolvedValue(true);
  uploadFile.mockImplementation((form: FormData) => {
    const [file] = form.getAll('files') as File[];
    return new Promise((resolve, reject) => {
      pendingUploads.push({ name: file.name, resolve, reject });
    });
  });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('parallel upload of one album', () => {
  it(`keeps at most ${MEDIA_UPLOAD_CONCURRENCY} uploads in flight`, async () => {
    const names = ['1.pdf', '2.pdf', '3.pdf', '4.pdf', '5.pdf', '6.pdf'];
    const { result } = setup();

    let sending: Promise<boolean> | undefined;
    await act(async () => {
      sending = result.current.sendMedia(names.map(makeFile), 'media', ROOM_JID);
    });

    expect(MEDIA_UPLOAD_CONCURRENCY).toBe(4);
    expect(pendingUploads).toHaveLength(4);

    await settle('1.pdf');
    expect(pendingUploads).toHaveLength(5);

    for (const name of names.slice(1)) {
      await settle(name);
    }
    await act(async () => {
      await sending;
    });
    expect(uploadFile).toHaveBeenCalledTimes(6);
    expect(sendMediaMessageStanza).toHaveBeenCalledTimes(1);
  });

  it('sends the attachments in selection order, whatever order the uploads finish in', async () => {
    const names = ['1.pdf', '2.pdf', '3.pdf'];
    const { store, result } = setup();

    let sending: Promise<boolean> | undefined;
    await act(async () => {
      sending = result.current.sendMedia(names.map(makeFile), 'media', ROOM_JID);
    });

    await settle('3.pdf');
    await settle('1.pdf');
    await settle('2.pdf');
    await act(async () => {
      await sending;
    });

    expect(sendMediaMessageStanza).toHaveBeenCalledTimes(1);
    expect(sentAttachmentNames()).toEqual(names);

    // The bubble follows the same order.
    const [message] = roomMessages(store);
    expect(message.attachments.map((item: { originalName: string }) => item.originalName)).toEqual(names);
  });

  it('holds the album when one file fails, then sends it complete once that file is retried', async () => {
    const names = ['1.pdf', '2.pdf', '3.pdf'];
    const { store, result } = setup();

    let sending: Promise<boolean> | undefined;
    let delivered: boolean | undefined;
    await act(async () => {
      sending = result.current.sendMedia(names.map(makeFile), 'media', ROOM_JID);
    });

    await settle('1.pdf');
    await settle('2.pdf', false);
    await settle('3.pdf');
    await act(async () => {
      delivered = await sending;
    });

    // Nothing goes out incomplete: no stanza, the message is marked failed.
    expect(delivered).toBe(false);
    expect(sendMediaMessageStanza).not.toHaveBeenCalled();
    const [held] = roomMessages(store);
    expect(held.failed).toBe(true);
    expect(held.attachments.map((item: { uploadStatus?: string }) => item.uploadStatus)).toEqual([
      'uploading',
      'failed',
      'uploading',
    ]);
    expect(hasMediaRetry(held.id)).toBe(true);

    // Retry only the failed file. The other two are not uploaded again.
    const before = uploadFile.mock.calls.length;
    await act(async () => {
      const retrying = retryMediaSend(held.id, 1);
      await waitFor(() => expect(uploadsFor('2.pdf').length).toBe(2));
      uploadsFor('2.pdf')[1].resolve(resultFor('2.pdf'));
      delivered = await retrying;
    });

    expect(uploadFile.mock.calls.length - before).toBe(1);
    expect(delivered).toBe(true);
    expect(sendMediaMessageStanza).toHaveBeenCalledTimes(1);
    expect(sentAttachmentNames()).toEqual(names);
    expect(hasMediaRetry(held.id)).toBe(false);
  });

  it('retries every missing file when no index is given', async () => {
    const names = ['1.pdf', '2.pdf'];
    const { store, result } = setup();

    await act(async () => {
      void result.current.sendMedia(names.map(makeFile), 'media', ROOM_JID);
    });
    await settle('1.pdf', false);
    await settle('2.pdf', false);

    const [held] = roomMessages(store);
    const before = uploadFile.mock.calls.length;
    await act(async () => {
      const retrying = retryMediaSend(held.id);
      await waitFor(() => expect(uploadFile.mock.calls.length - before).toBe(2));
      pendingUploads.slice(-2).forEach((upload) =>
        upload.resolve(resultFor(upload.name))
      );
      await retrying;
    });

    expect(sendMediaMessageStanza).toHaveBeenCalledTimes(1);
    expect(sentAttachmentNames()).toEqual(names);
  });

  it('returns false when there is no pending send to retry', async () => {
    expect(await retryMediaSend('send-media-message:unknown')).toBe(false);
  });
});
