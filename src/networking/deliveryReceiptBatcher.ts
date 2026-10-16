/**
 * Coalesces XEP-0184 delivery receipts per room.
 *
 * Per room, the first message enqueued while no window is open is acked at
 * once (leading edge). Everything that arrives during the following
 * `coalesceMs` window is held, keeping only the newest message by timestamp,
 * and that one is acked when the window closes (trailing edge). A receipt
 * for a message implies delivery of everything before it, so one stanza can
 * stand for a whole burst or a whole history replay.
 */

export interface DeliveryReceiptBatcherOptions {
  /** Sends one `<received/>` for `messageId` in `roomJid`. */
  send: (roomJid: string, messageId: string) => void;
  /** Injectable timer for tests. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  /** Injectable timer cancel for tests. */
  clearTimer?: (handle: unknown) => void;
  /** Injectable clock, used when `enqueue` gets no timestamp. */
  now?: () => number;
  /** Bound on remembered acked ids (oldest forgotten first). */
  maxAckedIds?: number;
}

interface PendingAck {
  messageId: string;
  timestamp: number;
}

interface RoomAckState {
  timer: unknown | null;
  pending: PendingAck | null;
  lastAckedTs: number;
  coalesceMs: number;
}

const DEFAULT_MAX_ACKED_IDS = 5000;

const ackKey = (roomJid: string, messageId: string): string =>
  `${roomJid}\n${messageId}`;

export class DeliveryReceiptBatcher {
  private readonly rooms = new Map<string, RoomAckState>();
  private readonly acked = new Set<string>();
  private readonly maxAckedIds: number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly now: () => number;

  constructor(private readonly options: DeliveryReceiptBatcherOptions) {
    this.maxAckedIds = options.maxAckedIds ?? DEFAULT_MAX_ACKED_IDS;
    this.setTimer =
      options.setTimer ?? ((fn, ms) => setTimeout(fn, ms) as unknown);
    this.clearTimer =
      options.clearTimer ?? ((handle) => clearTimeout(handle as any));
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * Queues a receipt for `messageId`. `coalesceMs` is the window length used
   * when a window opens; 0 sends every call straight away.
   */
  enqueue(
    roomJid: string,
    messageId: string,
    coalesceMs: number,
    timestamp: number = this.now()
  ): void {
    if (!roomJid || !messageId) return;
    if (this.acked.has(ackKey(roomJid, messageId))) return;

    const state = this.stateFor(roomJid, coalesceMs);
    // Older than the newest message already acked in this room: that ack
    // already covers it.
    if (timestamp < state.lastAckedTs) return;

    if (state.timer !== null) {
      // Window open: hold the newest message only.
      if (!state.pending || timestamp >= state.pending.timestamp) {
        state.pending = { messageId, timestamp };
      }
      return;
    }
    this.ack(roomJid, state, messageId, timestamp);
  }

  /** Cancels the window and drops the held message for one room. */
  clearRoom(roomJid: string): void {
    const state = this.rooms.get(roomJid);
    if (!state) return;
    this.cancel(state);
    this.rooms.delete(roomJid);
  }

  /**
   * Cancels every window and drops every held message (disconnect). Acked
   * ids are kept so a reconnect replay does not ack them twice.
   */
  clear(): void {
    for (const state of this.rooms.values()) this.cancel(state);
    this.rooms.clear();
  }

  /** Full teardown: timers, held messages and the acked-id memory. */
  destroy(): void {
    this.clear();
    this.acked.clear();
  }

  /** Test/inspection helper: number of rooms with an open window. */
  openWindowCount(): number {
    let count = 0;
    for (const state of this.rooms.values()) {
      if (state.timer !== null) count++;
    }
    return count;
  }

  private stateFor(roomJid: string, coalesceMs: number): RoomAckState {
    let state = this.rooms.get(roomJid);
    if (!state) {
      state = { timer: null, pending: null, lastAckedTs: 0, coalesceMs };
      this.rooms.set(roomJid, state);
    }
    state.coalesceMs = coalesceMs;
    return state;
  }

  private ack(
    roomJid: string,
    state: RoomAckState,
    messageId: string,
    timestamp: number
  ): void {
    this.remember(ackKey(roomJid, messageId));
    state.lastAckedTs = Math.max(state.lastAckedTs, timestamp);
    this.options.send(roomJid, messageId);
    if (state.coalesceMs <= 0) return;
    state.timer = this.setTimer(() => this.onWindowEnd(roomJid), state.coalesceMs);
  }

  private onWindowEnd(roomJid: string): void {
    const state = this.rooms.get(roomJid);
    if (!state) return;
    state.timer = null;
    const pending = state.pending;
    state.pending = null;
    if (!pending) return;
    if (this.acked.has(ackKey(roomJid, pending.messageId))) return;
    this.ack(roomJid, state, pending.messageId, pending.timestamp);
  }

  private cancel(state: RoomAckState): void {
    if (state.timer !== null) this.clearTimer(state.timer);
    state.timer = null;
    state.pending = null;
  }

  private remember(key: string): void {
    this.acked.add(key);
    if (this.acked.size > this.maxAckedIds) {
      const oldest = this.acked.values().next().value;
      if (oldest !== undefined) this.acked.delete(oldest);
    }
  }
}
