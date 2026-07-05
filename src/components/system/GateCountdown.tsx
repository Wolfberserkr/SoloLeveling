import { useEffect, useState } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { msUntilMidnight } from '@/lib/dates';

/** Evening hour (in the profile's timezone) when the countdown arms. */
const GATE_WARNING_HOUR = 19;

function localHour(tz: string | null | undefined): number {
  try {
    return Number(
      new Intl.DateTimeFormat('en-US', { timeZone: tz || undefined, hour: 'numeric', hour12: false }).format(
        new Date(),
      ),
    ) % 24;
  } catch {
    return new Date().getHours();
  }
}

/**
 * "GATE CLOSES IN 3:41:22" — once the evening arrives with the Daily Quest
 * unresolved, the deadline becomes visible and ticking. Loss framed, honest:
 * the streak really does die at local midnight.
 */
export function GateCountdown() {
  const { profile, training } = usePlayerStore();
  const [now, setNow] = useState(() => Date.now());

  const armed =
    profile != null && training != null && training.status === 'pending' && localHour(profile.timezone) >= GATE_WARNING_HOUR;

  useEffect(() => {
    if (!armed) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [armed]);

  if (!armed) return null;

  const ms = msUntilMidnight(profile.timezone, new Date(now));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const urgent = ms < 2 * 3_600_000;

  return (
    <div
      className={`mb-1 flex items-center justify-between border px-3 py-2 font-sys text-[0.7rem] uppercase tracking-[0.2em] ${
        urgent
          ? 'border-accent-red/60 bg-accent-red/10 text-accent-red animate-pulse'
          : 'border-accent-gold/40 bg-accent-gold/5 text-accent-gold'
      }`}
    >
      <span>Gate closes in</span>
      <span className="font-display text-sm font-bold tabular-nums">
        {h}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
      </span>
    </div>
  );
}
