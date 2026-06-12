import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { usePlayerStore } from '@/stores/playerStore';
import { useUiStore } from '@/stores/uiStore';
import { SystemWindow } from '@/components/system/SystemWindow';
import { pushSupported, currentSubscription, enablePush, disablePush } from '@/lib/push';

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
  const { profile, reset, refresh } = usePlayerStore();
  const pushAlert = useUiStore((s) => s.pushAlert);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tzMismatch = Boolean(profile && deviceTz && profile.timezone !== deviceTz);

  async function signOut() {
    await supabase.auth.signOut();
    reset();
    navigate('/login', { replace: true });
  }

  // Timezone is one of the two client-writable profile columns (see 0001);
  // dates only ever shift by a day, and the server's daily reset is idempotent.
  async function syncTimezone() {
    if (busy || !profile || !tzMismatch) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ timezone: deviceTz })
        .eq('user_id', profile.user_id);
      if (error) throw new Error(error.message);
      pushAlert({
        kind: 'success',
        title: 'Timezone synced',
        body: `The System now follows ${deviceTz}. Days roll over at your local midnight.`,
      });
      await refresh();
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Sync rejected',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
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
        {tzMismatch && (
          <button
            className="sys-btn sys-btn-ghost mt-2 w-full !min-h-[34px] !py-1 !text-[0.65rem]"
            disabled={busy}
            onClick={syncTimezone}
          >
            Device reports {deviceTz} — sync
          </button>
        )}
        <button className="sys-btn sys-btn-danger mt-4 w-full" onClick={signOut}>
          Sever System Link
        </button>
      </SystemWindow>

      <NotificationsPanel />

      <SystemWindow title="System Expansion" accent="purple" delay={0.12}>
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

function NotificationsPanel() {
  const { profile } = usePlayerStore();
  const pushAlert = useUiStore((s) => s.pushAlert);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const supported = pushSupported();

  useEffect(() => {
    if (!supported) return;
    void currentSubscription().then((sub) => setEnabled(Boolean(sub)));
  }, [supported]);

  async function toggle() {
    if (busy || !profile) return;
    setBusy(true);
    try {
      if (enabled) {
        await disablePush();
        setEnabled(false);
        pushAlert({ kind: 'info', title: 'Notifications off', body: 'The System goes quiet.' });
      } else {
        await enablePush(profile.user_id);
        setEnabled(true);
        pushAlert({
          kind: 'success',
          title: 'Notifications on',
          body: 'Gates, knowledge checks, and evening reminders will reach this device.',
        });
      }
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Notification setup failed',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SystemWindow title="Notifications" accent="gold" delay={0.08}>
      {supported ? (
        <>
          <p className="text-xs leading-relaxed text-slate-400">
            The System announces Gates in the morning, surfaces due knowledge checks, and warns
            in the evening if the Daily Quest is unresolved.
          </p>
          <button className="sys-btn mt-3 w-full" disabled={busy} onClick={toggle}>
            {enabled ? 'Disable on this device' : 'Enable on this device'}
          </button>
        </>
      ) : (
        <p className="text-xs leading-relaxed text-slate-500">
          Push is not supported in this browser. On iPhone, install the app to your Home Screen
          first (Share → Add to Home Screen), then enable here.
        </p>
      )}
    </SystemWindow>
  );
}
