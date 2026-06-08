'use client';
import { useState } from 'react';
import { LevelUpCinema } from '@/components/LevelUpCinema';
import type { Notice } from '@/components/Notice';

const MOCK_LEVEL_UP: Notice = {
  id: -1,
  kind: 'level_up',
  title: '[ LEVEL UP ]  Lv.12 → Lv.13',
  body: 'Cleared dungeon: upper_a. +5 stat point(s), +1 skill point(s).',
  created_at: Date.now(),
  read: 0,
};

const MOCK_RANK_UP: Notice = {
  id: -2,
  kind: 'rank_up',
  title: '[ RANK UP ]  D → C',
  body: 'The System has re-evaluated you as a Rank C Hunter.',
  created_at: Date.now(),
  read: 0,
};

const MOCK_BOTH: Notice[] = [MOCK_LEVEL_UP, MOCK_RANK_UP];

export default function DemoPage() {
  const [key, setKey] = useState(0);
  const [mock, setMock] = useState<Notice[] | null>(null);

  function trigger(notices: Notice[]) {
    setMock(null);
    setTimeout(() => {
      setMock(notices);
      setKey((k) => k + 1);
    }, 50);
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-6 p-8"
      style={{ background: '#05060d' }}
    >
      <div className="sys-title text-lg tracking-[0.3em]">◈  CINEMATIC DEMO  ◈</div>
      <p className="text-xs font-mono text-[#465e7a] text-center max-w-xs">
        Trigger a preview of the level-up / rank-up overlays without needing real XP.
      </p>
      <div className="flex flex-wrap gap-3 justify-center">
        <button className="sys-btn" onClick={() => trigger([MOCK_LEVEL_UP])}>
          Level Up
        </button>
        <button className="sys-btn sys-window-purple" onClick={() => trigger([MOCK_RANK_UP])}>
          Rank Up
        </button>
        <button className="sys-btn sys-window-gold" onClick={() => trigger(MOCK_BOTH)}>
          Both (queue)
        </button>
      </div>

      {mock && <LevelUpCinema key={key} mockNotices={mock} />}
    </div>
  );
}
