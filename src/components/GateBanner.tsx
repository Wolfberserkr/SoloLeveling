'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SystemWindow } from './SystemWindow';

type Gate = {
  id: number;
  gate_key: string;
  label: string;
  rank: string;
  target: number;
  progress: number;
  unit: string | null;
  mirrors: string | null;
  expires_at: string;
  reward_xp: number;
  reward_extra: string | null;
};

const RANK_VARIANT: Record<string, 'cyan' | 'purple' | 'gold' | 'red'> = {
  D: 'cyan',
  C: 'cyan',
  B: 'purple',
  A: 'gold',
  S: 'red',
};

function fmtTime(ms: number) {
  if (ms <= 0) return 'EXPIRED';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function GateBanner({ initial }: { initial: Gate | null }) {
  const router = useRouter();
  const [gate, setGate] = useState<Gate | null>(initial);
  const [remaining, setRemaining] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (!gate) return;
    const tick = () => {
      const ms = new Date(gate.expires_at).getTime() - Date.now();
      setRemaining(fmtTime(ms));
      if (ms <= 0) {
        setGate(null);
        router.refresh();
      }
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [gate, router]);

  if (!gate) return null;

  const pct = Math.min(100, (gate.progress / gate.target) * 100);
  const variant = RANK_VARIANT[gate.rank] || 'red';

  async function log(n: number) {
    setBusy(true);
    const res = await fetch('/api/gates/progress', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: n }),
    });
    if (res.ok) {
      const j = await res.json();
      if (j.cleared) {
        setGate(null);
        router.refresh();
      } else if (j.gate) {
        setGate(j.gate);
      }
    }
    setBusy(false);
    setAmount('');
  }

  const quicks: number[] = gate.unit === 'kg' ? [100, 250, 500] : gate.unit === 'km' ? [1, 2, 5] : [5, 10, 25];

  return (
    <SystemWindow
      title={`${gate.label}  ·  RANK ${gate.rank}`}
      variant={variant}
      scan
      right={
        <span className="text-[10px] font-mono tracking-widest text-accent-cyan animate-flicker">
          {remaining}
        </span>
      }
    >
      <div className="flex justify-between text-xs font-mono mb-1">
        <span className="text-[#cfe6fb]">
          {gate.progress} / {gate.target} {gate.unit}
        </span>
        <span className="text-accent-gold">
          +{gate.reward_xp} XP{gate.reward_extra ? ` · ${gate.reward_extra}` : ''}
        </span>
      </div>
      <div className="h-2 bg-bg-base border border-accent-cyan/20 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-accent-red via-accent-gold to-accent-cyan transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-mono tracking-widest text-accent-cyan/70">LOG:</span>
        {quicks.map((n) => (
          <button
            key={n}
            disabled={busy}
            onClick={() => log(n)}
            className="sys-btn !py-1 !px-2 !text-[10px]"
          >
            +{n} {gate.unit}
          </button>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(amount);
            if (n > 0) log(n);
          }}
          className="flex gap-1"
        >
          <input
            type="number"
            min={1}
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={gate.unit || ''}
            className="sys-input !py-1 !px-2 !text-[11px] w-24"
          />
          <button disabled={busy} className="sys-btn !py-1 !px-2 !text-[10px]">LOG</button>
        </form>
      </div>
      {gate.mirrors && gate.mirrors !== 'workout_volume' && (
        <p className="text-[10px] text-[#5d7a96] font-mono mt-2">
          [ TIP: progress on the {gate.mirrors.toUpperCase()} daily quest auto-credits this gate. ]
        </p>
      )}
    </SystemWindow>
  );
}
