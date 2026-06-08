import { redirect } from 'next/navigation';
import { getCurrentHunter } from '@/lib/auth';
import { getStats } from '@/lib/leveling';
import { AppShell } from '@/components/AppShell';
import { SystemWindow } from '@/components/SystemWindow';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { MAIN_LIFTS } from '@/lib/program';
import { ProgressChart } from './ProgressChart';
import { titleFor } from '@/lib/achievements';

export const dynamic = 'force-dynamic';

export default async function ProgressPage() {
  const user = await getCurrentHunter();
  if (!user) redirect('/login');
  const stats = await getStats(user.id);
  const sb = getAdminSupabase();

  // Pull all logs for main lifts in one go, then bucket by exercise+date in JS.
  const mainKeys = MAIN_LIFTS.map((m) => m.key);
  const { data: rows } = await sb
    .from('workout_logs')
    .select('exercise_key, session_date, weight')
    .eq('user_id', user.id)
    .in('exercise_key', mainKeys)
    .not('weight', 'is', null)
    .order('session_date', { ascending: true });

  const series = MAIN_LIFTS.map((m) => {
    const byDate = new Map<string, number>();
    for (const r of rows || []) {
      if (r.exercise_key !== m.key) continue;
      const w = Number(r.weight);
      const prev = byDate.get(r.session_date) || 0;
      if (w > prev) byDate.set(r.session_date, w);
    }
    const points = Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, topWeight]) => ({ date, topWeight }));
    return { key: m.key, name: m.name, points };
  });

  const { data: volRows } = await sb
    .from('workout_logs')
    .select('weight, reps')
    .eq('user_id', user.id)
    .not('weight', 'is', null)
    .not('reps', 'is', null);
  const totalVolume = (volRows || []).reduce(
    (acc, r: any) => acc + Number(r.weight) * Number(r.reps),
    0
  );

  const { data: sessRows } = await sb
    .from('workout_logs')
    .select('session_date, session_key')
    .eq('user_id', user.id);
  const totalSessions = new Set(
    (sessRows || []).map((r: any) => r.session_date + '|' + r.session_key)
  ).size;

  return (
    <AppShell hunterName={user.hunter_name} rank={stats.rank} level={stats.level} title={titleFor(user.active_title)} currentTz={user.timezone}>
      <SystemWindow title="PROGRESS REPORT" scan>
        <div className="grid grid-cols-3 gap-4 text-center font-mono">
          <Stat label="LEVEL" value={String(stats.level)} />
          <Stat label="SESSIONS" value={String(totalSessions)} />
          <Stat label="VOLUME" value={`${Math.round(totalVolume).toLocaleString()} kg`} />
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
