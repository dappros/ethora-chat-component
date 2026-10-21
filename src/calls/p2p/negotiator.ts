import type { P2PSignal } from './signalStanza';

// The pure half of the p2p signalling state machine: given the stream of
// signals from the peer and a few "we are ready" notifications, it says WHAT
// to do next (apply an offer, apply an answer, add a candidate, stop) without
// touching an RTCPeerConnection. The controller executes the commands.
//
// Rules it enforces:
//  - one negotiation per callId; signals for another callId or from anyone but
//    the expected peer are ignored;
//  - the callee may receive the offer before it has accepted (and before it
//    has local media): the first offer wins, later initial offers are ignored,
//    and it is held until markReady();
//  - candidates that arrive before the remote description is applied are held
//    and flushed right after it;
//  - duplicates (same SDP delivered twice, e.g. the caller re-sending its
//    offer) are no-ops;
//  - after the first exchange, a new offer is a renegotiation (ICE restart).
//    If both sides restart at once (glare) the caller is "impolite" and keeps
//    its own offer; the callee is "polite" and yields to the caller's.

export type P2PRole = 'caller' | 'callee';

export type NegotiatorCommand =
  | { type: 'apply-offer'; sdp: string; initial: boolean; rollback: boolean }
  | { type: 'apply-answer'; sdp: string }
  | { type: 'add-candidate'; candidate: RTCIceCandidateInit }
  | { type: 'remote-end'; reason: string };

const MAX_HELD_CANDIDATES = 64;

export class P2PNegotiator {
  readonly callId: string;
  readonly role: P2PRole;
  private readonly peerLocal: string;

  private ready = false;
  private ended = false;
  private remoteDescriptionSet = false;
  private initialOfferTaken = false;
  private heldOffer: string | null = null;
  private localOfferPending = false;
  private lastOfferSdp: string | null = null;
  private lastAnswerSdp: string | null = null;
  private heldCandidates: RTCIceCandidateInit[] = [];
  // The caller re-sends its offer and candidates while unanswered, so the same
  // candidate can arrive more than once; each is applied (or held) only once.
  private seenCandidates = new Set<string>();

  constructor(params: { callId: string; role: P2PRole; peerLocal: string }) {
    this.callId = params.callId;
    this.role = params.role;
    this.peerLocal = String(params.peerLocal || '')
      .split('@')[0]
      .toLowerCase();
  }

  get isEnded(): boolean {
    return this.ended;
  }

  /** True while we have sent an offer and not yet received its answer. */
  get awaitingAnswer(): boolean {
    return this.localOfferPending;
  }

  private accepts(signal: P2PSignal): boolean {
    if (this.ended) return false;
    if (signal.callId !== this.callId) return false;
    if (this.peerLocal && signal.fromLocal !== this.peerLocal) return false;
    return true;
  }

  receive(signal: P2PSignal): NegotiatorCommand[] {
    if (!this.accepts(signal)) return [];

    switch (signal.signal) {
      case 'end': {
        this.ended = true;
        this.heldOffer = null;
        this.heldCandidates = [];
        const reason = (signal.payload as { reason?: string }).reason;
        return [{ type: 'remote-end', reason: reason || 'ended' }];
      }

      case 'offer': {
        const sdp = (signal.payload as { sdp: string }).sdp;
        if (sdp === this.lastOfferSdp) return [];
        if (!this.initialOfferTaken) {
          // Only the callee ever receives the first offer.
          if (this.role !== 'callee') return [];
          this.initialOfferTaken = true;
          this.lastOfferSdp = sdp;
          if (!this.ready) {
            this.heldOffer = sdp;
            return [];
          }
          return [{ type: 'apply-offer', sdp, initial: true, rollback: false }];
        }
        // Renegotiation. Before the initial exchange finished, or before we
        // are ready, there is nothing sensible to apply it to.
        if (!this.ready || !this.remoteDescriptionSet) return [];
        if (this.localOfferPending) {
          if (this.role === 'caller') return []; // impolite: keep ours
          this.localOfferPending = false; // polite: roll ours back
          this.lastOfferSdp = sdp;
          return [{ type: 'apply-offer', sdp, initial: false, rollback: true }];
        }
        this.lastOfferSdp = sdp;
        return [{ type: 'apply-offer', sdp, initial: false, rollback: false }];
      }

      case 'answer': {
        if (!this.localOfferPending) return [];
        const sdp = (signal.payload as { sdp: string }).sdp;
        if (sdp === this.lastAnswerSdp) return [];
        this.lastAnswerSdp = sdp;
        this.localOfferPending = false;
        return [{ type: 'apply-answer', sdp }];
      }

      case 'candidate': {
        const c = signal.payload as RTCIceCandidateInit;
        // An empty candidate string is the end-of-candidates marker; nothing
        // needs to be added for it.
        if (!c.candidate) return [];
        const key = `${c.candidate}|${c.sdpMid ?? ''}|${c.sdpMLineIndex ?? ''}`;
        if (this.seenCandidates.has(key)) return [];
        this.seenCandidates.add(key);
        if (this.remoteDescriptionSet) {
          return [{ type: 'add-candidate', candidate: c }];
        }
        if (this.heldCandidates.length < MAX_HELD_CANDIDATES) {
          this.heldCandidates.push(c);
        }
        return [];
      }
    }
    return [];
  }

  /**
   * Local media and the peer connection exist. For the callee this releases
   * the offer that arrived while it was still on the ring screen.
   */
  markReady(): NegotiatorCommand[] {
    if (this.ended) return [];
    this.ready = true;
    if (this.heldOffer !== null) {
      const sdp = this.heldOffer;
      this.heldOffer = null;
      return [{ type: 'apply-offer', sdp, initial: true, rollback: false }];
    }
    return [];
  }

  /** We created and set a local offer; its answer is now expected. */
  markLocalOffer(): void {
    this.localOfferPending = true;
    this.lastAnswerSdp = null;
    // The caller's own first offer IS its initial exchange, so any offer it
    // receives afterwards is a renegotiation, not a second "first offer".
    if (this.role === 'caller') this.initialOfferTaken = true;
  }

  /**
   * A remote description (offer or answer) was applied to the connection.
   * Returns the candidates that were waiting for it.
   */
  markRemoteApplied(): NegotiatorCommand[] {
    this.remoteDescriptionSet = true;
    const held = this.heldCandidates;
    this.heldCandidates = [];
    return held.map((candidate) => ({
      type: 'add-candidate' as const,
      candidate,
    }));
  }

  /** Local teardown: later signals are ignored. */
  stop(): void {
    this.ended = true;
    this.heldOffer = null;
    this.heldCandidates = [];
  }
}
