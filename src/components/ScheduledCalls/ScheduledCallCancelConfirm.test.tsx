import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import chatSettingsSlice from '../../roomStore/chatSettingsSlice';
import scheduledCallSlice, { openCancelModal } from '../../roomStore/scheduledCallSlice';
import { ToastProvider } from '../../context/ToastContext';

const { cancelScheduledCall } = vi.hoisted(() => ({ cancelScheduledCall: vi.fn() }));
vi.mock('../../networking/api-requests/scheduledCalls.api', async () => {
  const actual = await vi.importActual<
    typeof import('../../networking/api-requests/scheduledCalls.api')
  >('../../networking/api-requests/scheduledCalls.api');
  return { ...actual, cancelScheduledCall };
});

import ScheduledCallCancelConfirm from './ScheduledCallCancelConfirm';

const SLUG = 'abcdefghijklmnopqrstuv';

const setup = () => {
  const store = configureStore({
    reducer: { chatSettingStore: chatSettingsSlice, scheduledCall: scheduledCallSlice },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  render(
    <Provider store={store}>
      <ToastProvider>
        <ScheduledCallCancelConfirm />
      </ToastProvider>
    </Provider>
  );
  return store;
};

describe('ScheduledCallCancelConfirm', () => {
  beforeEach(() => cancelScheduledCall.mockReset());
  afterEach(() => cleanup());

  it('renders nothing until a cancel is requested', () => {
    setup();
    expect(screen.queryByText('Cancel this call?')).toBeNull();
  });

  it('keeps the call when the user says keep', () => {
    const store = setup();
    React.act(() => {
      store.dispatch(openCancelModal({ slug: SLUG, title: 'Weekly sync' }));
    });
    fireEvent.click(screen.getByText('Keep call'));
    expect(cancelScheduledCall).not.toHaveBeenCalled();
    expect((store.getState() as any).scheduledCall.cancelModal).toBeNull();
  });

  it('cancels the call on confirm and closes the dialog', async () => {
    cancelScheduledCall.mockResolvedValue({ slug: SLUG, status: 'cancelled' });
    const store = setup();
    React.act(() => {
      store.dispatch(openCancelModal({ slug: SLUG, title: 'Weekly sync' }));
    });
    expect(screen.getByText('Cancel this call?')).toBeTruthy();
    fireEvent.click(screen.getAllByText('Cancel call').pop() as HTMLElement);
    await waitFor(() => expect(cancelScheduledCall).toHaveBeenCalledWith(SLUG));
    expect((store.getState() as any).scheduledCall.cancelModal).toBeNull();
  });
});
