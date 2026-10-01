import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { setPortal } from '@/lib/portal';
import { currentSubscription, disablePush, enablePush, pushSupported } from '@/lib/push';
import { ASCEND, xpForLevel, type Reminders, type Template, type Theme } from '../logic';
import { useAscend } from '../store';
import { Icon, cvar, fmt, useConfirm } from '../ui';

const THEMES: Array<[Theme, string, 'auto' | 'sun' | 'moon']> = [['system', 'System', 'auto'], ['light', 'Light', 'sun'], ['dark', 'Dark', 'moon']];

export function SettingsScreen() {
  const data = useAscend((s) => s.data);
  const save = useAscend((s) => s.saveSettings);
  const toast = useAscend((s) => s.toast);
  const navigate = useNavigate();
  const st = data.settings;

  function exportJson() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ascend-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Export downloaded');
  }
  async function signOut() {
    setPortal(null);
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  }

  return (
    <>
      <header className="pagehead"><h1>Settings</h1><p className="muted">{ASCEND.tagline}</p></header>
      <div className="cols">
        <div className="stack">
          <section className="card setgroup">
            <h2>Preferences</h2>
            <div className="field"><span className="flabel">Theme</span>
              <div className="chips">{THEMES.map(([v, l, i]) => <button key={v} className="chip" aria-pressed={st.theme === v} onClick={() => void save({ theme: v })}><Icon name={i} />{l}</button>)}</div>
            </div>
            <div className="setrow">
              <NumberField id="set-work" label="Focus minutes" value={st.focusWork} max={120} onCommit={(v) => void save({ focusWork: v })} />
              <NumberField id="set-break" label="Break minutes" value={st.focusBreak} max={60} onCommit={(v) => void save({ focusBreak: v })} />
            </div>
          </section>
          <RemindersCard reminders={st.reminders} onSave={(reminders) => void save({ reminders })} />
          <Templates templates={st.templates} onSave={(templates) => void save({ templates })} />
          <section className="card setgroup">
            <h2>Level curve</h2>
            <p className="muted" style={{ fontSize: 13.5 }}>Total XP to reach level <i>n</i> = <span className="num">{ASCEND.xpCurveK} × (n − 1) × (n + 2)</span>. Each level costs {ASCEND.xpCurveK * 2} XP more than the last. Capped at {ASCEND.maxLevel}.</p>
            <div className="curve">{[2, 5, 10, 25, 50, 100].map((n) => <div key={n}><span className="a">Level {n}</span><span className="b">{fmt(xpForLevel(n))}</span></div>)}</div>
          </section>
          <section className="card setgroup">
            <h2>Account</h2>
            <p className="muted" style={{ fontSize: 13.5 }}>Your progress is saved to your account and syncs across devices.</p>
            <div className="setrow" style={{ justifyContent: 'flex-start' }}>
              <button className="btn sm" onClick={exportJson}>Download my data (JSON)</button>
              <button className="btn sm" onClick={() => { setPortal('system'); navigate('/'); }}><Icon name="swap" />Switch to the System</button>
              <button className="btn sm danger" onClick={() => void signOut()}>Sign out</button>
            </div>
          </section>
        </div>
        <div className="stack"><StatsEditor /></div>
      </div>
    </>
  );
}

function NumberField({ id, label, value, max, onCommit }: { id: string; label: string; value: number; max: number; onCommit: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  return (
    <label className="field" style={{ flex: 1 }}>
      <span className="flabel">{label}</span>
      <input id={id} type="number" inputMode="numeric" min={1} max={max} value={v} onChange={(e) => setV(e.target.value)}
        onBlur={() => { const n = Math.max(1, Math.min(max, parseInt(v, 10) || value)); setV(String(n)); if (n !== value) onCommit(n); }} />
    </label>
  );
}

function Templates({ templates, onSave }: { templates: Template[]; onSave: (t: Template[]) => void }) {
  const [rows, setRows] = useState(templates.map((t) => ({ label: t.label, xp: String(t.xp) })));
  const commit = (next = rows) => onSave(next.filter((r) => r.label.trim()).map((r) => ({ label: r.label.trim(), xp: Math.max(1, parseInt(r.xp, 10) || 1) })));
  return (
    <section className="card setgroup">
      <div className="card-head" style={{ margin: 0 }}><h2>XP templates</h2><span className="muted">Quick picks when adding a quest</span></div>
      {rows.map((r, i) => (
        <div key={i} className="tplrow">
          <input className="input" id={`tpl-l-${i}`} aria-label="Action" value={r.label} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} onBlur={() => commit()} />
          <input className="input num" id={`tpl-x-${i}`} aria-label="XP" type="number" min={1} value={r.xp} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, xp: e.target.value } : x)))} onBlur={() => commit()} />
          <button className="iconbtn sm" aria-label="Remove template" onClick={() => { const next = rows.filter((_, j) => j !== i); setRows(next); commit(next); }}><Icon name="x" /></button>
        </div>
      ))}
      <div><button className="btn sm" onClick={() => { const next = [...rows, { label: 'New action', xp: '25' }]; setRows(next); commit(next); }}><Icon name="plus" />Add template</button></div>
    </section>
  );
}

function StatsEditor() {
  const data = useAscend((s) => s.data);
  const updateStat = useAscend((s) => s.updateStat);
  const addSub = useAscend((s) => s.addSub);
  const renameSub = useAscend((s) => s.renameSub);
  const deleteSub = useAscend((s) => s.deleteSub);
  const confirm = useConfirm();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  return (
    <section className="card setgroup">
      <div className="card-head" style={{ margin: 0 }}><h2>Stats & sub-skills</h2><span className="muted">Rename, recolor, branch</span></div>
      {data.stats.map((s) => (
        <div key={s.id} className="statedit" style={{ '--c': cvar(s.color) } as React.CSSProperties}>
          <div className="top">
            <span className="ico">{s.icon}</span>
            <input className="input" id={`st-n-${s.id}`} aria-label="Stat name" defaultValue={s.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.name) void updateStat(s.id, { name: v }); }} />
          </div>
          <div className="swatches" role="group" aria-label="Color">
            {ASCEND.colors.map((c) => <button key={c} className="swatch" style={{ '--c': cvar(c) } as React.CSSProperties} aria-pressed={s.color === c} aria-label={c} onClick={() => void updateStat(s.id, { color: c })} />)}
          </div>
          {data.subskills.filter((x) => x.statId === s.id).sort((a, b) => a.position - b.position).map((x) => (
            <div key={x.id} className="subedit">
              <i className="dot" />
              <input className="input" id={`sub-n-${x.id}`} aria-label="Sub-skill name" defaultValue={x.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== x.name) void renameSub(x.id, v); }} />
              {confirm.armed === x.id
                ? <button className="btn sm armed" onClick={() => { if (confirm.tap(x.id)) void deleteSub(x.id); }}>Remove</button>
                : <button className="iconbtn sm" aria-label={`Remove ${x.name}`} onClick={() => confirm.tap(x.id)}><Icon name="x" /></button>}
            </div>
          ))}
          <form className="subedit" onSubmit={(e) => { e.preventDefault(); const v = (drafts[s.id] ?? '').trim(); if (!v) return; void addSub(s.id, v); setDrafts({ ...drafts, [s.id]: '' }); }}>
            <input className="input" id={`sub-add-${s.id}`} placeholder="Add a sub-skill" aria-label={`New sub-skill for ${s.name}`} value={drafts[s.id] ?? ''} onChange={(e) => setDrafts({ ...drafts, [s.id]: e.target.value })} />
            <button className="btn sm" type="submit">Add</button>
          </form>
        </div>
      ))}
    </section>
  );
}

const HOURS = Array.from({ length: 19 }, (_, i) => i + 5); // 05:00–23:00

function RemindersCard({ reminders, onSave }: { reminders: Reminders; onSave: (r: Reminders) => void }) {
  const uid = useAscend((s) => s.uid);
  const toast = useAscend((s) => s.toast);
  const [device, setDevice] = useState<'unknown' | 'on' | 'off' | 'unsupported'>('unknown');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!pushSupported()) { setDevice('unsupported'); return; }
    void currentSubscription().then((sub) => setDevice(sub ? 'on' : 'off'));
  }, []);
  async function toggleDevice() {
    if (!uid || busy) return;
    setBusy(true);
    try {
      if (device === 'on') { await disablePush(); setDevice('off'); toast('Notifications turned off on this device'); }
      else { await enablePush(uid); setDevice('on'); toast('Notifications are on for this device'); }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not change notifications');
    } finally { setBusy(false); }
  }
  const hours = [...reminders.hours].sort((a, b) => a - b);
  const toggleHour = (h: number) => onSave({ ...reminders, hours: hours.includes(h) ? hours.filter((x) => x !== h) : [...hours, h].sort((a, b) => a - b) });
  return (
    <section className="card setgroup">
      <div className="card-head" style={{ margin: 0 }}><h2>Reminders</h2><span className="muted">Daily quests still open</span></div>
      <div className="setrow">
        <span style={{ fontSize: 14 }}>This device: <b>{device === 'on' ? 'on' : device === 'off' ? 'off' : device === 'unsupported' ? 'not supported' : '…'}</b></span>
        {device !== 'unsupported' && device !== 'unknown' && <button className="btn sm" disabled={busy} onClick={() => void toggleDevice()}>{device === 'on' ? 'Turn off here' : 'Turn on for this device'}</button>}
      </div>
      {device === 'unsupported' && <p className="hint">On iPhone, add the app to your Home Screen first, then open it from there to allow notifications.</p>}
      <label className="toggle"><input type="checkbox" id="rem-on" checked={reminders.enabled} onChange={(e) => onSave({ ...reminders, enabled: e.target.checked })} /><span>Remind me when daily quests are still open</span></label>
      {reminders.enabled && (
        <div className="field"><span className="flabel">Remind me at</span>
          <div className="chips">{HOURS.map((h) => <button key={h} className="chip num" aria-pressed={hours.includes(h)} onClick={() => toggleHour(h)}>{String(h).padStart(2, '0')}:00</button>)}</div>
        </div>
      )}
      <p className="hint">Each reminder lists what is left today and stays on screen until you dismiss it. A later one replaces it, and nothing is sent once every daily quest is done.</p>
    </section>
  );
}
