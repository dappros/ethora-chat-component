import type { IceServerConfig } from '../callMode';
import { IceAction, IceRestartPolicy, P2PConnState } from './icePolicy';
import { NegotiatorCommand, P2PNegotiator, P2PRole } from './negotiator';
import type {
  P2PCandidatePayload,
  P2PSdpPayload,
  P2PSignal,
  P2PSignalName,
  P2PSignalPayload,
} from './signalStanza';

// One peer to peer call, from getUserMedia to hang-up. Everything that talks
// to the outside world is injected (RTCPeerConnection, getUserMedia, the
// signal transport, ICE credential refresh), so the class is plain TypeScript
// and runs under a fake connection in unit tests. The decisions live in the
// small pure modules next to it (negotiator, icePolicy, signalStanza); this
// class only wires them to a real connection and cleans up after itself.
//
// Media encryption: a WebRTC peer connection already encrypts media between
// the two peers with DTLS-SRTP, so the LiveKit insertable-streams E2EE layer
// (and its OMEMO key exchange) is deliberately NOT applied on this path.

export type P2PStatus =
  | 'preparing'
  | 'waiting'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'ended';

export interface P2PSnapshot {
  status: P2PStatus;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  micEnabled: boolean;
  camEnabled: boolean;
  remoteVideoLive: boolean;
  /** Dismissible, non-fatal hint (e.g. the camera could not be re-enabled). */
  notice: string | null;
}

export interface P2PCallParams {
  callId: string;
  role: P2PRole;
  kind: 'audio' | 'video';
  /** Peer's xmpp localpart; signals from anyone else are ignored. */
  peerLocal: string;
  iceServers: IceServerConfig[];
  startWithMicOn?: boolean;
  startWithCameraOn?: boolean;
}

export interface P2PCallDeps {
  createPeerConnection: (config: RTCConfiguration) => RTCPeerConnection;
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createMediaStream: () => MediaStream;
  /** Fresh credentials; null/empty keeps the servers already in use. */
  fetchIceServers: () => Promise<IceServerConfig[] | null>;
  sendSignal: (signal: P2PSignalName, payload: P2PSignalPayload) => void;
  log?: (message: string, detail?: unknown) => void;
}

export interface P2PCallEvents {
  /** The offer/answer exchange completed: media is now negotiating. */
  onNegotiated?: () => void;
  /** Media is flowing for the first time. */
  onConnected?: () => void;
  /** The peer ended the call (hang up, decline, their own failure). */
  onRemoteEnd?: (reason: string) => void;
  /** The call failed locally; the message is meant for the user. */
  onFailed?: (message: string) => void;
  /**
   * Called exactly once when the call's resources are released. `started` is
   * false for a callee that never accepted (nothing was negotiated).
   */
  onDisposed?: (info: { started: boolean }) => void;
}

export interface P2PTimings {
  connectTimeoutMs: number;
  offerResendMs: number[];
}

const DEFAULT_TIMINGS: P2PTimings = {
  connectTimeoutMs: 25_000,
  // While nobody has answered, the offer and candidates are sent again: a
  // callee that was still reconnecting (woken by push) missed the first copy,
  // and the stanzas are not stored for later. Duplicates are no-ops there.
  offerResendMs: [4_000, 10_000],
};

export const describeMediaError = (error: unknown): string => {
  const name = (error as { name?: string })?.name || '';
  const text = String((error as Error)?.message || '').toLowerCase();
  if (
    name === 'NotAllowedError' ||
    name === 'SecurityError' ||
    text.includes('permission') ||
    text.includes('denied')
  ) {
    return 'Camera or microphone permission denied';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No camera or microphone found on this device';
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return 'Your camera or microphone is already in use by another app';
  }
  return 'Could not access your camera or microphone';
};

/**
 * What to show when the PEER ended the call for a reason that is a failure
 * rather than a normal hang up / decline. Null means "just close the call".
 */
export const remoteEndNotice = (reason: string): string | null => {
  switch (reason) {
    case 'media-error':
      return 'The other person could not access their camera or microphone';
    case 'connect-timeout':
    case 'connection-failed':
    case 'negotiation-error':
    case 'setup-error':
      return 'The call could not be connected';
    default:
      return null;
  }
};

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};
// How often the received video is checked for a stall, and how many checks in a
// row without a new decoded frame count as "the peer stopped sending video".
const REMOTE_VIDEO_POLL_MS = 1_000;
const REMOTE_VIDEO_STALL_POLLS = 2;
const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  facingMode: 'user',
};

export class P2PCallController {
  readonly callId: string;
  readonly role: P2PRole;
  readonly kind: 'audio' | 'video';

  private readonly params: P2PCallParams;
  private readonly deps: P2PCallDeps;
  private readonly events: P2PCallEvents;
  private readonly timings: P2PTimings;
  private readonly negotiator: P2PNegotiator;
  private readonly policy = new IceRestartPolicy();

  private snapshot: P2PSnapshot;
  private readonly listeners = new Set<() => void>();

  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private audioTrack: MediaStreamTrack | null = null;
  private videoTrack: MediaStreamTrack | null = null;
  private videoSender: RTCRtpSender | null = null;
  private ownedTracks: MediaStreamTrack[] = [];
  private remoteStream: MediaStream | null = null;
  private remoteCleanups: Array<() => void> = [];

  private queue: Promise<void> = Promise.resolve();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  private deadlineTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;

  private started = false;
  private disposed = false;
  private endSent = false;
  private connectedOnce = false;
  private negotiated = false;
  private cameraBusy = false;
  private remoteVideoWatched = false;
  private remoteVideoStalled = false;
  private lastConn: P2PConnState | null = null;

  // Outgoing candidates wait until the offer/answer they belong to is out, so
  // the peer never sees a candidate before its description.
  private candidateGateOpen = false;
  private heldOutgoingCandidates: P2PCandidatePayload[] = [];
  private sentCandidates: P2PCandidatePayload[] = [];
  private lastOffer: P2PSdpPayload | null = null;

  constructor(
    params: P2PCallParams,
    deps: P2PCallDeps,
    events: P2PCallEvents = {},
    timings: Partial<P2PTimings> = {}
  ) {
    this.params = params;
    this.deps = deps;
    this.events = events;
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.callId = params.callId;
    this.role = params.role;
    this.kind = params.kind;
    this.negotiator = new P2PNegotiator({
      callId: params.callId,
      role: params.role,
      peerLocal: params.peerLocal,
    });
    this.snapshot = {
      status: 'preparing',
      localStream: null,
      remoteStream: null,
      micEnabled: params.startWithMicOn !== false,
      camEnabled: params.kind === 'video' && params.startWithCameraOn !== false,
      remoteVideoLive: false,
      notice: null,
    };
  }

  // ---- observable state (useSyncExternalStore friendly) -------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): P2PSnapshot => this.snapshot;

  private update(patch: Partial<P2PSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of Array.from(this.listeners)) listener();
  }

  private log(message: string, detail?: unknown): void {
    this.deps.log?.(`[p2p ${this.callId}] ${message}`, detail);
  }

  // ---- timers -------------------------------------------------------------

  private later(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
    const id = setTimeout(() => {
      this.timers.delete(id);
      if (!this.disposed) fn();
    }, ms);
    this.timers.add(id);
    return id;
  }

  private cancel(id: ReturnType<typeof setTimeout> | null): void {
    if (id === null) return;
    clearTimeout(id);
    this.timers.delete(id);
  }

  // ---- lifecycle ----------------------------------------------------------

  /**
   * Caller: get media, build the connection, offer. Callee: get media, build
   * the connection, then apply the offer that may already be waiting. Safe to
   * call once; every failure ends the call with a message instead of throwing.
   */
  async start(): Promise<void> {
    if (this.started || this.disposed) return;
    this.started = true;
    this.update({ status: 'preparing' });

    // Credentials are fetched while the permission prompt is open.
    const icePromise: Promise<IceServerConfig[]> =
      this.params.iceServers.length > 0
        ? Promise.resolve(this.params.iceServers)
        : this.deps
            .fetchIceServers()
            .then((list) => list || [])
            .catch(() => []);

    try {
      await this.acquireMedia();
    } catch (error) {
      this.log('getUserMedia failed', error);
      this.fail(describeMediaError(error), 'media-error');
      return;
    }
    if (this.disposed) {
      this.releaseMedia();
      return;
    }

    const servers = await icePromise;
    if (this.disposed) return;

    try {
      this.createConnection(servers);
    } catch (error) {
      this.log('peer connection setup failed', error);
      this.fail('Could not start the call', 'setup-error');
      return;
    }

    this.enqueue(async () => {
      await this.runCommands(this.negotiator.markReady());
      if (this.role === 'caller' && !this.disposed) {
        await this.sendOffer(false);
        this.update({ status: 'waiting' });
        this.scheduleOfferResends();
      }
    });
  }

  /** Feed a signal from the peer (already routed by callId). */
  receive(signal: P2PSignal): void {
    if (this.disposed) return;
    const commands = this.negotiator.receive(signal);
    // An end must act immediately: it can arrive while the permission prompt
    // is still open, before the connection (and so the job queue) is running.
    const end = commands.find((c) => c.type === 'remote-end');
    if (end && end.type === 'remote-end') {
      this.handleRemoteEnd(end.reason);
      return;
    }
    if (commands.length > 0) this.enqueue(() => this.runCommands(commands));
  }

  /** Local user hung up (or cancelled): tell the peer and release everything. */
  hangup(reason = 'hangup'): void {
    if (this.disposed) return;
    this.sendEnd(reason);
    this.dispose();
  }

  /**
   * Release every resource: timers, listeners, media tracks, the connection.
   * Idempotent, safe from any exit path. Tells the peer unless it is already
   * known to be over.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.started && !this.negotiator.isEnded) this.sendEnd('hangup');

    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
    this.negotiator.stop();

    for (const cleanup of this.remoteCleanups) {
      try {
        cleanup();
      } catch {
        /* listener already gone */
      }
    }
    this.remoteCleanups = [];

    const pc = this.pc;
    this.pc = null;
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      try {
        pc.close();
      } catch {
        /* already closed */
      }
    }
    this.releaseMedia();

    this.snapshot = {
      ...this.snapshot,
      status: this.snapshot.status === 'failed' ? 'failed' : 'ended',
      localStream: null,
      remoteStream: null,
      remoteVideoLive: false,
    };
    for (const listener of Array.from(this.listeners)) listener();
    this.listeners.clear();
    this.events.onDisposed?.({ started: this.started });
  }

  private sendEnd(reason: string): void {
    if (this.endSent) return;
    this.endSent = true;
    try {
      this.deps.sendSignal('end', { reason });
    } catch (error) {
      this.log('end signal failed', error);
    }
  }

  private fail(message: string, reason: string): void {
    if (this.disposed) return;
    this.sendEnd(reason);
    this.snapshot = { ...this.snapshot, status: 'failed', notice: message };
    this.events.onFailed?.(message);
    this.dispose();
  }

  private handleRemoteEnd(reason: string): void {
    if (this.disposed) return;
    // The peer already knows; do not echo an end back.
    this.endSent = true;
    this.snapshot = { ...this.snapshot, status: 'ended' };
    this.events.onRemoteEnd?.(reason);
    this.dispose();
  }

  // ---- media --------------------------------------------------------------

  private async acquireMedia(): Promise<void> {
    const wantVideo =
      this.kind === 'video' && this.params.startWithCameraOn !== false;
    const stream = await this.deps.getUserMedia({
      audio: AUDIO_CONSTRAINTS,
      video: wantVideo ? VIDEO_CONSTRAINTS : false,
    });
    this.localStream = stream;
    this.ownedTracks = stream.getTracks();
    this.audioTrack = stream.getAudioTracks()[0] || null;
    this.videoTrack = stream.getVideoTracks()[0] || null;
    if (this.audioTrack && this.params.startWithMicOn === false) {
      this.audioTrack.enabled = false;
    }
    this.update({
      localStream: stream,
      micEnabled: !!this.audioTrack && this.audioTrack.enabled,
      camEnabled: !!this.videoTrack,
    });
  }

  private releaseMedia(): void {
    const tracks = new Set<MediaStreamTrack>(this.ownedTracks);
    this.localStream?.getTracks().forEach((t) => tracks.add(t));
    for (const track of tracks) {
      try {
        track.stop();
      } catch {
        /* already stopped */
      }
    }
    this.ownedTracks = [];
    this.audioTrack = null;
    this.videoTrack = null;
    this.videoSender = null;
    this.localStream = null;
  }

  toggleMic(): void {
    if (this.disposed || !this.audioTrack) return;
    this.audioTrack.enabled = !this.audioTrack.enabled;
    this.update({ micEnabled: this.audioTrack.enabled });
  }

  /**
   * Turning the camera off stops sending video and releases the device (the
   * camera light goes out); turning it on opens the camera again and swaps it
   * into the existing sender, so no renegotiation is needed.
   */
  async toggleCamera(): Promise<void> {
    if (
      this.disposed ||
      this.kind !== 'video' ||
      !this.videoSender ||
      !this.localStream ||
      this.cameraBusy
    ) {
      return;
    }
    this.cameraBusy = true;
    try {
      if (this.videoTrack) {
        const track = this.videoTrack;
        this.videoTrack = null;
        try {
          await this.videoSender.replaceTrack(null);
        } catch (error) {
          this.log('replaceTrack(null) failed', error);
        }
        try {
          this.localStream.removeTrack(track);
        } catch {
          /* not in the stream */
        }
        track.stop();
        this.ownedTracks = this.ownedTracks.filter((t) => t !== track);
        this.update({ camEnabled: false, notice: null });
      } else {
        const media = await this.deps.getUserMedia({
          video: VIDEO_CONSTRAINTS,
        });
        const track = media.getVideoTracks()[0];
        if (!track) return;
        if (this.disposed || !this.videoSender || !this.localStream) {
          track.stop();
          return;
        }
        await this.videoSender.replaceTrack(track);
        this.localStream.addTrack(track);
        this.videoTrack = track;
        this.ownedTracks.push(track);
        this.update({ camEnabled: true, notice: null });
      }
    } catch (error) {
      this.log('camera toggle failed', error);
      this.update({ notice: describeMediaError(error) });
    } finally {
      this.cameraBusy = false;
    }
  }

  dismissNotice(): void {
    if (this.snapshot.notice) this.update({ notice: null });
  }

  // ---- peer connection ----------------------------------------------------

  private createConnection(servers: IceServerConfig[]): void {
    const pc = this.deps.createPeerConnection({
      iceServers: servers as RTCIceServer[],
      iceCandidatePoolSize: 2,
    });
    this.pc = pc;

    pc.onicecandidate = (event) => {
      const c = event.candidate;
      if (!c || !c.candidate) return;
      const json: P2PCandidatePayload =
        typeof c.toJSON === 'function'
          ? (c.toJSON() as P2PCandidatePayload)
          : {
              candidate: c.candidate,
              sdpMid: c.sdpMid,
              sdpMLineIndex: c.sdpMLineIndex,
            };
      if (this.candidateGateOpen) this.emitCandidate(json);
      else this.heldOutgoingCandidates.push(json);
    };
    pc.ontrack = (event) => this.onRemoteTrack(event.track);
    pc.onconnectionstatechange = () => this.onConnectionState();
    pc.oniceconnectionstatechange = () => this.onConnectionState();

    const stream = this.localStream;
    if (stream) {
      if (this.audioTrack) pc.addTrack(this.audioTrack, stream);
      if (this.kind === 'video') {
        if (this.videoTrack) {
          this.videoSender = pc.addTrack(this.videoTrack, stream);
        } else {
          // Camera starts off: keep a video section so it can be turned on
          // later without renegotiating.
          this.videoSender = pc.addTransceiver('video', {
            direction: 'sendrecv',
          }).sender;
        }
      }
    }
  }

  private emitCandidate(candidate: P2PCandidatePayload): void {
    this.sentCandidates.push(candidate);
    this.deps.sendSignal('candidate', candidate);
  }

  private openCandidateGate(): void {
    this.candidateGateOpen = true;
    const held = this.heldOutgoingCandidates;
    this.heldOutgoingCandidates = [];
    for (const candidate of held) this.emitCandidate(candidate);
  }

  private onRemoteTrack(track: MediaStreamTrack): void {
    if (!this.remoteStream) this.remoteStream = this.deps.createMediaStream();
    const stream = this.remoteStream;
    if (!stream.getTracks().includes(track)) stream.addTrack(track);

    const refresh = () => this.update({ remoteVideoLive: this.remoteVideoLive() });
    track.addEventListener('mute', refresh);
    track.addEventListener('unmute', refresh);
    track.addEventListener('ended', refresh);
    this.remoteCleanups.push(() => {
      track.removeEventListener('mute', refresh);
      track.removeEventListener('unmute', refresh);
      track.removeEventListener('ended', refresh);
    });
    this.update({
      remoteStream: stream,
      remoteVideoLive: this.remoteVideoLive(),
    });
  }

  private remoteVideoLive(): boolean {
    return (
      !this.remoteVideoStalled &&
      (this.remoteStream?.getVideoTracks() || []).some(
        (t) => t.readyState === 'live' && !t.muted
      )
    );
  }

  /**
   * A peer that turns its camera off drops the sender's track (replaceTrack
   * with null). Chrome does not mute the receiving track for that, so the
   * `mute` event alone leaves the last frame frozen on screen. Frames that stop
   * arriving are the signal that does work in every browser, so the received
   * video is polled and a stall counts as "no live picture" until frames flow
   * again.
   */
  private watchRemoteVideo(): void {
    if (this.remoteVideoWatched || this.kind !== 'video') return;
    this.remoteVideoWatched = true;
    let lastFrames = -1;
    let stalledPolls = 0;
    const poll = async (): Promise<void> => {
      const pc = this.pc;
      if (!pc || this.disposed) return;
      let frames: number | null = null;
      try {
        if (typeof pc.getStats === 'function') {
          const report = await pc.getStats();
          report.forEach((entry: any) => {
            if (
              entry.type === 'inbound-rtp' &&
              (entry.kind || entry.mediaType) === 'video' &&
              typeof entry.framesDecoded === 'number'
            ) {
              frames = entry.framesDecoded;
            }
          });
        }
      } catch {
        frames = null;
      }
      if (this.disposed) return;
      if (frames !== null) {
        stalledPolls = frames === lastFrames ? stalledPolls + 1 : 0;
        lastFrames = frames;
        const stalled = stalledPolls >= REMOTE_VIDEO_STALL_POLLS;
        if (stalled !== this.remoteVideoStalled) {
          this.remoteVideoStalled = stalled;
          this.update({ remoteVideoLive: this.remoteVideoLive() });
        }
      }
      this.later(() => void poll(), REMOTE_VIDEO_POLL_MS);
    };
    this.later(() => void poll(), REMOTE_VIDEO_POLL_MS);
  }

  // ---- negotiation --------------------------------------------------------

  private enqueue(job: () => Promise<void>): void {
    this.queue = this.queue
      .then(() => (this.disposed ? undefined : job()))
      .catch((error) => {
        this.log('negotiation step failed', error);
        // A broken negotiation cannot recover on its own.
        this.fail('Could not set up the call', 'negotiation-error');
      });
  }

  private async sendOffer(iceRestart: boolean): Promise<void> {
    const pc = this.pc;
    if (!pc || this.disposed) return;
    this.candidateGateOpen = false;
    const offer = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
    await pc.setLocalDescription(offer);
    if (this.disposed) return;
    const sdp = pc.localDescription?.sdp || offer.sdp || '';
    this.negotiator.markLocalOffer();
    this.lastOffer = { type: 'offer', sdp };
    this.sentCandidates = [];
    this.deps.sendSignal('offer', this.lastOffer);
    this.openCandidateGate();
  }

  private scheduleOfferResends(): void {
    for (const ms of this.timings.offerResendMs) {
      this.later(() => {
        if (!this.negotiator.awaitingAnswer || !this.lastOffer) return;
        this.log('re-sending offer');
        this.deps.sendSignal('offer', this.lastOffer);
        for (const candidate of this.sentCandidates) {
          this.deps.sendSignal('candidate', candidate);
        }
      }, ms);
    }
  }

  private async runCommands(commands: NegotiatorCommand[]): Promise<void> {
    for (const command of commands) {
      if (this.disposed || !this.pc) return;
      switch (command.type) {
        case 'apply-offer':
          await this.applyOffer(command);
          break;
        case 'apply-answer':
          await this.pc.setRemoteDescription({
            type: 'answer',
            sdp: command.sdp,
          });
          await this.runCommands(this.negotiator.markRemoteApplied());
          this.onNegotiated();
          break;
        case 'add-candidate':
          try {
            await this.pc.addIceCandidate(command.candidate);
          } catch (error) {
            // A candidate from a superseded ICE session; harmless.
            this.log('addIceCandidate ignored', error);
          }
          break;
        case 'remote-end':
          // Handled synchronously in receive(); never queued.
          break;
      }
    }
  }

  private async applyOffer(
    command: Extract<NegotiatorCommand, { type: 'apply-offer' }>
  ): Promise<void> {
    const pc = this.pc;
    if (!pc) return;
    if (command.rollback && pc.signalingState === 'have-local-offer') {
      await pc.setLocalDescription({ type: 'rollback' });
    }
    await pc.setRemoteDescription({ type: 'offer', sdp: command.sdp });
    await this.runCommands(this.negotiator.markRemoteApplied());
    if (this.disposed || !this.pc) return;

    this.candidateGateOpen = false;
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    if (this.disposed) return;
    this.deps.sendSignal('answer', {
      type: 'answer',
      sdp: pc.localDescription?.sdp || answer.sdp || '',
    });
    this.openCandidateGate();
    if (command.initial) this.onNegotiated();
  }

  private onNegotiated(): void {
    if (this.negotiated || this.disposed) return;
    this.negotiated = true;
    if (!this.connectedOnce) {
      this.update({ status: 'connecting' });
      this.connectTimer = this.later(() => {
        if (!this.connectedOnce) {
          this.fail('Could not connect the call', 'connect-timeout');
        }
      }, this.timings.connectTimeoutMs);
    }
    this.events.onNegotiated?.();
  }

  // ---- connection health --------------------------------------------------

  private connState(): P2PConnState {
    const pc = this.pc;
    if (!pc) return 'closed';
    const cs = pc.connectionState as P2PConnState | undefined;
    if (cs) return cs;
    // Browsers without connectionState: map the ICE state.
    switch (pc.iceConnectionState) {
      case 'connected':
      case 'completed':
        return 'connected';
      case 'disconnected':
        return 'disconnected';
      case 'failed':
        return 'failed';
      case 'closed':
        return 'closed';
      case 'checking':
        return 'connecting';
      default:
        return 'new';
    }
  }

  private onConnectionState(): void {
    if (this.disposed) return;
    const state = this.connState();
    if (state === this.lastConn) return;
    this.lastConn = state;
    this.log(`connection ${state}`);

    if (state === 'connected') {
      this.cancel(this.graceTimer);
      this.cancel(this.deadlineTimer);
      this.cancel(this.connectTimer);
      this.graceTimer = this.deadlineTimer = this.connectTimer = null;
      this.runIceAction(this.policy.onState(state));
      this.update({ status: 'connected' });
      this.watchRemoteVideo();
      if (!this.connectedOnce) {
        this.connectedOnce = true;
        this.events.onConnected?.();
      }
      return;
    }
    if (state === 'connecting') {
      if (this.connectedOnce) this.update({ status: 'reconnecting' });
      return;
    }
    if (state === 'disconnected' || state === 'failed') {
      if (this.connectedOnce) this.update({ status: 'reconnecting' });
      this.runIceAction(this.policy.onState(state));
    }
  }

  private runIceAction(action: IceAction): void {
    switch (action.type) {
      case 'wait':
        this.cancel(this.graceTimer);
        this.graceTimer = this.later(() => {
          this.graceTimer = null;
          this.runIceAction(this.policy.onGraceElapsed());
        }, action.ms);
        break;
      case 'restart':
        this.cancel(this.graceTimer);
        this.graceTimer = null;
        this.cancel(this.deadlineTimer);
        this.deadlineTimer = this.later(() => {
          this.deadlineTimer = null;
          const down = this.lastConn !== 'connected';
          this.runIceAction(this.policy.onRestartDeadline(down));
        }, action.deadlineMs);
        this.enqueue(() => this.restartIce());
        break;
      case 'give-up':
        this.fail('Connection lost', 'connection-failed');
        break;
      case 'recovered':
      case 'none':
        break;
    }
  }

  /** ICE restart with fresh TURN credentials; the caller of this is the policy. */
  private async restartIce(): Promise<void> {
    const pc = this.pc;
    if (!pc || this.disposed) return;
    let fresh: IceServerConfig[] | null = null;
    try {
      fresh = await this.deps.fetchIceServers();
    } catch {
      fresh = null;
    }
    if (this.disposed || !this.pc) return;
    if (fresh && fresh.length > 0) {
      try {
        pc.setConfiguration({
          ...pc.getConfiguration(),
          iceServers: fresh as RTCIceServer[],
        });
      } catch (error) {
        this.log('setConfiguration failed', error);
      }
    }
    // A negotiation is already in flight (e.g. the peer is restarting too);
    // the restart deadline still guards the outcome.
    if (pc.signalingState !== 'stable') return;
    if (typeof pc.restartIce === 'function') pc.restartIce();
    await this.sendOffer(true);
  }
}
