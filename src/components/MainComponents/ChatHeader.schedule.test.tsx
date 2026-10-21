import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import chatSettingsSlice from '../../roomStore/chatSettingsSlice';
import roomsSlice from '../../roomStore/roomsSlice';
import roomHeapSlice from '../../roomStore/roomHeapSlice';
import callSlice from '../../roomStore/callSlice';
import scheduledCallSlice from '../../roomStore/scheduledCallSlice';
import { ToastProvider } from '../../context/ToastContext';
import { IRoom } from '../../types/types';

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: { leaveTheRoomStanza: vi.fn() }, setClient: vi.fn() }),
}));
vi.mock('../../calls/startCall', () => ({ requestOutgoingCall: vi.fn(async () => {}) }));
vi.mock('../../networking/callTokenStanza', () => ({ sendCallInviteSignal: vi.fn() }));

import ChatHeader from './ChatHeader';

const ROOM_JID = 'app_room@conference.example.com';
const room = (type: IRoom['type']): IRoom =>
  ({
    jid: ROOM_JID,
    name: 'Design team',
    title: 'Design team',
    type,
    usersCnt: 3,
    members: [],
    messages: [],
    isLoading: false,
  }) as unknown as IRoom;

const renderHeader = (config: Record<string, unknown>, currentRoom: IRoom) => {
  const store = configureStore({
    reducer: {
      chatSettingStore: chatSettingsSlice,
      rooms: roomsSlice,
      roomHeapSlice,
      call: callSlice,
      scheduledCall: scheduledCallSlice,
    },
    preloadedState: {
      chatSettingStore: { config, user: { xmppUsername: 'me_1', fileToken: '' } },
      rooms: { rooms: { [ROOM_JID]: currentRoom }, activeRoomJID: ROOM_JID },
    } as any,
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  render(
    <Provider store={store}>
      <ToastProvider>
        <ChatHeader currentRoom={currentRoom} />
      </ToastProvider>
    </Provider>
  );
  return store;
};

const ON = { videoCalls: { enabled: true, livekitUrl: 'wss://lk.example.com' } };
const button = () => screen.queryByLabelText('Schedule call');

describe('ChatHeader: Schedule call action', () => {
  it('sits next to the call buttons wherever calls are enabled', () => {
    renderHeader(ON, room('group'));
    expect(button()).toBeTruthy();
  });

  it('is there for a 1:1 chat too', () => {
    renderHeader(ON, room('private'));
    expect(button()).toBeTruthy();
  });

  it('is absent where calls are not', () => {
    renderHeader({}, room('group'));
    expect(button()).toBeNull();
  });

  it('is absent in a room type calls do not allow', () => {
    renderHeader(ON, room('public'));
    expect(button()).toBeNull();
  });

  it('is absent without a LiveKit URL', () => {
    renderHeader({ videoCalls: { enabled: true, livekitUrl: '' } }, room('group'));
    expect(button()).toBeNull();
  });

  it('can be switched off by the host', () => {
    renderHeader({ ...ON, scheduledCalls: { enabled: false } }, room('group'));
    expect(button()).toBeNull();
  });

  it('opens the schedule form for this room', () => {
    const store = renderHeader(ON, room('group'));
    fireEvent.click(button() as HTMLElement);
    expect((store.getState() as any).scheduledCall.scheduleModal).toEqual({
      roomJid: ROOM_JID,
      editing: null,
    });
  });
});
