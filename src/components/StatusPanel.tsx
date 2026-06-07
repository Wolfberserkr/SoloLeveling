'use client';
import { useState } from 'react';
import { SystemWindow } from './SystemWindow';

type Stats = {
  level: number;
  xp: number;
  xp_to_next: number;
  rank: string;
  str: number;
  agi: number;
  vit: number;
  int_: number;
  per: number;
  stat_points: number;
  streak: number;
  mana: number;
  mana_max: number;
};

const STAT_LABELS: Array<{ key: keyof Stats; label: string; tip: string }> = [
  { key: 'str', label: 'STR', tip: 'Strength — main lift weight, push power.' },
  { key: 'agi', label: 'AGI', tip: 'Agility — speed work, mobility, conditioning.' },
  { key: 'vit', label: 'VIT', tip: 'Vitality — recovery, capacity, work volume.' },
  { key: 'int_', label: 'INT', tip: 'Intelligence — programming knowledge, technique.' },
  { key: 'per', label: 'PER', tip: 'Perception — mind-muscle connection, focus.' },
];

export function StatusPanel({
  hunterName,
  stats: initial,
  armyPower = 0,
  armyCount = 0,
}: {
  hunterName: string;
  stats: Stats;
  armyPower?: number;
  armyCount?: number;
}) {
  const [stats, setStats] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function spend(stat: string) {
    setBusy(stat);
    const res = await fetch('/api/stats/allocate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stat, amount: 1 }),
    });
    if (res.ok) {
      const json = await res.json();
      setStats(json.stats);
    }
    setBusy(null);
  }

  const xpPct = Math.min(100, (stats.xp / stats.xp_to_next) * 100);

  return (
    <SystemWindow title="STATUS WINDOW" scan>
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <div className="text-[11px] font-mono tracking-[0.3em] text-accent-cyan/80">NAME</div>
          <div className="text-2xl font-mono tracking-wider glow-text text-white">{hunterName}</div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div>
              <div className="text-[10px] font-mono tracking-[0.3em] text-accent-cyan/70">CLASS</div>
              <div className="font-mono">Hunter</div>
            </div>
            <div>
              <div className="text-[10px] font-mono tracking-[0.3em] text-accent-cyan/70">LEVEL</div>
              <div className="font-mono text-xl text-accent-cyan glow-text">{stats.level}</div>
            </div>
            <div>
              <div className="text-[10px] font-mono tracking-[0.3em] text-accent-cyan/70">RANK</div>
              <div className={`rank-badge rank-${stats.rank} mt-1`}>{stats.rank}</div>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex justify-between text-[10px] font-mono tracking-widest text-accent-cyan/70">
              <span>EXP</span>
              <span>{stats.xp} / {stats.xp_to_next}</span>
            </div>
            <div className="xp-bar mt-1">
              <div className="xp-fill" style={{ width: `${xpPct}%` }} />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm font-mono">
            <div title="Spent on Mana Shield (30) to absorb a missed-day penalty. Rest days regen +10.">
              <div className="flex justify-between text-[10px] tracking-widest text-accent-cyan/70">
                <span>MANA</span>
                <span>{stats.mana} / {stats.mana_max}</span>
              </div>
              <div className="h-1.5 bg-bg-base mt-0.5 border border-accent-cyan/20 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-accent-purple to-accent-cyan"
                  style={{ width: `${Math.min(100, (stats.mana / stats.mana_max) * 100)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="text-[10px] tracking-widest text-accent-cyan/70">STREAK</div>
              <div className="text-accent-gold mt-0.5">{stats.streak}d</div>
            </div>
          </div>

          <div className="mt-3 flex items-baseline gap-3 text-sm font-mono">
            <span className="text-[10px] tracking-widest text-accent-purple">SHADOW ARMY</span>
            <span className="text-accent-purple glow-text">{armyCount}</span>
            <span className="text-[10px] text-accent-cyan/60">·</span>
            <span className="text-[10px] tracking-widest text-accent-gold">POWER</span>
            <span className="text-accent-gold glow-text">{armyPower.toLocaleString()}</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-baseline">
            <div className="text-[11px] font-mono tracking-[0.3em] text-accent-cyan/80">STATS</div>
            <div className="text-[11px] font-mono text-accent-gold">
              {stats.stat_points} unspent
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {STAT_LABELS.map(({ key, label, tip }) => (
              <div key={key} className="flex items-center gap-3" title={tip}>
                <div className="w-10 text-[11px] font-mono tracking-[0.2em] text-accent-cyan/80">{label}</div>
                <div className="flex-1 h-2 bg-bg-base border border-accent-cyan/20 rounded-sm overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-accent-cyan to-accent-purple"
                    style={{ width: `${Math.min(100, (Number(stats[key]) / 100) * 100)}%` }}
                  />
                </div>
                <div className="w-8 text-right font-mono text-sm">{Number(stats[key])}</div>
                <button
                  className="sys-btn text-[10px] !py-1 !px-2"
                  disabled={stats.stat_points <= 0 || busy === key}
                  onClick={() => spend(key as string)}
                >
                  +1
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SystemWindow>
  );
}
