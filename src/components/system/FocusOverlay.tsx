import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePlayerStore } from '@/stores/playerStore';
import { useUiStore } from '@/stores/uiStore';
import { gameAction } from '@/lib/gameApi';
import type { FocusRun, XpAward } from '@/lib/types';

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * The Instant Dungeon while it runs: a full-screen System takeover with a
 * live countdown. Clear it by seeing the timer through (the server enforces
 * the wall-clock); abandon and the dungeon collapses for nothing.
 */
export function FocusOverlay() {
  const { focus, setFocus, applyAward } = usePlayerStore();
  const showLevelUp = useUiStore((s) => s.showLevelUp);
  const burstXp = useUiStore((s) => s.burstXp);
  const pushAlert = useUiStore((s) => s.pushAlert);
  const showTakeover = useUiStore((s) => s.showTakeover);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  const active = focus != null && focus.status === 'active';

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [active]);

  if (!active) return null;
  const run = focus as FocusRun;

  const endsAt = new Date(run.ends_at).getTime();
  const startedAt = new Date(run.started_at).getTime();
  const remaining = endsAt - now;
  const cleared = remaining <= 0;
  const fraction = Math.min(1, Math.max(0, (now - startedAt) / (endsAt - startedAt)));

  async function claim() {
    if (busy || !cleared) return;
    setBusy(true);
    try {
      const res = await gameAction<{ award: XpAward }>('complete-focus');
      setFocus(null);
      applyAward(res.award);
      burstXp(res.award.credited);
      if (res.award.leveled_up) showLevelUp(res.award.new_level);
      showTakeover({
        kind: 'boss',
        title: 'Instant Dungeon Cleared',
        subtitle: `${run.duration_min} min of focus · +${res.award.credited} XP`,
      });
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Could not clear the dungeon',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  async function abandon() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await gameAction<{ keys_left: number }>('abandon-focus');
      setFocus(null, res.keys_left);
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Could not abandon',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-void/95 p-6 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="sys-title text-[0.65rem]">[ INSTANT DUNGEON ]</div>

        <div className="relative mt-6 flex h-56 w-56 items-center justify-center">
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="3" />
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke={cleared ? '#4ade80' : '#a855f7'}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 46}
              strokeDashoffset={2 * Math.PI * 46 * (1 - fraction)}
              style={{ transition: 'stroke-dashoffset 0.5s linear' }}
            />
          </svg>
          <div className="text-center">
            <div
              className={`font-display text-5xl font-bold tabular-nums glow-text ${
                cleared ? 'text-accent-green' : 'text-accent-purple'
              }`}
            >
              {cleared ? 'CLEAR' : fmt(remaining)}
            </div>
            <div className="mt-1 font-sys text-[0.6rem] uppercase tracking-[0.3em] text-slate-400">
              {run.duration_min} min run
            </div>
          </div>
        </div>

        <ul className="mt-6 flex w-full max-w-xs flex-col">
          {run.mobs.map((mob, i) => (
            <li
              key={i}
              className="mb-2 flex items-center gap-3 border border-accent-purple/20 bg-bg-base/40 p-2 font-sys text-xs text-slate-300"
            >
              <span className="text-accent-purple">▸</span>
              <span className="truncate">{mob}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 w-full max-w-xs">
          <button
            className={`sys-btn w-full ${cleared ? 'animate-pulse-glow' : ''}`}
            disabled={busy || !cleared}
            onClick={claim}
          >
            {cleared ? '⚔ Claim Clear' : 'Focus…'}
          </button>
          <button
            className="mt-2 w-full text-center font-sys text-[0.65rem] uppercase tracking-widest text-slate-500 hover:text-accent-red"
            disabled={busy}
            onClick={abandon}
          >
            Abandon — the dungeon collapses
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
