import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { usePlayerStore } from '@/stores/playerStore';
import { SystemWindow } from '@/components/system/SystemWindow';

const ROADMAP = [
  { phase: 2, name: 'Mana Economy & Daily Quests' },
  { phase: 3, name: 'Gym Dungeons & Boss Fights' },
  { phase: 4, name: 'Library & Knowledge Engine' },
  { phase: 5, name: 'System Events & Notifications' },
  { phase: 6, name: 'AI Knowledge Generation' },
  { phase: 7, name: 'Skills · Classes · Ranks' },
  { phase: 8, name: 'Legacy Boss — Past Self' },
];

export function MorePage() {
  const { profile, reset } = usePlayerStore();
  const navigate = useNavigate();

  async function signOut() {
    await supabase.auth.signOut();
    reset();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex flex-col gap-4">
      <SystemWindow title="Player">
        <div className="font-sys text-xs uppercase tracking-widest text-slate-400">
          <div className="flex justify-between border-b border-white/5 py-2">
            <span>Name</span>
            <span className="text-white">{profile?.display_name}</span>
          </div>
          <div className="flex justify-between border-b border-white/5 py-2">
            <span>Journey started</span>
            <span className="text-white">{profile?.journey_started_at}</span>
          </div>
          <div className="flex justify-between py-2">
            <span>Timezone</span>
            <span className="text-white">{profile?.timezone}</span>
          </div>
        </div>
        <button className="sys-btn sys-btn-danger mt-4 w-full" onClick={signOut}>
          Sever System Link
        </button>
      </SystemWindow>

      <SystemWindow title="System Expansion" accent="purple" delay={0.08}>
        <ul className="flex flex-col gap-2 font-sys text-xs uppercase tracking-widest">
          {ROADMAP.map((r) => (
            <li key={r.phase} className="flex justify-between border-b border-white/5 pb-2">
              <span className="text-slate-300">{r.name}</span>
              <span className="text-slate-600">Phase {r.phase}</span>
            </li>
          ))}
        </ul>
      </SystemWindow>
    </div>
  );
}
