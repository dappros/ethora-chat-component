import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import ArchivedMessageCard from './ArchivedMessageCard';
import { useJumpToMessage } from './useJumpToMessage';

const ROOM = 'room1@conf';
const preview = {
  roomJID: ROOM,
  sender: 'Ada Lovelace',
  body: 'the text of an old message',
  createdAt: '2026-06-25T10:00:00.000Z',
};

const stateWith = (extra: Record<string, unknown>) => ({
  rooms: { rooms: {}, activeRoomJID: ROOM, archivedMessage: null, ...extra } as any,
});

describe('ArchivedMessageCard', () => {
  it('shows the message and the reason, for the room it belongs to', () => {
    renderWithProviders(<ArchivedMessageCard roomJID={ROOM} />, {
      preloadedState: stateWith({ archivedMessage: preview }),
    });
    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText('the text of an old message')).toBeTruthy();
    expect(screen.getByText(/older than the history available/i)).toBeTruthy();
  });

  it('stays hidden in another room, and when there is nothing to show', () => {
    const { container, unmount } = renderWithProviders(
      <ArchivedMessageCard roomJID="other@conf" />,
      {
        preloadedState: stateWith({ archivedMessage: preview }),
      }
    );
    expect(
      container.querySelector('[data-testid="archived-message-card"]')
    ).toBeNull();
    unmount();
    const second = renderWithProviders(<ArchivedMessageCard roomJID={ROOM} />, {
      preloadedState: stateWith({ archivedMessage: null }),
    });
    expect(
      second.container.querySelector('[data-testid="archived-message-card"]')
    ).toBeNull();
  });

  it('closes with the button, Escape, and a click on the scrim', () => {
    const { store } = renderWithProviders(
      <ArchivedMessageCard roomJID={ROOM} />,
      {
        preloadedState: stateWith({ archivedMessage: preview }),
      }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(store.getState().rooms.archivedMessage).toBeNull();

    const b = renderWithProviders(<ArchivedMessageCard roomJID={ROOM} />, {
      preloadedState: stateWith({ archivedMessage: preview }),
    });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(b.store.getState().rooms.archivedMessage).toBeNull();

    const c = renderWithProviders(<ArchivedMessageCard roomJID={ROOM} />, {
      preloadedState: stateWith({ archivedMessage: preview }),
    });
    fireEvent.click(
      c.container.querySelector(
        '[data-testid="archived-message-card"]'
      ) as Element
    );
    expect(c.store.getState().rooms.archivedMessage).toBeNull();
  });
});

// The reported bug: tapping a search hit that the chat's history cannot reach
// ended in an error toast. The hit carries its own text, so it is shown.
const toast = vi.fn();
vi.mock('../../context/ToastContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../context/ToastContext')>()),
  useOptionalToast: () => ({ showToast: toast }),
}));

const Harness: React.FC = () => {
  useJumpToMessage({
    roomJID: ROOM,
    messages: [
      { id: '1', body: 'recent', date: '2026-09-01T00:00:00Z' } as any,
    ],
    visibleCount: 1,
    setRenderWindow: () => {},
    fetchOlderPage: async () => ({ ok: true, complete: true }),
    containerRef: { current: null },
    historyComplete: true,
    isUserScrolledUpRef: { current: false },
  });
  return null;
};

describe('a jump that cannot reach the message', () => {
  const run = async (jump: Record<string, unknown>) => {
    toast.mockReset();
    const view = renderWithProviders(<Harness />, {
      preloadedState: stateWith({
        pendingJump: { roomJID: ROOM, ids: ['nope'], at: Date.now(), ...jump },
      }),
    });
    await act(async () => {});
    return view.store.getState().rooms;
  };

  it('shows the hit itself instead of an error when it has a preview', async () => {
    const rooms = await run({ preview });
    expect(rooms.archivedMessage).toEqual(preview);
    expect(rooms.pendingJump).toBeNull();
    expect(toast).not.toHaveBeenCalled();
  });

  it('still says it could not be found when there is nothing to show (a push or a link)', async () => {
    const rooms = await run({});
    expect(rooms.archivedMessage).toBeNull();
    expect(rooms.pendingJump).toBeNull();
    expect(toast).toHaveBeenCalledTimes(1);
  });
});
