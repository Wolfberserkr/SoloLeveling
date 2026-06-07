'use client';
import { useEffect, useState } from 'react';

export type Notice = {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  created_at: number;
  read: number;
};

export function NoticeStack() {
  const [items, setItems] = useState<Notice[]>([]);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setItems(data.notifications.filter((n: Notice) => !n.read).slice(0, 4));
      }
    })();
  }, []);

  async function dismiss(id: number) {
    setItems((prev) => prev.filter((p) => p.id !== id));
    await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
  }

  if (items.length === 0) return null;
  return (
    <div className="fixed top-20 right-4 z-40 space-y-3 max-w-sm">
      {items.map((n) => {
        const variant =
          n.kind === 'level_up'
            ? 'gold'
            : n.kind === 'rank_up'
            ? 'purple'
            : n.kind === 'penalty'
            ? 'red'
            : n.kind === 'achievement'
            ? 'purple'
            : n.kind === 'shield'
            ? 'purple'
            : n.kind === 'meditate'
            ? 'cyan'
            : 'cyan';
        return (
          <div
            key={n.id}
            className={`sys-window sys-window-${variant} p-3 animate-level-up cursor-pointer`}
            onClick={() => dismiss(n.id)}
          >
            <div className="sys-title text-[11px]">{n.title}</div>
            {n.body && <div className="text-xs mt-1 text-[#cfe6fb]">{n.body}</div>}
            <div className="text-[9px] mt-2 opacity-60 font-mono">[ TAP TO DISMISS ]</div>
          </div>
        );
      })}
    </div>
  );
}
