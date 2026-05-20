import React, { ReactElement } from 'react';
import { Provider } from 'react-redux';
import { configureStore, type EnhancedStore } from '@reduxjs/toolkit';
import { render, type RenderOptions } from '@testing-library/react';
import { ToastProvider } from '../context/ToastContext';

import chatSettingsSlice from '../roomStore/chatSettingsSlice';
import roomsSlice from '../roomStore/roomsSlice';

/**
 * Renders a component with the providers it expects in production —
 * Redux Provider + ToastProvider — without pulling in the real
 * persisted store, sagas, or XMPP middleware. Each test gets its own
 * store so state doesn't leak between tests.
 *
 * Pass `preloadedState` to seed redux state for the test, and
 * `storeRef` to grab a reference to the store after render (for
 * dispatching mid-test or asserting on resulting state).
 *
 * Usage:
 *
 *     renderWithProviders(<Login config={...} />, {
 *       preloadedState: { chatSettingStore: { user: null, config: {} } },
 *     });
 */
type PreloadedState = Parameters<typeof configureStore>[0]['preloadedState'];

interface RenderOpts extends Omit<RenderOptions, 'wrapper'> {
  preloadedState?: PreloadedState;
  storeRef?: { current: EnhancedStore | null };
}

export function renderWithProviders(
  ui: ReactElement,
  { preloadedState, storeRef, ...renderOptions }: RenderOpts = {}
) {
  const store = configureStore({
    reducer: {
      chatSettingStore: chatSettingsSlice,
      rooms: roomsSlice,
    },
    preloadedState,
    // No saga / persist middleware in tests — each one is pure and
    // wraps a single render. Silences the "non-serializable value"
    // warning that fires when persisted state shapes are mocked.
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });

  if (storeRef) storeRef.current = store;

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <Provider store={store}>
        <ToastProvider>{children}</ToastProvider>
      </Provider>
    );
  }

  return { store, ...render(ui, { wrapper: Wrapper, ...renderOptions }) };
}
