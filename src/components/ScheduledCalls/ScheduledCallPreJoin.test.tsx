import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import chatSettingsSlice from '../../roomStore/chatSettingsSlice';
import roomsSlice from '../../roomStore/roomsSlice';
import roomHeapSlice from '../../roomStore/roomHeapSlice';
import callSlice from '../../roomStore/callSlice';
import scheduledCallSlice, { openPreJoin } from '../../roomStore/scheduledCallSlice';
import type { ScheduledCallDetails } from '../../types/models/scheduledCall.model';

const { placeRoomCall } = vi.hoisted(() => ({ placeRoomCall: vi.fn(async () => {}) }));
vi.mock('../../calls/placeCall', () => ({ placeRoomCall }));

import ScheduledCallPreJoin from './ScheduledCallPreJoin';

const SLUG = 'abcdefghijklmnopqrstuv';
const ROOM = 'app_room@conference.example.com';
const START = new Date('2026-10-22T15:00:00.000Z').getTime();
const CALLS = { enabled: true, livekitUrl: 'wss://lk.example.com' };

const details = (over: Record<string, unknown> = {}): ScheduledCallDetails =>
  ({
    scheduledCall: {
      chatName: 'app_room',
      title: 'Weekly sync',
      startAt: new Date(START).toISOString(),
      durationMinutes: 30,
      kind: 'video',
      slug: SLUG,
      status: 'scheduled',
      ...over,
    },
    links: {
      join: 'j',
      ics: `https://api.chat.ethora.com/v1/calls/scheduled/${SLUG}.ics`,
      google: 'https://calendar.google.com/calendar/render',
      outlook: 'https://outlook.live.com/calendar/0/deeplink/compose',
    },
    chat: { name: 'app_room', title: 'Design team', type: 'group', jid: ROOM },
  }) as ScheduledCallDetails;

const setup = (
  d: ScheduledCallDetails,
  opts: { config?: Record<string, unknown>; callPhase?: string; inRoom?: boolean } = {}
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
        config: opts.config ?? { videoCalls: CALLS },
        user: { _id: 'me', xmppUsername: 'me_1' },
      },
      rooms: {
        rooms:
          opts.inRoom === false
            ? {}
            : {
                [ROOM]: {
                  jid: ROOM,
                  name: 'Design team',
                  type: 'group',
                  members: [{ xmppUsername: 'me_1' }],
                  messages: [],
                },
              },
      },
      ...(opts.callPhase ? { call: { ...callSlice(undefined, { type: '@@' }), phase: opts.callPhase } } : {}),
    } as any,
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(openPreJoin(d));
  render(
    <Provider store={store}>
      <ScheduledCallPreJoin />
    </Provider>
  );
  return store;
};

const joinBtn = () => screen.getByTestId('scheduled-call-prejoin-join') as HTMLButtonElement;

describe('ScheduledCallPreJoin', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    placeRoomCall.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows the call and its room, and starts nothing on open', () => {
    vi.setSystemTime(START - 5 * 60_000);
    setup(details());
    expect(screen.getByText('Weekly sync')).toBeTruthy();
    expect(screen.getByText(/Design team/)).toBeTruthy();
    expect(screen.getByText('Nothing is shared until you tap Join.')).toBeTruthy();
    expect(placeRoomCall).not.toHaveBeenCalled();
  });

  it('keeps Join off before the window and explains when it opens', () => {
    vi.setSystemTime(START - 60 * 60_000);
    setup(details());
    expect(joinBtn().disabled).toBe(true);
    expect(screen.getByText(/You can join from/)).toBeTruthy();
  });

  it('Join call dials through the shared call path with the call kind', () => {
    vi.setSystemTime(START - 5 * 60_000);
    const store = setup(details({ kind: 'audio' }));
    expect(joinBtn().disabled).toBe(false);
    fireEvent.click(joinBtn());
    expect(placeRoomCall).toHaveBeenCalledTimes(1);
    const arg = (placeRoomCall.mock.calls[0] as any[])[0];
    expect(arg.kind).toBe('audio');
    expect(arg.room.jid).toBe(ROOM);
    expect(arg.room.members).toHaveLength(1);
    expect(arg.selfXmppUsername).toBe('me_1');
    expect((store.getState() as any).scheduledCall.preJoin).toBeNull();
  });

  it('still joins when the room is not in the list yet', () => {
    vi.setSystemTime(START);
    setup(details(), { inRoom: false });
    fireEvent.click(joinBtn());
    const arg = (placeRoomCall.mock.calls[0] as any[])[0];
    expect(arg.room).toMatchObject({ jid: ROOM, name: 'Design team', type: 'group' });
  });

  it('cannot join an ended call', () => {
    vi.setSystemTime(START + 31 * 60_000);
    setup(details());
    expect(joinBtn().disabled).toBe(true);
    expect(screen.getByText('This call has ended.')).toBeTruthy();
  });

  it('cannot join a cancelled call', () => {
    vi.setSystemTime(START);
    setup(details({ status: 'cancelled' }));
    expect(joinBtn().disabled).toBe(true);
    expect(screen.getByText('This call was cancelled.')).toBeTruthy();
  });

  it('cannot join while another call is in progress', () => {
    vi.setSystemTime(START);
    setup(details(), { callPhase: 'in-call' });
    expect(joinBtn().disabled).toBe(true);
    expect(screen.getByText('Another call is already in progress.')).toBeTruthy();
  });

  it('cannot join where calls are not configured', () => {
    vi.setSystemTime(START);
    setup(details(), { config: {} });
    expect(joinBtn().disabled).toBe(true);
    expect(screen.getByText('Calls are not available in this chat.')).toBeTruthy();
  });

  it('shows the room name from the list, never the raw chat name, for a 1:1 room', () => {
    vi.setSystemTime(START);
    const raw = 'abcdef0123456789abcdef01_abcdef0123456789abcdef02-abcdef0123456789abcdef01_abcdef0123456789abcdef03';
    const d = details();
    d.chat = { name: raw, title: '', type: 'group', jid: ROOM } as any;
    setup(d);
    expect(screen.getByText(/In Design team/)).toBeTruthy();
    expect(screen.queryByText(new RegExp(raw))).toBeNull();
  });

  it('omits the room line when no readable room name is known', () => {
    vi.setSystemTime(START);
    const d = details();
    d.chat = { name: 'abcdef0123456789abcdef01_abcdef0123456789abcdef02', title: '', type: 'group', jid: ROOM } as any;
    setup(d, { inRoom: false });
    expect(screen.queryByText(/^In /)).toBeNull();
  });

  it('Close dismisses the panel without dialling', () => {
    vi.setSystemTime(START);
    const store = setup(details());
    fireEvent.click(screen.getAllByText('Close')[0]);
    expect((store.getState() as any).scheduledCall.preJoin).toBeNull();
    expect(placeRoomCall).not.toHaveBeenCalled();
  });

  it('offers the calendar links from the API', () => {
    vi.setSystemTime(START - 60 * 60_000);
    setup(details());
    expect((screen.getByText('Google Calendar') as HTMLAnchorElement).getAttribute('href')).toContain('calendar.google.com');
    expect(screen.getByText('Download .ics')).toBeTruthy();
  });
});
