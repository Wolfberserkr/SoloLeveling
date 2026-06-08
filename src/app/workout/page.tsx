import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentHunter } from '@/lib/auth';
import { getStats } from '@/lib/leveling';
import { AppShell } from '@/components/AppShell';
import { SystemWindow } from '@/components/SystemWindow';
import { PROGRAM, isDeloadWeek, weekNumberSince, DELOAD_EVERY_WEEKS } from '@/lib/program';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { titleFor } from '@/lib/achievements';
import { dayOfWeekInTz } from '@/lib/time';

export const dynamic = 'force-dynamic';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default async function WorkoutHub() {
  const user = await getCurrentHunter();
  if (!user) redirect('/login');
  const stats = await getStats(user.id);
  const sb = getAdminSupabase();
  const { data: profile } = await sb
    .from('profiles')
    .select('created_at')
    .eq('id', user.id)
    .single();
  const startDate = profile?.created_at ? new Date(profile.created_at) : new Date();
  const weekNo = weekNumberSince(startDate);
  const deload = isDeloadWeek(weekNo);

  const dayIdx = dayOfWeekInTz(user.timezone);

  return (
    <AppShell hunterName={user.hunter_name} rank={stats.rank} level={stats.level} title={titleFor(user.active_title)} currentTz={user.timezone}>
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

      <SystemWindow
        title="WEEKLY GATE SCHEDULE"
        right={
          <span className="text-[10px] font-mono text-accent-cyan/70">
            WEEK {weekNo} · DELOAD EVERY {DELOAD_EVERY_WEEKS}W
          </span>
        }
      >
        <div className="grid grid-cols-7 gap-1 md:gap-2">
          {DAY_NAMES.map((name, i) => {
            const session = PROGRAM.find((s) => s.day === i);
            const isToday = i === dayIdx;
            // Three visual states: today-training (cyan glow, action),
            // today-rest (soft gold, no-action), other (muted).
            const tileCls = isToday
              ? session
                ? 'border-accent-cyan bg-accent-cyan/10 shadow-glow'
                : 'border-accent-gold/50 bg-accent-gold/5 shadow-[0_0_14px_rgba(255,209,102,0.22)]'
              : 'border-accent-cyan/20 bg-bg-base/40';
            const dayLabelCls = isToday && !session
              ? 'text-accent-gold/80'
              : 'text-accent-cyan/70';
            return (
              <div
                key={i}
                className={`p-2 border rounded-sm text-center transition-all ${tileCls}`}
              >
                <div className={`text-[10px] font-mono tracking-widest ${dayLabelCls}`}>
                  <span className="sm:hidden">{name[0]}</span>
                  <span className="hidden sm:inline">{name}</span>
                </div>
                {session ? (
                  <Link
                    href={`/workout/${session.key}`}
                    className="block mt-1 text-[9px] sm:text-[10px] font-mono text-accent-cyan hover:underline break-words leading-tight"
                  >
                    {session.title.split('—')[0].trim().replace('GATE: ', '')}
                  </Link>
                ) : isToday ? (
                  <div className="mt-1 text-[10px] font-mono text-accent-gold/80 leading-tight">
                    TODAY
                    <span className="block text-[9px] text-accent-gold/60">REST</span>
                  </div>
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
