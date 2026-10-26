// ICE restart policy for a p2p call, kept apart from the RTCPeerConnection so
// it can be reasoned about and tested on its own. The controller feeds it the
// connection state and runs the timers; the policy only decides.
//
//  - `disconnected` is often transient (a Wi-Fi blip heals by itself), so the
//    first reaction is to wait a grace period and restart only if it has not
//    recovered;
//  - `failed` is terminal for that ICE session, so restart straight away;
//  - one restart per outage, and a small cap per call so a flapping network
//    ends in a clean failure instead of an endless loop;
//  - a restart that does not bring the connection back within a deadline
//    gives up.

export type P2PConnState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

export type IceAction =
  | { type: 'none' }
  | { type: 'wait'; ms: number } // re-check with onGraceElapsed() after ms
  | { type: 'restart'; deadlineMs: number } // restart; onRestartDeadline() after deadlineMs
  | { type: 'recovered' }
  | { type: 'give-up'; reason: string };

export interface IcePolicyOptions {
  graceMs?: number;
  restartDeadlineMs?: number;
  maxRestartsPerCall?: number;
}

export class IceRestartPolicy {
  private readonly graceMs: number;
  private readonly restartDeadlineMs: number;
  private readonly maxRestarts: number;
  private restarts = 0;
  private attemptedThisOutage = false;
  private inOutage = false;

  constructor(options: IcePolicyOptions = {}) {
    this.graceMs = options.graceMs ?? 3_000;
    this.restartDeadlineMs = options.restartDeadlineMs ?? 15_000;
    this.maxRestarts = options.maxRestartsPerCall ?? 3;
  }

  get restartCount(): number {
    return this.restarts;
  }

  private tryRestart(): IceAction {
    if (this.attemptedThisOutage) {
      return { type: 'give-up', reason: 'restart-did-not-recover' };
    }
    if (this.restarts >= this.maxRestarts) {
      return { type: 'give-up', reason: 'too-many-restarts' };
    }
    this.attemptedThisOutage = true;
    this.restarts += 1;
    return { type: 'restart', deadlineMs: this.restartDeadlineMs };
  }

  onState(state: P2PConnState): IceAction {
    switch (state) {
      case 'connected': {
        const wasOutage = this.inOutage;
        this.inOutage = false;
        this.attemptedThisOutage = false;
        return wasOutage ? { type: 'recovered' } : { type: 'none' };
      }
      case 'disconnected': {
        this.inOutage = true;
        if (this.attemptedThisOutage) return { type: 'none' };
        return { type: 'wait', ms: this.graceMs };
      }
      case 'failed': {
        this.inOutage = true;
        return this.tryRestart();
      }
      default:
        return { type: 'none' };
    }
  }

  /** The grace period after `disconnected` ran out without recovery. */
  onGraceElapsed(): IceAction {
    if (!this.inOutage) return { type: 'none' };
    return this.tryRestart();
  }

  /** The restart deadline ran out; `stillDown` is the state at that moment. */
  onRestartDeadline(stillDown: boolean): IceAction {
    return stillDown
      ? { type: 'give-up', reason: 'restart-timeout' }
      : { type: 'none' };
  }
}
