import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getStats } from '@/lib/leveling';
import { AppShell } from '@/components/AppShell';
import { SystemWindow } from '@/components/SystemWindow';
import { PROGRAM, isDeloadWeek, weekNumberSince, DELOAD_EVERY_WEEKS } from '@/lib/program';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function WorkoutHub() {
  const user = getCurrentUser();
  if (!user) redirect('/login');
  const stats = getStats(user.id);
  const db = getDb();
  const acct = db.prepare('SELECT created_at FROM users WHERE id = ?').get(user.id) as any;
  const startDate = new Date(acct.created_at);
  const weekNo = weekNumberSince(startDate);
  const deload = isDeloadWeek(weekNo);

  const today = new Date();
  const dayIdx = today.getDay();

  return (
    <AppShell hunterName={user.hunter_name} rank={stats.rank} level={stats.level}>
      {deload && (
        <SystemWindow title="DELOAD WEEK ACTIVE" variant="gold" scan>
          <p className="text-sm text-[#e6f4ff] mb-2">
            Week <b>{weekNo}</b> — the System has scheduled a recovery cycle.
          </p>
          <ul className="text-xs space-y-1 font-mono text-[#cfe6fb]">
            <li>· Drop main-lift load to ~60% of last week's weights.</li>
            <li>· Keep the same sets and reps; bar speed stays crisp.</li>
            <li>· Sleep 8+ hrs. Walk between sessions. Hydrate.</li>
            <li>· On completion: earn a Shadow Extraction power-up.</li>
          </ul>
        </SystemWindow>
      )}

      <SystemWindow title="WEEKLY GATE SCHEDULE" right={<span className="text-[10px] font-mono text-accent-cyan/70">WEEK {weekNo} · DELOAD EVERY {DELOAD_EVERY_WEEKS}W</span>}>
        <div className="grid grid-cols-7 gap-1 md:gap-2">
          {DAY_NAMES.map((name, i) => {
            const session = PROGRAM.find((s) => s.day === i);
            const isToday = i === dayIdx;
            return (
              <div
                key={i}
                className={`p-2 border rounded-sm text-center transition-all ${
                  isToday
                    ? 'border-accent-cyan bg-accent-cyan/10 shadow-glow'
                    : 'border-accent-cyan/20 bg-bg-base/40'
                }`}
              >
                <div className="text-[10px] font-mono tracking-widest text-accent-cyan/70">{name}</div>
                {session ? (
                  <Link
                    href={`/workout/${session.key}`}
                    className="block mt-1 text-[10px] font-mono text-accent-cyan hover:underline"
                  >
                    {session.title.split('—')[0].trim().replace('GATE: ', '')}
                  </Link>
                ) : (
                  <div className="mt-1 text-[10px] font-mono text-[#465e7a]">REST</div>
                )}
              </div>
            );
          })}
        </div>
      </SystemWindow>

      <div className="grid md:grid-cols-2 gap-6">
        {PROGRAM.map((s) => (
          <Link key={s.key} href={`/workout/${s.key}`} className="block group">
            <SystemWindow
              title={s.title}
              variant="purple"
              className="h-full group-hover:shadow-glow-purple transition-all"
            >
              <p className="text-xs text-[#a9c7e0]">{s.subtitle}</p>
              <div className="mt-2 text-[10px] font-mono tracking-widest text-accent-purple">
                [ {s.difficulty} · DAY {s.day} ]
              </div>
              <ul className="mt-3 text-xs space-y-1 font-mono text-[#cfe6fb]">
                {s.main.slice(0, 4).map((m) => (
                  <li key={m.key}>
                    · {m.name} <span className="text-[#7aa0c2]">{m.sets}×{m.reps}</span>
                  </li>
                ))}
                {s.main.length > 4 && (
                  <li className="text-[#7aa0c2]">+ {s.main.length - 4} more</li>
                )}
              </ul>
            </SystemWindow>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
