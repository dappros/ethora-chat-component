import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import chatSettingsSlice from '../../roomStore/chatSettingsSlice';
import roomsSlice from '../../roomStore/roomsSlice';
import roomHeapSlice from '../../roomStore/roomHeapSlice';
import callSlice from '../../roomStore/callSlice';
import scheduledCallSlice, { openScheduleModal } from '../../roomStore/scheduledCallSlice';
import { ToastProvider } from '../../context/ToastContext';
import type { ScheduledCallDetails } from '../../types/models/scheduledCall.model';

const { createScheduledCall, updateScheduledCall } = vi.hoisted(() => ({
  createScheduledCall: vi.fn(),
  updateScheduledCall: vi.fn(),
}));
vi.mock('../../networking/api-requests/scheduledCalls.api', async () => {
  const actual = await vi.importActual<
    typeof import('../../networking/api-requests/scheduledCalls.api')
  >('../../networking/api-requests/scheduledCalls.api');
  return { ...actual, createScheduledCall, updateScheduledCall };
});
vi.mock('../../networking/apiClient', () => ({ default: { defaults: {} } }));

import ScheduleCallModal from './ScheduleCallModal';
import { ScheduledCallApiError } from '../../networking/api-requests/scheduledCalls.api';

const ROOM = 'app_room@conference.example.com';
const SLUG = 'abcdefghijklmnopqrstuv';

const setup = (opts: { editing?: ScheduledCallDetails; config?: Record<string, unknown> } = {}) => {
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
        config: opts.config ?? { videoCalls: { enabled: true, livekitUrl: 'wss://x', enableAudioCalls: true } },
        user: { _id: 'me', xmppUsername: 'me_1' },
      },
    } as any,
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(openScheduleModal({ roomJid: ROOM, editing: opts.editing }));
  render(
    <Provider store={store}>
      <ToastProvider>
        <ScheduleCallModal />
      </ToastProvider>
    </Provider>
  );
  return store;
};

const type = (testId: string, value: string) =>
  fireEvent.change(screen.getByTestId(testId), { target: { value } });

describe('ScheduleCallModal: create', () => {
  beforeEach(() => {
    createScheduledCall.mockReset();
    updateScheduledCall.mockReset();
    createScheduledCall.mockResolvedValue({ scheduledCall: {}, links: {} });
  });
  afterEach(cleanup);

  it('posts the chat name, UTC start, duration, zone and kind, then closes', async () => {
    const store = setup();
    type('schedule-call-title', '  Standup  ');
    type('schedule-call-date', '2099-03-04');
    type('schedule-call-time', '09:30');
    type('schedule-call-duration', '45');
    fireEvent.click(screen.getByLabelText('Audio call'));
    fireEvent.click(screen.getByTestId('schedule-call-submit'));
    await waitFor(() => expect(createScheduledCall).toHaveBeenCalledTimes(1));
    const body = createScheduledCall.mock.calls[0][0];
    expect(body.chatName).toBe('app_room');
    expect(body.title).toBe('Standup');
    expect(body.durationMinutes).toBe(45);
    expect(body.kind).toBe('audio');
    expect(body.startAt).toBe(new Date(2099, 2, 4, 9, 30).toISOString());
    expect(typeof body.timezone === 'string' || body.timezone === undefined).toBe(true);
    await waitFor(() => expect((store.getState() as any).scheduledCall.scheduleModal).toBeNull());
  });

  it('falls back to the localized default title', async () => {
    setup();
    type('schedule-call-date', '2099-03-04');
    type('schedule-call-time', '09:30');
    fireEvent.click(screen.getByTestId('schedule-call-submit'));
    await waitFor(() => expect(createScheduledCall).toHaveBeenCalled());
    expect(createScheduledCall.mock.calls[0][0].title).toBe('Call');
  });

  it('refuses a start in the past without calling the server', async () => {
    setup();
    type('schedule-call-date', '2001-01-01');
    type('schedule-call-time', '09:30');
    fireEvent.click(screen.getByTestId('schedule-call-submit'));
    expect(await screen.findByText('Pick a time in the future.')).toBeTruthy();
    expect(createScheduledCall).not.toHaveBeenCalled();
  });

  it('refuses a missing date', async () => {
    setup();
    type('schedule-call-date', '');
    fireEvent.click(screen.getByTestId('schedule-call-submit'));
    expect(await screen.findByText('Pick a valid date and time.')).toBeTruthy();
    expect(createScheduledCall).not.toHaveBeenCalled();
  });

  it('only offers video when audio calls are not enabled', () => {
    setup({ config: { videoCalls: { enabled: true, livekitUrl: 'wss://x' } } });
    expect(screen.queryByLabelText('Audio call')).toBeNull();
    expect(screen.getByLabelText('Video call')).toBeTruthy();
  });

  it('shows the future-time message when the server says the start is in the past', async () => {
    createScheduledCall.mockRejectedValue(new ScheduledCallApiError(422, 'network', 'START_IN_PAST'));
    setup();
    type('schedule-call-date', '2099-03-04');
    type('schedule-call-time', '09:30');
    fireEvent.click(screen.getByTestId('schedule-call-submit'));
    expect(await screen.findByText('Pick a time in the future.')).toBeTruthy();
  });

  it('keeps the form open and says so when the server refuses', async () => {
    createScheduledCall.mockRejectedValue(new ScheduledCallApiError(500, 'network', null));
    const store = setup();
    type('schedule-call-date', '2099-03-04');
    type('schedule-call-time', '09:30');
    fireEvent.click(screen.getByTestId('schedule-call-submit'));
    expect(await screen.findByText('Could not save the call. Try again.')).toBeTruthy();
    expect((store.getState() as any).scheduledCall.scheduleModal).not.toBeNull();
  });
});

describe('ScheduleCallModal: edit', () => {
  const editing = (): ScheduledCallDetails =>
    ({
      scheduledCall: {
        chatName: 'app_room',
        title: 'Weekly sync',
        description: 'Agenda',
        startAt: new Date(2099, 5, 1, 10, 0).toISOString(),
        durationMinutes: 60,
        kind: 'video',
        slug: SLUG,
        status: 'scheduled',
        createdBy: 'me',
      },
      links: { join: 'j', ics: 'i', google: 'g', outlook: 'o' },
      chat: { name: 'app_room', jid: ROOM },
    }) as ScheduledCallDetails;

  beforeEach(() => {
    createScheduledCall.mockReset();
    updateScheduledCall.mockReset();
    updateScheduledCall.mockResolvedValue({ scheduledCall: {}, links: {} });
  });
  afterEach(cleanup);

  it('is prefilled from the call', () => {
    setup({ editing: editing() });
    expect((screen.getByTestId('schedule-call-title') as HTMLInputElement).value).toBe('Weekly sync');
    expect((screen.getByTestId('schedule-call-date') as HTMLInputElement).value).toBe('2099-06-01');
    expect((screen.getByTestId('schedule-call-time') as HTMLInputElement).value).toBe('10:00');
    expect((screen.getByTestId('schedule-call-duration') as HTMLSelectElement).value).toBe('60');
    expect(screen.getByText('Edit scheduled call')).toBeTruthy();
  });

  it('patches only the fields that changed', async () => {
    setup({ editing: editing() });
    type('schedule-call-title', 'Renamed');
    fireEvent.click(screen.getByTestId('schedule-call-submit'));
    await waitFor(() => expect(updateScheduledCall).toHaveBeenCalledTimes(1));
    expect(updateScheduledCall).toHaveBeenCalledWith(SLUG, { title: 'Renamed' });
    expect(createScheduledCall).not.toHaveBeenCalled();
  });

  it('sends the new start when the time changes', async () => {
    setup({ editing: editing() });
    type('schedule-call-time', '11:15');
    fireEvent.click(screen.getByTestId('schedule-call-submit'));
    await waitFor(() => expect(updateScheduledCall).toHaveBeenCalled());
    expect(updateScheduledCall.mock.calls[0][1]).toEqual({
      startAt: new Date(2099, 5, 1, 11, 15).toISOString(),
    });
  });

  it('makes no request when nothing changed', async () => {
    const store = setup({ editing: editing() });
    fireEvent.click(screen.getByTestId('schedule-call-submit'));
    await waitFor(() => expect((store.getState() as any).scheduledCall.scheduleModal).toBeNull());
    expect(updateScheduledCall).not.toHaveBeenCalled();
  });

  it('explains a 403', async () => {
    updateScheduledCall.mockRejectedValue(new ScheduledCallApiError(403, 'not-a-member', null));
    setup({ editing: editing() });
    type('schedule-call-title', 'x');
    fireEvent.click(screen.getByTestId('schedule-call-submit'));
    expect(
      await screen.findByText('Only the person who scheduled the call or the chat owner can change it.')
    ).toBeTruthy();
  });
});
