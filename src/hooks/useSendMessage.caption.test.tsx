import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import chatSettingsSlice from '../roomStore/chatSettingsSlice';
import roomsSlice, { addRoom } from '../roomStore/roomsSlice';
import roomHeapSlice from '../roomStore/roomHeapSlice';

const sendMediaMessageStanza = vi.fn(async () => true);
const sendMessage = vi.fn(async () => true);
const uploadFile = vi.fn();

vi.mock('../context/xmppProvider', () => ({
  useXmppClient: () => ({
    client: {
      sendMediaMessageStanza,
      sendMessage,
      recoverRoomPresenceOnly: vi.fn(async () => true),
    },
  }),
}));

vi.mock('../networking/api-requests/auth.api', () => ({
  uploadFile: (...args: unknown[]) => uploadFile(...args),
}));

import { useSendMessage } from './useSendMessage';
import { retryMediaSend } from '../helpers/mediaSendRetry';
import { parseAttachments } from '../helpers/attachments';

const ROOM_JID = 'room@conference.xmpp.example';

const uploadResult = (index: number) => ({
  _id: `att-${index}`,
  location: `https://files.example/${index}.png`,
  locationPreview: '',
  mimetype: 'image/png',
  originalname: `${index}.png`,
  filename: `stored-${index}.png`,
  size: 1024,
  createdAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2027-01-01T00:00:00.000Z',
});

const makeFile = (name: string) => new File(['x'], name, { type: 'image/png' });

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

const CAPTION = {
  text: 'hi @Alice look',
  mentions: [{ jid: 'alice@xmpp.example', name: 'Alice', offset: 3, length: 6 }],
};

describe('sendMedia with a caption', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMediaMessageStanza.mockResolvedValue(true);
    uploadFile.mockImplementation(async (form: FormData) => {
      const [file] = form.getAll('files') as File[];
      return { data: { results: [uploadResult(Number(file.name.charAt(0)))] } };
    });
  });

  it('sends one media stanza carrying the caption and no text message', async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.sendMedia(
        [makeFile('1.png'), makeFile('2.png')],
        'media',
        ROOM_JID,
        false,
        false,
        '',
        CAPTION
      );
    });

    expect(sendMediaMessageStanza).toHaveBeenCalledTimes(1);
    expect(sendMessage).not.toHaveBeenCalled();

    const [, payload] = sendMediaMessageStanza.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(payload.caption).toBe('hi @Alice look');
    expect(payload.captionMentions).toEqual(CAPTION.mentions);
    // The caption is not smuggled into the legacy fields.
    expect(payload.location).toBe('https://files.example/1.png');
    expect(parseAttachments(payload.attachments)).toHaveLength(2);
  });

  it('shows the caption on the optimistic message, and it survives the send', async () => {
    const { store, result } = setup();

    await act(async () => {
      await result.current.sendMedia([makeFile('1.png')], 'media', ROOM_JID, false, false, '', CAPTION);
    });

    const messages = roomMessages(store);
    expect(messages).toHaveLength(1);
    expect(messages[0].body).toBe('media');
    expect(messages[0].caption).toBe('hi @Alice look');
    expect(messages[0].captionMentions).toEqual(CAPTION.mentions);
  });

  it('leaves a message without a caption free of the caption fields', async () => {
    const { store, result } = setup();

    await act(async () => {
      await result.current.sendMedia([makeFile('1.png')], 'media', ROOM_JID, false, false, '', {
        text: '   ',
      });
    });

    const [, payload] = sendMediaMessageStanza.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(payload.caption).toBeUndefined();
    expect(payload.captionMentions).toBeUndefined();
    expect(roomMessages(store)[0].caption).toBeUndefined();
  });

  it('keeps the caption on a failed message and a retry sends one message with it', async () => {
    uploadFile.mockRejectedValueOnce(new Error('network down'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { store, result } = setup();

    let delivered: boolean | undefined;
    await act(async () => {
      delivered = await result.current.sendMedia(
        [makeFile('1.png')],
        'media',
        ROOM_JID,
        false,
        false,
        '',
        CAPTION
      );
    });

    expect(delivered).toBe(false);
    expect(sendMediaMessageStanza).not.toHaveBeenCalled();
    const [failed] = roomMessages(store);
    expect(failed.failed).toBe(true);
    expect(failed.caption).toBe('hi @Alice look');

    await act(async () => {
      await retryMediaSend(failed.id);
    });

    expect(sendMediaMessageStanza).toHaveBeenCalledTimes(1);
    const [, payload] = sendMediaMessageStanza.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(payload.caption).toBe('hi @Alice look');
    expect(payload.captionMentions).toEqual(CAPTION.mentions);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(roomMessages(store)).toHaveLength(1);
    expect(roomMessages(store)[0].caption).toBe('hi @Alice look');
    consoleError.mockRestore();
  });
});
