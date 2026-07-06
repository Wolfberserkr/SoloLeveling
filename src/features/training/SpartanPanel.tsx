import { useState } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { useUiStore } from '@/stores/uiStore';
import { gameAction } from '@/lib/gameApi';
import { SystemWindow } from '@/components/system/SystemWindow';
import { StatBar } from '@/components/system/StatBar';
import { itemDef } from '@game/items.ts';
import {
  SPARTAN_CHAPTERS,
  SPARTAN_SHADOW_NAME,
  type SpartanCondition,
  type SpartanReward,
  type SpartanSnapshot,
} from '@game/spartan.ts';

function rewardNames(reward: SpartanReward): string[] {
  const names = reward.items.map((i) => `${itemDef(i.key)?.name ?? i.key} ×${i.qty}`);
  if (reward.gear) names.push(itemDef(reward.gear)?.name ?? reward.gear);
  if (reward.shadow) names.push(`${SPARTAN_SHADOW_NAME} — Monarch shadow`);
  return names;
}

function ConditionRow({ c }: { c: SpartanCondition }) {
  const value = c.value;
  const shownValue =
    value === null ? '—' : c.unit === 'kg' ? value.toFixed(1) : String(value);
  const arrow = c.dir === 'lte' ? '≤' : '≥';
  // A progress bar reads well for "reach a number"; the boss row is binary.
  const showBar = c.key !== 'boss';
  const frac =
    value === null || c.target === 0
      ? 0
      : c.dir === 'lte'
        ? Math.min(1, c.target / Math.max(value, 0.0001))
        : Math.min(1, value / c.target);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span
          className={`font-display text-xs font-semibold uppercase tracking-wide ${c.met ? 'text-accent-green' : 'text-slate-200'}`}
        >
          {c.met ? '✓ ' : c.pending ? '⋯ ' : '○ '}
          {c.label}
        </span>
        <span className="shrink-0 font-sys text-[0.65rem] text-slate-400">
          {c.pending ? 'syncing' : `${shownValue} / ${arrow}${c.target} ${c.unit}`}
        </span>
      </div>
      {showBar && (
        <StatBar
          value={c.pending ? 0 : Math.round(frac * 100)}
          max={100}
          accent={c.met ? 'green' : 'gold'}
          height={5}
        />
      )}
    </div>
  );
}

/**
 * THE SPARTAN PROTOCOL — an optional, binding six-month campaign that runs as a
 * meta-layer over the Daily Training Quest and Gym Dungeon. Undertaking it is a
 * commitment: each chapter has a deadline, and letting one lapse — or deserting
 * — collapses the campaign for a rank/XP toll. Clearing all four grants the
 * campaign's exclusive rewards. Collapsible; sits alongside the daily quest.
 */
export function SpartanPanel() {
  const { spartan, setSpartan, refresh } = usePlayerStore();
  const pushAlert = useUiStore((s) => s.pushAlert);
  const showTakeover = useUiStore((s) => s.showTakeover);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | 'enlist' | 'abandon'>(null);

  if (!spartan) return null;

  async function act<T extends { spartan: SpartanSnapshot }>(
    action: 'enlist-spartan' | 'attempt-spartan-boss' | 'abandon-spartan',
    onDone?: (res: T) => void,
  ) {
    if (busy) return;
    setBusy(true);
    setConfirm(null);
    try {
      const res = await gameAction<T>(action);
      // refresh() first (rewards, profile/rank changes), then let the action's
      // authoritative snapshot win so cadence values aren't clobbered.
      await refresh();
      setSpartan(res.spartan);
      onDone?.(res);
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'System rejected the order',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  // ── Not enlisted (or collapsed and awaiting re-enlistment) ────────────────
  if (spartan.status === 'inactive' || spartan.status === 'failed') {
    const collapsed = spartan.status === 'failed';
    const locked = collapsed && !spartan.canReenlist;
    return (
      <SystemWindow
        title="The Spartan Protocol"
        accent={collapsed ? 'red' : 'gold'}
        collapsible
        defaultCollapsed={!collapsed}
        storageKey="spartan"
        scan
      >
        {collapsed && (
          <p className="mb-3 font-sys text-xs leading-relaxed text-accent-red">
            The campaign collapsed. {locked
              ? `Re-enlistment is barred until ${spartan.reenlistOn}.`
              : 'The System will permit a new enlistment.'}
          </p>
        )}
        <p className="text-sm leading-relaxed text-slate-300">
          An optional six-month campaign, calculated from your body scan and mapped onto the System:
          four chapters — <span className="text-accent-gold">Foundation → Iron Path → Warrior’s
          Forge → Elite Conditioning</span> — each ending in a boss and a reward. It runs
          <span className="text-accent-cyan"> alongside</span> your Daily Quest and Gym Dungeon; it
          does not replace them.
        </p>
        <p className="mt-3 text-xs leading-relaxed text-accent-red">
          ⚠ Binding. Each chapter has a deadline. Miss one — or desert — and the campaign COLLAPSES:
          you are demoted a full rank and forfeit Essence, then barred from re-enlisting for 14 days.
          Clear all four and claim the exclusive Spartan’s Aegis and the Monarch shadow{' '}
          <span className="text-accent-gold">{SPARTAN_SHADOW_NAME}</span>.
        </p>

        {confirm === 'enlist' ? (
          <div className="mt-4 flex flex-col gap-2">
            <p className="font-sys text-xs text-accent-gold">
              Undertake the Spartan Protocol? Once begun, you must finish it.
            </p>
            <div className="flex gap-2">
              <button className="sys-btn flex-1" disabled={busy} onClick={() => act('enlist-spartan')}>
                ⚔ Undertake
              </button>
              <button className="sys-btn sys-btn-ghost flex-1" disabled={busy} onClick={() => setConfirm(null)}>
                Not yet
              </button>
            </div>
          </div>
        ) : (
          <button
            className="sys-btn mt-4 w-full"
            disabled={busy || locked}
            onClick={() => setConfirm('enlist')}
          >
            {locked ? `Barred until ${spartan.reenlistOn}` : 'Undertake the Spartan Protocol'}
          </button>
        )}
      </SystemWindow>
    );
  }

  // ── Completed ─────────────────────────────────────────────────────────────
  if (spartan.status === 'completed') {
    return (
      <SystemWindow title="The Spartan Protocol" accent="gold" collapsible defaultCollapsed storageKey="spartan" scan>
        <p className="font-display text-sm font-bold uppercase tracking-widest text-accent-gold">
          Campaign conquered
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          All four chapters cleared. The Demon of the Summit has fallen. {SPARTAN_SHADOW_NAME} marches
          in your Shadow Army and the Spartan’s Aegis is yours — permanently. The System does not
          promise magic. It promised arithmetic, and you did the work.
        </p>
      </SystemWindow>
    );
  }

  // ── Active ────────────────────────────────────────────────────────────────
  const ch = spartan.chapter;
  if (!ch) return null;
  const total = SPARTAN_CHAPTERS.length;
  const deadlineTone = ch.overdue ? 'text-accent-red' : ch.daysLeft <= 7 ? 'text-accent-gold' : 'text-slate-400';

  return (
    <SystemWindow
      title="The Spartan Protocol"
      accent="gold"
      collapsible
      storageKey="spartan"
      attention={ch.allMet}
      scan
    >
      <div className="mb-3 flex items-center justify-between font-sys text-[0.65rem] uppercase tracking-widest">
        <span className="text-accent-gold">
          Chapter {ch.index}/{total} · {ch.name}
        </span>
        <span className={deadlineTone}>
          {ch.overdue ? 'DEADLINE PASSED' : `${ch.daysLeft}d left · ${ch.deadline}`}
        </span>
      </div>

      <p className="mb-3 text-xs leading-relaxed text-slate-300">{ch.blurb}</p>

      <div className="flex flex-col gap-3">
        {ch.conditions.map((c) => (
          <ConditionRow key={c.key} c={c} />
        ))}
      </div>

      <div className="mt-4 rounded border border-slate-700/60 bg-slate-900/40 p-2">
        <p className="font-sys text-[0.6rem] uppercase tracking-widest text-slate-500">
          Clearing this chapter grants
        </p>
        <p className="mt-1 text-xs text-accent-cyan">{rewardNames(ch.reward).join(' · ')}</p>
      </div>

      <button
        className={`sys-btn mt-4 w-full ${ch.allMet ? 'animate-pulse-glow' : ''}`}
        disabled={busy || !ch.allMet}
        onClick={() =>
          act<{ spartan: SpartanSnapshot; completed: boolean }>('attempt-spartan-boss', (res) => {
            showTakeover({
              kind: res.completed ? 'perfect' : 'boss',
              title: res.completed ? 'Spartan Protocol Conquered' : `${ch.bossName} Falls`,
              subtitle: res.completed
                ? `${SPARTAN_SHADOW_NAME} arises · the Spartan’s Aegis is forged`
                : `Chapter ${ch.index} cleared · rewards claimed`,
            });
          })
        }
      >
        {ch.allMet ? `⚔ Defeat ${ch.bossName}` : `Meet every condition to face ${ch.bossName}`}
      </button>

      {confirm === 'abandon' ? (
        <div className="mt-2 flex flex-col gap-2 rounded border border-accent-red/40 p-2">
          <p className="font-sys text-xs text-accent-red">
            Desert the campaign? It collapses now: −1 rank, all Essence forfeit, 14-day lockout.
          </p>
          <div className="flex gap-2">
            <button
              className="sys-btn sys-btn-ghost flex-1 !text-accent-red"
              disabled={busy}
              onClick={() => act('abandon-spartan')}
            >
              Desert
            </button>
            <button className="sys-btn sys-btn-ghost flex-1" disabled={busy} onClick={() => setConfirm(null)}>
              Hold the line
            </button>
          </div>
        </div>
      ) : (
        <button
          className="mt-2 w-full font-sys text-[0.6rem] uppercase tracking-widest text-slate-600 hover:text-accent-red"
          disabled={busy}
          onClick={() => setConfirm('abandon')}
        >
          Desert the campaign
        </button>
      )}
    </SystemWindow>
  );
}
