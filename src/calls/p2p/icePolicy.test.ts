import { describe, expect, it } from 'vitest';
import { IceRestartPolicy } from './icePolicy';

describe('IceRestartPolicy', () => {
  it('waits out a disconnect, then restarts once if it did not heal', () => {
    const p = new IceRestartPolicy({ graceMs: 3000, restartDeadlineMs: 15000 });
    expect(p.onState('connected')).toEqual({ type: 'none' });
    expect(p.onState('disconnected')).toEqual({ type: 'wait', ms: 3000 });
    expect(p.onGraceElapsed()).toEqual({ type: 'restart', deadlineMs: 15000 });
    expect(p.restartCount).toBe(1);
  });

  it('a disconnect that heals during the grace period never restarts', () => {
    const p = new IceRestartPolicy();
    p.onState('disconnected');
    expect(p.onState('connected')).toEqual({ type: 'recovered' });
    expect(p.onGraceElapsed()).toEqual({ type: 'none' });
    expect(p.restartCount).toBe(0);
  });

  it('failed restarts straight away, but only once per outage', () => {
    const p = new IceRestartPolicy();
    expect(p.onState('failed')).toMatchObject({ type: 'restart' });
    // The restart did not help: another failed/disconnected in the same outage.
    expect(p.onState('failed')).toEqual({
      type: 'give-up',
      reason: 'restart-did-not-recover',
    });
    expect(p.onState('disconnected')).toEqual({ type: 'none' });
  });

  it('a recovered outage earns a fresh attempt, up to a cap per call', () => {
    const p = new IceRestartPolicy({ maxRestartsPerCall: 2 });
    expect(p.onState('failed')).toMatchObject({ type: 'restart' });
    p.onState('connected');
    expect(p.onState('failed')).toMatchObject({ type: 'restart' });
    p.onState('connected');
    expect(p.onState('failed')).toEqual({
      type: 'give-up',
      reason: 'too-many-restarts',
    });
  });

  it('gives up when the restart deadline passes while still down', () => {
    const p = new IceRestartPolicy();
    p.onState('failed');
    expect(p.onRestartDeadline(true)).toEqual({
      type: 'give-up',
      reason: 'restart-timeout',
    });
    expect(p.onRestartDeadline(false)).toEqual({ type: 'none' });
  });

  it('ignores states that are not an outage', () => {
    const p = new IceRestartPolicy();
    expect(p.onState('new')).toEqual({ type: 'none' });
    expect(p.onState('connecting')).toEqual({ type: 'none' });
    expect(p.onState('closed')).toEqual({ type: 'none' });
  });
});
