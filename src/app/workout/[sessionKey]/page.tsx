import { redirect, notFound } from 'next/navigation';
import { getCurrentHunter } from '@/lib/auth';
import { getStats } from '@/lib/leveling';
import { AppShell } from '@/components/AppShell';
import { sessionFor, isDeloadWeek, weekNumberSince } from '@/lib/program';
import { SessionRunner } from './SessionRunner';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { titleFor } from '@/lib/achievements';
import { todayInTz } from '@/lib/time';

export const dynamic = 'force-dynamic';

export default async function SessionPage({ params }: { params: { sessionKey: string } }) {
  const user = await getCurrentHunter();
  if (!user) redirect('/login');
  const session = sessionFor(params.sessionKey);
  if (!session) notFound();
  const stats = await getStats(user.id);
  const sb = getAdminSupabase();
  const today = todayInTz(user.timezone);

  const { data: profile } = await sb
    .from('profiles')
    .select('created_at')
    .eq('id', user.id)
    .single();
  const weekNo = weekNumberSince(profile?.created_at ? new Date(profile.created_at) : new Date());
  const deload = isDeloadWeek(weekNo);

  const { data: logs } = await sb
    .from('workout_logs')
    .select('exercise_key, set_index, weight, reps')
    .eq('user_id', user.id)
    .eq('session_date', today)
    .eq('session_key', session.key);

  const mainKeys = session.main.map((m) => m.key);
  const { data: lasts } = await sb
    .from('workout_logs')
    .select('exercise_key, weight, reps, completed_at')
    .eq('user_id', user.id)
    .neq('session_date', today)
    .in('exercise_key', mainKeys)
    .not('weight', 'is', null)
    .order('completed_at', { ascending: false });

  const lastByEx: Record<string, { weight: number; reps: number }> = {};
  for (const l of lasts || []) {
    if (!lastByEx[l.exercise_key]) lastByEx[l.exercise_key] = { weight: l.weight, reps: l.reps };
  }

  return (
    <AppShell hunterName={user.hunter_name} rank={stats.rank} level={stats.level} title={titleFor(user.active_title)}>
      <SessionRunner
        session={session}
        date={today}
        existingLogs={(logs || []) as any}
        lastSession={lastByEx}
        deload={deload}
        weekNo={weekNo}
      />
    </AppShell>
  );
}
