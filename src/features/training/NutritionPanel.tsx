import { useState } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { useUiStore } from '@/stores/uiStore';
import { supabase } from '@/lib/supabase';
import { gameAction } from '@/lib/gameApi';
import { SystemWindow } from '@/components/system/SystemWindow';
import { StatBar } from '@/components/system/StatBar';
import { TickingNumber } from '@/components/system/TickingNumber';
import {
  NUTRITION_XP,
  SUPPLEMENT_STACK_XP,
  SUPPLEMENT_STACK,
  PROTEIN_TARGET_MIN_G,
  PROTEIN_TARGET_MAX_G,
  CALORIE_TARGET_MIN_KCAL,
  CALORIE_TARGET_MAX_KCAL,
  clampProteinTarget,
  clampCalorieTarget,
  type SupplementKey,
} from '@game/nutrition.ts';
import type { NutritionLog, XpAward } from '@/lib/types';

const PROTEIN_STEPS = [10, 25, 40]; // g — snack · shake · full meal
const CALORIE_STEPS = [150, 300, 600]; // kcal — snack · light meal · full meal

type TargetKind = 'protein' | 'calories';

export function NutritionPanel() {
  const { profile, nutrition, setNutrition, refresh, applyAward } = usePlayerStore();
  const pushAlert = useUiStore((s) => s.pushAlert);
  const showLevelUp = useUiStore((s) => s.showLevelUp);
  const burstXp = useUiStore((s) => s.burstXp);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<TargetKind | null>(null);
  const [targetText, setTargetText] = useState('');

  if (!profile) return null;

  // Today's protein target is snapshotted on first log; before that, the profile's.
  const target = Number(nutrition?.target_g ?? profile.protein_target_g);
  const calorieTarget = Number(profile.calorie_target_kcal ?? 2200);
  const proteinDone = Number(nutrition?.protein_g ?? 0);
  const kcalDone = Number(nutrition?.calories_kcal ?? 0);
  const overCeiling = kcalDone > calorieTarget;
  const fueled = Boolean(nutrition?.fueled);
  const stacked = Boolean(nutrition?.stacked);
  const taken: Record<SupplementKey, boolean> = {
    creatine: Boolean(nutrition?.creatine),
    vitamins: Boolean(nutrition?.vitamins),
  };

  async function log(
    payload: {
      protein_g?: number;
      calories_kcal?: number;
      creatine?: boolean;
      vitamins?: boolean;
    },
    at?: { x: number; y: number },
  ) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await gameAction<{
        nutrition: NutritionLog;
        fuel_award: XpAward | null;
        stack_award: XpAward | null;
      }>('log-nutrition', payload);
      setNutrition(res.nutrition);
      if (res.fuel_award) burstXp(res.fuel_award.credited, at);
      if (res.stack_award) burstXp(res.stack_award.credited, at);
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
      // Awards carry the XP delta; only a level-up warrants a full refetch.
      applyAward(res.stack_award ?? res.fuel_award);
      if (res.fuel_award?.leveled_up || res.stack_award?.leveled_up) await refresh();
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

  async function saveTarget(kind: TargetKind) {
    if (busy || !profile || !Number.isFinite(Number(targetText))) return;
    const update =
      kind === 'protein'
        ? { protein_target_g: clampProteinTarget(Number(targetText)) }
        : { calorie_target_kcal: clampCalorieTarget(Number(targetText)) };
    setBusy(true);
    try {
      const { error } = await supabase.from('profiles').update(update).eq('user_id', profile.user_id);
      if (error) throw new Error(error.message);
      setEditing(null);
      pushAlert({
        kind: 'success',
        title: kind === 'protein' ? 'Protein target set' : 'Calorie ceiling set',
        body:
          kind === 'protein'
            ? `${update.protein_target_g} g/day. New days will use it; today keeps its snapshot.`
            : `${update.calorie_target_kcal} kcal/day ceiling.`,
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

  function TargetValue({ kind, value, min, max }: { kind: TargetKind; value: number; min: number; max: number }) {
    if (editing === kind) {
      return (
        <span className="inline-flex items-center gap-1">
          <input
            autoFocus
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            value={targetText}
            onChange={(e) => setTargetText(e.target.value)}
            className="w-16 border border-accent-gold/40 bg-bg-base/60 px-1 py-0.5 text-center font-sys text-xs text-white outline-none focus:border-accent-gold"
          />
          <button className="text-accent-gold" disabled={busy} onClick={() => saveTarget(kind)}>
            save
          </button>
        </span>
      );
    }
    return (
      <button
        className="underline decoration-dotted underline-offset-2"
        title={kind === 'protein' ? 'Edit daily protein target' : 'Edit daily calorie ceiling'}
        onClick={() => {
          setTargetText(String(value));
          setEditing(kind);
        }}
      >
        {value}
      </button>
    );
  }

  return (
    <SystemWindow
      title="Fuel — Supplement Intake"
      accent="gold"
      delay={0.06}
      collapsible
      defaultCollapsed
      attention={!fueled}
    >
      {/* Protein — the floor. Meet it, earn XP. */}
      <div className="mb-1 flex items-baseline justify-between">
        <span
          className={`font-display text-sm font-semibold uppercase tracking-wider ${fueled ? 'text-accent-green' : ''}`}
        >
          {fueled ? '✓ ' : ''}Protein
        </span>
        <span className="font-sys text-xs text-slate-400">
          <TickingNumber value={Math.round(proteinDone)} /> /{' '}
          <TargetValue kind="protein" value={target} min={PROTEIN_TARGET_MIN_G} max={PROTEIN_TARGET_MAX_G} /> g
        </span>
      </div>
      <StatBar value={proteinDone} max={target} accent={fueled ? 'green' : 'gold'} height={8} />
      <div className="mt-2 flex gap-2">
        {PROTEIN_STEPS.map((step) => (
          <button
            key={step}
            className="sys-btn sys-btn-ghost flex-1 !min-h-[34px] !py-1 !text-[0.65rem]"
            disabled={busy}
            onClick={(e) => log({ protein_g: step }, { x: e.clientX, y: e.clientY })}
          >
            +{step} g
          </button>
        ))}
      </div>

      {/* Calories — the ceiling. Informational: no XP rides on eating less. */}
      <div className="mb-1 mt-4 flex items-baseline justify-between">
        <span
          className={`font-display text-sm font-semibold uppercase tracking-wider ${overCeiling ? 'text-accent-red' : ''}`}
        >
          Calories
        </span>
        <span className="font-sys text-xs text-slate-400">
          <TickingNumber value={Math.round(kcalDone)} /> /{' '}
          <TargetValue
            kind="calories"
            value={calorieTarget}
            min={CALORIE_TARGET_MIN_KCAL}
            max={CALORIE_TARGET_MAX_KCAL}
          />{' '}
          kcal
        </span>
      </div>
      <StatBar value={kcalDone} max={calorieTarget} accent={overCeiling ? 'red' : 'cyan'} height={8} />
      <div className="mt-2 flex gap-2">
        {CALORIE_STEPS.map((step) => (
          <button
            key={step}
            className="sys-btn sys-btn-ghost flex-1 !min-h-[34px] !py-1 !text-[0.65rem]"
            disabled={busy}
            onClick={() => log({ calories_kcal: step })}
          >
            +{step}
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
            onClick={(e) => log({ [s.key]: true }, { x: e.clientX, y: e.clientY })}
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
              <span className="mt-0.5 block font-sys text-[0.6rem] text-slate-400">{s.dose}</span>
            </span>
            {!taken[s.key] && (
              <span className="font-sys text-[0.6rem] uppercase tracking-widest text-slate-400">
                mark taken
              </span>
            )}
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Protein is the floor — meet it for <span className="text-accent-gold">+{NUTRITION_XP} XP</span>;
        a complete stack pays <span className="text-accent-gold">+{SUPPLEMENT_STACK_XP} XP</span> more.
        Calories are the ceiling — stay under it and the fat burns while protein defends the muscle
        {stacked && fueled ? '. Today: fully fueled.' : '.'}
      </p>
    </SystemWindow>
  );
}
