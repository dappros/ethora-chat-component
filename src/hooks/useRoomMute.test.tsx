import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import roomsSlice from '../roomStore/roomsSlice';
import chatSettingsSlice from '../roomStore/chatSettingsSlice';
import roomHeapSlice from '../roomStore/roomHeapSlice';
import { ToastProvider } from '../context/ToastContext';
import type { RootState } from '../roomStore';

const { muteRoomMock, unmuteRoomMock } = vi.hoisted(() => ({
  muteRoomMock: vi.fn(),
  unmuteRoomMock: vi.fn(),
}));
vi.mock('../networking/api-requests/rooms.api', () => ({
  muteRoom: muteRoomMock,
  unmuteRoom: unmuteRoomMock,
}));

import { useRoomMute } from './useRoomMute';

const JID = 'room1@conference.example.com';

const makeRoomsState = (muted: boolean | undefined) => ({
  rooms: {
    [JID]: {
      jid: JID,
      name: 'r1',
      title: 'r1',
      usersCnt: 1,
      messages: [],
      isLoading: false,
      roomBg: null,
      ...(muted !== undefined ? { muted } : {}),
    },
  },
  activeRoomJID: null,
  isChatUiVisible: false,
  isLoading: false,
  editAction: { isEdit: false, roomJid: '', messageId: '', text: '' },
  usersSet: {},
  presenceByRoom: {},
  reportRoom: { isOpen: false },
  subscribedRooms: [],
  pushSubscriptionStatus: {},
} as unknown as RootState['rooms']);

// A minimal isolated store per test (same slices renderWithProviders.tsx
// uses) - renderHook needs its wrapper built ahead of the render call, which
// doesn't fit that helper's render()-oriented API.
const makeWrapper = (muted: boolean | undefined) => {
  const store = configureStore({
    reducer: {
      chatSettingStore: chatSettingsSlice,
      rooms: roomsSlice,
      roomHeapSlice,
    },
    preloadedState: { rooms: makeRoomsState(muted) },
  });

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>
      <ToastProvider>{children}</ToastProvider>
    </Provider>
  );

  return { store, Wrapper };
};

describe('useRoomMute', () => {
  beforeEach(() => {
    muteRoomMock.mockReset();
    unmuteRoomMock.mockReset();
  });

  it('is hidden (isSupported=false) when the room has never reported a `muted` value - e.g. prod', () => {
    const { Wrapper } = makeWrapper(undefined);
    const { result } = renderHook(() => useRoomMute(JID), { wrapper: Wrapper });

    expect(result.current.isSupported).toBe(false);
    expect(result.current.muted).toBe(false);
  });

  it('is supported once the room has an actual `muted` boolean', () => {
    const { Wrapper } = makeWrapper(false);
    const { result } = renderHook(() => useRoomMute(JID), { wrapper: Wrapper });

    expect(result.current.isSupported).toBe(true);
    expect(result.current.muted).toBe(false);
  });

  it('toggleMute optimistically flips to muted and calls muteRoom with the bare chat name', async () => {
    muteRoomMock.mockResolvedValue({ chatName: 'room1', muted: true });
    const { Wrapper } = makeWrapper(false);
    const { result } = renderHook(() => useRoomMute(JID), { wrapper: Wrapper });

    await act(async () => {
      await result.current.toggleMute();
    });

    expect(muteRoomMock).toHaveBeenCalledWith('room1');
    expect(result.current.muted).toBe(true);
    expect(result.current.isPending).toBe(false);
  });

  it('toggleMute rolls back to the previous value and stays "supported" when the request fails', async () => {
    muteRoomMock.mockRejectedValue(new Error('network'));
    const { Wrapper } = makeWrapper(false);
    const { result } = renderHook(() => useRoomMute(JID), { wrapper: Wrapper });

    await act(async () => {
      await result.current.toggleMute();
    });

    expect(muteRoomMock).toHaveBeenCalledWith('room1');
    expect(result.current.muted).toBe(false);
    expect(result.current.isSupported).toBe(true);
    expect(result.current.isPending).toBe(false);
  });

  it('setMuted(false) calls unmuteRoom', async () => {
    unmuteRoomMock.mockResolvedValue({ chatName: 'room1', muted: false });
    const { Wrapper } = makeWrapper(true);
    const { result } = renderHook(() => useRoomMute(JID), { wrapper: Wrapper });

    await act(async () => {
      await result.current.setMuted(false);
    });

    expect(unmuteRoomMock).toHaveBeenCalledWith('room1');
    expect(result.current.muted).toBe(false);
  });
});
