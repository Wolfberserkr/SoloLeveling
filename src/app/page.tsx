import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default function Landing() {
  const user = getCurrentUser();
  if (user) redirect('/dashboard');

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16 relative">
      <div className="max-w-2xl w-full text-center space-y-8">
        <div className="space-y-3">
          <div className="font-mono text-xs tracking-[0.5em] text-accent-cyan/70 animate-flicker">
            [ SYSTEM ACCESS DETECTED ]
          </div>
          <h1 className="text-4xl md:text-6xl font-mono uppercase tracking-[0.2em] glow-text text-accent-cyan">
            ARISE
          </h1>
          <div className="sys-divider my-4" />
          <p className="text-[#cfe6fb] text-sm md:text-base leading-relaxed">
            You have been granted access to <span className="text-accent-cyan">THE SYSTEM</span> — a
            training protocol that turns daily effort into measurable power. Complete the daily
            quest. Clear gym dungeons. Accumulate strength.
          </p>
          <p className="text-[#7aa0c2] text-xs">
            Fail the quest, and the penalty zone awaits.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 text-left">
          <div className="sys-window sys-window-cyan p-4">
            <div className="sys-title text-[10px] sys-bracket mb-2">DAILY QUEST</div>
            <p className="text-xs text-[#cfe6fb]">
              Push-ups · Sit-ups · Squats · Run. The iconic four. Complete them or take the penalty.
            </p>
          </div>
          <div className="sys-window sys-window-purple p-4">
            <div className="sys-title text-[10px] sys-bracket mb-2">DUNGEON RUNS</div>
            <p className="text-xs text-[#cfe6fb]">
              4-day Upper/Lower split. Compound focus. Linear progression. Built-in deload weeks.
            </p>
          </div>
          <div className="sys-window sys-window-gold p-4">
            <div className="sys-title text-[10px] sys-bracket mb-2">LEVEL UP</div>
            <p className="text-xs text-[#cfe6fb]">
              Gain XP, allocate stat points to STR · AGI · VIT · INT · PER. Earn rank-ups E → S.
            </p>
          </div>
          <div className="sys-window p-4">
            <div className="sys-title text-[10px] sys-bracket mb-2">POWER-UPS</div>
            <p className="text-xs text-[#cfe6fb]">
              Earn Essence Stones, Elixirs, Runes of Focus, and Shadow Extractions. Bend the System.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
          <Link href="/signup" className="sys-btn !px-6">Awaken (Sign Up)</Link>
          <Link href="/login" className="sys-btn sys-btn-ghost !px-6">I am already a Hunter</Link>
        </div>
        <p className="text-[10px] text-[#5d7a96] font-mono tracking-widest pt-6">
          INSPIRED BY SOLO LEVELING · UNOFFICIAL FAN PROJECT
        </p>
      </div>
    </main>
  );
}
