import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getStats } from '@/lib/leveling';
import { AppShell } from '@/components/AppShell';
import { SystemWindow } from '@/components/SystemWindow';
import { getDb } from '@/lib/db';
import { MAIN_LIFTS } from '@/lib/program';
import { ProgressChart } from './ProgressChart';

export const dynamic = 'force-dynamic';

export default function ProgressPage() {
  const user = getCurrentUser();
  if (!user) redirect('/login');
  const stats = getStats(user.id);
  const db = getDb();

  const series = MAIN_LIFTS.map((m) => {
    const rows = db
      .prepare(
        `SELECT session_date as date, MAX(weight) as topWeight
         FROM workout_logs
         WHERE user_id = ? AND exercise_key = ? AND weight IS NOT NULL
         GROUP BY session_date ORDER BY session_date ASC`
      )
      .all(user.id, m.key) as any[];
    return { key: m.key, name: m.name, points: rows };
  });

  const totalVolume = db
    .prepare(
      `SELECT COALESCE(SUM(weight*reps),0) as v FROM workout_logs WHERE user_id = ? AND weight IS NOT NULL AND reps IS NOT NULL`
    )
    .get(user.id) as any;

  const totalSessions = db
    .prepare('SELECT COUNT(DISTINCT session_date || session_key) as c FROM workout_logs WHERE user_id = ?')
    .get(user.id) as any;

  return (
    <AppShell hunterName={user.hunter_name} rank={stats.rank} level={stats.level}>
      <SystemWindow title="PROGRESS REPORT" scan>
        <div className="grid grid-cols-3 gap-4 text-center font-mono">
          <Stat label="LEVEL" value={String(stats.level)} />
          <Stat label="SESSIONS" value={String(totalSessions.c)} />
          <Stat label="VOLUME" value={`${Math.round(totalVolume.v).toLocaleString()} kg`} />
        </div>
      </SystemWindow>

      <div className="grid md:grid-cols-2 gap-6">
        {series.map((s) => (
          <SystemWindow key={s.key} title={s.name + ' · TOP SET'} variant="purple">
            {s.points.length === 0 ? (
              <p className="text-xs text-[#a9c7e0] font-mono">[ NO DATA YET — LOG A SESSION ]</p>
            ) : (
              <ProgressChart data={s.points} />
            )}
          </SystemWindow>
        ))}
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] tracking-widest text-accent-cyan/70">{label}</div>
      <div className="text-2xl text-accent-cyan glow-text">{value}</div>
    </div>
  );
}
