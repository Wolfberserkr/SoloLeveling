import { motion } from 'framer-motion';
import { STATS, STAT_LABELS, type StatKey } from '@game/constants.ts';

type Props = {
  stats: Record<string, number>;
  /** Axis scale — every stat is plotted against this maximum. */
  max?: number;
  size?: number;
};

const CYAN = '#4ecbff';
const RINGS = [0.25, 0.5, 0.75, 1];

/**
 * Inline-SVG radar (spider) chart of the 9 attributes. Hand-rolled to match the
 * "system" look — no chart dependency, same approach as ManaOrb. Axis 0 sits at
 * the top and the nine axes fan out clockwise, so the three contiguous stat
 * groups (Physical / Mental / Character) occupy thirds of the circle.
 */
export function StatRadar({ stats, max = 100, size = 260 }: Props) {
  const c = size / 2;
  const outer = size * 0.32; // leaves room for the labels ringing the chart
  const n = STATS.length;

  // Polar → cartesian. i indexes the axis; f is the fraction of the outer radius.
  const point = (i: number, f: number) => {
    const angle = (-90 + (i * 360) / n) * (Math.PI / 180);
    return {
      x: c + Math.cos(angle) * outer * f,
      y: c + Math.sin(angle) * outer * f,
    };
  };

  const toPoly = (f: (i: number) => number) =>
    STATS.map((_, i) => {
      const p = point(i, f(i));
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    }).join(' ');

  const dataFrac = (key: StatKey) =>
    Math.max(0, Math.min(1, (Number(stats[key]) || 0) / max));

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="mx-auto block w-full max-w-[280px]"
      role="img"
      aria-label="Radar chart of your nine attributes"
    >
      {/* Concentric grid rings */}
      {RINGS.map((ring) => (
        <polygon
          key={ring}
          points={toPoly(() => ring)}
          fill="none"
          stroke={CYAN}
          strokeOpacity={0.14}
          strokeWidth={1}
        />
      ))}

      {/* Spokes */}
      {STATS.map((_, i) => {
        const p = point(i, 1);
        return (
          <line
            key={i}
            x1={c}
            y1={c}
            x2={p.x}
            y2={p.y}
            stroke={CYAN}
            strokeOpacity={0.12}
            strokeWidth={1}
          />
        );
      })}

      {/* Filled data polygon, drawn in from the centre */}
      <motion.polygon
        points={toPoly((i) => dataFrac(STATS[i]))}
        fill={CYAN}
        fillOpacity={0.22}
        stroke={CYAN}
        strokeWidth={1.5}
        strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 6px ${CYAN}66)`, transformOrigin: `${c}px ${c}px` }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 90, damping: 16 }}
      />

      {/* Vertex dots */}
      {STATS.map((key, i) => {
        const p = point(i, dataFrac(key));
        return <circle key={key} cx={p.x} cy={p.y} r={2.6} fill={CYAN} />;
      })}

      {/* Labels: stat key + current value, just outside each axis tip */}
      {STATS.map((key, i) => {
        const p = point(i, 1.18);
        const dx = p.x - c;
        const anchor = Math.abs(dx) < 4 ? 'middle' : dx > 0 ? 'start' : 'end';
        const value = Math.round(Number(stats[key]) || 0);
        return (
          <text
            key={key}
            x={p.x}
            y={p.y}
            textAnchor={anchor}
            dominantBaseline="middle"
            className="font-sys"
          >
            <tspan fill={CYAN} fontSize={9} letterSpacing={0.5}>
              {key}
            </tspan>
            <tspan fill="#e2e8f0" fontSize={9} dx={3} fontWeight={700}>
              {value}
            </tspan>
            <title>{STAT_LABELS[key]}</title>
          </text>
        );
      })}
    </svg>
  );
}
