import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { usePlayerStore } from '@/stores/playerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';
import { SystemWindow } from '@/components/system/SystemWindow';
import {
  ZONE_KINDS,
  ZONE_KIND_META,
  ZONE_LIMIT,
  ZONE_RADIUS_DEFAULT_M,
  ZONE_TRIGGER_CHANCES,
  type ZoneKind,
} from '@game/zones.ts';

function currentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('This device does not expose location.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, (err) => reject(new Error(err.message)), {
      enableHighAccuracy: true,
      timeout: 20_000,
      maximumAge: 10_000,
    });
  });
}

/** Manage Field Zones: mark real places, and arm the GPS watch. */
export function ZonesPanel() {
  const { profile, zones, zoneTriggers, refresh } = usePlayerStore();
  const zoneWatch = useSettingsStore((s) => s.zoneWatch);
  const setZoneWatch = useSettingsStore((s) => s.setZoneWatch);
  const pushAlert = useUiStore((s) => s.pushAlert);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ZoneKind>('gym');

  const settledToday = new Set(zoneTriggers.map((t) => t.zone_id));

  async function toggleWatch() {
    if (zoneWatch) {
      setZoneWatch(false);
      pushAlert({ kind: 'info', title: 'Location triggers off', body: 'The field goes quiet.' });
      return;
    }
    try {
      await currentPosition(); // surfaces the browser permission prompt
      setZoneWatch(true);
      pushAlert({
        kind: 'success',
        title: 'Location triggers armed',
        body: 'While the app is open, arriving at a marked zone rolls for encounters.',
      });
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Location unavailable',
        body: err instanceof Error ? err.message : undefined,
      });
    }
  }

  async function markZone() {
    if (busy || !profile || !name.trim() || zones.length >= ZONE_LIMIT) return;
    setBusy(true);
    try {
      const pos = await currentPosition();
      const { error } = await supabase.from('zones').insert({
        user_id: profile.user_id,
        name: name.trim(),
        kind,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        radius_m: ZONE_RADIUS_DEFAULT_M,
      });
      if (error) throw new Error(error.message);
      setName('');
      pushAlert({
        kind: 'success',
        title: 'Zone marked',
        body: `${ZONE_KIND_META[kind].name} registered — ${ZONE_KIND_META[kind].hint}.`,
      });
      await refresh();
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Zone rejected',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  async function removeZone(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('zones').delete().eq('id', id);
      if (error) throw new Error(error.message);
      await refresh();
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Could not remove zone',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SystemWindow title="Field Zones" accent="cyan" delay={0.105}>
      <p className="text-xs leading-relaxed text-slate-400">
        Mark real places — your gym, the supply store, a landmark. Arriving there with the app
        open rolls once per zone per day: field monsters at Training Grounds (
        {Math.round(ZONE_TRIGGER_CHANCES.gym * 100)}%), supply caches at Supply Posts (
        {Math.round(ZONE_TRIGGER_CHANCES.store * 100)}%), buried treasure at Landmarks (
        {Math.round(ZONE_TRIGGER_CHANCES.landmark * 100)}%).
      </p>

      {/* Arm the watch */}
      <button
        type="button"
        role="switch"
        aria-checked={zoneWatch}
        onClick={() => void toggleWatch()}
        className="mt-2 flex w-full items-center justify-between gap-3 border-b border-white/5 py-3 text-left"
      >
        <span className="min-w-0">
          <span className="block font-sys text-xs uppercase tracking-widest text-white">
            Location triggers
          </span>
          <span className="mt-0.5 block font-sys text-[0.6rem] leading-relaxed text-slate-500">
            Watches GPS only while the app is open — the web cannot geofence in the background.
          </span>
        </span>
        <span
          className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
            zoneWatch ? 'border-accent-cyan bg-accent-cyan/30' : 'border-white/15 bg-bg-base/60'
          }`}
        >
          <span
            className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${
              zoneWatch ? 'left-[1.15rem] bg-accent-cyan' : 'left-0.5 bg-slate-500'
            }`}
            style={zoneWatch ? { boxShadow: '0 0 8px #4ecbff' } : undefined}
          />
        </span>
      </button>

      {/* Marked zones */}
      {zones.length > 0 && (
        <div className="mt-1 flex flex-col">
          {zones.map((z) => (
            <div
              key={z.id}
              className="flex items-center justify-between gap-2 border-b border-white/5 py-2 last:border-b-0"
            >
              <span className="min-w-0">
                <span className="block truncate font-sys text-xs uppercase tracking-widest text-white">
                  {settledToday.has(z.id) ? '✓ ' : ''}
                  {z.name}
                </span>
                <span className="block font-sys text-[0.6rem] uppercase tracking-widest text-slate-500">
                  {ZONE_KIND_META[z.kind].name} · {z.radius_m} m
                </span>
              </span>
              <button
                className="shrink-0 font-sys text-[0.65rem] uppercase tracking-widest text-slate-500 hover:text-accent-red"
                disabled={busy}
                onClick={() => void removeZone(z.id)}
              >
                remove
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Mark a new zone */}
      {zones.length < ZONE_LIMIT && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex gap-1">
            {ZONE_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`flex-1 border px-2 py-1 font-sys text-[0.6rem] uppercase tracking-widest transition-colors ${
                  kind === k
                    ? 'border-accent-cyan/60 bg-accent-cyan/10 text-accent-cyan'
                    : 'border-white/10 text-slate-500'
                }`}
              >
                {ZONE_KIND_META[k].name}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void markZone()}
              placeholder="Name this place…"
              className="min-w-0 flex-1 border border-accent-cyan/30 bg-bg-base/60 px-2 py-1 font-sys text-xs text-white outline-none placeholder:text-slate-600 focus:border-accent-cyan"
            />
            <button
              className="sys-btn sys-btn-ghost shrink-0 !min-h-[34px] !px-3 !py-1 !text-[0.65rem]"
              disabled={busy || !name.trim()}
              onClick={() => void markZone()}
            >
              {busy ? 'Locating…' : 'Mark here'}
            </button>
          </div>
        </div>
      )}
    </SystemWindow>
  );
}
