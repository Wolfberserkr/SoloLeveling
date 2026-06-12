import { useState } from 'react';
import { motion } from 'framer-motion';
import { usePlayerStore } from '@/stores/playerStore';
import { useUiStore } from '@/stores/uiStore';
import { gameAction } from '@/lib/gameApi';
import { SystemWindow } from '@/components/system/SystemWindow';
import { StatBar } from '@/components/system/StatBar';
import { RankBadge } from '@/components/system/RankBadge';
import { ManaOrb } from '@/components/system/ManaOrb';
import { GlitchText } from '@/components/system/GlitchText';
import { levelProgress } from '@game/xpCurve.ts';
import { STAT_GROUPS, STAT_LABELS, RANK_TITLES, type Rank } from '@game/constants.ts';
import { CLASSES, classByKey, CLASS_UNLOCK_LEVEL, SKILLS, TITLES } from '@game/progression.ts';

export function StatusPage() {
  const { profile, stats, totals, messages } = usePlayerStore();
  if (!profile) return null;

  const progress = levelProgress(profile.xp_total);
  const statMap = Object.fromEntries(stats.map((s) => [s.stat, Number(s.value)]));
  const playerClass = classByKey(profile.class);

  return (
    <div className="flex flex-col gap-4">
      {/* ── Identity ── */}
      <SystemWindow title="Status" scan>
        <div className="flex items-center gap-4">
          <RankBadge rank={profile.rank} size={52} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-xl font-bold uppercase tracking-wider">
              <GlitchText text={profile.display_name} />
            </div>
            <div className="font-sys text-[0.65rem] uppercase tracking-widest text-slate-400">
              {profile.rank}-Rank · {RANK_TITLES[profile.rank as Rank] ?? ''}
              {playerClass && <span className="text-accent-cyan"> · {playerClass.name}</span>}
              {profile.equipped_title && (
                <span className="text-accent-gold"> · {profile.equipped_title}</span>
              )}
            </div>
            <div className="mt-1 font-sys text-sm text-accent-cyan glow-text">
              LEVEL {profile.level}
            </div>
          </div>
          <ManaOrb mana={profile.mana} manaMax={profile.mana_max} />
        </div>

        <div className="mt-4">
          <StatBar
            value={progress.intoLevel}
            max={progress.forLevel}
            label={`XP ${progress.intoLevel.toLocaleString()} / ${progress.forLevel.toLocaleString()}`}
            sublabel={`Next: LV ${Math.min(progress.level + 1, 100)}`}
          />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 font-sys text-center text-[0.65rem] uppercase tracking-widest">
          <div className="border border-accent-cyan/20 bg-bg-base/40 p-2">
            <div className="text-base text-accent-gold glow-text">{totals?.current_streak ?? 0}</div>
            <div className="text-slate-500">Streak</div>
          </div>
          <div className="border border-accent-cyan/20 bg-bg-base/40 p-2">
            <div className="text-base text-essence glow-text">{profile.essence_stones}</div>
            <div className="text-slate-500">Essence</div>
          </div>
          <div className="border border-accent-cyan/20 bg-bg-base/40 p-2">
            <div className="text-base text-mana glow-text">{profile.mana_potions}</div>
            <div className="text-slate-500">Potions</div>
          </div>
        </div>
      </SystemWindow>

      {/* ── 9 stats ── */}
      <SystemWindow title="Attributes" delay={0.08}>
        <div className="flex flex-col gap-3">
          {STAT_GROUPS.map((group, gi) => (
            <div key={group.name}>
              <div className="mb-1 font-sys text-[0.6rem] uppercase tracking-[0.25em] text-slate-500">
                {group.name}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {group.stats.map((key, si) => (
                  <motion.div
                    key={key}
                    className="border border-accent-cyan/20 bg-bg-base/40 p-2 text-center"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 + gi * 0.08 + si * 0.04 }}
                    title={STAT_LABELS[key]}
                  >
                    <div className="font-sys text-[0.65rem] uppercase tracking-widest text-accent-cyan">
                      {key}
                    </div>
                    <div className="font-sys text-lg text-white">
                      {Number((statMap[key] ?? 10).toFixed(1))}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SystemWindow>

      {/* ── Class advancement (Phase 7) ── */}
      {!profile.class && profile.level >= CLASS_UNLOCK_LEVEL && <ClassChoicePanel />}

      {/* ── Skills & Titles (Phase 7) ── */}
      <SkillsPanel />
      <TitlesPanel />

      {/* ── Lifetime record ── */}
      <SystemWindow title="Record" accent="purple" delay={0.16}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 font-sys text-xs uppercase tracking-wider">
          <Record label="Push-ups" value={totals?.total_pushups ?? 0} />
          <Record label="Sit-ups" value={totals?.total_situps ?? 0} />
          <Record label="Squats" value={totals?.total_squats ?? 0} />
          <Record label="Distance" value={`${Number(totals?.total_run_km ?? 0).toFixed(1)} km`} />
          <Record label="Days trained" value={totals?.days_completed ?? 0} />
          <Record label="Best streak" value={totals?.best_streak ?? 0} />
        </div>
      </SystemWindow>

      {/* ── System log ── */}
      <SystemWindow title="System Log" accent="gold" delay={0.24}>
        {messages.length === 0 ? (
          <p className="font-sys text-xs text-slate-500">No messages.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.slice(0, 6).map((m) => (
              <li key={m.id} className="border-l-2 border-accent-gold/40 pl-3">
                <div className="font-display text-sm font-semibold">{m.title}</div>
                {m.body && <div className="mt-0.5 text-xs text-slate-400">{m.body}</div>}
                <div className="mt-0.5 font-sys text-[0.6rem] uppercase tracking-widest text-slate-600">
                  {new Date(m.created_at).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SystemWindow>
    </div>
  );
}

// ── Class advancement: one path, chosen once, at the unlock level ────────────
function ClassChoicePanel() {
  const { refresh } = usePlayerStore();
  const pushAlert = useUiStore((s) => s.pushAlert);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function choose() {
    if (busy || !selected) return;
    setBusy(true);
    try {
      await gameAction('choose-class', { class_key: selected });
      const def = classByKey(selected);
      pushAlert({
        kind: 'success',
        title: `CLASS ADVANCEMENT — ${def?.name ?? selected}`,
        body: '+10% XP in this domain, from this day on.',
      });
      await refresh();
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Advancement rejected',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SystemWindow title="Class Advancement" accent="red" scan delay={0.1}>
      <p className="text-xs leading-relaxed text-slate-400">
        You have proven yourself worthy of a class. Choose your path — the choice is permanent,
        and it shapes how the System rewards you.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {CLASSES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setSelected(c.key)}
            className={`border p-3 text-left transition-colors ${
              selected === c.key
                ? 'border-accent-cyan/70 bg-accent-cyan/10'
                : 'border-accent-cyan/20 bg-bg-base/40'
            }`}
          >
            <div className="font-display text-sm font-bold uppercase tracking-widest text-white">
              {c.name}
            </div>
            <div className="mt-1 text-xs leading-relaxed text-slate-400">{c.line}</div>
          </button>
        ))}
      </div>
      <button className="sys-btn mt-3 w-full" disabled={busy || !selected} onClick={choose}>
        {selected ? `⚔ Walk the path of the ${classByKey(selected)?.name}` : 'Choose a path'}
      </button>
    </SystemWindow>
  );
}

// ── Skills: milestone-unlocked passives ──────────────────────────────────────
function SkillsPanel() {
  const { skills } = usePlayerStore();
  const unlocked = new Set(skills.map((s) => s.skill_key));

  return (
    <SystemWindow title={`Skills — ${unlocked.size}/${SKILLS.length}`} delay={0.12}>
      <div className="flex flex-col gap-2">
        {SKILLS.map((skill) => {
          const has = unlocked.has(skill.key);
          return (
            <div
              key={skill.key}
              className={`border p-2 ${has ? 'border-accent-cyan/40 bg-bg-base/40' : 'border-white/5 bg-bg-base/20 opacity-60'}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={`font-sys text-xs uppercase tracking-widest ${has ? 'text-accent-cyan glow-text' : 'text-slate-500'}`}
                >
                  {has ? `[${skill.name}]` : '[ ??? ]'}
                </span>
                <span className="font-sys text-[0.6rem] uppercase tracking-widest text-slate-600">
                  {has ? 'Passive' : 'Locked'}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-slate-400">
                {has ? skill.perk : skill.requirement}
              </div>
            </div>
          );
        })}
      </div>
    </SystemWindow>
  );
}

// ── Titles: earned badges, one worn on the status line ───────────────────────
function TitlesPanel() {
  const { profile, titles, refresh } = usePlayerStore();
  const pushAlert = useUiStore((s) => s.pushAlert);
  const [busy, setBusy] = useState(false);
  const earned = new Set(titles.map((t) => t.title_key));

  async function equip(titleKey: string | null) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await gameAction<{ equipped_title: string | null }>('equip-title', {
        title_key: titleKey,
      });
      pushAlert({
        kind: 'success',
        title: res.equipped_title ? `Title equipped — ${res.equipped_title}` : 'Title removed',
      });
      await refresh();
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Title rejected',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SystemWindow title={`Titles — ${earned.size}/${TITLES.length}`} accent="gold" delay={0.14}>
      <div className="flex flex-col gap-2">
        {TITLES.map((title) => {
          const has = earned.has(title.key);
          const worn = has && profile?.equipped_title === title.name;
          return (
            <div
              key={title.key}
              className={`flex items-center justify-between gap-2 border p-2 ${
                has ? 'border-accent-gold/40 bg-bg-base/40' : 'border-white/5 bg-bg-base/20 opacity-60'
              }`}
            >
              <div className="min-w-0">
                <div
                  className={`font-sys text-xs uppercase tracking-widest ${has ? 'text-accent-gold' : 'text-slate-500'}`}
                >
                  {has ? title.name : '???'}
                </div>
                <div className="mt-0.5 truncate text-[0.65rem] text-slate-500">
                  {title.requirement}
                </div>
              </div>
              {has && (
                <button
                  className="sys-btn sys-btn-ghost shrink-0 !min-h-[28px] !px-2 !py-0.5 !text-[0.6rem]"
                  disabled={busy}
                  onClick={() => equip(worn ? null : title.key)}
                >
                  {worn ? 'Unequip' : 'Equip'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </SystemWindow>
  );
}

function Record({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between border-b border-white/5 pb-1">
      <span className="text-slate-500">{label}</span>
      <span className="text-white">{typeof value === 'number' ? value.toLocaleString() : value}</span>
    </div>
  );
}
