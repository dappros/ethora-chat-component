import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import chatSettingsSlice from '../../roomStore/chatSettingsSlice';
import roomsSlice, { addRoom } from '../../roomStore/roomsSlice';
import roomHeapSlice from '../../roomStore/roomHeapSlice';
import callSlice from '../../roomStore/callSlice';
import scheduledCallSlice, {
  requestOpenScheduledCall,
} from '../../roomStore/scheduledCallSlice';
import { ToastProvider } from '../../context/ToastContext';

const { getScheduledCall } = vi.hoisted(() => ({ getScheduledCall: vi.fn() }));
vi.mock('../../networking/api-requests/scheduledCalls.api', async () => {
  const actual = await vi.importActual<
    typeof import('../../networking/api-requests/scheduledCalls.api')
  >('../../networking/api-requests/scheduledCalls.api');
  return { ...actual, getScheduledCall };
});
vi.mock('../../networking/apiClient', () => ({ default: { defaults: {} } }));

import ScheduledCallLayer from './ScheduledCallLayer';
import { ScheduledCallApiError } from '../../networking/api-requests/scheduledCalls.api';

const SLUG = 'abcdefghijklmnopqrstuv';
const ROOM = 'app_room@conference.example.com';
const START = Date.now() + 5 * 60_000;

const call = (status = 'scheduled') => ({
  scheduledCall: {
    chatName: 'app_room',
    title: 'Weekly sync',
    startAt: new Date(START).toISOString(),
    durationMinutes: 30,
    kind: 'video',
    slug: SLUG,
    status,
  },
  links: { join: 'j', ics: 'i', google: 'g', outlook: 'o' },
  chat: { name: 'app_room', title: 'Room', type: 'group', jid: ROOM },
});

const setup = (
  props: { scheduledCallSlug?: string; onOpenError?: (e: unknown) => void; withRoom?: boolean } = {}
) => {
  const store = configureStore({
    reducer: {
      chatSettingStore: chatSettingsSlice,
      rooms: roomsSlice,
      roomHeapSlice,
      call: callSlice,
      scheduledCall: scheduledCallSlice,
    },
    preloadedState: {
      chatSettingStore: {
        config: {
          videoCalls: { enabled: true, livekitUrl: 'wss://x' },
          scheduledCalls: { onOpenError: props.onOpenError },
        },
        user: { _id: 'me', xmppUsername: 'me_1' },
      },
      rooms: {
        rooms:
          props.withRoom === false
            ? {}
            : { [ROOM]: { jid: ROOM, name: 'Room', type: 'group', messages: [] } },
      },
    } as any,
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  const onRevealRoom = vi.fn();
  render(
    <Provider store={store}>
      <ToastProvider>
        <ScheduledCallLayer scheduledCallSlug={props.scheduledCallSlug} onRevealRoom={onRevealRoom} />
      </ToastProvider>
    </Provider>
  );
  return { store, onRevealRoom };
};

describe('ScheduledCallLayer opener', () => {
  beforeEach(() => {
    getScheduledCall.mockReset();
  });
  afterEach(cleanup);

  it('opens the room and the pre-join panel for a slug prop, starting no call', async () => {
    getScheduledCall.mockResolvedValue(call());
    const { store, onRevealRoom } = setup({ scheduledCallSlug: SLUG });
    await waitFor(() => expect(screen.getByTestId('scheduled-call-prejoin')).toBeTruthy());
    expect(getScheduledCall).toHaveBeenCalledWith(SLUG);
    await waitFor(() => expect((store.getState() as any).rooms.activeRoomJID).toBe(ROOM));
    expect(onRevealRoom).toHaveBeenCalled();
    expect((store.getState() as any).call.phase).toBe('idle');
  });

  it('fetches a prop slug once', async () => {
    getScheduledCall.mockResolvedValue(call());
    const { store } = setup({ scheduledCallSlug: SLUG });
    await waitFor(() => expect(screen.getByTestId('scheduled-call-prejoin')).toBeTruthy());
    act(() => {
      store.dispatch({ type: 'noop' });
    });
    expect(getScheduledCall).toHaveBeenCalledTimes(1);
  });

  it('opens on an openScheduledCall request made later', async () => {
    getScheduledCall.mockResolvedValue(call());
    const { store } = setup();
    expect(getScheduledCall).not.toHaveBeenCalled();
    act(() => {
      store.dispatch(requestOpenScheduledCall(SLUG));
    });
    await waitFor(() => expect(screen.getByTestId('scheduled-call-prejoin')).toBeTruthy());
  });

  it('selects the room when it arrives after the call was resolved', async () => {
    getScheduledCall.mockResolvedValue(call());
    const { store } = setup({ scheduledCallSlug: SLUG, withRoom: false });
    await waitFor(() => expect(screen.getByTestId('scheduled-call-prejoin')).toBeTruthy());
    expect((store.getState() as any).rooms.activeRoomJID).not.toBe(ROOM);
    act(() => {
      store.dispatch(addRoom({ roomData: { jid: ROOM, name: 'Room', title: 'Room', type: 'group', messages: [] } } as any));
    });
    await waitFor(() => expect((store.getState() as any).rooms.activeRoomJID).toBe(ROOM));
  });

  it.each([
    ['not-found', 404, 'Call not found.'],
    ['not-a-member', 403, 'You are not a member of this chat.'],
    ['network', 0, 'Could not open the call. Try again.'],
  ])('reports %s and shows no panel', async (reason, status, text) => {
    const failure =
      status === 0
        ? new Error('offline')
        : new ScheduledCallApiError(status as number, reason as 'not-found', null);
    getScheduledCall.mockRejectedValue(failure);
    const onOpenError = vi.fn();
    const { store } = setup({ scheduledCallSlug: SLUG, onOpenError });
    expect(await screen.findByText(text as string)).toBeTruthy();
    expect(onOpenError).toHaveBeenCalledWith({ slug: SLUG, reason });
    expect((store.getState() as any).scheduledCall.preJoin).toBeNull();
    expect((store.getState() as any).scheduledCall.openError).toEqual({ slug: SLUG, reason });
  });

  it('refuses a cancelled call', async () => {
    getScheduledCall.mockResolvedValue(call('cancelled'));
    const onOpenError = vi.fn();
    setup({ scheduledCallSlug: SLUG, onOpenError });
    expect(await screen.findByText('This call was cancelled.')).toBeTruthy();
    expect(onOpenError).toHaveBeenCalledWith({ slug: SLUG, reason: 'cancelled' });
    expect(screen.queryByTestId('scheduled-call-prejoin')).toBeNull();
  });

  it('rejects an implausible slug without a request', async () => {
    const onOpenError = vi.fn();
    setup({ scheduledCallSlug: 'nope', onOpenError });
    await waitFor(() => expect(onOpenError).toHaveBeenCalledWith({ slug: 'nope', reason: 'not-found' }));
    expect(getScheduledCall).not.toHaveBeenCalled();
  });
});
