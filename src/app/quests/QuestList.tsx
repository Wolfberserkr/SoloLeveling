'use client';
import { useState } from 'react';
import { SystemWindow } from '@/components/SystemWindow';
import { useRouter } from 'next/navigation';

type Quest = {
  id: number;
  key: string;
  label: string;
  target: number;
  progress: number;
  unit: string | null;
  completed: boolean;
  weekly?: boolean;
};

// Quick-log amounts per quest type. Falls back to [1, 5, 10] for unknowns.
const QUICK_AMOUNTS: Record<string, number[]> = {
  // reps
  pushups: [5, 10, 25], dips: [5, 10, 20], diamond_pushups: [5, 10, 20], burpees: [5, 10, 15],
  situps: [5, 10, 25], leg_raises: [5, 10, 20], squats: [5, 10, 25], jump_squats: [5, 10, 20], lunges: [5, 10, 20],
  // seconds
  plank: [15, 30, 60], hollow_hold: [15, 30, 60], wall_sit: [15, 30, 60],
  // km / min
  run: [1, 2, 5], cycling: [2, 5, 10], weekly_hike: [1, 2, 5], weekly_long_run: [1, 2, 5], weekly_cycling_long: [5, 10, 15],
  jump_rope: [5, 10, 15], rowing: [5, 10, 15],
  weekly_swim: [5, 10, 15], weekly_sport: [10, 20, 30], weekly_circuit: [10, 20, 30],
};

export function QuestList({ initial, streak }: { initial: Quest[]; streak: number }) {
  const router = useRouter();
  const [quests, setQuests] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [reward, setReward] = useState<string | null>(null);

  const core = quests.filter((q) => !q.weekly);
  const weekly = quests.filter((q) => q.weekly);
  const coreCleared = core.every((q) => q.completed);
  const weeklyCleared = weekly.length > 0 && weekly.every((q) => q.completed);

  async function log(key: string, amount: number) {
    setBusy(key);
    const res = await fetch('/api/quests/progress', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key, amount }),
    });
    if (res.ok) {
      const json = await res.json();
      setQuests((qs) => qs.map((q) => (q.key === key ? { ...json.quest, weekly: q.weekly } : q)));
      if (json.rewards.length > 0) {
        setReward(json.rewards.join(' · '));
        setTimeout(() => setReward(null), 3500);
        router.refresh();
      }
    }
    setBusy(null);
  }

  return (
    <div className="space-y-6">
      {/* ── Core daily quests ── */}
      <SystemWindow
        title="DAILY QUEST"
        variant={coreCleared ? 'gold' : 'red'}
        scan
        right={
          <div className="text-[10px] font-mono text-accent-gold tracking-widest">
            STREAK · {streak}d
          </div>
        }
      >
        <div className="text-center mb-4">
          <div className="font-mono text-xs tracking-[0.4em] text-accent-cyan/70 animate-flicker">
            [ DO NOT NEGLECT THE DAILY QUEST ]
          </div>
          {!coreCleared ? (
            <p className="text-[#a9c7e0] text-sm mt-2">
              Goals — complete <span className="text-accent-cyan">all four</span> objectives before
              the day ends. Failure incurs a penalty.
            </p>
          ) : (
            <p className="text-accent-gold text-sm mt-2 glow-text">
              ✦ ALL OBJECTIVES CLEARED — REWARDS DELIVERED ✦
            </p>
          )}
        </div>

        <ul className="space-y-3">
          {core.map((q) => <QuestItem key={q.id} q={q} busy={busy} onLog={log} />)}
        </ul>
      </SystemWindow>

      {/* ── Weekly bonus (Saturday only) ── */}
      {weekly.length > 0 && (
        <SystemWindow
          title="WEEKLY BONUS QUEST"
          variant="gold"
          right={
            <div className="text-[10px] font-mono text-accent-gold tracking-widest">
              HIGH REWARD
            </div>
          }
        >
          <p className="text-xs text-[#a9c7e0] font-mono mb-3">
            A special objective issued once per week. Clearing it awards 2× the normal XP and
            bonus Essence Stones. Does not affect your daily streak.
          </p>
          <ul className="space-y-3">
            {weekly.map((q) => <QuestItem key={q.id} q={q} busy={busy} onLog={log} gold />)}
          </ul>
          {weeklyCleared && (
            <p className="text-accent-gold text-sm mt-3 text-center glow-text">
              ✦ WEEKLY BONUS CLEARED ✦
            </p>
          )}
        </SystemWindow>
      )}

      {reward && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 sys-window sys-window-gold p-3 animate-level-up">
          <div className="sys-title text-[10px]">REWARD</div>
          <div className="font-mono text-sm text-accent-gold mt-1">{reward}</div>
        </div>
      )}

      <SystemWindow title="PENALTY CLAUSE" variant="red">
        <p className="text-xs text-[#a9c7e0] font-mono">
          [ Should you fail to complete the daily quest, the System will dispense a penalty:
          STR&nbsp;-1, VIT&nbsp;-1, mana drain, and your streak resets. Do not be careless. ]
        </p>
      </SystemWindow>
    </div>
  );
}

function QuestItem({
  q,
  busy,
  onLog,
  gold = false,
}: {
  q: Quest;
  busy: string | null;
  onLog: (key: string, amount: number) => void;
  gold?: boolean;
}) {
  const pct = Math.min(100, (q.progress / q.target) * 100);
  const quicks = QUICK_AMOUNTS[q.key] || [1, 5, 10];
  return (
    <li
      className={`p-3 border rounded-sm transition-all ${
        q.completed
          ? gold
            ? 'border-accent-gold/60 bg-accent-gold/5 shadow-[0_0_18px_rgba(255,209,102,0.18)]'
            : 'border-accent-green/60 bg-accent-green/5 shadow-[0_0_18px_rgba(16,185,129,0.18)]'
          : gold
            ? 'border-accent-gold/30 bg-bg-base/60'
            : 'border-accent-cyan/30 bg-bg-base/60'
      }`}
    >
      <div className="flex justify-between items-center font-mono">
        <div className="text-sm tracking-widest">
          <span className={q.completed ? (gold ? 'text-accent-gold' : 'text-accent-green') : (gold ? 'text-accent-gold/70' : 'text-accent-cyan')}>
            {q.completed ? '✓' : '○'}
          </span>{' '}
          GOAL — {q.label}
        </div>
        <div className="text-xs text-[#a9c7e0]">
          {q.progress} / {q.target} {q.unit}
        </div>
      </div>
      <div className="h-1.5 bg-bg-base mt-1.5 border border-accent-cyan/15">
        <div
          className={`h-full transition-all duration-500 ${gold ? 'bg-gradient-to-r from-accent-gold to-accent-cyan' : 'bg-gradient-to-r from-accent-cyan to-accent-purple'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {!q.completed && (
        <div className="mt-2 flex flex-wrap gap-2">
          {quicks.map((n) => (
            <button
              key={n}
              disabled={busy === q.key}
              onClick={() => onLog(q.key, n)}
              className="sys-btn !py-1 !px-2 !text-[10px]"
            >
              +{n} {q.unit}
            </button>
          ))}
          <CustomInput onSubmit={(v) => onLog(q.key, v)} disabled={busy === q.key} unit={q.unit || ''} />
        </div>
      )}
    </li>
  );
}

function CustomInput({
  onSubmit,
  disabled,
  unit,
}: {
  onSubmit: (n: number) => void;
  disabled: boolean;
  unit: string;
}) {
  const [v, setV] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(v);
        if (!n || n <= 0) return;
        onSubmit(n);
        setV('');
      }}
      className="flex gap-1"
    >
      <input
        type="number"
        min={1}
        step="any"
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={unit}
        className="sys-input !py-1 !px-2 !text-[11px] w-24"
      />
      <button disabled={disabled} className="sys-btn !py-1 !px-2 !text-[10px]">LOG</button>
    </form>
  );
}
