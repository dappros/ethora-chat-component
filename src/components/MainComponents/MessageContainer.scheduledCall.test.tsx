import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import chatSettingsSlice from '../../roomStore/chatSettingsSlice';
import roomsSlice from '../../roomStore/roomsSlice';
import roomHeapSlice from '../../roomStore/roomHeapSlice';
import callSlice from '../../roomStore/callSlice';
import scheduledCallSlice from '../../roomStore/scheduledCallSlice';
import { ToastProvider } from '../../context/ToastContext';
import type { IMessage } from '../../types/types';

vi.mock('../../networking/apiClient', () => ({ default: { defaults: {} } }));
vi.mock('../../networking/api-requests/scheduledCalls.api', async () => {
  const actual = await vi.importActual<object>('../../networking/api-requests/scheduledCalls.api');
  return { ...actual, getScheduledCall: vi.fn(() => new Promise(() => {})) };
});

import { MessageContainer } from './MessageContainer';

const ROOM = 'app_room@conference.example.com';
const base = (over: Record<string, unknown>): IMessage =>
  ({
    id: 'm1',
    body: 'Scheduled call: Weekly sync, 2099-10-22T15:00:00.000Z',
    roomJid: ROOM,
    date: new Date().toISOString(),
    user: { id: 'system', name: 'Ethora' },
    isSystemMessage: 'true',
    ...over,
  }) as unknown as IMessage;

const renderMessage = (message: IMessage) => {
  const store = configureStore({
    reducer: {
      chatSettingStore: chatSettingsSlice,
      rooms: roomsSlice,
      roomHeapSlice,
      call: callSlice,
      scheduledCall: scheduledCallSlice,
    },
    preloadedState: {
      chatSettingStore: { config: {}, user: { _id: 'me', xmppUsername: 'me_1' } },
    } as any,
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  render(
    <Provider store={store}>
      <ToastProvider>
        <MessageContainer
          message={message}
          activeMessage={undefined as never}
          config={{}}
          xmppUsername="me_1"
          isReply={false}
          showDateLabel={false}
        />
      </ToastProvider>
    </Provider>
  );
};

describe('MessageContainer: scheduled call', () => {
  afterEach(cleanup);

  it('renders the invite card, even for a system-account message', () => {
    renderMessage(
      base({
        scheduledCall: {
          slug: 'abcdefghijklmnopqrstuv',
          title: 'Weekly sync',
          startAt: '2099-10-22T15:00:00.000Z',
          durationMinutes: 30,
          kind: 'video',
          status: 'scheduled',
        },
      })
    );
    expect(screen.getByTestId('scheduled-call-card')).toBeTruthy();
    expect(screen.getByText('Weekly sync')).toBeTruthy();
    expect(screen.queryByText(/Scheduled call: Weekly sync/)).toBeNull();
  });

  it('a message without scheduled-call meta keeps its plain body (old clients, bad data)', () => {
    renderMessage(base({}));
    expect(screen.queryByTestId('scheduled-call-card')).toBeNull();
    expect(screen.getByText(/Scheduled call: Weekly sync/)).toBeTruthy();
  });
});
