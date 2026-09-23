import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { IRoom } from '../../types/types';

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: null, setClient: vi.fn() }),
}));

import RoomList from './RoomList';

// The decisive half of the "a new private room never shows up live" bug.
// onChatInvite adds the room the moment the invite arrives, well before the
// corrective /chats/my refetch can supply a real title, so what it puts in
// `name`/`title` in the meantime decides whether the room survives its first
// render at all: this list prunes any room with no label as corrupted
// persisted state (isValidRoomRecord). With the old blank placeholder the
// room was deleted the instant it rendered and never came back until a
// reload; with the jid-derived label it stays until the real title lands.
const ROOM_JID =
  '646cc8dc96d4a4dc8f7b2f2d_new-user-646cc8dc96d4a4dc8f7b2f2d_me@conference.xmpp.chat-qa.ethora.com';

const invitedRoom = (label: string): IRoom =>
  ({
    jid: ROOM_JID,
    name: label,
    title: label,
    usersCnt: 0,
    messages: [],
    isLoading: false,
    roomBg: null,
    icon: null,
    unreadMessages: 0,
    unreadCapped: false,
    lastViewedTimestamp: 0,
    historyPreloadState: 'idle',
  }) as unknown as IRoom;

const renderWithRoom = (room: IRoom) => {
  const storeRef: { current: any } = { current: null };
  renderWithProviders(<RoomList chats={[room]} />, {
    preloadedState: {
      chatSettingStore: {
        config: { chatHeaderSettings: { disableCreate: true } },
      } as any,
      rooms: { rooms: { [room.jid]: room }, activeRoomJID: null } as any,
    },
    storeRef,
  });
  return storeRef;
};

describe('RoomList - a freshly invited room survives its first render', () => {
  it('prunes the room when the invite placeholder has no label (the old behaviour)', () => {
    const storeRef = renderWithRoom(invitedRoom(''));

    expect(storeRef.current.getState().rooms.rooms[ROOM_JID]).toBeUndefined();
  });

  it('keeps and renders the room when the placeholder carries the jid-derived label', () => {
    const label = ROOM_JID.split('@')[0];
    const storeRef = renderWithRoom(invitedRoom(label));

    expect(storeRef.current.getState().rooms.rooms[ROOM_JID]).toBeTruthy();
    expect(screen.getByText(label)).toBeTruthy();
  });
});
