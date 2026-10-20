import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import callSlice from '../../roomStore/callSlice';
import chatSettingsSlice from '../../roomStore/chatSettingsSlice';

// A controller double with a mutable snapshot the component subscribes to.
const h = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const ctrl: any = {
    snapshot: null as any,
    toggleMic: vi.fn(),
    toggleCamera: vi.fn(async () => {}),
    dismissNotice: vi.fn(),
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getSnapshot: () => ctrl.snapshot,
    set(patch: any) {
      ctrl.snapshot = { ...ctrl.snapshot, ...patch };
      listeners.forEach((fn) => fn());
    },
  };
  return { ctrl, listeners };
});

vi.mock('../../calls/p2p/p2pRuntime', () => ({
  getActiveP2PController: () => h.ctrl,
  subscribeActiveP2P: () => () => {},
}));

import { P2PCallSession } from './P2PCallSession';

const base = {
  status: 'connected',
  localStream: null,
  remoteStream: null,
  micEnabled: true,
  camEnabled: true,
  remoteVideoLive: false,
  notice: null,
};

const mount = (props: Record<string, unknown> = {}, connectedAt: number | null = null) => {
  const store = configureStore({
    reducer: { call: callSlice, chatSettingStore: chatSettingsSlice },
    preloadedState: { call: { roomName: 'Bob B', connectedAt } } as any,
  });
  const onHangup = vi.fn();
  const view = render(
    <Provider store={store}>
      <P2PCallSession onHangup={onHangup} {...props} />
    </Provider>
  );
  return { onHangup, ...view };
};

describe('P2PCallSession', () => {
  beforeEach(() => {
    // jsdom does not implement media playback.
    HTMLMediaElement.prototype.play = vi.fn(async () => {});
    h.ctrl.snapshot = { ...base };
    h.ctrl.toggleMic.mockClear();
    h.ctrl.toggleCamera.mockClear();
    h.ctrl.dismissNotice.mockClear();
  });

  it('video call: name, call clock, and working mic / camera / hang up buttons', () => {
    const { onHangup } = mount({ kind: 'video' }, Date.now() - 65_000);
    expect(screen.getAllByText('Bob B').length).toBeGreaterThan(0);
    expect(screen.getByText('01:05')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Mute microphone'));
    expect(h.ctrl.toggleMic).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText('Turn camera off'));
    expect(h.ctrl.toggleCamera).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText('End call'));
    expect(onHangup).toHaveBeenCalledTimes(1);
  });

  it('audio call: no camera control, always has remote audio', () => {
    const { container } = mount({ kind: 'audio' });
    expect(screen.getByText('Audio call')).toBeTruthy();
    expect(screen.queryByLabelText(/camera/i)).toBeNull();
    expect(container.querySelector('audio')).toBeTruthy();
  });

  it('shows connection state: starting, ringing, connecting, reconnecting, lost', () => {
    mount({ kind: 'audio' });
    const cases: Array<[string, string]> = [
      ['preparing', 'Starting…'],
      ['waiting', 'Ringing…'],
      ['connecting', 'Connecting…'],
      ['failed', 'Connection lost'],
    ];
    for (const [status, text] of cases) {
      act(() => h.ctrl.set({ status }));
      expect(screen.getByText(text)).toBeTruthy();
    }
    act(() => h.ctrl.set({ status: 'reconnecting' }));
    expect(screen.getByText('Reconnecting…')).toBeTruthy();
    expect(screen.getByText('Connection unstable, reconnecting…')).toBeTruthy();
  });

  it('reflects a muted microphone and camera', () => {
    mount({ kind: 'video' });
    act(() => h.ctrl.set({ micEnabled: false, camEnabled: false }));
    expect(screen.getByLabelText('Unmute microphone')).toBeTruthy();
    expect(screen.getByLabelText('Turn camera on')).toBeTruthy();
  });

  it('minimized: compact bar keeps mic, hang up and expand, and keeps the audio element', () => {
    const onToggleMinimize = vi.fn();
    const { container, onHangup } = mount({ kind: 'video', minimized: true, onToggleMinimize });
    expect(container.querySelector('audio')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Expand call'));
    expect(onToggleMinimize).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('End call'));
    expect(onHangup).toHaveBeenCalled();
    expect(screen.queryByLabelText('Turn camera off')).toBeNull();
  });

  it('shows a dismissible notice (e.g. camera could not be re-enabled)', () => {
    h.ctrl.snapshot = { ...base, notice: 'Camera or microphone permission denied' };
    mount({ kind: 'video' });
    expect(screen.getByRole('alert').textContent).toMatch(/permission denied/);
    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(h.ctrl.dismissNotice).toHaveBeenCalled();
  });

  it('renders the remote picture only while it is live', () => {
    const remote = {} as MediaStream;
    h.ctrl.snapshot = { ...base, remoteStream: remote, remoteVideoLive: false };
    const { container } = mount({ kind: 'video' });
    expect(screen.getByText("Peer's camera is off")).toBeTruthy();
    expect(container.querySelectorAll('video').length).toBe(0);
    act(() => h.ctrl.set({ remoteVideoLive: true }));
    expect(container.querySelectorAll('video').length).toBeGreaterThan(0);
  });
});
