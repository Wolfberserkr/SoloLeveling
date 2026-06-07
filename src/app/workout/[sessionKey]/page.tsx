import { redirect, notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getStats } from '@/lib/leveling';
import { AppShell } from '@/components/AppShell';
import { sessionFor, isDeloadWeek, weekNumberSince } from '@/lib/program';
import { SessionRunner } from './SessionRunner';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default function SessionPage({ params }: { params: { sessionKey: string } }) {
  const user = getCurrentUser();
  if (!user) redirect('/login');
  const session = sessionFor(params.sessionKey);
  if (!session) notFound();
  const stats = getStats(user.id);
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const acct = db.prepare('SELECT created_at FROM users WHERE id = ?').get(user.id) as any;
  const weekNo = weekNumberSince(new Date(acct.created_at));
  const deload = isDeloadWeek(weekNo);

  // Pull all logs for today's session
  const logs = db
    .prepare(
      'SELECT exercise_key, set_index, weight, reps FROM workout_logs WHERE user_id = ? AND session_date = ? AND session_key = ?'
    )
    .all(user.id, today, session.key) as any[];

  // Pull last-time bests per exercise (exclude today's logs so it's a true "last time")
  const lasts = db
    .prepare(
      `SELECT exercise_key, weight, reps
       FROM workout_logs
       WHERE user_id = ? AND session_date != ? AND exercise_key IN (${session.main.map(() => '?').join(',')})
         AND weight IS NOT NULL
       ORDER BY completed_at DESC`
    )
    .all(user.id, today, ...session.main.map((m) => m.key)) as any[];

  const lastByEx: Record<string, { weight: number; reps: number }> = {};
  for (const l of lasts) {
    if (!lastByEx[l.exercise_key]) lastByEx[l.exercise_key] = { weight: l.weight, reps: l.reps };
  }

  return (
    <AppShell hunterName={user.hunter_name} rank={stats.rank} level={stats.level}>
      <SessionRunner
        session={session}
        date={today}
        existingLogs={logs}
        lastSession={lastByEx}
        deload={deload}
        weekNo={weekNo}
      />
    </AppShell>
  );
}
