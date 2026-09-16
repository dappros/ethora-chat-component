import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import chatSettingsSlice from '../roomStore/chatSettingsSlice';
import roomsSlice, {
  addRoom,
  editRoomMessage,
  setEditAction,
} from '../roomStore/roomsSlice';
import roomHeapSlice from '../roomStore/roomHeapSlice';
import { IMessage } from '../types/types';

// Regression coverage for "editing a message does nothing until the server
// echo arrives": useSendMessage used to only send the edit stanza and clear
// editAction, never touching the store, so the bubble kept the pre-edit
// body and gained the `edited` label only once onEditMessage (in
// stanzaHandlers.ts) dispatched editRoomMessage for us. On a slow link the
// author's own edit looked like it did nothing. These tests assert the
// local store reflects the edit the moment it is submitted, that the later
// server echo is idempotent, and that a client with no connection never
// gets to show a phantom edit.
const editMessageStanza = vi.fn();
let checkOnline = vi.fn(() => true);

vi.mock('../context/xmppProvider', () => ({
  useXmppClient: () => ({
    client: {
      editMessageStanza: (...args: unknown[]) => editMessageStanza(...args),
      checkOnline: () => checkOnline(),
      recoverRoomPresenceOnly: vi.fn(async () => true),
    },
  }),
}));

import { useSendMessage } from './useSendMessage';

const ROOM_JID = 'room@conference.xmpp.example';
const MESSAGE_ID = 'msg-1';
const ORIGINAL_BODY = 'original text';

const baseMessage: IMessage = {
  id: MESSAGE_ID,
  user: { id: 'author', name: 'Author' } as never,
  date: '2026-01-01T00:00:00.000Z',
  body: ORIGINAL_BODY,
  roomJid: ROOM_JID,
  pending: false,
};

const setup = (seedMessage: Partial<IMessage> = {}) => {
  const store = configureStore({
    reducer: { chatSettingStore: chatSettingsSlice, rooms: roomsSlice, roomHeapSlice },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });

  store.dispatch(
    addRoom({
      roomData: {
        jid: ROOM_JID,
        name: 'room',
        messages: [{ ...baseMessage, ...seedMessage }],
      } as never,
    })
  );

  store.dispatch(
    setEditAction({
      isEdit: true,
      roomJid: ROOM_JID,
      messageId: MESSAGE_ID,
      text: ORIGINAL_BODY,
    })
  );

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );

  const { result } = renderHook(() => useSendMessage(), { wrapper });
  return { store, result };
};

const getMessage = (store: ReturnType<typeof setup>['store']) =>
  (store.getState() as any).rooms.rooms[ROOM_JID]?.messages.find(
    (m: IMessage) => m.id === MESSAGE_ID
  );

const getEditAction = (store: ReturnType<typeof setup>['store']) =>
  (store.getState() as any).rooms.editAction;

describe('useSendMessage - optimistic edit apply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkOnline = vi.fn(() => true);
  });

  it('applies the new body and the edited label to the store immediately', async () => {
    const { store, result } = setup();

    await act(async () => {
      await result.current.sendMessage('edited text', ROOM_JID);
    });

    const message = getMessage(store);
    expect(message.body).toBe('edited text');
    expect(message.isEdited).toBe(true);
    expect(editMessageStanza).toHaveBeenCalledWith(
      ROOM_JID,
      MESSAGE_ID,
      'edited text'
    );
  });

  it('closes the edit composer once the edit is submitted', async () => {
    const { store, result } = setup();

    await act(async () => {
      await result.current.sendMessage('edited text', ROOM_JID);
    });

    expect(getEditAction(store).isEdit).toBe(false);
  });

  it('drops a stale translation cached for the pre-edit body', async () => {
    const { store, result } = setup({
      translations: {
        fr: { translatedText: 'texte original', language: 'fr', languageName: 'French' },
      } as never,
    });

    await act(async () => {
      await result.current.sendMessage('edited text', ROOM_JID);
    });

    expect(getMessage(store).translations).toBeUndefined();
  });

  it('leaves the state unchanged when the server echo repeats the same text', async () => {
    const { store, result } = setup();

    await act(async () => {
      await result.current.sendMessage('edited text', ROOM_JID);
    });
    const afterOptimistic = getMessage(store);

    // Simulate onEditMessage (stanzaHandlers.ts) dispatching the echo for
    // this client's own edit, carrying the same text back.
    act(() => {
      store.dispatch(
        editRoomMessage({ roomJID: ROOM_JID, messageId: MESSAGE_ID, text: 'edited text' })
      );
    });

    const afterEcho = getMessage(store);
    expect(afterEcho.body).toBe(afterOptimistic.body);
    expect(afterEcho.isEdited).toBe(afterOptimistic.isEdited);
  });

  it('still applies an echo with different text (another client won the race)', async () => {
    const { store, result } = setup();

    await act(async () => {
      await result.current.sendMessage('edited text', ROOM_JID);
    });

    act(() => {
      store.dispatch(
        editRoomMessage({
          roomJID: ROOM_JID,
          messageId: MESSAGE_ID,
          text: 'a competing edit',
        })
      );
    });

    const message = getMessage(store);
    expect(message.body).toBe('a competing edit');
    expect(message.isEdited).toBe(true);
  });

  it('does not apply the optimistic edit, and reports failure, when the client is not connected', async () => {
    checkOnline = vi.fn(() => false);
    const { store, result } = setup();

    await act(async () => {
      await result.current.sendMessage('edited text', ROOM_JID);
    });

    const message = getMessage(store);
    expect(message.body).toBe(ORIGINAL_BODY);
    expect(message.isEdited).toBeFalsy();
    expect(editMessageStanza).not.toHaveBeenCalled();
    // The composer is left open (not silently closed on a send that never
    // went out) so the user's typed text isn't lost.
    expect(getEditAction(store).isEdit).toBe(true);
  });
});
