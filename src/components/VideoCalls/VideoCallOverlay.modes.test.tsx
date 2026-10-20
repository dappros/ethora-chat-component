import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';

const h = vi.hoisted(() => ({
  livekitProps: null as any,
  reportCallDeclined: vi.fn(),
  sendCallStateSignal: vi.fn(),
}));

vi.mock('./VideoCallSession', () => ({
  VideoCallSession: (props: any) => {
    h.livekitProps = props;
    return <div data-testid="livekit-session" />;
  },
}));
vi.mock('./P2PCallSession', () => ({
  P2PCallSession: (props: any) => (
    <div data-testid="p2p-session" data-kind={props.kind} />
  ),
}));
vi.mock('./P2PCallRunner', () => ({ P2PCallRunner: () => null }));
vi.mock('../../networking/api-requests/callState.api', () => ({
  reportCallDeclined: h.reportCallDeclined,
  reportCallEnded: vi.fn(),
  reportCallRinging: vi.fn(),
  reportCallConnected: vi.fn(),
  fetchIceServers: vi.fn(),
}));
vi.mock('../../networking/callTokenStanza', async () => {
  const actual = await vi.importActual<any>('../../networking/callTokenStanza');
  return { ...actual, sendCallStateSignal: h.sendCallStateSignal };
});

import { store } from '../../roomStore';
import { setConfig, setUser } from '../../roomStore/chatSettingsSlice';
import {
  endCall,
  setCallPhase,
  setIncomingCallToken,
  setOutgoingCallRoute,
  startOutgoingCall,
} from '../../roomStore/callSlice';
import { ToastProvider } from '../../context/ToastContext';
import { VideoCallOverlay } from './VideoCallOverlay';

const mount = () =>
  render(
    <Provider store={store}>
      <ToastProvider>
        <VideoCallOverlay />
      </ToastProvider>
    </Provider>
  );

describe('VideoCallOverlay: which transport renders', () => {
  beforeEach(() => {
    h.livekitProps = null;
    h.reportCallDeclined.mockClear();
    h.sendCallStateSignal.mockClear();
    store.dispatch(endCall());
    store.dispatch(setUser({ xmppUsername: 'me' } as any));
    store.dispatch(
      setConfig({ videoCalls: { enabled: true, livekitUrl: 'wss://config.example.com' } } as any)
    );
  });

  it('a group ring names the room and says it is a group call', () => {
    act(() => {
      store.dispatch(
        setIncomingCallToken({
          roomJid: 'g@conference.x',
          roomName: 'Design team',
          roomBareName: 'g',
          token: 't',
          kind: 'video',
          isGroup: true,
          callId: 'cg',
        })
      );
    });
    mount();
    expect(screen.getAllByText('Incoming group video call').length).toBeGreaterThan(0);
    expect(screen.getByText('Design team')).toBeTruthy();
    expect(screen.getByText('Group video call')).toBeTruthy();
  });

  it('a 1:1 ring keeps the plain wording', () => {
    act(() => {
      store.dispatch(
        setIncomingCallToken({
          roomJid: 'a-b@conference.x',
          roomName: 'Bob B',
          token: 't',
          kind: 'audio',
        })
      );
    });
    mount();
    expect(screen.getAllByText('Incoming audio call').length).toBeGreaterThan(0);
    expect(screen.getByText('Audio call')).toBeTruthy();
  });

  it('1:1 LiveKit: renders the LiveKit session with the config URL and isGroup=false', () => {
    act(() => {
      store.dispatch(
        setIncomingCallToken({ roomJid: 'a-b@conference.x', roomName: 'Bob', token: 'jwt', callId: 'c1' })
      );
    });
    mount();
    act(() => {
      fireEvent.click(screen.getByLabelText('Accept call'));
    });
    expect(screen.getByTestId('livekit-session')).toBeTruthy();
    expect(screen.queryByTestId('p2p-session')).toBeNull();
    expect(h.livekitProps).toMatchObject({
      token: 'jwt',
      livekitUrl: 'wss://config.example.com',
      isGroup: false,
    });
  });

  it('group: renders the LiveKit session with isGroup=true', () => {
    act(() => {
      store.dispatch(
        setIncomingCallToken({
          roomJid: 'g@conference.x',
          roomName: 'Team',
          token: 'jwt',
          isGroup: true,
          callId: 'cg',
        })
      );
    });
    mount();
    act(() => {
      fireEvent.click(screen.getByLabelText('Accept call'));
    });
    expect(h.livekitProps).toMatchObject({ isGroup: true });
  });

  it('caller: the server livekitUrl wins over the config URL', () => {
    act(() => {
      store.dispatch(
        startOutgoingCall({ roomJid: 'a-b@conference.x', kind: 'video', peerXmppUsername: 'b' })
      );
      store.dispatch(
        setOutgoingCallRoute({
          startedAt: store.getState().call.startedAt,
          callId: 'c9',
          mode: 'livekit',
          livekitUrl: 'wss://server.example.com',
        })
      );
      // The caller's own LiveKit token arrives as before.
      store.dispatch({
        type: 'call/setOutgoingCallToken',
        payload: { roomJid: 'a-b@conference.x', token: 'mine', callId: 'c9' },
      });
    });
    mount();
    expect(h.livekitProps).toMatchObject({ token: 'mine', livekitUrl: 'wss://server.example.com' });
  });

  it('p2p: renders the p2p session (no token, no livekitUrl needed)', () => {
    act(() => {
      store.dispatch(setConfig({ videoCalls: { enabled: true, livekitUrl: '' } } as any));
      store.dispatch(
        setIncomingCallToken({
          roomJid: 'a-b@conference.x',
          roomName: 'Bob',
          token: '',
          kind: 'audio',
          mode: 'p2p',
          callId: 'cp',
        })
      );
    });
    mount();
    act(() => {
      fireEvent.click(screen.getByLabelText('Accept call'));
    });
    const session = screen.getByTestId('p2p-session');
    expect(session.getAttribute('data-kind')).toBe('audio');
    expect(screen.queryByTestId('livekit-session')).toBeNull();
  });

  it('p2p caller shows the dialling card until the call connects, then the session', () => {
    act(() => {
      store.dispatch(
        startOutgoingCall({ roomJid: 'a-b@conference.x', roomName: 'Bob', kind: 'video', peerXmppUsername: 'b' })
      );
      store.dispatch(
        setOutgoingCallRoute({
          startedAt: store.getState().call.startedAt,
          callId: 'cp2',
          mode: 'p2p',
          iceServers: [],
        })
      );
    });
    mount();
    expect(screen.getAllByText('Calling…').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('p2p-session')).toBeNull();

    act(() => {
      store.dispatch(setCallPhase('connecting'));
    });
    expect(screen.getByTestId('p2p-session')).toBeTruthy();
  });

  it('declining a p2p call reports the decline to the server; a LiveKit decline does not', () => {
    act(() => {
      store.dispatch(
        setIncomingCallToken({
          roomJid: 'a-b@conference.x',
          roomName: 'Bob',
          token: '',
          mode: 'p2p',
          callId: 'cp3',
        })
      );
    });
    const view = mount();
    act(() => {
      fireEvent.click(screen.getByLabelText('Decline call'));
    });
    expect(h.reportCallDeclined).toHaveBeenCalledWith('cp3');
    expect(store.getState().call.phase).toBe('idle');
    view.unmount();

    act(() => {
      store.dispatch(
        setIncomingCallToken({ roomJid: 'a-b@conference.x', roomName: 'Bob', token: 't', callId: 'cl' })
      );
    });
    h.reportCallDeclined.mockClear();
    mount();
    act(() => {
      fireEvent.click(screen.getByLabelText('Decline call'));
    });
    expect(h.reportCallDeclined).not.toHaveBeenCalled();
  });
});
