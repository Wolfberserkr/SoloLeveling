import { useState } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { useUiStore } from '@/stores/uiStore';
import { gameAction } from '@/lib/gameApi';
import { SystemWindow } from '@/components/system/SystemWindow';
import { ManaOrb } from '@/components/system/ManaOrb';
import type { TrainingQuest } from '@/lib/types';

export function RecoveryPanel() {
  const { profile, sleep, setTraining, refresh } = usePlayerStore();
  const pushAlert = useUiStore((s) => s.pushAlert);
  const [hours, setHours] = useState('7.5');
  const [busy, setBusy] = useState(false);

  if (!profile) return null;
  const canPotion = profile.mana_potions > 0 && profile.mana < profile.mana_max;

  async function logSleep() {
    const h = Number(hours);
    if (busy || !Number.isFinite(h) || h <= 0 || h > 24) return;
    setBusy(true);
    try {
      const res = await gameAction<{
        mana: number;
        potion: boolean;
        training: TrainingQuest;
      }>('log-sleep', { hours: h });
      setTraining(res.training);
      pushAlert({
        kind: res.potion ? 'success' : 'info',
        title: 'Sleep logged',
        body: res.potion
          ? 'Full recovery: mana restored + Mana Potion ×1 earned.'
          : `Mana restored to ${res.mana}.`,
      });
      await refresh();
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Sleep log rejected',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  async function usePotion() {
    if (busy || !canPotion) return;
    setBusy(true);
    try {
      const res = await gameAction<{ restored: number; mana: number; potions: number }>(
        'use-potion',
      );
      pushAlert({ kind: 'success', title: 'Mana Potion consumed', body: `+${res.restored} mana.` });
      await refresh();
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Potion rejected',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SystemWindow
      title="Mana — Recovery"
      accent="purple"
      delay={0.08}
      collapsible
      defaultCollapsed
      attention={!sleep}
    >
      <div className="flex items-center gap-4">
        <ManaOrb mana={profile.mana} manaMax={profile.mana_max} size={64} />
        <div className="min-w-0 flex-1">
          {sleep ? (
            <p className="font-sys text-xs text-slate-400">
              Sleep logged: <span className="text-accent-cyan">{Number(sleep.hours)}h</span> · mana
              +{sleep.mana_gained}
              {sleep.potion_earned && <span className="text-accent-gold"> · potion earned</span>}
            </p>
          ) : (
            <div>
              <label className="font-sys text-[0.65rem] uppercase tracking-widest text-slate-400">
                Hours slept last night
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={24}
                  step={0.5}
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  className="w-20 border border-accent-cyan/30 bg-bg-base/60 px-2 py-1 text-center font-sys text-sm text-white outline-none focus:border-accent-cyan"
                />
                <button
                  className="sys-btn sys-btn-ghost flex-1 !min-h-[34px] !py-1 !text-[0.65rem]"
                  disabled={busy}
                  onClick={logSleep}
                >
                  Log Sleep
                </button>
              </div>
            </div>
          )}
          <button
            className="sys-btn sys-btn-ghost mt-2 w-full !min-h-[34px] !py-1 !text-[0.65rem]"
            disabled={busy || !canPotion}
            onClick={usePotion}
          >
            ⚗ Use Mana Potion ({profile.mana_potions})
          </button>
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Mana regenerates +50 each dawn. Side quests spend it; sleep restores it. 8+ hours earns a
        Mana Potion — potions can only be earned, never bought.
      </p>
    </SystemWindow>
  );
}
