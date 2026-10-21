import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import callSlice from '../../roomStore/callSlice';
import chatSettingsSlice from '../../roomStore/chatSettingsSlice';

// The LiveKit client and its React bindings are replaced by a controllable
// fake room: tests change who is "in the room" and re-render.
const lk = vi.hoisted(() => ({
  participants: [] as any[],
  tracks: [] as any[],
}));

vi.mock('livekit-client', () => {
  class Room {
    localParticipant = {
      setMicrophoneEnabled: vi.fn(async () => {}),
      setCameraEnabled: vi.fn(async () => {}),
    };
    connect = vi.fn(async () => {});
    disconnect = vi.fn();
    on = vi.fn();
    off = vi.fn();
  }
  return {
    Room,
    ConnectionState: { Connected: 'connected', Connecting: 'connecting' },
    ExternalE2EEKeyProvider: class {},
    RoomEvent: {},
    Track: {
      Source: { Camera: 'camera', Microphone: 'microphone', ScreenShare: 'screen_share' },
    },
    VideoPresets: { h540: {}, h216: {} },
    isE2EESupported: () => false,
  };
});

vi.mock('@livekit/components-react', () => ({
  RoomContext: { Provider: ({ children }: any) => <>{children}</> },
  RoomAudioRenderer: () => null,
  VideoTrack: () => <div data-testid="video-track" />,
  useConnectionState: () => 'connected',
  useParticipants: () => lk.participants,
  useRemoteParticipants: () => lk.participants.filter((p) => !p.isLocal),
  useSpeakingParticipants: () => [],
  useTrackToggle: () => ({ enabled: true, toggle: vi.fn() }),
  useTracks: () => lk.tracks,
}));

import { VideoCallSession } from './VideoCallSession';

const person = (identity: string, isLocal = false, joinedAt = '2026-01-01T00:00:00Z') => ({
  identity,
  name: identity === 'me' ? 'Mia' : identity,
  isLocal,
  joinedAt: new Date(joinedAt),
});

const renderSession = (props: Record<string, unknown>) => {
  const store = configureStore({
    reducer: { call: callSlice, chatSettingStore: chatSettingsSlice },
    preloadedState: { call: { roomName: 'Design team' } } as any,
  });
  const ui = (p: Record<string, unknown>) => (
    <Provider store={store}>
      <VideoCallSession token="t" livekitUrl="wss://lk" onHangup={onHangup} {...p} />
    </Provider>
  );
  const utils = render(ui(props));
  return { ...utils, rerenderWith: (p: Record<string, unknown>) => utils.rerender(ui(p)) };
};

const onHangup = vi.fn();

describe('VideoCallSession: 1:1 vs group', () => {
  beforeEach(() => {
    onHangup.mockClear();
    lk.tracks = [];
  });

  it('1:1: ends the call locally as soon as the remote peer leaves', async () => {
    lk.participants = [person('me', true), person('peer')];
    const { rerenderWith } = renderSession({ kind: 'audio' });
    expect(onHangup).not.toHaveBeenCalled();

    lk.participants = [person('me', true)];
    await act(async () => rerenderWith({ kind: 'audio' }));
    expect(onHangup).toHaveBeenCalledTimes(1);
  });

  it('group: does NOT end when one participant leaves, even the last other one', async () => {
    lk.participants = [person('me', true), person('ann'), person('bob')];
    const { rerenderWith } = renderSession({ kind: 'audio', isGroup: true });

    lk.participants = [person('me', true), person('bob')];
    await act(async () => rerenderWith({ kind: 'audio', isGroup: true }));
    lk.participants = [person('me', true)];
    await act(async () => rerenderWith({ kind: 'audio', isGroup: true }));

    expect(onHangup).not.toHaveBeenCalled();
    expect(screen.getByText('Waiting for others…')).toBeTruthy();
  });

  it('group audio: one tile per participant, you included, with the room as the title', () => {
    lk.participants = [person('ann'), person('me', true), person('bob')];
    renderSession({ kind: 'audio', isGroup: true });
    expect(screen.getByText('Design team')).toBeTruthy();
    expect(screen.getByText('Mia (You)')).toBeTruthy();
    expect(screen.getByText('ann')).toBeTruthy();
    expect(screen.getByText('bob')).toBeTruthy();
    expect(screen.getByText(/3 participants/)).toBeTruthy();
    // Group mode never uses the 1:1 "Peer's camera" / Ringing copy.
    expect(screen.queryByText('Ringing…')).toBeNull();
  });

  it('group video: renders the grid (not the 1:1 stage) with a tile per participant', () => {
    lk.participants = [person('me', true), person('ann')];
    renderSession({ kind: 'video', isGroup: true });
    const grid = screen.getByTestId('group-call-grid');
    expect(grid.children.length).toBe(2);
    expect(screen.queryByText("Peer's camera is off")).toBeNull();
  });

  it('group video: a shared screen gets its own tile', () => {
    const screenTrack = {
      participant: { identity: 'ann' },
      publication: { isMuted: false, track: {} },
      source: 'screen_share',
    };
    lk.participants = [person('me', true), person('ann')];
    lk.tracks = [screenTrack];
    renderSession({ kind: 'video', isGroup: true });
    const grid = screen.getByTestId('group-call-grid');
    expect(grid.children.length).toBe(3);
    expect(screen.getByText(/ann - screen/)).toBeTruthy();
  });

  it('1:1 video keeps its own layout (no grid)', () => {
    lk.participants = [person('me', true), person('peer')];
    renderSession({ kind: 'video' });
    expect(screen.queryByTestId('group-call-grid')).toBeNull();
  });
});
