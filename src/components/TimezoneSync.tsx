'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Detects the browser's IANA timezone and pushes it to the server so the
// app's date logic (today/yesterday for quests, gates, penalties, etc.) runs
// in the user's local time. Mounts silently on the dashboard.
export function TimezoneSync({ currentTz }: { currentTz: string }) {
  const router = useRouter();

  useEffect(() => {
    let detected: string | undefined;
    try {
      detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!detected || detected === currentTz) return;

    fetch('/api/profile/timezone', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ timezone: detected }),
    })
      .then((r) => {
        if (!r.ok) return;
        // First-time fix: if we were defaulted to UTC, reload so today's
        // quest row gets recomputed for the user's actual local date.
        if (currentTz === 'UTC') {
          router.refresh();
        }
      })
      .catch(() => {});
  }, [currentTz, router]);

  return null;
}
