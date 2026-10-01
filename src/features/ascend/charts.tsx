// Ascend charts — plain SVG sized to their container, colored from the theme
// tokens so they read in light and dark.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  addDays, levelFromXp, overallDay, doneIndex, tally, weekStart, DAYS, WEEK_ORDER, type AscendData,
} from './logic';
import { cvar, fmt, fmtDate } from './ui';

function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}
function niceMax(v: number) {
  if (v <= 0) return 50;
  for (const s of [20, 50, 100, 150, 200, 250, 300, 400, 500, 600, 800, 1000, 1500, 2000, 3000, 5000]) if (v <= s) return s;
  return Math.ceil(v / 1000) * 1000;
}
const T = (fill: string, size = 10.5, extra: React.CSSProperties = {}) => ({ fill, fontSize: size, ...extra });

function Sized({ render, height, label }: { render: (w: number) => ReactNode; height: number; label: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  return (
    <div className="chart" ref={ref} style={{ minHeight: height }}>
      {w > 0 && <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} role="img" aria-label={label}>{render(w)}</svg>}
    </div>
  );
}

export function Radar({ data }: { data: AscendData }) {
  const t = tally(data);
  const [ref, w] = useWidth<HTMLDivElement>();
  const n = data.stats.length;
  if (n < 3) return null;
  const size = Math.min(w || 320, 360), cx = size / 2, cy = size / 2, R = size / 2 - (size < 340 ? 80 : 62);
  const lv = data.stats.map((s) => levelFromXp(t.stat[s.id] ?? 0));
  const maxL = Math.max(10, Math.ceil(Math.max(...lv) / 5) * 5);
  const pt = (i: number, r: number): [number, number] => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
  const poly = (f: (i: number) => number) => data.stats.map((_, i) => pt(i, f(i)).map((v) => v.toFixed(1)).join(',')).join(' ');
  return (
    <div className="chart" ref={ref} style={{ display: 'grid', placeItems: 'center', overflow: 'visible' }}>
      {w > 0 && (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Stat levels: ${data.stats.map((s, i) => `${s.name} ${lv[i]}`).join(', ')}`}>
          {[0.25, 0.5, 0.75, 1].map((f) => <polygon key={f} points={poly(() => R * f)} style={{ fill: 'none', stroke: 'var(--line)' }} />)}
          {data.stats.map((s, i) => { const [x, y] = pt(i, R); return <line key={s.id} x1={cx} y1={cy} x2={x} y2={y} style={{ stroke: 'var(--line)' }} />; })}
          {[[0.5, maxL / 2], [1, maxL]].map(([f, v]) => <text key={f} x={cx + 4} y={cy - R * f + 11} style={T('var(--faint)', 9.5, { fontFamily: 'var(--font-mono)' })}>{v}</text>)}
          <polygon points={poly((i) => (R * lv[i]) / maxL)} style={{ fill: 'color-mix(in srgb,var(--fg) 9%,transparent)', stroke: 'var(--fg)' }} strokeWidth={1.6} strokeLinejoin="round" />
          {data.stats.map((s, i) => { const [x, y] = pt(i, (R * lv[i]) / maxL); return <circle key={s.id} cx={x} cy={y} r={4.5} style={{ fill: cvar(s.color), stroke: 'var(--surface)' }} strokeWidth={2} />; })}
          {data.stats.map((s, i) => {
            const [x, y] = pt(i, R + 26);
            const anchor = Math.abs(x - cx) < 8 ? 'middle' : x > cx ? 'start' : 'end';
            return (
              <g key={s.id}>
                <text x={x} y={y - 4} textAnchor={anchor} style={T('var(--muted)', 11.5, { fontWeight: 500 })}>{s.name.split(' ')[0]}</text>
                <text x={x} y={y + 10} textAnchor={anchor} style={T(cvar(s.color), 12, { fontWeight: 600, fontFamily: 'var(--font-mono)' })}>{lv[i]}</text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

export function XpPerDay({ data, today }: { data: AscendData; today: string }) {
  const days = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));
  const map: Record<string, Record<string, number>> = {};
  for (const c of data.completions) if (c.localDate >= days[0]) { (map[c.localDate] ??= {})[c.statId] = (map[c.localDate]?.[c.statId] ?? 0) + c.xp; }
  const totals = days.map((k) => Object.values(map[k] ?? {}).reduce((a, b) => a + b, 0));
  const H = 190;
  return (
    <Sized height={H} label="XP per day over the last 30 days" render={(w) => {
      const pl = 36, pr = 6, pt = 10, pb = 24, pw = w - pl - pr, ph = H - pt - pb, max = niceMax(Math.max(...totals)), bw = pw / 30, gap = Math.min(3, bw * 0.25);
      const y = (v: number) => pt + ph - (v / max) * ph;
      return <>
        {[0, max / 2, max].map((v) => <g key={v}><line x1={pl} x2={w - pr} y1={y(v)} y2={y(v)} style={{ stroke: 'var(--line)' }} strokeDasharray={v ? '2 3' : undefined} /><text x={pl - 6} y={y(v) + 3.5} textAnchor="end" style={T('var(--faint)', 10.5, { fontFamily: 'var(--font-mono)' })}>{fmt(v)}</text></g>)}
        {days.map((k, i) => {
          let acc = 0;
          const x = pl + i * bw + gap / 2;
          return (
            <g key={k}>
              {data.stats.map((s) => {
                const v = map[k]?.[s.id];
                if (!v) return null;
                const el = <rect key={s.id} x={x} y={y(acc + v)} width={bw - gap} height={y(acc) - y(acc + v)} style={{ fill: cvar(s.color) }}><title>{`${fmtDate(k)} · ${s.name}: ${v} XP`}</title></rect>;
                acc += v;
                return el;
              })}
              {(i % 7 === 1 || i === 29) && <text x={i === 29 ? w - pr : x + (bw - gap) / 2} y={H - 6} textAnchor={i === 29 ? 'end' : 'middle'} style={T(i === 29 ? 'var(--fg)' : 'var(--faint)', 10.5, { fontWeight: i === 29 ? 600 : 400 })}>{i === 29 ? 'Today' : fmtDate(k)}</text>}
            </g>
          );
        })}
      </>;
    }} />
  );
}

export function Weekly({ data, today }: { data: AscendData; today: string }) {
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(weekStart(today), (i - 7) * 7));
  const counts = weeks.map((ws) => data.completions.filter((c) => c.localDate >= ws && c.localDate < addDays(ws, 7)).length);
  const H = 160;
  return (
    <Sized height={H} label="Quests completed per week" render={(w) => {
      const pl = 30, pr = 6, pt = 18, pb = 24, pw = w - pl - pr, ph = H - pt - pb, max = niceMax(Math.max(...counts)), bw = pw / 8;
      const y = (v: number) => pt + ph - (v / max) * ph;
      return <>
        {[0, max].map((v) => <g key={v}><line x1={pl} x2={w - pr} y1={y(v)} y2={y(v)} style={{ stroke: 'var(--line)' }} strokeDasharray={v ? '2 3' : undefined} /><text x={pl - 6} y={y(v) + 3.5} textAnchor="end" style={T('var(--faint)', 10.5, { fontFamily: 'var(--font-mono)' })}>{v}</text></g>)}
        {counts.map((c, i) => {
          const x = pl + i * bw + bw * 0.2, bwid = bw * 0.6, last = i === 7;
          return (
            <g key={weeks[i]}>
              <rect x={x} y={y(c)} width={bwid} height={pt + ph - y(c)} rx={4} style={{ fill: last ? 'var(--fg)' : 'color-mix(in srgb,var(--fg) 28%,var(--surface))' }} />
              {c > 0 && <text x={x + bwid / 2} y={y(c) - 5} textAnchor="middle" style={T(last ? 'var(--fg)' : 'var(--muted)', 10.5, { fontFamily: 'var(--font-mono)', fontWeight: 600 })}>{c}</text>}
              {(last || bw >= 52 || i % 2 === 1) && <text x={x + bwid / 2} y={H - 6} textAnchor="middle" style={T(last ? 'var(--fg)' : 'var(--faint)')}>{last ? 'This week' : fmtDate(weeks[i])}</text>}
            </g>
          );
        })}
      </>;
    }} />
  );
}

export function Donut({ data }: { data: AscendData }) {
  const t = tally(data);
  const size = 180, r = 66, sw = 22, C = 2 * Math.PI * r, cx = size / 2;
  const parts = data.stats.map((s) => ({ s, v: t.stat[s.id] ?? 0 })).filter((p) => p.v > 0);
  let off = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="XP by stat" style={{ flex: 'none' }}>
      <circle cx={cx} cy={cx} r={r} style={{ fill: 'none', stroke: 'var(--surface-2)' }} strokeWidth={sw} />
      {parts.map((p) => {
        const len = (p.v / t.total) * C, g = parts.length > 1 ? Math.min(2, len * 0.3) : 0;
        const el = <circle key={p.s.id} cx={cx} cy={cx} r={r} style={{ fill: 'none', stroke: cvar(p.s.color) }} strokeWidth={sw} strokeDasharray={`${Math.max(0, len - g)} ${C}`} strokeDashoffset={-off} transform={`rotate(-90 ${cx} ${cx})`}><title>{`${p.s.name}: ${fmt(p.v)} XP`}</title></circle>;
        off += len;
        return el;
      })}
      <text x="50%" y="47%" textAnchor="middle" style={T('var(--fg)', 22, { fontWeight: 600, fontFamily: 'var(--font-mono)' })}>{fmt(t.total)}</text>
      <text x="50%" y="60%" textAnchor="middle" style={T('var(--muted)', 11)}>lifetime XP</text>
    </svg>
  );
}

export function Heatmap({ data, today }: { data: AscendData; today: string }) {
  const start = addDays(weekStart(today), -77), idx = doneIndex(data);
  const cells = Array.from({ length: 84 }, (_, i) => {
    const k = addDays(start, i);
    if (k > today) return <i key={k} className="off" />;
    const r = overallDay(data, k, idx);
    const cls = !r.scheduled ? 'off' : r.ok ? 'ok' : r.done ? 'part' : k === today ? 'off' : 'miss';
    return <i key={k} className={`${cls}${k === today ? ' today' : ''}`} title={`${fmtDate(k)}: ${r.scheduled ? `${r.done}/${r.total} done` : 'nothing scheduled'}`} />;
  });
  return (
    <>
      <div className="heat-wrap">
        <div className="heat-days">{WEEK_ORDER.map((d, i) => <span key={d}>{i % 2 === 0 ? DAYS[d][0] : ''}</span>)}</div>
        <div className="heat" role="img" aria-label="Streak history, last 12 weeks">{cells}</div>
      </div>
      <div className="heat-legend">
        <span><i style={{ background: 'var(--fg)' }} />Counted</span>
        <span><i style={{ background: 'color-mix(in srgb,var(--fg) 30%,var(--surface))' }} />Some done</span>
        <span><i style={{ boxShadow: 'inset 0 0 0 1.5px var(--line-strong)' }} />Missed</span>
      </div>
    </>
  );
}
