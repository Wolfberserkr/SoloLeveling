import { useState } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { useUiStore } from '@/stores/uiStore';
import { gameAction } from '@/lib/gameApi';
import { SystemWindow } from '@/components/system/SystemWindow';
import { GlitchText } from '@/components/system/GlitchText';
import { EXPLORE_MANA_COST } from '@game/encounters.ts';
import { STAT_LABELS } from '@game/constants.ts';
import { itemDef } from '@game/items.ts';
import type { Encounter, XpAward } from '@/lib/types';

type ResolveResult = {
  success: boolean;
  award: XpAward;
  essence: number;
  items: Array<{ key: string; qty: number }>;
  shadow: { name: string; grade: string } | null;
};

/** On-demand monster encounters: spend mana to Explore, resolve with a stat check. */
export function EncounterPanel() {
  const { encounter, exploresLeftToday, profile, refresh } = usePlayerStore();
  const pushAlert = useUiStore((s) => s.pushAlert);
  const showLevelUp = useUiStore((s) => s.showLevelUp);
  const [busy, setBusy] = useState(false);

  if (!profile) return null;

  const lowMana = profile.mana < EXPLORE_MANA_COST;
  const noneLeft = exploresLeftToday <= 0;

  async function explore() {
    if (busy || encounter) return;
    setBusy(true);
    try {
      await gameAction<{ encounter: Encounter }>('explore-encounter');
      await refresh();
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'The path stays shut',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  async function resolve(choiceKey: string) {
    if (busy || !encounter) return;
    setBusy(true);
    try {
      const res = await gameAction<ResolveResult>('resolve-encounter', { choice_key: choiceKey });
      if (res.success) {
        const itemNames = res.items.map((it) => itemDef(it.key)?.name ?? it.key);
        pushAlert({
          kind: 'success',
          title: 'ENCOUNTER CLEARED',
          body: `+${res.award.credited} XP · +${res.essence} Essence${
            itemNames.length ? ` · ${itemNames.join(', ')}` : ''
          }${res.shadow ? ` · Shadow: ${res.shadow.name}` : ''}`,
        });
        if (res.award.leveled_up) showLevelUp(res.award.new_level);
      } else {
        pushAlert({
          kind: 'warning',
          title: 'The check failed',
          body: `+${res.award.credited} XP for the attempt. Train and return.`,
        });
      }
      await refresh();
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Action rejected',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  // ── No active encounter: the Explore prompt ──
  if (!encounter) {
    return (
      <SystemWindow title="Encounter" accent="red" delay={0.04}>
        <p className="text-xs leading-relaxed text-slate-400">
          Venture off the path to face what the System throws at you. A stat check decides the
          outcome — essence, experience, and loot for the victor.
        </p>
        <button className="sys-btn mt-3 w-full" disabled={busy || lowMana || noneLeft} onClick={explore}>
          ⚔ Explore — Cost {EXPLORE_MANA_COST} mana
        </button>
        <p className="mt-2 text-center font-sys text-[0.6rem] uppercase tracking-widest text-slate-500">
          {noneLeft
            ? 'No explorations left today'
            : lowMana
              ? 'Not enough mana to Explore'
              : `${exploresLeftToday} ${exploresLeftToday === 1 ? 'exploration' : 'explorations'} left today`}
        </p>
      </SystemWindow>
    );
  }

  // ── Active encounter: pick an action ──
  const choices = encounter.payload.choices ?? [];
  return (
    <SystemWindow title="Encounter" accent="red" scan delay={0.04}>
      <div className="font-display text-lg font-bold uppercase tracking-[0.2em] text-white glow-text">
        <GlitchText text={encounter.payload.title} />
      </div>
      <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-400">
        {encounter.payload.body}
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {choices.map((c) => (
          <button
            key={c.choice_key}
            className="sys-btn sys-btn-ghost w-full !justify-between !text-left"
            disabled={busy}
            onClick={() => resolve(c.choice_key)}
          >
            <span>{c.label}</span>
            <span className="ml-2 shrink-0 font-sys text-[0.6rem] uppercase tracking-widest text-accent-cyan">
              {STAT_LABELS[c.stat]} · {Math.round(c.success_chance * 100)}%
            </span>
          </button>
        ))}
      </div>
    </SystemWindow>
  );
}
