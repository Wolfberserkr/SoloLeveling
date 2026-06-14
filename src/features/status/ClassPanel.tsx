import { useState } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { useUiStore } from '@/stores/uiStore';
import { gameAction } from '@/lib/gameApi';
import { SystemWindow } from '@/components/system/SystemWindow';
import { classDef, eligibleClasses, JOB_CHANGE_RANK } from '@game/progression.ts';
import { RANKS, type Rank } from '@game/constants.ts';

export function ClassPanel() {
  const { profile, stats, refresh } = usePlayerStore();
  const pushAlert = useUiStore((s) => s.pushAlert);
  const [busy, setBusy] = useState(false);
  if (!profile) return null;

  const current = classDef(profile.class);
  const unlocked =
    RANKS.indexOf(profile.rank as Rank) >= RANKS.indexOf(JOB_CHANGE_RANK as Rank);

  async function choose(key: string) {
    if (busy) return;
    setBusy(true);
    try {
      await gameAction('choose-class', { class_key: key });
      await refresh();
      pushAlert({
        kind: 'success',
        title: 'Class awakened',
        body: classDef(key)?.perk,
      });
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Job change rejected',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  // Already chosen — show the class and its passive.
  if (current) {
    return (
      <SystemWindow title="Class" accent="purple" delay={0.12}>
        <div className="font-display text-xl font-bold uppercase tracking-wider text-accent-purple glow-text">
          {current.name}
        </div>
        <div className="mt-1 font-sys text-[0.65rem] uppercase tracking-widest text-slate-400">
          {current.group} discipline
        </div>
        <div className="mt-2 text-sm text-accent-gold">{current.perk}</div>
      </SystemWindow>
    );
  }

  // Locked until the job-change rank.
  if (!unlocked) {
    return (
      <SystemWindow title="Class" accent="purple" delay={0.12}>
        <p className="font-sys text-xs uppercase tracking-widest text-slate-500">
          The job change unlocks at {JOB_CHANGE_RANK}-Rank. Keep leveling — the System will offer a
          path drawn from your strongest attributes.
        </p>
      </SystemWindow>
    );
  }

  // Eligible job change — choose from the dominant stat group.
  const statMap = Object.fromEntries(stats.map((s) => [s.stat, Number(s.value)]));
  const options = eligibleClasses(statMap);
  return (
    <SystemWindow title="Job Change Available" accent="purple" scan delay={0.12}>
      <p className="mb-3 font-sys text-[0.65rem] uppercase tracking-widest text-accent-gold">
        Your attributes qualify you for these classes. Choose once — it is permanent.
      </p>
      <div className="flex flex-col gap-2">
        {options.map((c) => (
          <button
            key={c.key}
            disabled={busy}
            onClick={() => choose(c.key)}
            className="border border-accent-purple/40 bg-bg-base/40 p-3 text-left transition-colors hover:border-accent-purple"
          >
            <div className="font-display text-base font-semibold text-white">{c.name}</div>
            <div className="mt-0.5 text-sm text-accent-gold">{c.perk}</div>
          </button>
        ))}
      </div>
    </SystemWindow>
  );
}
