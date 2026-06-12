import { useState } from 'react';
import { motion } from 'framer-motion';
import { usePlayerStore } from '@/stores/playerStore';
import { useUiStore } from '@/stores/uiStore';
import { gameAction } from '@/lib/gameApi';
import { SystemWindow } from '@/components/system/SystemWindow';
import { GlitchText } from '@/components/system/GlitchText';
import type { SystemEvent, XpAward } from '@/lib/types';

const EVENT_ACCENTS: Record<SystemEvent['kind'], 'red' | 'cyan' | 'gold' | 'purple'> = {
  gate: 'red',
  mana_surge: 'cyan',
  xp_surge: 'gold',
  potion_gift: 'purple',
};

/** Today's random System Event, if one spawned. Gates are clearable. */
export function EventPanel() {
  const { event, refresh } = usePlayerStore();
  const pushAlert = useUiStore((s) => s.pushAlert);
  const showLevelUp = useUiStore((s) => s.showLevelUp);
  const [busy, setBusy] = useState(false);

  if (!event || event.status === 'expired') return null;
  const cleared = event.status === 'completed';

  async function clearGate() {
    if (busy || !event || event.kind !== 'gate' || cleared) return;
    setBusy(true);
    try {
      const res = await gameAction<{ award: XpAward }>('complete-event');
      pushAlert({
        kind: 'success',
        title: 'GATE CLEARED',
        body: `+${res.award.credited} XP${res.award.capped ? ' · DAILY XP SATURATED' : ''}`,
      });
      if (res.award.leveled_up) showLevelUp(res.award.new_level);
      await refresh();
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Gate rejected',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SystemWindow title="System Event" accent={EVENT_ACCENTS[event.kind]} scan>
      <div className="font-display text-lg font-bold uppercase tracking-[0.2em] text-white glow-text">
        <GlitchText text={event.title} />
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-400">{event.body}</p>

      {event.kind === 'gate' &&
        (cleared ? (
          <motion.div
            initial={{ scale: 2, opacity: 0, rotate: -12 }}
            animate={{ scale: 1, opacity: 1, rotate: -8 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none mx-auto mt-4 w-fit border-2 border-accent-green px-6 py-1 font-display text-xl font-bold uppercase tracking-[0.3em] text-accent-green"
            style={{ boxShadow: '0 0 18px rgba(16,185,129,0.4)' }}
          >
            Cleared
          </motion.div>
        ) : (
          <button className="sys-btn mt-4 w-full" disabled={busy} onClick={clearGate}>
            ⚔ Report Gate Cleared (+{event.xp_reward} XP)
          </button>
        ))}
    </SystemWindow>
  );
}
