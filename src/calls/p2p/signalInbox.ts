import type { P2PSignal } from './signalStanza';

// Routes incoming p2p signals to the call that owns them.
//
// Signals can arrive before anyone is listening: the caller's offer and first
// candidates are on the wire while the callee is still on the ring screen (the
// controller only exists after Accept), and may even overtake the relayed
// call-token that tells the callee the call exists. So signals for a callId
// with no listener are held briefly and replayed in order when a controller
// attaches. The hold is small and bounded on purpose: a signal for a call that
// never materialises is just dropped when its time is up, so unknown callIds
// stay inert (they never raise UI and never grow memory without limit).

export interface SignalInboxOptions {
  /** How long signals for a call with no listener are kept. */
  ttlMs?: number;
  /** Most distinct unclaimed callIds held at once (oldest dropped first). */
  maxPendingCalls?: number;
  /** Most signals kept per unclaimed call. */
  maxPerCall?: number;
  now?: () => number;
}

export type SignalDelivery = 'delivered' | 'buffered' | 'dropped';

type Handler = (signal: P2PSignal) => void;

const CLOSED_MEMORY = 16;

export class P2PSignalInbox {
  private readonly ttlMs: number;
  private readonly maxPendingCalls: number;
  private readonly maxPerCall: number;
  private readonly now: () => number;
  private readonly pending = new Map<
    string,
    { firstAt: number; signals: P2PSignal[] }
  >();
  private readonly handlers = new Map<string, Handler>();
  // Calls that already ended: late stragglers for them are dropped instead of
  // being buffered for a controller that will never come.
  private readonly closed: string[] = [];

  constructor(options: SignalInboxOptions = {}) {
    this.ttlMs = options.ttlMs ?? 20_000;
    this.maxPendingCalls = options.maxPendingCalls ?? 8;
    this.maxPerCall = options.maxPerCall ?? 96;
    this.now = options.now ?? Date.now;
  }

  private sweep(): void {
    const cutoff = this.now() - this.ttlMs;
    for (const [callId, entry] of this.pending) {
      if (entry.firstAt < cutoff) this.pending.delete(callId);
    }
  }

  receive(signal: P2PSignal): SignalDelivery {
    const handler = this.handlers.get(signal.callId);
    if (handler) {
      handler(signal);
      return 'delivered';
    }
    if (this.closed.includes(signal.callId)) return 'dropped';

    this.sweep();
    let entry = this.pending.get(signal.callId);
    if (!entry) {
      if (this.pending.size >= this.maxPendingCalls) {
        const oldest = this.pending.keys().next().value;
        if (oldest !== undefined) this.pending.delete(oldest);
      }
      entry = { firstAt: this.now(), signals: [] };
      this.pending.set(signal.callId, entry);
    }
    if (entry.signals.length >= this.maxPerCall) return 'dropped';
    entry.signals.push(signal);
    return 'buffered';
  }

  /**
   * Starts delivering a call's signals to `handler`, replaying anything held
   * for it first (in arrival order). Returns a detach function that also
   * marks the call closed.
   */
  attach(callId: string, handler: Handler): () => void {
    const idx = this.closed.indexOf(callId);
    if (idx >= 0) this.closed.splice(idx, 1);

    this.sweep();
    const held = this.pending.get(callId);
    this.pending.delete(callId);
    this.handlers.set(callId, handler);
    if (held) {
      for (const signal of held.signals) handler(signal);
    }
    return () => {
      if (this.handlers.get(callId) === handler) this.handlers.delete(callId);
      this.close(callId);
    };
  }

  /** The call is over: forget held signals and drop future stragglers. */
  close(callId: string): void {
    this.pending.delete(callId);
    if (!this.closed.includes(callId)) {
      this.closed.push(callId);
      if (this.closed.length > CLOSED_MEMORY) this.closed.shift();
    }
  }

  clear(): void {
    this.pending.clear();
    this.handlers.clear();
    this.closed.length = 0;
  }
}
