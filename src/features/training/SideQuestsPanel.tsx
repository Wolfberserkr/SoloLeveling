import { useState } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { useUiStore } from '@/stores/uiStore';
import { gameAction } from '@/lib/gameApi';
import { SystemWindow } from '@/components/system/SystemWindow';
import type { DailyQuest, XpAward } from '@/lib/types';

export function SideQuestsPanel() {
  const { profile, quests, setQuest, refresh } = usePlayerStore();
  const pushAlert = useUiStore((s) => s.pushAlert);
  const showLevelUp = useUiStore((s) => s.showLevelUp);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  if (!profile || quests.length === 0) return null;
  const mana = profile.mana;

  async function complete(quest: DailyQuest) {
    if (busyKey) return;
    setBusyKey(quest.quest_key);
    try {
      const res = await gameAction<{
        award: XpAward;
        mana: number;
        perfect: XpAward | null;
        quest: DailyQuest;
      }>('complete-quest', { key: quest.quest_key });
      setQuest(res.quest);
      pushAlert({
        kind: 'success',
        title: `${quest.title} complete`,
        body: `+${res.award.credited} XP · −${quest.mana_cost} mana${res.award.capped ? ' · DAILY XP SATURATED' : ''}`,
      });
      if (res.perfect) {
        pushAlert({
          kind: 'success',
          title: 'PERFECT CLEAR',
          body: `Every quest today completed. +${res.perfect.credited} XP`,
        });
      }
      if (res.award.leveled_up || res.perfect?.leveled_up) {
        showLevelUp(res.perfect?.leveled_up ? res.perfect.new_level : res.award.new_level);
      }
      await refresh();
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Quest rejected',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <SystemWindow title="Side Quests" accent="cyan" delay={0.05}>
      <div className="flex flex-col gap-3">
        {quests.map((q) => {
          const done = q.status === 'completed';
          const affordable = mana >= q.mana_cost;
          return (
            <div
              key={q.quest_key}
              className={`border p-3 ${done ? 'border-accent-green/30 bg-accent-green/5' : 'border-accent-cyan/20 bg-bg-base/40'}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={`font-display text-sm font-semibold uppercase tracking-wider ${done ? 'text-accent-green' : ''}`}
                >
                  {done ? '✓ ' : ''}
                  {q.title}
                </span>
                <span className="shrink-0 font-sys text-[0.65rem] uppercase tracking-widest text-slate-400">
                  <span className="text-mana">◈ {q.mana_cost}</span> · +{q.xp_reward} XP
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{q.body}</p>
              {!done && (
                <button
                  className="sys-btn sys-btn-ghost mt-2 w-full !min-h-[34px] !py-1 !text-[0.65rem]"
                  disabled={busyKey !== null || !affordable}
                  onClick={() => complete(q)}
                >
                  {affordable ? 'Report Completion' : 'Insufficient Mana'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </SystemWindow>
  );
}
