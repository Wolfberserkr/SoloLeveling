import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { usePlayerStore } from '@/stores/playerStore';
import { useUiStore } from '@/stores/uiStore';
import { useSettingsStore, type DistanceUnit } from '@/stores/settingsStore';
import { gameAction } from '@/lib/gameApi';
import { SystemWindow } from '@/components/system/SystemWindow';
import { TitlesPanel } from '@/features/status/TitlesPanel';
import { pushSupported, currentSubscription, enablePush, disablePush } from '@/lib/push';
import { installAvailable, subscribeInstall, promptInstall } from '@/lib/install';

const ROADMAP: Array<{ phase: number; name: string }> = [];

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
      <ReminderPanel />
      <PreferencesPanel />
      <InstallPanel />
      <DataPanel />
      <ResetPanel />
      <AboutPanel />

      <SystemWindow title="System Expansion" accent="purple" delay={0.12}>
        {ROADMAP.length === 0 ? (
          <p className="font-sys text-[0.65rem] uppercase tracking-widest text-slate-500">
            All eight phases online. The System is fully awakened — your transformation is the only
            content left to write.
          </p>
        ) : (
          <ul className="flex flex-col gap-2 font-sys text-xs uppercase tracking-widest">
            {ROADMAP.map((r) => (
              <li key={r.phase} className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-slate-300">{r.name}</span>
                <span className="text-slate-600">Phase {r.phase}</span>
              </li>
            ))}
          </ul>
        )}
      </SystemWindow>

      {/* ── Titles ── */}
      <TitlesPanel />
    </div>
  );
}

function InstallPanel() {
  const [available, setAvailable] = useState(installAvailable());
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeInstall(() => setAvailable(installAvailable())), []);
  if (!available) return null;

  async function install() {
    if (busy) return;
    setBusy(true);
    try {
      await promptInstall();
    } finally {
      setBusy(false);
    }
  }

  return (
    <SystemWindow title="Install" accent="gold" delay={0.1}>
      <p className="text-xs leading-relaxed text-slate-400">
        Install The System to your device for a full-screen, offline-capable app and reliable
        notifications.
      </p>
      <button className="sys-btn mt-3 w-full" disabled={busy} onClick={install}>
        Install The System
      </button>
    </SystemWindow>
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
          body: 'Gates, knowledge checks, supplement reminders, and evening warnings will reach this device.',
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
            The System announces Gates in the morning, surfaces due knowledge checks, checks the
            supplement stack at 10:00, and warns in the evening if the Daily Quest is unresolved.
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

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 border-b border-white/5 py-3 text-left last:border-b-0"
    >
      <span className="min-w-0">
        <span className="block font-sys text-xs uppercase tracking-widest text-white">{label}</span>
        {description && (
          <span className="mt-0.5 block font-sys text-[0.6rem] leading-relaxed text-slate-500">
            {description}
          </span>
        )}
      </span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
          checked ? 'border-accent-cyan bg-accent-cyan/30' : 'border-white/15 bg-bg-base/60'
        }`}
      >
        <span
          className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${
            checked ? 'left-[1.15rem] bg-accent-cyan' : 'left-0.5 bg-slate-500'
          }`}
          style={checked ? { boxShadow: '0 0 8px #4ecbff' } : undefined}
        />
      </span>
    </button>
  );
}

function ReminderPanel() {
  const { profile, refresh } = usePlayerStore();
  const pushAlert = useUiStore((s) => s.pushAlert);
  const [busy, setBusy] = useState(false);
  const current = profile?.reminder_hour ?? 18;

  async function update(hour: number) {
    if (busy || !profile || hour === current) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ reminder_hour: hour })
        .eq('user_id', profile.user_id);
      if (error) throw new Error(error.message);
      pushAlert({
        kind: 'success',
        title: 'Reminder set',
        body: `The evening Daily Quest reminder will fire around ${String(hour).padStart(2, '0')}:00 your time.`,
      });
      await refresh();
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Could not set reminder',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SystemWindow title="Daily Reminder" accent="gold" delay={0.09}>
      <p className="text-xs leading-relaxed text-slate-400">
        The hour the System checks in if your Daily Training Quest is still unresolved. Times are in
        your own timezone.
      </p>
      <label className="mt-3 flex items-center justify-between font-sys text-xs uppercase tracking-widest text-slate-400">
        <span>Reminder hour</span>
        <select
          className="border border-accent-cyan/30 bg-bg-base/60 px-2 py-1 text-white"
          disabled={busy}
          value={current}
          onChange={(e) => void update(Number(e.target.value))}
        >
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, '0')}:00
            </option>
          ))}
        </select>
      </label>
    </SystemWindow>
  );
}

function PreferencesPanel() {
  const { sound, haptics, distanceUnit, setSound, setHaptics, setDistanceUnit } = useSettingsStore();
  const units: DistanceUnit[] = ['km', 'mi'];

  return (
    <SystemWindow title="Preferences" delay={0.1}>
      <Toggle
        label="Sounds"
        description="Short System chimes on alerts and level-ups."
        checked={sound}
        onChange={setSound}
      />
      <Toggle
        label="Haptics"
        description="Vibration feedback on supported devices."
        checked={haptics}
        onChange={setHaptics}
      />
      <div className="flex items-center justify-between py-3">
        <span className="font-sys text-xs uppercase tracking-widest text-white">Distance unit</span>
        <div className="flex overflow-hidden border border-accent-cyan/30">
          {units.map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setDistanceUnit(u)}
              className={`px-3 py-1 font-sys text-xs uppercase tracking-widest transition-colors ${
                distanceUnit === u ? 'bg-accent-cyan/20 text-accent-cyan' : 'text-slate-500'
              }`}
            >
              {u}
            </button>
          ))}
        </div>
      </div>
    </SystemWindow>
  );
}

function DataPanel() {
  const pushAlert = useUiStore((s) => s.pushAlert);

  function exportData() {
    const s = usePlayerStore.getState();
    const snapshot = {
      exported_at: new Date().toISOString(),
      app_version: __APP_VERSION__,
      profile: s.profile,
      stats: s.stats,
      titles: s.titles,
      skills: s.skills,
      shadows: s.shadows,
      totals: s.totals,
      books: s.books,
      liftLogs: s.liftLogs,
      messages: s.messages,
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `the-system-${s.profile?.display_name ?? 'player'}-${stamp}.json`.toLowerCase();
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    pushAlert({ kind: 'success', title: 'Data exported', body: 'Your records were saved to a file.' });
  }

  return (
    <SystemWindow title="Data" accent="purple" delay={0.11}>
      <p className="text-xs leading-relaxed text-slate-400">
        Download a JSON snapshot of your profile, stats, titles, records, and System log from this
        session.
      </p>
      <button className="sys-btn sys-btn-ghost mt-3 w-full" onClick={exportData}>
        Export my data
      </button>
    </SystemWindow>
  );
}

function ResetPanel() {
  const { loadAll } = usePlayerStore();
  const pushAlert = useUiStore((s) => s.pushAlert);
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = text.trim().toUpperCase() === 'RESET';

  function cancel() {
    setConfirming(false);
    setText('');
  }

  async function reset() {
    if (busy || !ready) return;
    setBusy(true);
    try {
      await gameAction('reset-progress', { confirm: 'RESET' });
      await loadAll();
      cancel();
      pushAlert({
        kind: 'warning',
        title: 'Progress reset',
        body: 'The System has rebound itself. You begin again at Level 1.',
      });
      navigate('/', { replace: true });
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Reset failed',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SystemWindow title="Reset Progress" accent="red" delay={0.12}>
      <p className="text-xs leading-relaxed text-slate-400">
        Permanently erase all progress — levels, XP, stats, titles, shadows, dungeons, library, and
        records — and begin again at Level 1. Your name, timezone, and reminder time are kept. This
        cannot be undone.
      </p>
      {!confirming ? (
        <button className="sys-btn sys-btn-danger mt-3 w-full" onClick={() => setConfirming(true)}>
          Reset progress…
        </button>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <label className="font-sys text-[0.65rem] uppercase tracking-widest text-accent-red">
            Type RESET to confirm
          </label>
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="RESET"
            className="border border-accent-red/40 bg-bg-base/60 px-2 py-1 font-sys text-sm uppercase tracking-widest text-white outline-none focus:border-accent-red"
          />
          <div className="flex gap-2">
            <button className="sys-btn sys-btn-ghost flex-1" disabled={busy} onClick={cancel}>
              Cancel
            </button>
            <button
              className="sys-btn sys-btn-danger flex-1"
              disabled={!ready || busy}
              onClick={reset}
            >
              {busy ? 'Resetting…' : 'Erase everything'}
            </button>
          </div>
        </div>
      )}
    </SystemWindow>
  );
}

function AboutPanel() {
  const built = (() => {
    try {
      return new Date(__BUILD_DATE__).toLocaleString();
    } catch {
      return __BUILD_DATE__;
    }
  })();

  return (
    <SystemWindow title="About" delay={0.13}>
      <div className="font-sys text-xs uppercase tracking-widest text-slate-400">
        <div className="flex justify-between border-b border-white/5 py-2">
          <span>App</span>
          <span className="text-white">The System — Solo Leveling</span>
        </div>
        <div className="flex justify-between border-b border-white/5 py-2">
          <span>Version</span>
          <span className="text-white">{__APP_VERSION__}</span>
        </div>
        <div className="flex justify-between py-2">
          <span>Build</span>
          <span className="text-white">{built}</span>
        </div>
      </div>
    </SystemWindow>
  );
}
