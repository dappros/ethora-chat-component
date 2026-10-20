import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import chatSettingsSlice from '../../roomStore/chatSettingsSlice';
import roomsSlice from '../../roomStore/roomsSlice';
import roomHeapSlice from '../../roomStore/roomHeapSlice';
import callSlice from '../../roomStore/callSlice';
import { ToastProvider } from '../../context/ToastContext';
import { IRoom } from '../../types/types';

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({
    client: { leaveTheRoomStanza: vi.fn() },
    setClient: vi.fn(),
  }),
}));

const { requestOutgoingCall, sendCallInviteSignal } = vi.hoisted(() => ({
  requestOutgoingCall: vi.fn(async () => {}),
  sendCallInviteSignal: vi.fn(),
}));
vi.mock('../../calls/startCall', () => ({ requestOutgoingCall }));
vi.mock('../../networking/callTokenStanza', () => ({ sendCallInviteSignal }));

import ChatHeader from './ChatHeader';

const ROOM_JID = 'app_room@conference.example.com';

const room = (overrides: Partial<IRoom> = {}): IRoom =>
  ({
    jid: ROOM_JID,
    name: 'Design team',
    title: 'Design team',
    type: 'group',
    usersCnt: 4,
    members: [
      { xmppUsername: 'me_1', firstName: 'Me', lastName: 'M' },
      { xmppUsername: 'peer_1', firstName: 'Pat', lastName: 'P' },
    ],
    messages: [],
    isLoading: false,
    ...overrides,
  }) as unknown as IRoom;

const renderHeader = (
  videoCalls: Record<string, unknown> | undefined,
  currentRoom: IRoom
) => {
  const store = configureStore({
    reducer: {
      chatSettingStore: chatSettingsSlice,
      rooms: roomsSlice,
      roomHeapSlice,
      call: callSlice,
    },
    preloadedState: {
      chatSettingStore: {
        config: videoCalls ? { videoCalls } : {},
        user: { xmppUsername: 'me_1', fileToken: '' },
      },
      rooms: {
        rooms: { [ROOM_JID]: currentRoom },
        activeRoomJID: ROOM_JID,
        presenceByRoom: { [ROOM_JID]: ['me_1', 'peer_1'] },
      },
    } as any,
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  const utils = render(
    <Provider store={store}>
      <ToastProvider>
        <ChatHeader currentRoom={currentRoom} />
      </ToastProvider>
    </Provider>
  );
  return { store, ...utils };
};

const ON = { enabled: true, livekitUrl: 'wss://lk.example.com', enableAudioCalls: true };
const videoBtn = () => screen.queryByLabelText(/video call/i);
const audioBtn = () => screen.queryByLabelText(/audio call/i);

describe('ChatHeader call buttons: 1:1 vs group', () => {
  beforeEach(() => {
    requestOutgoingCall.mockClear();
    sendCallInviteSignal.mockClear();
  });

  it('a group room gets video and audio call buttons by default', () => {
    renderHeader(ON, room({ type: 'group' }));
    expect(videoBtn()).toBeTruthy();
    expect(audioBtn()).toBeTruthy();
  });

  it('a private room still gets them', () => {
    renderHeader(ON, room({ type: 'private', usersCnt: 2 }));
    expect(videoBtn()).toBeTruthy();
  });

  it('a public room does not', () => {
    renderHeader(ON, room({ type: 'public' }));
    expect(videoBtn()).toBeNull();
  });

  it('host config can keep calls 1:1 only', () => {
    renderHeader({ ...ON, allowedRoomTypes: ['private'] }, room({ type: 'group' }));
    expect(videoBtn()).toBeNull();
  });

  it('group calls follow the master switch and the livekit prerequisite', () => {
    const off = renderHeader({ ...ON, enabled: false }, room({ type: 'group' }));
    expect(videoBtn()).toBeNull();
    off.unmount();
    renderHeader({ ...ON, livekitUrl: '' }, room({ type: 'group' }));
    expect(videoBtn()).toBeNull();
  });

  it('the audio button needs enableAudioCalls, for groups too', () => {
    renderHeader({ ...ON, enableAudioCalls: false }, room({ type: 'group' }));
    expect(videoBtn()).toBeTruthy();
    expect(audioBtn()).toBeNull();
  });

  it('starting a group call dials the room with no peer and sends no 1:1 invite', async () => {
    const { store } = renderHeader(ON, room({ type: 'group' }));
    fireEvent.click(videoBtn()!);
    await waitFor(() => expect(requestOutgoingCall).toHaveBeenCalled());
    expect(requestOutgoingCall).toHaveBeenCalledWith({
      chatName: 'app_room',
      kind: 'video',
      peerXmppUsername: null,
    });
    expect(sendCallInviteSignal).not.toHaveBeenCalled();
    expect(store.getState().call).toMatchObject({
      phase: 'requesting',
      direction: 'outgoing',
      isGroup: true,
      peerXmppUsername: null,
      roomName: 'Design team',
    });
  });

  it('starting a 1:1 call dials the peer and sends the kind invite first', async () => {
    const { store } = renderHeader(ON, room({ type: 'private', usersCnt: 2, name: 'Pat P' }));
    fireEvent.click(audioBtn()!);
    await waitFor(() => expect(requestOutgoingCall).toHaveBeenCalled());
    expect(sendCallInviteSignal).toHaveBeenCalledWith('audio', {
      peerXmppUsername: 'peer_1',
      roomBareName: 'app_room',
    });
    expect(requestOutgoingCall).toHaveBeenCalledWith({
      chatName: 'app_room',
      kind: 'audio',
      peerXmppUsername: 'peer_1',
    });
    expect(store.getState().call).toMatchObject({
      isGroup: false,
      peerXmppUsername: 'peer_1',
    });
  });

  it('shows the error on the dial screen when creating the call fails', async () => {
    requestOutgoingCall.mockRejectedValueOnce(new Error('Error creating chat call'));
    const { store } = renderHeader(ON, room({ type: 'group' }));
    fireEvent.click(videoBtn()!);
    await waitFor(() =>
      expect(store.getState().call).toMatchObject({
        phase: 'error',
        error: 'Error creating chat call',
      })
    );
  });
});
