import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import chatSettingsSlice from '../../roomStore/chatSettingsSlice';
import roomsSlice from '../../roomStore/roomsSlice';
import roomHeapSlice from '../../roomStore/roomHeapSlice';
import callSlice from '../../roomStore/callSlice';
import scheduledCallSlice from '../../roomStore/scheduledCallSlice';
import { ToastProvider } from '../../context/ToastContext';
import type { IMessage } from '../../types/types';

vi.mock('../../networking/apiClient', () => ({
  default: { defaults: { baseURL: 'https://api.chat.ethora.com' } },
}));

const { getScheduledCall, cancelScheduledCall } = vi.hoisted(() => ({
  getScheduledCall: vi.fn(),
  cancelScheduledCall: vi.fn(),
}));
vi.mock('../../networking/api-requests/scheduledCalls.api', async () => {
  const actual = await vi.importActual<
    typeof import('../../networking/api-requests/scheduledCalls.api')
  >('../../networking/api-requests/scheduledCalls.api');
  return { ...actual, getScheduledCall, cancelScheduledCall };
});

import ScheduledCallCard from './ScheduledCallCard';

const SLUG = 'abcdefghijklmnopqrstuv';
const ROOM = 'app_room@conference.example.com';
const NOW = new Date('2026-10-22T14:00:00.000Z').getTime();
const START = '2026-10-22T15:00:00.000Z';
const CALLS = { enabled: true, livekitUrl: 'wss://lk.example.com' };

const message = (over: Record<string, unknown> = {}): IMessage =>
  ({
    id: 'm1',
    body: 'Scheduled call: Weekly sync',
    roomJid: ROOM,
    date: new Date(NOW).toISOString(),
    user: { id: 'system' },
    scheduledCall: {
      slug: SLUG,
      title: 'Weekly sync',
      startAt: START,
      durationMinutes: 30,
      kind: 'video',
      status: 'scheduled',
      createdBy: 'me',
      icsUrl: `https://api.chat.ethora.com/v1/calls/scheduled/${SLUG}.ics`,
      googleUrl: 'https://calendar.google.com/calendar/render?action=TEMPLATE',
      outlookUrl: 'https://outlook.live.com/calendar/0/deeplink/compose',
      ...over,
    },
  }) as unknown as IMessage;

const details = (createdBy = 'me') => ({
  scheduledCall: {
    chatName: 'app_room',
    title: 'Weekly sync',
    startAt: START,
    durationMinutes: 30,
    kind: 'video',
    slug: SLUG,
    status: 'scheduled',
    createdBy,
  },
  links: { join: 'j', ics: 'i', google: 'g', outlook: 'o' },
  chat: { name: 'app_room', title: 'Room', type: 'group', jid: ROOM },
});

const setup = (
  msg: IMessage,
  config: Record<string, unknown> = { videoCalls: CALLS },
  roomExtra: Record<string, unknown> = {}
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
      chatSettingStore: { config, user: { _id: 'me', xmppUsername: 'me_1' } },
      rooms: { rooms: { [ROOM]: { jid: ROOM, name: 'Room', type: 'group', messages: [], ...roomExtra } } },
    } as any,
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  render(
    <Provider store={store}>
      <ToastProvider>
        <ScheduledCallCard message={msg} />
      </ToastProvider>
    </Provider>
  );
  return store;
};

describe('ScheduledCallCard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(NOW);
    getScheduledCall.mockReset();
    cancelScheduledCall.mockReset();
    // Pending by default: most tests are about the first paint, not the fetch.
    getScheduledCall.mockReturnValue(new Promise(() => {}));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows title, kind and the three calendar buttons for an upcoming call', async () => {
    setup(message());
    expect(screen.getByText('Weekly sync')).toBeTruthy();
    expect(screen.getByText('Video call')).toBeTruthy();
    const google = screen.getByText('Google Calendar') as HTMLAnchorElement;
    expect(google.getAttribute('href')).toContain('calendar.google.com');
    expect(google.getAttribute('target')).toBe('_blank');
    expect(google.getAttribute('rel')).toContain('noopener');
    expect((screen.getByText('Outlook') as HTMLAnchorElement).getAttribute('href')).toContain('outlook.live.com');
    expect((screen.getByText('Download .ics') as HTMLAnchorElement).getAttribute('href')).toContain(`${SLUG}.ics`);
    // Rendering needs no request: the message carries everything.
    expect(getScheduledCall).not.toHaveBeenCalled();
  });

  it('keeps Join disabled until 15 minutes before the start', () => {
    setup(message());
    const join = screen.getByTestId('scheduled-call-join') as HTMLButtonElement;
    expect(join.disabled).toBe(true);
    expect(screen.getByTestId('scheduled-call-card').getAttribute('data-phase')).toBe('upcoming');
  });

  it('enables Join inside the window and opens the pre-join panel on click', async () => {
    vi.setSystemTime(new Date(START).getTime() - 10 * 60_000);
    getScheduledCall.mockResolvedValue(details());
    const store = setup(message());
    expect(screen.getByTestId('scheduled-call-card').getAttribute('data-phase')).toBe('joinable');
    const join = screen.getByTestId('scheduled-call-join') as HTMLButtonElement;
    expect(join.disabled).toBe(false);
    fireEvent.click(join);
    await waitFor(() =>
      expect((store.getState() as any).scheduledCall.preJoin?.scheduledCall.slug).toBe(SLUG)
    );
  });

  it('starts no call by itself: Join only opens the panel', async () => {
    vi.setSystemTime(new Date(START).getTime());
    getScheduledCall.mockResolvedValue(details());
    const store = setup(message());
    fireEvent.click(screen.getByTestId('scheduled-call-join'));
    await waitFor(() => expect((store.getState() as any).scheduledCall.preJoin).not.toBeNull());
    expect((store.getState() as any).call.phase).toBe('idle');
  });

  it('greys out an ended call: no Join, no calendar buttons', () => {
    vi.setSystemTime(new Date(START).getTime() + 31 * 60_000);
    setup(message());
    expect(screen.getByTestId('scheduled-call-card').getAttribute('data-phase')).toBe('ended');
    expect(screen.queryByTestId('scheduled-call-join')).toBeNull();
    expect(screen.queryByText('Google Calendar')).toBeNull();
    expect(screen.getByText('Ended')).toBeTruthy();
    expect(getScheduledCall).not.toHaveBeenCalled();
  });

  it('shows a cancelled call struck through with no actions', () => {
    setup(message({ status: 'cancelled' }));
    expect(screen.getByTestId('scheduled-call-card').getAttribute('data-phase')).toBe('cancelled');
    expect(screen.getByText('Cancelled')).toBeTruthy();
    expect(screen.queryByTestId('scheduled-call-join')).toBeNull();
    expect(getComputedStyle(screen.getByText('Weekly sync')).textDecoration).toContain('line-through');
  });

  it('shows an `updated` badge on an edited call', () => {
    setup(message({ status: 'updated' }));
    expect(screen.getByText('Updated')).toBeTruthy();
  });

  it('offers Edit and Cancel to the creator straight from the message', () => {
    setup(message());
    expect(screen.getByTestId('scheduled-call-edit')).toBeTruthy();
    expect(screen.getByTestId('scheduled-call-cancel')).toBeTruthy();
    expect(getScheduledCall).not.toHaveBeenCalled();
  });

  it('hides Edit and Cancel from everyone else', () => {
    setup(message({ createdBy: 'someone-else' }));
    expect(screen.queryByTestId('scheduled-call-edit')).toBeNull();
    expect(screen.queryByTestId('scheduled-call-cancel')).toBeNull();
  });

  it('hides Edit and Cancel when the creator is unknown (older backend)', () => {
    setup(message({ createdBy: undefined }));
    expect(screen.queryByTestId('scheduled-call-edit')).toBeNull();
  });

  it('gives the room owner Edit and Cancel too', () => {
    setup(message({ createdBy: 'someone-else' }), { videoCalls: CALLS }, { createdBy: 'me' });
    expect(screen.getByTestId('scheduled-call-edit')).toBeTruthy();
  });

  it('offers neither on an ended or cancelled call', () => {
    vi.setSystemTime(new Date(START).getTime() + 31 * 60_000);
    setup(message());
    expect(screen.queryByTestId('scheduled-call-edit')).toBeNull();
    expect(screen.queryByTestId('scheduled-call-cancel')).toBeNull();
  });

  it('asks for a confirmation through the layer instead of cancelling at once', () => {
    const store = setup(message());
    fireEvent.click(screen.getByTestId('scheduled-call-cancel'));
    expect(cancelScheduledCall).not.toHaveBeenCalled();
    expect((store.getState() as any).scheduledCall.cancelModal).toEqual({
      slug: SLUG,
      title: 'Weekly sync',
    });
    // The dialog itself lives in ScheduledCallCancelConfirm (outside the list).
    expect(screen.queryByText('Cancel this call?')).toBeNull();
  });

  it('offers Edit and Cancel from the access token when the user has no _id', () => {
    const token = `x.${btoa(JSON.stringify({ data: { userId: 'me' } }))}.y`;
    const store = setup(message());
    expect(store).toBeTruthy();
    cleanup();
    const noId = configureStore({
      reducer: {
        chatSettingStore: chatSettingsSlice,
        rooms: roomsSlice,
        roomHeapSlice,
        call: callSlice,
        scheduledCall: scheduledCallSlice,
      },
      preloadedState: {
        chatSettingStore: { config: { videoCalls: CALLS }, user: { token, xmppUsername: 'me_1' } },
        rooms: { rooms: { [ROOM]: { jid: ROOM, name: 'Room', type: 'group', messages: [] } } },
      } as any,
      middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
    });
    render(
      <Provider store={noId}>
        <ToastProvider>
          <ScheduledCallCard message={message()} />
        </ToastProvider>
      </Provider>
    );
    expect(screen.getByTestId('scheduled-call-edit')).toBeTruthy();
    expect(screen.getByTestId('scheduled-call-cancel')).toBeTruthy();
  });

  it('fetches the whole call when Edit is pressed, then opens the form', async () => {
    getScheduledCall.mockResolvedValue(details());
    const store = setup(message());
    fireEvent.click(screen.getByTestId('scheduled-call-edit'));
    await waitFor(() =>
      expect((store.getState() as any).scheduledCall.scheduleModal?.editing.scheduledCall.slug).toBe(SLUG)
    );
    expect(getScheduledCall).toHaveBeenCalledWith(SLUG);
  });

  it('has no Join when calls are off, but still shows the calendar buttons', () => {
    vi.setSystemTime(new Date(START).getTime());
    setup(message(), {});
    expect(screen.queryByTestId('scheduled-call-join')).toBeNull();
    expect(screen.getByText('Google Calendar')).toBeTruthy();
  });

  it('does not render a forged calendar link', () => {
    setup(message({ googleUrl: undefined, outlookUrl: undefined, icsUrl: undefined }));
    expect(screen.queryByText('Google Calendar')).toBeNull();
    expect(screen.queryByText('Download .ics')).toBeNull();
  });
});
