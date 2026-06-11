type Props = {
  rank: string;
  size?: number;
};

export function RankBadge({ rank, size = 44 }: Props) {
  const display = rank === 'National' ? 'N' : rank === 'Monarch' ? 'M' : rank;
  return (
    <span
      className={`rank-badge rank-${rank} animate-pulse-glow`}
      style={{ width: size, height: size, fontSize: size * 0.52 }}
      title={`${rank}-Rank`}
    >
      {display}
    </span>
  );
}
