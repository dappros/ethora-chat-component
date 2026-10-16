/**
 * Rate-limits XEP-0333 `<displayed/>` markers for one room. The first mark
 * goes out at once; marks inside `minIntervalMs` of the last send are held
 * and only the newest id is sent when the interval ends (trailing edge), so
 * the final read watermark is never lost. `dispose()` sends a held mark
 * immediately, then cancels the timer.
 */

export interface DisplayedMarkerThrottleOptions {
  minIntervalMs: number;
  send: (messageId: string) => void;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export class DisplayedMarkerThrottle {
  private lastSentAt: number | null = null;
  private pendingId: string | null = null;
  private timer: unknown | null = null;
  private disposed = false;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(private readonly options: DisplayedMarkerThrottleOptions) {
    this.now = options.now ?? (() => Date.now());
    this.setTimer =
      options.setTimer ?? ((fn, ms) => setTimeout(fn, ms) as unknown);
    this.clearTimer =
      options.clearTimer ?? ((handle) => clearTimeout(handle as any));
  }

  mark(messageId: string): void {
    if (!messageId || this.disposed) return;
    const wait =
      this.lastSentAt === null
        ? 0
        : this.lastSentAt + this.options.minIntervalMs - this.now();
    if (this.timer === null && wait <= 0) {
      this.fire(messageId);
      return;
    }
    this.pendingId = messageId;
    if (this.timer === null) {
      this.timer = this.setTimer(() => this.onTimer(), Math.max(0, wait));
    }
  }

  dispose(): void {
    if (this.disposed) return;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    const held = this.pendingId;
    this.pendingId = null;
    this.disposed = true;
    if (held) this.options.send(held);
  }

  private onTimer(): void {
    this.timer = null;
    const held = this.pendingId;
    this.pendingId = null;
    if (held && !this.disposed) this.fire(held);
  }

  private fire(messageId: string): void {
    this.lastSentAt = this.now();
    this.options.send(messageId);
  }
}
