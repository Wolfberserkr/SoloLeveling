// Small SVG chart for Project Viking: lines, dots, bars, a corridor band and a
// target line, on one shared x (day number) / y scale.
import { fmtD, iso } from './vikingLogic';

type Pt = [number, number];
export type Layer =
  | { type: 'band'; pts: Array<[number, number, number]> }
  | { type: 'line'; pts: Pt[] }
  | { type: 'dots'; pts: Pt[]; cls?: string; r?: number }
  | { type: 'end'; pt?: Pt }
  | { type: 'bars'; pts: Array<[number, number, string?]> }
  | { type: 'hline'; y: number; label?: string };

export type Tick = { x: number; l: string };

function niceStep(r: number) {
  if (r <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(r)));
  const f = r / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

export function dateTicks(a: number, b: number, n = 4): Tick[] {
  if (b <= a) return [{ x: a, l: fmtD(iso(a)) }];
  const out: Tick[] = [];
  for (let i = 0; i < n; i++) {
    const x = Math.round(a + ((b - a) * i) / (n - 1));
    out.push({ x, l: fmtD(iso(x)) });
  }
  return out;
}

export function Chart(o: {
  x0: number; x1: number; y0: number; y1: number;
  h?: number; xt?: Tick[]; yFmt?: (v: number) => string; aria: string; layers: Layer[];
}) {
  const w = 360, h = o.h ?? 170, L = 38, R = 10, T = 10, B = 22, iw = w - L - R, ih = h - T - B;
  const { x0, x1 } = o;
  let { y0, y1 } = o;
  if (y1 - y0 < 1e-6) { y1 += 1; y0 -= 1; }
  const sx = (x: number) => L + (x1 === x0 ? iw / 2 : ((x - x0) / (x1 - x0)) * iw);
  const sy = (y: number) => T + (1 - (y - y0) / (y1 - y0)) * ih;
  const f = (n: number) => n.toFixed(1);
  const step = niceStep((y1 - y0) / 4), dec = step < 1 ? 1 : 0;

  const grid: JSX.Element[] = [];
  for (let v = Math.ceil(y0 / step - 1e-9) * step, i = 0; v <= y1 + 1e-9; v += step, i++) {
    grid.push(
      <g key={`g${i}`}>
        <line className="grid" x1={L} x2={w - R} y1={f(sy(v))} y2={f(sy(v))} />
        <text className="ax" x={L - 6} y={f(sy(v) + 3.5)} textAnchor="end">{o.yFmt ? o.yFmt(v) : v.toFixed(dec)}</text>
      </g>,
    );
  }

  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={o.aria}>
      {grid}
      {(o.xt ?? []).map((tk, i) => (
        <text key={`x${i}`} className="ax" x={f(sx(tk.x))} y={h - 6} textAnchor="middle">{tk.l}</text>
      ))}
      {o.layers.map((ly, li) => {
        switch (ly.type) {
          case 'band': {
            if (ly.pts.length < 2) return null;
            const top = ly.pts.map((p) => `${f(sx(p[0]))},${f(sy(p[2]))}`);
            const bot = ly.pts.slice().reverse().map((p) => `${f(sx(p[0]))},${f(sy(p[1]))}`);
            return <polygon key={li} className="band" points={top.concat(bot).join(' ')} />;
          }
          case 'line':
            return ly.pts.length > 1
              ? <polyline key={li} className="ln" points={ly.pts.map((p) => `${f(sx(p[0]))},${f(sy(p[1]))}`).join(' ')} />
              : null;
          case 'dots':
            return (
              <g key={li}>
                {ly.pts.map((p, i) => (
                  <circle key={i} className={`dt ${ly.cls ?? ''}`} cx={f(sx(p[0]))} cy={f(sy(p[1]))} r={ly.r ?? 2.6} />
                ))}
              </g>
            );
          case 'end':
            return ly.pt ? <circle key={li} className="end" cx={f(sx(ly.pt[0]))} cy={f(sy(ly.pt[1]))} r={4.5} /> : null;
          case 'bars': {
            const bw = Math.max(3, (iw / (x1 - x0)) * 0.62);
            return (
              <g key={li}>
                {ly.pts.map((p, i) => {
                  const y = sy(Math.max(p[1], y0)), b = sy(y0);
                  return <rect key={i} className={`br ${p[2] ?? ''}`} x={f(sx(p[0]) - bw / 2)} y={f(y)} width={f(bw)} height={f(Math.max(0, b - y))} rx={2} />;
                })}
              </g>
            );
          }
          case 'hline': {
            const y = sy(ly.y);
            return (
              <g key={li}>
                <line className="hl" x1={L} x2={w - R} y1={f(y)} y2={f(y)} />
                {ly.label && <text className="hlt" x={w - R} y={f(y - 5)} textAnchor="end">{ly.label}</text>}
              </g>
            );
          }
        }
      })}
    </svg>
  );
}
