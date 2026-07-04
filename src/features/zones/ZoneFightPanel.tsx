import { useState } from 'react';
import { motion } from 'framer-motion';
import { usePlayerStore } from '@/stores/playerStore';
import { useUiStore } from '@/stores/uiStore';
import { gameAction } from '@/lib/gameApi';
import { SystemWindow } from '@/components/system/SystemWindow';
import { GlitchText } from '@/components/system/GlitchText';
import type { ZoneTrigger, XpAward } from '@/lib/types';

/** Today's field monsters — GPS-triggered fights at the Player's zones. */
export function ZoneFightPanel() {
  const zoneTriggers = usePlayerStore((s) => s.zoneTriggers);
  const fights = zoneTriggers.filter((t) => t.kind === 'fight' && t.status !== 'expired');
  if (fights.length === 0) return null;
  return (
    <>
      {fights.map((fight) => (
        <FightCard key={fight.id} fight={fight} />
      ))}
    </>
  );
}

function FightCard({ fight }: { fight: ZoneTrigger }) {
  const refresh = usePlayerStore((s) => s.refresh);
  const pushAlert = useUiStore((s) => s.pushAlert);
  const showLevelUp = useUiStore((s) => s.showLevelUp);
  const burstXp = useUiStore((s) => s.burstXp);
  const [busy, setBusy] = useState(false);
  const slain = fight.status === 'completed';
  const mental = fight.payload.mode === 'mental';

  async function reportSlain(at?: { x: number; y: number }) {
    if (busy || slain) return;
    setBusy(true);
    try {
      const res = await gameAction<{ award: XpAward }>('complete-zone-fight', {
        trigger_id: fight.id,
      });
      burstXp(res.award.credited, at);
      pushAlert({
        kind: 'success',
        title: mental ? 'SPECTER BANISHED' : 'FIELD MONSTER SLAIN',
        body: `+${res.award.credited} XP${res.award.capped ? ' · DAILY XP SATURATED' : ''}`,
      });
      if (res.award.leveled_up) showLevelUp(res.award.new_level);
      await refresh();
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: mental ? 'The specter lingers' : 'The monster still stands',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SystemWindow title="Field Zone" accent="red" scan className={slain ? '' : 'gate-strobe'}>
      <div className="font-display text-lg font-bold uppercase tracking-[0.2em] text-white glow-text">
        <GlitchText text={fight.title} />
      </div>
      <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-400">
        {fight.body}
      </p>

      {slain ? (
        <motion.div
          initial={{ scale: 2, opacity: 0, rotate: -12 }}
          animate={{ scale: 1, opacity: 1, rotate: -8 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none mx-auto mt-4 w-fit border-2 border-accent-green px-6 py-1 font-display text-xl font-bold uppercase tracking-[0.3em] text-accent-green"
          style={{ boxShadow: '0 0 18px rgba(16,185,129,0.4)' }}
        >
          {mental ? 'Banished' : 'Slain'}
        </motion.div>
      ) : (
        <button
          className="sys-btn mt-4 w-full"
          disabled={busy}
          onClick={(e) => reportSlain({ x: e.clientX, y: e.clientY })}
        >
          {mental
            ? `◈ Report Trial Complete (+${fight.xp_reward} XP)`
            : `⚔ Report Monster Slain (+${fight.xp_reward} XP)`}
        </button>
      )}
    </SystemWindow>
  );
}
