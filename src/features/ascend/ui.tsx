// Shared Ascend UI pieces: icons, bars, rings, empty states, the two-tap
// confirm, confetti and the overlay hosts (toasts, celebrations, +XP).
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ASCEND, levelFromXp, titleFor, xpForLevel, type AscendData, type StatColor } from './logic';
import { useAscend } from './store';

const PATHS: Record<string, ReactNode> = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  timer: <><circle cx="12" cy="13.5" r="7" /><path d="M12 10v3.5l2.5 1.5M9.5 3h5M12 3v3.5" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" /></>,
  moon: <path d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.6 6.6 0 0 0 9.7 9.7z" />,
  auto: <><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.4-4 4.4-6 8-6s6.6 2 8 6" /></>,
  list: <><path d="M10 6.5h10M10 12h10M10 17.5h10" /><path d="M3.5 6.5l1.3 1.3L7.3 5.3M3.5 12l1.3 1.3 2.5-2.5M3.5 17.5l1.3 1.3 2.5-2.5" /></>,
  branch: <><circle cx="6" cy="5.5" r="2.2" /><circle cx="18" cy="9" r="2.2" /><circle cx="18" cy="18" r="2.2" /><path d="M6 7.7V21M6 13.5c0-3 3-4.5 9.8-4.5M6 18h9.8" /></>,
  ticket: <><path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z" /><path d="M14.5 7.5v9" strokeDasharray="1.5 2.4" /></>,
  bars: <path d="M5 20v-8M12 20V5M19 20v-5M3 20.5h18" />,
  flame: <path d="M12 2.8c.9 3.4 5.2 5.6 5.2 10.4a5.2 5.2 0 0 1-10.4 0c0-2.3 1.2-3.8 2.3-4.8.3 1.7 1.1 2.7 2.1 3.1-.1-3.1-.5-5.8.8-8.7z" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  chev: <path d="M9 6l6 6-6 6" />,
  play: <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />,
  pause: <path d="M8.5 5.5v13M15.5 5.5v13" />,
  trophy: <><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" /></>,
  up: <><path d="M5 14l7-7 7 7" /><path d="M5 20l7-7 7 7" opacity=".45" /></>,
  edit: <path d="M4 20h4L19 9l-4-4L4 16z" />,
  star: <path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.7 1-5.8-4.2-4.1 5.9-.9z" />,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  spark: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />,
  swap: <path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />,
};
export type IconName = keyof typeof PATHS;
export function Icon({ name }: { name: IconName }) {
  return <svg className="i" viewBox="0 0 24 24" aria-hidden="true">{PATHS[name]}</svg>;
}

export const cvar = (color: StatColor | string | undefined) =>
  `var(--c-${color && (ASCEND.colors as readonly string[]).includes(color) ? color : 'slate'})`;
export const statVar = (data: AscendData, statId: string | null | undefined): CSSProperties =>
  ({ '--c': cvar(data.stats.find((s) => s.id === statId)?.color) }) as CSSProperties;
export function statLabel(data: AscendData, statId: string | null | undefined, subId?: string | null) {
  const s = data.stats.find((x) => x.id === statId);
  const sub = subId ? data.subskills.find((x) => x.id === subId) : null;
  return (s ? s.name : 'Unassigned') + (sub ? ` · ${sub.name}` : '');
}
export const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const parseKey = (k: string) => new Date(`${k}T12:00:00Z`);
export const fmtDate = (k: string | null, year = false) =>
  k ? parseKey(k).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) }) : '';
export const fmtMonthYear = (k: string | null) => (k ? parseKey(k).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', year: 'numeric' }) : '');

/** Progress bar that grows from its previous width. */
export function Bar({ pct, lg, style }: { pct: number; lg?: boolean; style?: CSSProperties }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(Math.max(0, Math.min(1, pct)) * 100));
    return () => cancelAnimationFrame(id);
  }, [pct]);
  return <div className={`bar${lg ? ' lg' : ''}`} style={style}><i style={{ width: `${w}%` }} /></div>;
}

export function Ring({ pct, size = 56, stroke = 6, color = 'var(--c)', label = true }: { pct: number; size?: number; stroke?: number; color?: string; label?: boolean }) {
  const r = (size - stroke) / 2, C = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ flex: 'none' }}>
      <circle cx={size / 2} cy={size / 2} r={r} style={{ fill: 'none', stroke: 'var(--surface-2)' }} strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} style={{ fill: 'none', stroke: color, transition: 'stroke-dashoffset .8s' }} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={C} strokeDashoffset={C * (1 - p)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      {label && <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" style={{ fill: 'var(--fg)', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: Math.round(size * 0.24) }}>{Math.round(p * 100)}%</text>}
    </svg>
  );
}

export function Empty({ icon, title, children, action }: { icon: IconName; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="glyph"><Icon name={icon} /></div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
      <p className="tag">{ASCEND.tagline}</p>
    </div>
  );
}

/** Two-tap confirm for destructive or weighty actions (no browser dialogs). */
export function useConfirm() {
  const [armed, setArmed] = useState<string | null>(null);
  const t = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(t.current), []);
  return {
    armed,
    tap(key: string): boolean {
      if (armed === key) { setArmed(null); clearTimeout(t.current); return true; }
      setArmed(key);
      clearTimeout(t.current);
      t.current = setTimeout(() => setArmed(null), 3000);
      return false;
    },
  };
}

// ── Confetti (tiny canvas burst; skipped for reduced motion) ─────────────────
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export function confetti(root: HTMLElement | null, kind: 'stats' | 'gold' | 'ember') {
  if (!root || reducedMotion()) return;
  const css = getComputedStyle(root);
  const colors = kind === 'gold' ? [css.getPropertyValue('--gold'), '#F6DB8E', '#FFFFFF']
    : kind === 'ember' ? [css.getPropertyValue('--ember'), '#FFB27A', '#FFD9B8']
    : ASCEND.colors.slice(0, 7).map((c) => css.getPropertyValue(`--c-${c}`));
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr; canvas.height = window.innerHeight * dpr;
  root.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); return; }
  ctx.scale(dpr, dpr);
  const W = window.innerWidth, H = window.innerHeight;
  const parts = Array.from({ length: kind === 'ember' ? 90 : 130 }, () => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6, v = 9 + Math.random() * 9;
    return { x: W / 2, y: H * 0.62, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3, w: 6 + Math.random() * 5, h: 3 + Math.random() * 4, c: colors[Math.floor(Math.random() * colors.length)].trim() };
  });
  const start = performance.now();
  function frame(now: number) {
    ctx!.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.vy += 0.35; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx!.save(); ctx!.translate(p.x, p.y); ctx!.rotate(p.r); ctx!.fillStyle = p.c; ctx!.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx!.restore();
    }
    if (now - start < 2600) requestAnimationFrame(frame); else canvas.remove();
  }
  requestAnimationFrame(frame);
}

// ── Overlay hosts ────────────────────────────────────────────────────────────
export function Toasts() {
  const toasts = useAscend((s) => s.toasts);
  const dismiss = useAscend((s) => s.dismissToast);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast${t.level ? ' level' : ''}`}>
          <span className="tx">{t.text}</span>
          {t.action && <>
            <button type="button" onClick={() => { t.action!.run(); dismiss(t.id); }}>{t.action.label}</button>
            <span className="tbar" style={{ animationDuration: `${t.ms}ms` }} />
          </>}
        </div>
      ))}
    </div>
  );
}

export function Floats() {
  const floats = useAscend((s) => s.floats);
  const drop = useAscend((s) => s.dropFloat);
  const data = useAscend((s) => s.data);
  useEffect(() => {
    if (!floats.length) return;
    const t = setTimeout(() => drop(floats[0].id), 1100);
    return () => clearTimeout(t);
  }, [floats, drop]);
  return <>{floats.map((f) => <div key={f.id} className="floatxp" style={{ left: f.x, top: f.y, ...statVar(data, f.statId) }}>+{f.xp} XP</div>)}</>;
}

export function Celebrations({ rootRef }: { rootRef: React.RefObject<HTMLDivElement> }) {
  const modal = useAscend((s) => s.modals[0]);
  const close = useAscend((s) => s.closeModal);
  const claim = useAscend((s) => s.claim);
  const data = useAscend((s) => s.data);
  const today = useAscend((s) => s.today);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!modal) return;
    confetti(rootRef.current, modal.kind === 'ticket' ? 'gold' : modal.kind === 'boss' ? 'ember' : 'stats');
    btn.current?.focus();
  }, [modal, rootRef]);
  const missingTicket = modal?.kind === 'ticket' && !data.tickets.some((x) => x.id === modal.ticketId);
  useEffect(() => { if (missingTicket) close(); }, [missingTicket, close]);
  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, close]);
  if (!modal) return null;
  const total = data.completions.reduce((a, c) => a + c.xp, 0);
  let card: ReactNode;
  if (modal.kind === 'level') {
    const lv = modal.level;
    card = (
      <div className="modal-card" role="dialog" aria-modal="true" aria-label="Level up">
        <div className="medal"><span className="l">LEVEL</span><span className="v">{lv}</span></div>
        <h2>Level {lv} reached</h2>
        <p>{titleFor(lv) !== titleFor(lv - 1) ? <>New title: <b>{titleFor(lv)}</b>. </> : null}{lv < 100 ? `${fmt(xpForLevel(lv + 1) - total)} XP to level ${lv + 1}.` : 'The top of the curve.'}</p>
        <button ref={btn} className="btn primary" onClick={close}>Keep going</button>
      </div>
    );
  } else if (modal.kind === 'ticket') {
    const t = data.tickets.find((x) => x.id === modal.ticketId);
    if (!t) return null;
    card = (
      <div className="modal-card gold" role="dialog" aria-modal="true" aria-label="Golden Ticket unlocked">
        <div className="medal"><Icon name="ticket" /></div>
        <div className="eyebrow" style={{ color: 'var(--gold)' }}>Golden Ticket · {fmt(t.xp)} XP</div>
        <h2>{t.title}</h2>
        <p>You earned this one. Claim it when you're ready to enjoy it.</p>
        <button ref={btn} className="btn gold" onClick={() => { void claim(t.id); close(); }}>Claim now</button>
        <button className="btn ghost" style={{ marginTop: 0 }} onClick={close}>Later</button>
      </div>
    );
  } else {
    const b = modal.boss;
    const days = b.avoidingSince ? Math.round((Date.parse(today) - Date.parse(b.avoidingSince)) / 86400000) : null;
    card = (
      <div className="modal-card ember" role="dialog" aria-modal="true" aria-label="Boss defeated">
        <div className="medal"><Icon name="flame" /></div>
        <div className="eyebrow" style={{ color: 'var(--ember)' }}>Boss defeated · +{modal.xp} XP</div>
        <h2>{b.title}</h2>
        <p>{days != null ? `${days} days of avoiding it, done in one move. ` : ''}It now lives in the hall.</p>
        <button ref={btn} className="btn ember" onClick={close}>Victory</button>
      </div>
    );
  }
  return <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>{card}</div>;
}

/** Level shown in the sidebar and celebrations. */
export const totalXp = (d: AscendData) => d.completions.reduce((a, c) => a + c.xp, 0);
export const levelOf = (d: AscendData) => levelFromXp(totalXp(d));
