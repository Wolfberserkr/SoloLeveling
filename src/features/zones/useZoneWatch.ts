import { useEffect, useRef } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';
import { gameAction } from '@/lib/gameApi';
import { insideZone } from '@game/zones.ts';
import type { ZoneTrigger } from '@/lib/types';

/** Don't evaluate fixes more often than this — geofencing, not navigation. */
const FIX_THROTTLE_MS = 15_000;

/**
 * Watch GPS while the app is open and report arrival at a Field Zone.
 * The server rolls the outcome (once per zone per day, deterministic);
 * this hook only says "the Player is here". A web PWA cannot geofence in
 * the background — triggers land when the app is open at the location.
 */
export function useZoneWatch() {
  const enabled = useSettingsStore((s) => s.zoneWatch);
  const zoneCount = usePlayerStore((s) => s.zones.length);
  // Zones already reported this session — don't re-ask the server while
  // standing still; refresh() brings the authoritative row anyway.
  const reported = useRef<Set<string>>(new Set());
  const lastCheck = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!enabled || zoneCount === 0 || !('geolocation' in navigator)) return;

    async function onFix(pos: GeolocationPosition) {
      const now = Date.now();
      if (inFlight.current || now - lastCheck.current < FIX_THROTTLE_MS) return;
      lastCheck.current = now;

      const { latitude: lat, longitude: lng } = pos.coords;
      const { zones, zoneTriggers, refresh } = usePlayerStore.getState();
      const pushAlert = useUiStore.getState().pushAlert;
      const settled = new Set(zoneTriggers.map((t) => t.zone_id));
      // Strict radius client-side (no slack) — the server allows GPS slack,
      // so anything we report is comfortably inside.
      const zone = zones.find(
        (z) =>
          !settled.has(z.id) &&
          !reported.current.has(z.id) &&
          insideZone(lat, lng, z.lat, z.lng, z.radius_m, 0),
      );
      if (!zone) return;

      reported.current.add(zone.id);
      inFlight.current = true;
      try {
        const res = await gameAction<{ trigger: ZoneTrigger; quiet?: boolean; already?: boolean }>(
          'enter-zone',
          { zone_id: zone.id, lat, lng },
        );
        if (!res.already && res.trigger && res.trigger.kind !== 'quiet') {
          pushAlert({
            kind: res.trigger.kind === 'fight' ? 'warning' : 'success',
            title: res.trigger.title,
            body: res.trigger.body,
          });
        }
        await refresh();
      } catch {
        // Leave the zone marked as reported — a rejected report (e.g. GPS
        // drift outside the server's slack) retries on the next app open.
      } finally {
        inFlight.current = false;
      }
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => void onFix(pos),
      () => {
        // Permission denied or unavailable — stay quiet; the toggle in
        // More → Field Zones explains how to re-enable.
      },
      { enableHighAccuracy: true, maximumAge: 20_000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled, zoneCount]);
}
