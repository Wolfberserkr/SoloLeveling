'use client';
import { useEffect, useState } from 'react';

type State = 'loading' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed';

const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function PushPermission() {
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported');
      return;
    }
    navigator.serviceWorker.register('/sw.js').catch(() => {});

    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }

    navigator.serviceWorker.ready.then((reg) =>
      reg.pushManager.getSubscription().then((sub) => {
        setState(sub ? 'subscribed' : 'unsubscribed');
      })
    );
  }, []);

  async function subscribe() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setState('denied'); return; }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
      });

      const json = sub.toJSON();
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(json),
      });
      setState('subscribed');
    } catch {
      // User dismissed or browser blocked — treat as unsubscribed.
      setState('unsubscribed');
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        });
      }
      setState('unsubscribed');
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading' || state === 'unsupported') return null;

  if (state === 'denied') {
    return (
      <div className="text-[10px] font-mono text-[#465e7a] tracking-widest px-3 py-1 border border-[#465e7a]/30 rounded-sm">
        NOTIFICATIONS BLOCKED — enable in browser settings
      </div>
    );
  }

  if (state === 'subscribed') {
    return (
      <button
        onClick={unsubscribe}
        disabled={busy}
        className="text-[10px] font-mono tracking-widest px-3 py-1 border border-accent-cyan/30 rounded-sm text-accent-cyan/60 hover:text-accent-cyan hover:border-accent-cyan/60 transition-all"
        title="Disable quest reminders"
      >
        {busy ? '…' : '◉ ALERTS ON'}
      </button>
    );
  }

  return (
    <button
      onClick={subscribe}
      disabled={busy}
      className="text-[10px] font-mono tracking-widest px-3 py-1 border border-accent-cyan/30 rounded-sm text-[#a9c7e0] hover:text-accent-cyan hover:border-accent-cyan/60 transition-all"
      title="Enable quest reminders and gate alerts"
    >
      {busy ? '…' : '○ ENABLE ALERTS'}
    </button>
  );
}
