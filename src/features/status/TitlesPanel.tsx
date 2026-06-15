import { useState } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { useUiStore } from '@/stores/uiStore';
import { gameAction } from '@/lib/gameApi';
import { SystemWindow } from '@/components/system/SystemWindow';
import { TITLES, titleDef } from '@game/progression.ts';

export function TitlesPanel() {
  const { profile, titles, refresh } = usePlayerStore();
  const pushAlert = useUiStore((s) => s.pushAlert);
  const [busy, setBusy] = useState(false);
  if (!profile) return null;

  const earned = new Set(titles.map((t) => t.title_key));

  async function equip(key: string) {
    if (busy) return;
    setBusy(true);
    try {
      // Tapping the equipped title again removes it.
      const def = titleDef(key);
      const isEquipped = def && profile!.equipped_title === def.name;
      const result = await gameAction<{ equipped_title: string | null }>('equip-title', {
        title_key: isEquipped ? '' : key,
      });
      await refresh();
      pushAlert({
        kind: 'success',
        title: result.equipped_title ? `Title equipped` : 'Title removed',
        body: result.equipped_title ?? undefined,
      });
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Could not change title',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SystemWindow title="Titles" accent="gold" delay={0.2} collapsible defaultCollapsed>
      <p className="mb-3 font-sys text-[0.65rem] uppercase tracking-widest text-slate-500">
        {earned.size} / {TITLES.length} earned · tap an earned title to equip it
      </p>
      <ul className="flex flex-col gap-2">
        {TITLES.map((t) => {
          const has = earned.has(t.key);
          const equipped = profile.equipped_title === t.name;
          return (
            <li key={t.key}>
              <button
                disabled={!has || busy}
                onClick={() => equip(t.key)}
                className={`w-full border p-2 text-left transition-colors ${
                  equipped
                    ? 'border-accent-gold bg-accent-gold/10'
                    : has
                      ? 'border-accent-cyan/30 bg-bg-base/40 hover:border-accent-cyan/60'
                      : 'border-white/5 bg-bg-base/20 opacity-50'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={`font-display text-sm font-semibold ${
                      has ? 'text-white' : 'text-slate-500'
                    }`}
                  >
                    {has ? t.name : '???'}
                    {equipped && (
                      <span className="ml-2 font-sys text-[0.55rem] uppercase tracking-widest text-accent-gold">
                        equipped
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 font-sys text-[0.6rem] uppercase tracking-widest text-essence">
                    {t.essence}◆
                  </span>
                </div>
                <div className="mt-0.5 font-sys text-[0.65rem] text-slate-400">{t.description}</div>
              </button>
            </li>
          );
        })}
      </ul>
    </SystemWindow>
  );
}
