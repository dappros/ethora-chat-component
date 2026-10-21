import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  P2PCallController,
  P2PCallDeps,
  P2PCallParams,
  describeMediaError,
  remoteEndNotice,
} from './P2PCallController';
import type { P2PSignal, P2PSignalName } from './signalStanza';

// ---- fakes ------------------------------------------------------------------

class FakeTrack {
  enabled = true;
  readyState: 'live' | 'ended' = 'live';
  muted = false;
  private listeners = new Map<string, Set<() => void>>();
  constructor(public kind: 'audio' | 'video') {}
  stop() {
    this.readyState = 'ended';
  }
  addEventListener(type: string, fn: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: () => void) {
    this.listeners.get(type)?.delete(fn);
  }
  listenerCount() {
    return Array.from(this.listeners.values()).reduce((n, s) => n + s.size, 0);
  }
  fire(type: string) {
    this.listeners.get(type)?.forEach((fn) => fn());
  }
}

class FakeStream {
  tracks: FakeTrack[];
  constructor(tracks: FakeTrack[] = []) {
    this.tracks = [...tracks];
  }
  getTracks() {
    return [...this.tracks];
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === 'audio');
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === 'video');
  }
  addTrack(t: FakeTrack) {
    if (!this.tracks.includes(t)) this.tracks.push(t);
  }
  removeTrack(t: FakeTrack) {
    this.tracks = this.tracks.filter((x) => x !== t);
  }
}

const makeSender = (track: FakeTrack | null) => {
  const sender: any = {
    track,
    replaceTrack: vi.fn(async (t: FakeTrack | null) => {
      sender.track = t;
    }),
  };
  return sender;
};

class FakePC {
  signalingState = 'stable';
  connectionState = 'new';
  iceConnectionState = 'new';
  localDescription: { type: string; sdp: string } | null = null;
  onicecandidate: ((e: any) => void) | null = null;
  ontrack: ((e: any) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  senders: any[] = [];
  config: any;
  offers = 0;
  closed = false;
  createOffer = vi.fn(async (opts?: { iceRestart?: boolean }) => ({
    type: 'offer',
    sdp: `offer-${++this.offers}${opts?.iceRestart ? '-restart' : ''}`,
  }));
  createAnswer = vi.fn(async () => ({ type: 'answer', sdp: 'answer-1' }));
  setLocalDescription = vi.fn(async (d: any) => {
    if (d.type === 'rollback') {
      this.signalingState = 'stable';
      return;
    }
    this.localDescription = d;
    this.signalingState = d.type === 'offer' ? 'have-local-offer' : 'stable';
  });
  setRemoteDescription = vi.fn(async (d: any) => {
    this.signalingState = d.type === 'offer' ? 'have-remote-offer' : 'stable';
  });
  addIceCandidate = vi.fn(async () => {});
  addTrack = vi.fn((track: FakeTrack) => {
    const s = makeSender(track);
    this.senders.push(s);
    return s;
  });
  addTransceiver = vi.fn(() => {
    const s = makeSender(null);
    this.senders.push(s);
    return { sender: s };
  });
  getConfiguration = vi.fn(() => this.config);
  setConfiguration = vi.fn((c: any) => {
    this.config = c;
  });
  restartIce = vi.fn();
  close = vi.fn(() => {
    this.closed = true;
  });
  constructor(config: any) {
    this.config = config;
  }
  setConn(state: string) {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }
  gather(candidate: string) {
    this.onicecandidate?.({
      candidate: {
        candidate,
        sdpMid: '0',
        sdpMLineIndex: 0,
        toJSON() {
          return { candidate, sdpMid: '0', sdpMLineIndex: 0 };
        },
      },
    });
  }
}

interface Harness {
  controller: P2PCallController;
  pcs: FakePC[];
  sent: Array<{ signal: P2PSignalName; payload: any }>;
  gum: ReturnType<typeof vi.fn>;
  fetchIce: ReturnType<typeof vi.fn>;
  media: FakeTrack[];
  events: Record<string, ReturnType<typeof vi.fn>>;
  pc: () => FakePC;
}

const ICE = [{ urls: 'turn:t.example.com', username: 'u', credential: 'p' }];

const harness = (
  overrides: Partial<P2PCallParams> = {},
  gumImpl?: (c: MediaStreamConstraints) => Promise<any>
): Harness => {
  const pcs: FakePC[] = [];
  const sent: Harness['sent'] = [];
  const media: FakeTrack[] = [];
  const gum = vi.fn(
    gumImpl ||
      (async (c: MediaStreamConstraints) => {
        const tracks: FakeTrack[] = [];
        if (c.audio) tracks.push(new FakeTrack('audio'));
        if (c.video) tracks.push(new FakeTrack('video'));
        media.push(...tracks);
        return new FakeStream(tracks);
      })
  );
  const fetchIce = vi.fn(async () => [
    { urls: 'turn:fresh.example.com', username: 'u2', credential: 'p2' },
  ]);
  const deps: P2PCallDeps = {
    createPeerConnection: (config) => {
      const pc = new FakePC(config);
      pcs.push(pc);
      return pc as any;
    },
    getUserMedia: gum as any,
    createMediaStream: () => new FakeStream() as any,
    fetchIceServers: fetchIce as any,
    sendSignal: (signal, payload) => sent.push({ signal, payload }),
  };
  const events = {
    onNegotiated: vi.fn(),
    onConnected: vi.fn(),
    onRemoteEnd: vi.fn(),
    onFailed: vi.fn(),
    onDisposed: vi.fn(),
  };
  const controller = new P2PCallController(
    {
      callId: 'call-1',
      role: 'caller',
      kind: 'video',
      peerLocal: 'bob',
      iceServers: ICE,
      ...overrides,
    },
    deps,
    events
  );
  return { controller, pcs, sent, gum, fetchIce, media, events, pc: () => pcs[0] };
};

const flush = () => vi.advanceTimersByTimeAsync(0);

const fromPeer = (
  signal: P2PSignalName,
  payload: any,
  from = 'bob'
): P2PSignal => ({
  callId: 'call-1',
  signal,
  payload,
  fromBare: `${from}@x`,
  fromLocal: from,
  ageMs: null,
  delayed: false,
});

const sdpPayload = (type: 'offer' | 'answer', sdp: string) => ({ type, sdp });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

// ---- tests ------------------------------------------------------------------

describe('caller', () => {
  it('gets media, builds the connection with the ICE servers, sends the offer then candidates', async () => {
    const h = harness();
    await h.controller.start();
    await flush();

    expect(h.gum).toHaveBeenCalledTimes(1);
    expect((h.gum.mock.calls[0][0] as any).video).toBeTruthy();
    expect(h.pc().config).toMatchObject({ iceServers: ICE, iceCandidatePoolSize: 2 });
    expect(h.pc().addTrack).toHaveBeenCalledTimes(2); // mic + camera
    expect(h.sent.map((s) => s.signal)).toEqual(['offer']);
    expect(h.sent[0].payload).toEqual({ type: 'offer', sdp: 'offer-1' });
    expect(h.controller.getSnapshot().status).toBe('waiting');

    h.pc().gather('candidate:1 host');
    h.pc().gather('candidate:2 relay');
    expect(h.sent.map((s) => s.signal)).toEqual(['offer', 'candidate', 'candidate']);
  });

  it('completes on the answer and reports connected once media flows', async () => {
    const h = harness();
    await h.controller.start();
    await flush();

    h.controller.receive(fromPeer('answer', sdpPayload('answer', 'answer-x')));
    await flush();
    expect(h.pc().setRemoteDescription).toHaveBeenCalledWith({
      type: 'answer',
      sdp: 'answer-x',
    });
    expect(h.events.onNegotiated).toHaveBeenCalledTimes(1);
    expect(h.controller.getSnapshot().status).toBe('connecting');

    h.pc().setConn('connected');
    expect(h.events.onConnected).toHaveBeenCalledTimes(1);
    expect(h.controller.getSnapshot().status).toBe('connected');
  });

  it('an audio call asks for no camera and adds no video section', async () => {
    const h = harness({ kind: 'audio' });
    await h.controller.start();
    await flush();
    expect((h.gum.mock.calls[0][0] as any).video).toBe(false);
    expect(h.pc().addTrack).toHaveBeenCalledTimes(1);
    expect(h.pc().addTransceiver).not.toHaveBeenCalled();
    expect(h.controller.getSnapshot().camEnabled).toBe(false);
  });

  it('re-sends the offer and candidates while unanswered, and stops once answered', async () => {
    const h = harness();
    await h.controller.start();
    await flush();
    h.pc().gather('candidate:1 host');

    await vi.advanceTimersByTimeAsync(4000);
    expect(h.sent.filter((s) => s.signal === 'offer')).toHaveLength(2);
    expect(h.sent.filter((s) => s.signal === 'candidate')).toHaveLength(2);

    h.controller.receive(fromPeer('answer', sdpPayload('answer', 'a')));
    await flush();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.sent.filter((s) => s.signal === 'offer')).toHaveLength(2);
  });

  it('fails the call if nobody connects within the connect timeout', async () => {
    const h = harness();
    await h.controller.start();
    await flush();
    h.controller.receive(fromPeer('answer', sdpPayload('answer', 'a')));
    await flush();

    await vi.advanceTimersByTimeAsync(25_000);
    expect(h.events.onFailed).toHaveBeenCalledWith('Could not connect the call');
    expect(h.sent.at(-1)).toEqual({
      signal: 'end',
      payload: { reason: 'connect-timeout' },
    });
    expect(h.pc().closed).toBe(true);
  });
});

describe('media permission failure', () => {
  it('ends the call with a visible reason and tells the peer', async () => {
    const err = Object.assign(new Error('Permission denied'), {
      name: 'NotAllowedError',
    });
    const h = harness({}, async () => {
      throw err;
    });
    await h.controller.start();
    await flush();

    expect(h.events.onFailed).toHaveBeenCalledWith(
      'Camera or microphone permission denied'
    );
    expect(h.sent).toEqual([
      { signal: 'end', payload: { reason: 'media-error' } },
    ]);
    expect(h.pcs).toHaveLength(0); // never built a connection
    expect(h.events.onDisposed).toHaveBeenCalledWith({ started: true });
    expect(h.controller.getSnapshot().status).toBe('failed');
  });

  it('maps common getUserMedia errors to messages', () => {
    expect(describeMediaError({ name: 'NotFoundError' })).toMatch(/No camera or microphone/);
    expect(describeMediaError({ name: 'NotReadableError' })).toMatch(/already in use/);
    expect(describeMediaError(new Error('boom'))).toMatch(/Could not access/);
  });

  it('describes a failure end from the peer, and a normal hang up as nothing', () => {
    expect(remoteEndNotice('media-error')).toMatch(/camera or microphone/);
    expect(remoteEndNotice('connection-failed')).toMatch(/could not be connected/);
    expect(remoteEndNotice('hangup')).toBeNull();
    expect(remoteEndNotice('declined')).toBeNull();
  });
});

describe('callee', () => {
  it('buffers the offer and candidates received while ringing, answers after accept', async () => {
    const h = harness({ role: 'callee', peerLocal: 'bob' });
    // Everything arrives before the user accepts (the controller is not started).
    h.controller.receive(fromPeer('offer', sdpPayload('offer', 'offer-from-bob')));
    h.controller.receive(
      fromPeer('candidate', { candidate: 'candidate:1 host', sdpMid: '0', sdpMLineIndex: 0 })
    );
    await flush();
    expect(h.pcs).toHaveLength(0);
    expect(h.gum).not.toHaveBeenCalled();

    await h.controller.start(); // user accepted
    await flush();

    expect(h.pc().setRemoteDescription).toHaveBeenCalledWith({
      type: 'offer',
      sdp: 'offer-from-bob',
    });
    expect(h.pc().addIceCandidate).toHaveBeenCalledTimes(1);
    expect(h.sent.map((s) => s.signal)).toEqual(['answer']);
    expect(h.sent[0].payload).toEqual({ type: 'answer', sdp: 'answer-1' });
    expect(h.events.onNegotiated).toHaveBeenCalledTimes(1);

    // The callee's own candidates only go out after the answer.
    h.pc().gather('candidate:9 relay');
    expect(h.sent.map((s) => s.signal)).toEqual(['answer', 'candidate']);
  });

  it('ignores a second, different offer for the same call (first offer wins)', async () => {
    const h = harness({ role: 'callee' });
    h.controller.receive(fromPeer('offer', sdpPayload('offer', 'first')));
    h.controller.receive(fromPeer('offer', sdpPayload('offer', 'second')));
    await h.controller.start();
    await flush();
    expect(h.pc().setRemoteDescription).toHaveBeenCalledTimes(1);
    expect(h.pc().setRemoteDescription).toHaveBeenCalledWith({
      type: 'offer',
      sdp: 'first',
    });
  });

  it('a caller cancel while still ringing ends the call without ever touching media', async () => {
    const h = harness({ role: 'callee' });
    h.controller.receive(fromPeer('offer', sdpPayload('offer', 'o')));
    h.controller.receive(fromPeer('end', { reason: 'hangup' }));
    expect(h.events.onRemoteEnd).toHaveBeenCalledWith('hangup');
    expect(h.gum).not.toHaveBeenCalled();
    expect(h.sent).toEqual([]); // no echo of the end
    expect(h.events.onDisposed).toHaveBeenCalledWith({ started: false });
  });

  it('an end that arrives while the permission prompt is open releases the media afterwards', async () => {
    let resolveGum: (s: FakeStream) => void = () => {};
    const tracks = [new FakeTrack('audio')];
    const h = harness({ role: 'callee' }, () => new Promise((r) => (resolveGum = r)));
    const started = h.controller.start();
    h.controller.receive(fromPeer('end', { reason: 'hangup' }));
    expect(h.events.onRemoteEnd).toHaveBeenCalled();

    resolveGum(new FakeStream(tracks));
    await started;
    await flush();
    expect(tracks[0].readyState).toBe('ended');
    expect(h.pcs).toHaveLength(0);
  });

  it('ignores signals from anybody but the expected peer', async () => {
    const h = harness({ role: 'callee', peerLocal: 'bob' });
    h.controller.receive(fromPeer('offer', sdpPayload('offer', 'evil'), 'mallory'));
    h.controller.receive(fromPeer('end', { reason: 'x' }, 'mallory'));
    expect(h.events.onRemoteEnd).not.toHaveBeenCalled();
    await h.controller.start();
    await flush();
    expect(h.pc().setRemoteDescription).not.toHaveBeenCalled();
  });

  it('fetches ICE servers itself when the call-token carried none', async () => {
    const h = harness({ role: 'callee', iceServers: [] });
    h.controller.receive(fromPeer('offer', sdpPayload('offer', 'o')));
    await h.controller.start();
    await flush();
    expect(h.fetchIce).toHaveBeenCalledTimes(1);
    expect((h.pc().config.iceServers as any[])[0].urls).toBe('turn:fresh.example.com');
  });
});

describe('cleanup on every exit path', () => {
  it('dispose stops tracks, closes the connection, detaches listeners and tells the peer once', async () => {
    const h = harness();
    await h.controller.start();
    await flush();
    const pc = h.pc();
    const remote = new FakeTrack('video');
    pc.ontrack?.({ track: remote });
    expect(remote.listenerCount()).toBe(3);

    h.controller.dispose();
    h.controller.dispose(); // idempotent

    expect(h.media.every((t) => t.readyState === 'ended')).toBe(true);
    expect(pc.close).toHaveBeenCalledTimes(1);
    expect(pc.onicecandidate).toBeNull();
    expect(pc.ontrack).toBeNull();
    expect(pc.onconnectionstatechange).toBeNull();
    expect(remote.listenerCount()).toBe(0);
    expect(h.sent.filter((s) => s.signal === 'end')).toHaveLength(1);
    expect(h.events.onDisposed).toHaveBeenCalledTimes(1);

    // Nothing fires after disposal: no timers, no signals.
    const sentBefore = h.sent.length;
    await vi.advanceTimersByTimeAsync(60_000);
    h.controller.receive(fromPeer('answer', sdpPayload('answer', 'late')));
    await flush();
    expect(h.sent.length).toBe(sentBefore);
    expect(h.events.onNegotiated).not.toHaveBeenCalled();
  });

  it('hangup sends one end and releases everything', async () => {
    const h = harness();
    await h.controller.start();
    await flush();
    h.controller.hangup();
    expect(h.sent.filter((s) => s.signal === 'end')).toEqual([
      { signal: 'end', payload: { reason: 'hangup' } },
    ]);
    expect(h.pc().closed).toBe(true);
  });

  it('a remote end releases media and does not echo an end back', async () => {
    const h = harness();
    await h.controller.start();
    await flush();
    h.controller.receive(fromPeer('end', { reason: 'hangup' }));
    expect(h.events.onRemoteEnd).toHaveBeenCalledWith('hangup');
    expect(h.sent.filter((s) => s.signal === 'end')).toHaveLength(0);
    expect(h.media.every((t) => t.readyState === 'ended')).toBe(true);
    expect(h.pc().closed).toBe(true);
  });

  it('a negotiation error fails cleanly instead of hanging', async () => {
    const h = harness();
    await h.controller.start();
    await flush();
    h.pc().setRemoteDescription.mockRejectedValueOnce(new Error('bad sdp'));
    h.controller.receive(fromPeer('answer', sdpPayload('answer', 'garbage')));
    await flush();
    expect(h.events.onFailed).toHaveBeenCalledWith('Could not set up the call');
    expect(h.pc().closed).toBe(true);
  });
});

describe('ICE restart', () => {
  const connect = async (h: Harness) => {
    await h.controller.start();
    await flush();
    h.controller.receive(fromPeer('answer', sdpPayload('answer', 'a')));
    await flush();
    h.pc().setConn('connected');
  };

  it('after a lasting disconnect, restarts once with fresh credentials and recovers', async () => {
    const h = harness();
    await connect(h);

    h.pc().setConn('disconnected');
    expect(h.controller.getSnapshot().status).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(2999);
    expect(h.pc().restartIce).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    await flush();

    expect(h.fetchIce).toHaveBeenCalledTimes(1);
    expect(h.pc().setConfiguration).toHaveBeenCalledTimes(1);
    expect(h.pc().config.iceServers[0].urls).toBe('turn:fresh.example.com');
    expect(h.pc().restartIce).toHaveBeenCalledTimes(1);
    expect(h.pc().createOffer).toHaveBeenLastCalledWith({ iceRestart: true });
    expect(h.sent.at(-1)).toEqual({
      signal: 'offer',
      payload: { type: 'offer', sdp: 'offer-2-restart' },
    });

    // The peer answers the restart offer and the connection comes back.
    h.controller.receive(fromPeer('answer', sdpPayload('answer', 'a2')));
    await flush();
    h.pc().setConn('connected');
    expect(h.controller.getSnapshot().status).toBe('connected');
    expect(h.events.onFailed).not.toHaveBeenCalled();
    expect(h.events.onConnected).toHaveBeenCalledTimes(1);

    // The restart deadline no longer matters.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.events.onFailed).not.toHaveBeenCalled();
  });

  it('a disconnect that heals on its own never restarts', async () => {
    const h = harness();
    await connect(h);
    h.pc().setConn('disconnected');
    await vi.advanceTimersByTimeAsync(1500);
    h.pc().setConn('connected');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.pc().restartIce).not.toHaveBeenCalled();
  });

  it('failed restarts immediately; if the restart does not bring it back the call fails', async () => {
    const h = harness();
    await connect(h);
    h.pc().setConn('failed');
    await flush();
    expect(h.pc().restartIce).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(15_000);
    expect(h.events.onFailed).toHaveBeenCalledWith('Connection lost');
    expect(h.sent.at(-1)).toEqual({
      signal: 'end',
      payload: { reason: 'connection-failed' },
    });
    expect(h.pc().closed).toBe(true);
  });

  it('keeps the old credentials when the refresh endpoint fails', async () => {
    const h = harness();
    h.fetchIce.mockResolvedValue(null);
    await connect(h);
    h.pc().setConn('failed');
    await flush();
    expect(h.pc().setConfiguration).not.toHaveBeenCalled();
    expect(h.pc().restartIce).toHaveBeenCalledTimes(1);
  });

  it('answers a restart offer from the peer (renegotiation) on the callee side', async () => {
    const h = harness({ role: 'callee' });
    h.controller.receive(fromPeer('offer', sdpPayload('offer', 'o1')));
    await h.controller.start();
    await flush();
    h.pc().setConn('connected');

    h.controller.receive(fromPeer('offer', sdpPayload('offer', 'o2-restart')));
    await flush();
    expect(h.pc().setRemoteDescription).toHaveBeenLastCalledWith({
      type: 'offer',
      sdp: 'o2-restart',
    });
    expect(h.sent.filter((s) => s.signal === 'answer')).toHaveLength(2);
  });

  it('glare: when both restart, the callee rolls its own offer back and answers', async () => {
    const h = harness({ role: 'callee' });
    h.controller.receive(fromPeer('offer', sdpPayload('offer', 'o1')));
    await h.controller.start();
    await flush();
    h.pc().setConn('connected');

    h.pc().setConn('failed'); // callee restarts too
    await flush();
    expect(h.pc().signalingState).toBe('have-local-offer');

    h.controller.receive(fromPeer('offer', sdpPayload('offer', 'o2-from-caller')));
    await flush();
    expect(h.pc().setLocalDescription).toHaveBeenCalledWith({ type: 'rollback' });
    expect(h.sent.at(-1)?.signal).toBe('answer');
  });
});

describe('mute and camera', () => {
  it('toggles the microphone by disabling the track', async () => {
    const h = harness();
    await h.controller.start();
    await flush();
    h.controller.toggleMic();
    expect(h.controller.getSnapshot().micEnabled).toBe(false);
    expect(h.media.find((t) => t.kind === 'audio')!.enabled).toBe(false);
    h.controller.toggleMic();
    expect(h.controller.getSnapshot().micEnabled).toBe(true);
  });

  it('camera off releases the device and stops sending; on re-opens it without renegotiating', async () => {
    const h = harness();
    await h.controller.start();
    await flush();
    const cam = h.media.find((t) => t.kind === 'video')!;
    const sender = h.pc().senders.find((s) => s.track === cam);

    await h.controller.toggleCamera();
    expect(cam.readyState).toBe('ended');
    expect(sender.replaceTrack).toHaveBeenLastCalledWith(null);
    expect(h.controller.getSnapshot().camEnabled).toBe(false);

    await h.controller.toggleCamera();
    const fresh = h.media.filter((t) => t.kind === 'video').at(-1)!;
    expect(fresh).not.toBe(cam);
    expect(sender.replaceTrack).toHaveBeenLastCalledWith(fresh);
    expect(h.controller.getSnapshot().camEnabled).toBe(true);
    expect(h.pc().createOffer).toHaveBeenCalledTimes(1);

    h.controller.dispose();
    expect(fresh.readyState).toBe('ended');
  });

  it('a camera that cannot be re-enabled leaves a notice, not a dead call', async () => {
    let calls = 0;
    const h = harness({}, async (c) => {
      calls += 1;
      if (calls > 1) {
        throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
      }
      return new FakeStream([
        ...(c.audio ? [new FakeTrack('audio')] : []),
        ...(c.video ? [new FakeTrack('video')] : []),
      ]);
    });
    await h.controller.start();
    await flush();
    await h.controller.toggleCamera(); // off
    await h.controller.toggleCamera(); // on -> denied
    expect(h.controller.getSnapshot().notice).toMatch(/permission denied/);
    expect(h.events.onFailed).not.toHaveBeenCalled();
    h.controller.dismissNotice();
    expect(h.controller.getSnapshot().notice).toBeNull();
  });

  it('a video call that starts with the camera off keeps a video section for later', async () => {
    const h = harness({ startWithCameraOn: false });
    await h.controller.start();
    await flush();
    expect((h.gum.mock.calls[0][0] as any).video).toBe(false);
    expect(h.pc().addTransceiver).toHaveBeenCalledWith('video', { direction: 'sendrecv' });
    expect(h.controller.getSnapshot().camEnabled).toBe(false);
  });
});

describe('remote media', () => {
  it('collects remote tracks into one stream and tracks whether the picture is live', async () => {
    const h = harness();
    await h.controller.start();
    await flush();
    const audio = new FakeTrack('audio');
    const video = new FakeTrack('video');
    video.muted = true;
    h.pc().ontrack?.({ track: audio });
    h.pc().ontrack?.({ track: video });

    const snap = h.controller.getSnapshot();
    expect(snap.remoteStream?.getTracks()).toHaveLength(2);
    expect(snap.remoteVideoLive).toBe(false);

    video.muted = false;
    video.fire('unmute');
    expect(h.controller.getSnapshot().remoteVideoLive).toBe(true);
    video.fire('ended');
    video.readyState = 'ended';
    video.fire('ended');
    expect(h.controller.getSnapshot().remoteVideoLive).toBe(false);
  });
});
