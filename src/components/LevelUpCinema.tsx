'use client';
import { useEffect, useRef, useState } from 'react';
import type { Notice } from './Notice';

const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  left: `${5 + (i * 5.3) % 90}%`,
  bottom: `${5 + (i * 8.1) % 45}%`,
  size: [5, 3, 4, 2, 3, 4][i % 6],
  delay: `${(i * 0.14).toFixed(2)}s`,
  dur: `${2 + (i % 5) * 0.45}s`,
}));

function parseLevelUp(title: string) {
  const m = title.match(/Lv\.(\d+)\s*→\s*Lv\.(\d+)/);
  return m ? { oldLv: +m[1], newLv: +m[2] } : null;
}

function parseRankUp(title: string) {
  const m = title.match(/\]\s+(\S+)\s*→\s*(\S+)/);
  return m ? { oldRank: m[1], newRank: m[2] } : null;
}

function rankLabel(r: string) {
  return r === 'National' ? 'N' : r;
}

export function LevelUpCinema() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(false);
  const dismissing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch('/api/notifications')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        const hits: Notice[] = (data.notifications as Notice[]).filter(
          (n) => !n.read && (n.kind === 'level_up' || n.kind === 'rank_up')
        );
        if (hits.length) {
          setNotices(hits);
          setTimeout(() => setVisible(true), 30);
        }
      });
  }, []);

  const current = notices[idx] ?? null;

  useEffect(() => {
    if (!visible || !current) return;
    timer.current = setTimeout(dismiss, 6000);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, idx]);

  async function dismiss() {
    if (dismissing.current || !current) return;
    dismissing.current = true;
    if (timer.current) clearTimeout(timer.current);
    setVisible(false);
    await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: current.id }),
    });
    setTimeout(() => {
      dismissing.current = false;
      if (idx + 1 < notices.length) {
        setIdx((i) => i + 1);
        setTimeout(() => setVisible(true), 30);
      } else {
        setNotices([]);
      }
    }, 420);
  }

  if (!current) return null;

  const isRankUp = current.kind === 'rank_up';
  const levelData = isRankUp ? null : parseLevelUp(current.title);
  const rankData = isRankUp ? parseRankUp(current.title) : null;
  const variant = isRankUp ? 'purple' : 'gold';
  const accentRgb = isRankUp ? '168,85,247' : '255,209,102';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: 'rgba(5,6,13,0.92)',
        backdropFilter: 'blur(10px)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.4s ease',
        cursor: 'pointer',
      }}
      onClick={dismiss}
    >
      {PARTICLES.map((p: typeof PARTICLES[number], i: number) => (
        <div
          key={i}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: p.left,
            bottom: p.bottom,
            width: p.size,
            height: p.size,
            background: `rgba(${accentRgb},0.8)`,
            boxShadow: `0 0 ${p.size * 3}px rgba(${accentRgb},0.9)`,
            animationName: 'particle-rise',
            animationDuration: p.dur,
            animationDelay: p.delay,
            animationIterationCount: 'infinite',
            animationTimingFunction: 'ease-out',
            animationFillMode: 'both',
          }}
        />
      ))}

      <div
        key={current.id}
        className={`sys-window sys-window-${variant} w-[90vw] max-w-sm p-8 text-center`}
        style={{
          transition: 'transform 0.45s cubic-bezier(.34,1.56,.64,1), opacity 0.4s ease',
          transform: visible ? 'scale(1) translateY(0)' : 'scale(0.82) translateY(24px)',
          opacity: visible ? 1 : 0,
        }}
      >
        <div className="sys-title text-sm mb-6 tracking-[0.3em]">
          {isRankUp ? '◈  RANK UP  ◈' : '◈  LEVEL UP  ◈'}
        </div>

        {!isRankUp && levelData && (
          <>
            <div className="flex items-center justify-center gap-4 mb-5">
              <span className="font-mono text-2xl" style={{ color: '#3a4f6a' }}>
                Lv.{levelData.oldLv}
              </span>
              <span className="sys-title opacity-50 text-xl">▶</span>
              <span
                className="font-mono font-black"
                style={{
                  fontSize: '4.5rem',
                  lineHeight: 1,
                  color: `rgb(${accentRgb})`,
                  textShadow: `0 0 40px rgba(${accentRgb},0.9), 0 0 12px rgba(${accentRgb},0.6)`,
                  animation: 'number-reveal 0.55s cubic-bezier(.34,1.56,.64,1) 0.3s both',
                }}
              >
                {levelData.newLv}
              </span>
            </div>
            <div className="sys-divider mb-4" />
            <p className="text-xs font-mono text-[#cfe6fb] leading-loose tracking-wide">
              {current.body}
            </p>
          </>
        )}

        {isRankUp && rankData && (
          <>
            <div className="flex items-center justify-center gap-5 mb-5">
              <div
                className={`rank-badge rank-${rankData.oldRank}`}
                style={{ width: '3.5rem', height: '3.5rem', fontSize: '1.5rem', opacity: 0.35 }}
              >
                {rankLabel(rankData.oldRank)}
              </div>
              <span className="sys-title opacity-50 text-xl">▶▶</span>
              <div className="flex flex-col items-center gap-2">
                <div
                  className={`rank-badge rank-${rankData.newRank}`}
                  style={{
                    width: '5rem',
                    height: '5rem',
                    fontSize: '2.25rem',
                    animation: 'number-reveal 0.55s cubic-bezier(.34,1.56,.64,1) 0.3s both',
                  }}
                >
                  {rankLabel(rankData.newRank)}
                </div>
                <span
                  className={`rank-${rankData.newRank} text-xs font-mono tracking-[0.2em]`}
                  style={{ textShadow: '0 0 8px currentColor' }}
                >
                  RANK {rankData.newRank.toUpperCase()}
                </span>
              </div>
            </div>
            <div className="sys-divider mb-4" />
            <p className="text-xs font-mono text-[#cfe6fb] leading-loose tracking-wide">
              {current.body}
            </p>
          </>
        )}

        <div className="text-[10px] font-mono tracking-[0.25em] opacity-40 mt-6">
          [ TAP TO CONTINUE ]
        </div>
      </div>
    </div>
  );
}
