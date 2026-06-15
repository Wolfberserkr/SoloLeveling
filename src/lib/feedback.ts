// Lightweight UI feedback: vibration + short synthesized chimes. Both are
// gated by the player's settings so they stay silent/still unless opted in.
import { useSettingsStore } from '@/stores/settingsStore';

type Chime = 'info' | 'success' | 'warning' | 'danger' | 'levelup';

// One shared context, created lazily on first use (after a user gesture).
let audioCtx: AudioContext | null = null;

function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  if (audioCtx.state === 'suspended') void audioCtx.resume();
  return audioCtx;
}

const TONES: Record<Chime, number[]> = {
  info: [660],
  success: [660, 990],
  warning: [520, 440],
  danger: [330, 220],
  levelup: [523, 784, 1047],
};

/** Play a short chime for the given event, if sound is enabled. */
export function chime(kind: Chime): void {
  if (!useSettingsStore.getState().sound) return;
  const ac = ctx();
  if (!ac) return;
  const now = ac.currentTime;
  TONES[kind].forEach((freq, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    const start = now + i * 0.08;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.12, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
    osc.connect(gain).connect(ac.destination);
    osc.start(start);
    osc.stop(start + 0.2);
  });
}

/** Vibrate with the given pattern, if haptics are enabled and supported. */
export function haptic(pattern: number | number[]): void {
  if (!useSettingsStore.getState().haptics) return;
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
}
