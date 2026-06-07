'use client';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export function ProgressChart({ data }: { data: { date: string; topWeight: number }[] }) {
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="rgba(78, 203, 255, 0.08)" />
          <XAxis dataKey="date" stroke="#7aa0c2" tick={{ fontSize: 10 }} />
          <YAxis stroke="#7aa0c2" tick={{ fontSize: 10 }} />
          <Tooltip
            contentStyle={{
              background: '#0a0e1f',
              border: '1px solid rgba(78,203,255,0.45)',
              fontFamily: 'monospace',
              fontSize: 12,
              color: '#e6f4ff',
            }}
            labelStyle={{ color: '#4ecbff' }}
          />
          <Line type="monotone" dataKey="topWeight" stroke="#4ecbff" strokeWidth={2} dot={{ r: 3, fill: '#a855f7' }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
