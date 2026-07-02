import { useState } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { useUiStore } from '@/stores/uiStore';
import { supabase } from '@/lib/supabase';
import { gameAction } from '@/lib/gameApi';
import { SystemWindow } from '@/components/system/SystemWindow';
import { StatBar } from '@/components/system/StatBar';
import {
  NUTRITION_XP,
  SUPPLEMENT_STACK_XP,
  SUPPLEMENT_STACK,
  PROTEIN_TARGET_MIN_G,
  PROTEIN_TARGET_MAX_G,
  clampProteinTarget,
  type SupplementKey,
} from '@game/nutrition.ts';
import type { NutritionLog, XpAward } from '@/lib/types';

const PROTEIN_STEPS = [10, 25, 40]; // g — snack · shake · full meal

export function NutritionPanel() {
  const { profile, nutrition, setNutrition, refresh } = usePlayerStore();
  const pushAlert = useUiStore((s) => s.pushAlert);
  const showLevelUp = useUiStore((s) => s.showLevelUp);
  const [busy, setBusy] = useState(false);
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetText, setTargetText] = useState('');

  if (!profile) return null;

  // Today's target is snapshotted on first log; before that, the profile's.
  const target = Number(nutrition?.target_g ?? profile.protein_target_g);
  const proteinDone = Number(nutrition?.protein_g ?? 0);
  const fueled = Boolean(nutrition?.fueled);
  const stacked = Boolean(nutrition?.stacked);
  const taken: Record<SupplementKey, boolean> = {
    creatine: Boolean(nutrition?.creatine),
    vitamins: Boolean(nutrition?.vitamins),
  };

  async function log(payload: { protein_g?: number; creatine?: boolean; vitamins?: boolean }) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await gameAction<{
        nutrition: NutritionLog;
        fuel_award: XpAward | null;
        stack_award: XpAward | null;
      }>('log-nutrition', payload);
      setNutrition(res.nutrition);
      if (res.fuel_award) {
        pushAlert({
          kind: 'success',
          title: 'FUEL PROTOCOL COMPLETE',
          body: `Protein target met. +${res.fuel_award.credited} XP${res.fuel_award.capped ? ' · DAILY XP SATURATED' : ''}`,
        });
      }
      if (res.stack_award) {
        pushAlert({
          kind: 'success',
          title: 'Supplement stack complete',
          body: `+${res.stack_award.credited} XP`,
        });
      }
      if (res.fuel_award?.leveled_up || res.stack_award?.leveled_up) {
        showLevelUp(res.stack_award?.leveled_up ? res.stack_award.new_level : res.fuel_award!.new_level);
      }
      if (res.fuel_award || res.stack_award) await refresh();
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Intake rejected',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  async function saveTarget() {
    const next = clampProteinTarget(Number(targetText));
    if (busy || !profile || !Number.isFinite(Number(targetText))) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ protein_target_g: next })
        .eq('user_id', profile.user_id);
      if (error) throw new Error(error.message);
      setEditingTarget(false);
      pushAlert({
        kind: 'success',
        title: 'Protein target set',
        body: `${next} g/day. New days will use it; today keeps its snapshot.`,
      });
      await refresh();
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Target rejected',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SystemWindow title="Fuel — Supplement Intake" accent="gold" delay={0.06}>
      {/* Protein */}
      <div className="mb-1 flex items-baseline justify-between">
        <span
          className={`font-display text-sm font-semibold uppercase tracking-wider ${fueled ? 'text-accent-green' : ''}`}
        >
          {fueled ? '✓ ' : ''}Protein
        </span>
        <span className="font-sys text-xs text-slate-400">
          {Math.round(proteinDone)} /{' '}
          {editingTarget ? (
            <span className="inline-flex items-center gap-1">
              <input
                autoFocus
                type="number"
                inputMode="numeric"
                min={PROTEIN_TARGET_MIN_G}
                max={PROTEIN_TARGET_MAX_G}
                value={targetText}
                onChange={(e) => setTargetText(e.target.value)}
                className="w-14 border border-accent-gold/40 bg-bg-base/60 px-1 py-0.5 text-center font-sys text-xs text-white outline-none focus:border-accent-gold"
              />
              <button className="text-accent-gold" disabled={busy} onClick={saveTarget}>
                save
              </button>
            </span>
          ) : (
            <button
              className="underline decoration-dotted underline-offset-2"
              title="Edit daily protein target"
              onClick={() => {
                setTargetText(String(target));
                setEditingTarget(true);
              }}
            >
              {target}
            </button>
          )}{' '}
          g
        </span>
      </div>
      <StatBar value={proteinDone} max={target} accent={fueled ? 'green' : 'gold'} height={8} />
      <div className="mt-2 flex gap-2">
        {PROTEIN_STEPS.map((step) => (
          <button
            key={step}
            className="sys-btn sys-btn-ghost flex-1 !min-h-[34px] !py-1 !text-[0.65rem]"
            disabled={busy}
            onClick={() => log({ protein_g: step })}
          >
            +{step} g
          </button>
        ))}
      </div>

      {/* Supplement stack */}
      <div className="mt-4 flex flex-col gap-2">
        {SUPPLEMENT_STACK.map((s) => (
          <button
            key={s.key}
            type="button"
            disabled={busy || taken[s.key]}
            onClick={() => log({ [s.key]: true })}
            className={`flex items-center justify-between border px-3 py-2 text-left transition-colors ${
              taken[s.key]
                ? 'border-accent-green/40 bg-accent-green/5'
                : 'border-white/10 bg-bg-base/40'
            }`}
          >
            <span className="min-w-0">
              <span
                className={`block font-sys text-xs uppercase tracking-widest ${taken[s.key] ? 'text-accent-green' : 'text-white'}`}
              >
                {taken[s.key] ? '✓ ' : ''}
                {s.name}
              </span>
              <span className="mt-0.5 block font-sys text-[0.6rem] text-slate-500">{s.dose}</span>
            </span>
            {!taken[s.key] && (
              <span className="font-sys text-[0.6rem] uppercase tracking-widest text-slate-500">
                mark taken
              </span>
            )}
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Meet the protein target to earn <span className="text-accent-gold">+{NUTRITION_XP} XP</span>;
        a complete stack pays <span className="text-accent-gold">+{SUPPLEMENT_STACK_XP} XP</span> more.
        Muscle is kept in the kitchen — protein defends it while the fat burns
        {stacked && fueled ? '. Today: fully fueled.' : '.'}
      </p>
    </SystemWindow>
  );
}
