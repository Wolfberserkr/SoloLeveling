'use client';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { SystemWindow } from '@/components/SystemWindow';
import type { Session, Exercise } from '@/lib/program';
import { ytURL } from '@/lib/program';

type Log = { exercise_key: string; set_index: number; weight: number | null; reps: number | null };

export function SessionRunner({
  session,
  date,
  existingLogs,
  lastSession,
  deload,
  weekNo,
}: {
  session: Session;
  date: string;
  existingLogs: Log[];
  lastSession: Record<string, { weight: number; reps: number }>;
  deload: boolean;
  weekNo: number;
}) {
  const router = useRouter();
  const [openWarm, setOpenWarm] = useState(false);
  const [openCool, setOpenCool] = useState(false);
  const [reward, setReward] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [logs, setLogs] = useState<Record<string, Log[]>>(() => {
    const map: Record<string, Log[]> = {};
    for (const e of session.main) {
      map[e.key] = new Array(e.sets).fill(0).map((_, i) => ({
        exercise_key: e.key,
        set_index: i,
        weight: null,
        reps: null,
      }));
    }
    for (const l of existingLogs) {
      if (map[l.exercise_key] && map[l.exercise_key][l.set_index]) {
        map[l.exercise_key][l.set_index] = { ...l };
      }
    }
    return map;
  });

  function updateSet(exKey: string, setIdx: number, field: 'weight' | 'reps', val: string) {
    setLogs((prev) => {
      const next = { ...prev, [exKey]: [...prev[exKey]] };
      next[exKey][setIdx] = { ...next[exKey][setIdx], [field]: val === '' ? null : Number(val) };
      return next;
    });
  }

  async function saveSet(exKey: string, setIdx: number) {
    const entry = logs[exKey][setIdx];
    if (entry.weight == null || entry.reps == null) return;
    const res = await fetch('/api/workouts/log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        session_key: session.key,
        exercise_key: exKey,
        set_index: setIdx,
        weight: entry.weight,
        reps: entry.reps,
        date,
      }),
    });
    if (res.ok) {
      const j = await res.json();
      if (j.pr) {
        setReward(`PR! ${j.pr.exercise} — ${j.pr.weight} × ${j.pr.reps}`);
        setTimeout(() => setReward(null), 3500);
      }
    }
  }

  async function completeSession() {
    setCompleting(true);
    const res = await fetch('/api/workouts/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session_key: session.key, date, deload }),
    });
    if (res.ok) {
      const j = await res.json();
      setReward(`Session cleared. +${j.xpGained} XP`);
      setTimeout(() => {
        router.push('/dashboard');
        router.refresh();
      }, 1400);
    }
    setCompleting(false);
  }

  const completedSets = useMemo(() => {
    let c = 0;
    let total = 0;
    for (const ex of session.main) {
      total += ex.sets;
      for (const s of logs[ex.key]) if (s.weight != null && s.reps != null) c++;
    }
    return { c, total };
  }, [logs, session]);

  return (
    <div className="space-y-6">
      <SystemWindow title={session.title} variant={deload ? 'gold' : 'purple'} scan>
        <p className="text-sm text-[#cfe6fb]">{session.subtitle}</p>
        <div className="mt-1 text-[10px] font-mono tracking-widest text-accent-cyan/70">
          [ {session.difficulty} · WEEK {weekNo}{deload ? ' · DELOAD' : ''} ]
        </div>
        <div className="mt-3 flex items-center gap-3 text-xs font-mono">
          <span className="text-accent-cyan">Sets logged: {completedSets.c} / {completedSets.total}</span>
          <button
            onClick={completeSession}
            disabled={completing || completedSets.c === 0}
            className="sys-btn !text-[11px]"
          >
            {completing ? 'COMPLETING…' : 'COMPLETE SESSION'}
          </button>
        </div>
      </SystemWindow>

      {/* WARMUP */}
      <SystemWindow
        title="WARMUP · 5 MIN"
        right={
          <button onClick={() => setOpenWarm((v) => !v)} className="sys-btn !py-1 !text-[10px]">
            {openWarm ? 'COLLAPSE' : 'EXPAND'}
          </button>
        }
      >
        {openWarm ? (
          <ul className="space-y-2">
            {session.warmup.map((w) => (
              <li key={w.key} className="flex justify-between items-center text-sm">
                <span className="font-mono">
                  · {w.name} <span className="text-[#7aa0c2]">— {w.sets}×{w.reps}</span>
                </span>
                <a href={ytURL(w.videoQuery)} target="_blank" rel="noreferrer" className="sys-btn !py-1 !text-[10px]">DEMO</a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-[#a9c7e0] font-mono">[ Collapsed — expand to view drills ]</p>
        )}
      </SystemWindow>

      {/* MAIN BLOCK */}
      <div className="space-y-4">
        {session.main.map((ex) => (
          <ExerciseCard
            key={ex.key}
            ex={ex}
            sets={logs[ex.key]}
            last={lastSession[ex.key]}
            deload={deload}
            onChange={(setIdx, field, v) => updateSet(ex.key, setIdx, field, v)}
            onSave={(setIdx) => saveSet(ex.key, setIdx)}
          />
        ))}
      </div>

      {/* COOLDOWN */}
      <SystemWindow
        title="COOLDOWN · 3 MIN"
        right={
          <button onClick={() => setOpenCool((v) => !v)} className="sys-btn !py-1 !text-[10px]">
            {openCool ? 'COLLAPSE' : 'EXPAND'}
          </button>
        }
      >
        {openCool ? (
          <ul className="space-y-2">
            {session.cooldown.map((w) => (
              <li key={w.key} className="flex justify-between items-center text-sm">
                <span className="font-mono">
                  · {w.name} <span className="text-[#7aa0c2]">— {w.sets}×{w.reps}</span>
                </span>
                <a href={ytURL(w.videoQuery)} target="_blank" rel="noreferrer" className="sys-btn !py-1 !text-[10px]">DEMO</a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-[#a9c7e0] font-mono">[ Collapsed — expand to view stretches ]</p>
        )}
      </SystemWindow>

      {reward && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 sys-window sys-window-gold p-3 animate-level-up">
          <div className="sys-title text-[10px]">SYSTEM</div>
          <div className="font-mono text-sm text-accent-gold mt-1">{reward}</div>
        </div>
      )}
    </div>
  );
}

function ExerciseCard({
  ex,
  sets,
  last,
  deload,
  onChange,
  onSave,
}: {
  ex: Exercise;
  sets: Log[];
  last?: { weight: number; reps: number };
  deload: boolean;
  onChange: (setIdx: number, field: 'weight' | 'reps', v: string) => void;
  onSave: (setIdx: number) => void;
}) {
  const [restRemaining, setRestRemaining] = useState<number>(0);

  function startRest() {
    setRestRemaining(ex.restSec);
    const iv = setInterval(() => {
      setRestRemaining((r) => {
        if (r <= 1) {
          clearInterval(iv);
          try { new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=').play(); } catch {}
          return 0;
        }
        return r - 1;
      });
    }, 1000);
  }

  return (
    <SystemWindow
      title={ex.name + (ex.isMain ? '  ★' : '')}
      variant={ex.isMain ? 'cyan' : 'purple'}
      right={
        <a href={ytURL(ex.videoQuery)} target="_blank" rel="noreferrer" className="sys-btn !py-1 !text-[10px]">DEMO</a>
      }
    >
      <div className="flex flex-wrap items-baseline gap-3 text-xs font-mono">
        <span className="text-accent-cyan">{ex.sets} × {ex.reps}</span>
        <span className="text-[#7aa0c2]">rest {ex.restSec}s</span>
        {last && (
          <span className="text-[#a9c7e0]">last: {last.weight} × {last.reps}</span>
        )}
        {ex.isMain && !deload && (
          <span className="text-accent-gold">+2.5 kg / 5 lb when cleared</span>
        )}
        {deload && ex.isMain && (
          <span className="text-accent-gold">DELOAD · use ~60%</span>
        )}
      </div>
      {ex.note && <p className="text-[11px] text-[#7aa0c2] mt-1 font-mono">{ex.note}</p>}

      <div className="mt-3 space-y-2">
        {sets.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-12 text-[11px] tracking-widest font-mono text-accent-cyan/70">SET {i + 1}</span>
            <input
              type="number"
              step="0.5"
              min="0"
              placeholder="kg/lb"
              value={s.weight ?? ''}
              onChange={(e) => onChange(i, 'weight', e.target.value)}
              onBlur={() => onSave(i)}
              className="sys-input !py-1 !px-2 !text-sm w-24"
            />
            <span className="text-[#7aa0c2]">×</span>
            <input
              type="number"
              min="0"
              placeholder="reps"
              value={s.reps ?? ''}
              onChange={(e) => onChange(i, 'reps', e.target.value)}
              onBlur={() => onSave(i)}
              className="sys-input !py-1 !px-2 !text-sm w-20"
            />
            <button onClick={() => onSave(i)} className="sys-btn !py-1 !text-[10px]">SAVE</button>
            <button onClick={startRest} className="sys-btn !py-1 !text-[10px]">REST</button>
          </div>
        ))}
        {restRemaining > 0 && (
          <div className="mt-2 font-mono text-sm text-accent-cyan animate-pulse-glow inline-block px-3 py-1 border border-accent-cyan/40 rounded-sm">
            REST · {Math.floor(restRemaining / 60)}:{String(restRemaining % 60).padStart(2, '0')}
          </div>
        )}
      </div>
    </SystemWindow>
  );
}
