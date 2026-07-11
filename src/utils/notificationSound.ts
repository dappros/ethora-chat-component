// Synthesized notification chime via the Web Audio API - no audio file to
// bundle/host. `message` is a single short tone; `mention` is a two-tone
// "attention" variant so an @mention is audibly distinct from a regular
// message notification.
let sharedAudioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  const AudioContextCtor =
    window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextCtor) return null;

  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new AudioContextCtor();
  }
  return sharedAudioContext;
};

const playTone = (
  ctx: AudioContext,
  frequency: number,
  startAt: number,
  durationSec: number,
  volume: number
): void => {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startAt);
  // Quick fade in/out avoids a click at the tone's edges.
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(volume, startAt + 0.015);
  gain.gain.linearRampToValueAtTime(0, startAt + durationSec);

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + durationSec);
};

export type NotificationSoundKind = 'message' | 'mention';

export const playNotificationSound = (
  kind: NotificationSoundKind = 'message',
  volume = 0.2
): void => {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Browsers suspend a context created before any user gesture; resume is a
  // no-op if it's already running.
  void ctx.resume().catch(() => {});

  const now = ctx.currentTime;
  const clampedVolume = Math.min(Math.max(volume, 0), 1);

  if (kind === 'mention') {
    playTone(ctx, 880, now, 0.12, clampedVolume);
    playTone(ctx, 1175, now + 0.1, 0.16, clampedVolume);
  } else {
    playTone(ctx, 740, now, 0.14, clampedVolume);
  }
};
