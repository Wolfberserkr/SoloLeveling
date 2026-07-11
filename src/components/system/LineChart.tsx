import { motion } from 'framer-motion';

type Props = {
  /** Y-values, evenly spaced along X (oldest → newest). */
  points: number[];
  /** Optional background bars (same length as points), scaled to their own max. */
  bars?: number[];
  /** Line colour. Defaults to the System cyan. */
  color?: string;
  /** Background-bar colour. Defaults to a faint gold. */
  barColor?: string;
  /** SVG drawing height in user units (width is fixed at 360, viewBox scales). */
  height?: number;
  /** Rendered under the chart: "<latest> · <trend>". Pass to override. */
  caption?: string;
  ariaLabel: string;
  /** Shown when there are fewer than two points. */
  emptyHint?: string;
};

const CYAN = '#4ecbff';
const GOLD = '#ffd166';
const W = 360;
const PAD = 10;

/**
 * Hand-rolled inline-SVG line chart in the System look — same dependency-free
 * approach as StatRadar / the Reset app's WeightChart, but reusable and dark
 * themed. An optional bar layer sits behind the line for context (e.g. daily
 * XP behind the cumulative level climb).
 */
export function LineChart({
  points,
  bars,
  color = CYAN,
  barColor = GOLD,
  height = 96,
  caption,
  ariaLabel,
  emptyHint = 'Not enough data yet — check back once you have logged a few more days.',
}: Props) {
  if (points.length < 2) {
    return (
      <p className="font-sys text-xs leading-relaxed text-slate-500">{emptyHint}</p>
    );
  }

  const H = height;
  const minV = Math.min(...points);
  const maxV = Math.max(...points);
  const span = maxV - minV || 1; // avoid /0 on a flat line
  const lo = minV - span * 0.08;
  const hi = maxV + span * 0.08;

  const toX = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const toY = (v: number) => PAD + (1 - (v - lo) / (hi - lo)) * (H - PAD * 2);

  const poly = points.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');

  // Background bars share the X axis but scale to their own max, along the floor.
  const barMax = bars && bars.length ? Math.max(...bars, 1) : 1;
  const barW = bars && bars.length ? Math.max(1.5, ((W - PAD * 2) / bars.length) * 0.6) : 0;

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={ariaLabel}>
        {/* Faint horizontal grid */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={PAD}
            x2={W - PAD}
            y1={PAD + f * (H - PAD * 2)}
            y2={PAD + f * (H - PAD * 2)}
            stroke={color}
            strokeOpacity={0.1}
            strokeWidth={1}
          />
        ))}

        {/* Background bars (optional) */}
        {bars?.map((b, i) => {
          const h = (b / barMax) * (H - PAD * 2);
          if (h <= 0) return null;
          const x = toX(i) - barW / 2;
          return (
            <rect
              key={i}
              x={x.toFixed(1)}
              y={(H - PAD - h).toFixed(1)}
              width={barW.toFixed(1)}
              height={h.toFixed(1)}
              fill={barColor}
              fillOpacity={0.18}
            />
          );
        })}

        {/* The line, drawn on with a left-to-right reveal */}
        <motion.polyline
          points={poly}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 5px ${color}66)` }}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />

        {/* Endpoint dot */}
        <circle cx={toX(points.length - 1)} cy={toY(points[points.length - 1])} r={3.5} fill={color} />
      </svg>
      {caption && (
        <div className="mt-1 text-center font-sys text-[0.65rem] uppercase tracking-widest text-slate-400">
          {caption}
        </div>
      )}
    </div>
  );
}
