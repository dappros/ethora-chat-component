import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { RoomMenu } from './MenuRoom';

const { muteRoomMock, unmuteRoomMock } = vi.hoisted(() => ({
  muteRoomMock: vi.fn(),
  unmuteRoomMock: vi.fn(),
}));
vi.mock('../../networking/api-requests/rooms.api', () => ({
  muteRoom: muteRoomMock,
  unmuteRoom: unmuteRoomMock,
}));

const JID = 'room1@conference.example.com';

const preloadedState = (muted: boolean | undefined) => ({
  rooms: {
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
  },
});

const renderMenu = (muted: boolean | undefined) =>
  renderWithProviders(
    <RoomMenu
      roomJid={JID}
      handleLeaveClick={() => {}}
      handleReportClick={() => {}}
    />,
    { preloadedState: preloadedState(muted) as never }
  );

describe('RoomMenu - mute toggle visibility and wiring', () => {
  beforeEach(() => {
    muteRoomMock.mockReset();
    unmuteRoomMock.mockReset();
  });

  it('does not offer a mute option when the backend has never reported `muted` (e.g. prod)', () => {
    renderMenu(undefined);
    fireEvent.click(screen.getByRole('button'));

    expect(screen.queryByText('Mute notifications')).not.toBeInTheDocument();
    expect(screen.queryByText('Unmute notifications')).not.toBeInTheDocument();
    expect(screen.getByText('Report')).toBeInTheDocument();
  });

  it('offers "Mute notifications" once the room is known to be unmuted', () => {
    renderMenu(false);
    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('Mute notifications')).toBeInTheDocument();
  });

  it('offers "Unmute notifications" when the room is already muted', () => {
    renderMenu(true);
    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('Unmute notifications')).toBeInTheDocument();
  });

  it('clicking "Mute notifications" calls muteRoom with the bare chat name', async () => {
    muteRoomMock.mockResolvedValue({ chatName: 'room1', muted: true });
    renderMenu(false);

    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Mute notifications'));

    await waitFor(() => expect(muteRoomMock).toHaveBeenCalledWith('room1'));
  });
});
