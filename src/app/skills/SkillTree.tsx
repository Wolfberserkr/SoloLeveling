'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SkillDef, OwnedSkill } from '@/lib/skills';

type Props = {
  catalog: SkillDef[];
  owned: OwnedSkill[];
  rank: string;
  skillPoints: number;
  mana: number;
  inProgressQuests: { key: string; label: string }[];
};

const RANK_ORDER = ['E', 'D', 'C', 'B', 'A', 'S', 'National'];
const TIER_LABEL: Record<string, string> = {
  D: 'TIER I · RANK D',
  C: 'TIER II · RANK C',
  B: 'TIER III · RANK B',
  A: 'TIER IV · RANK A',
  S: 'TIER V · RANK S+',
};

function rankAtLeast(current: string, required: string) {
  return RANK_ORDER.indexOf(current) >= RANK_ORDER.indexOf(required);
}

export function SkillTree({
  catalog,
  owned: initialOwned,
  rank,
  skillPoints: initialSp,
  mana: initialMana,
  inProgressQuests,
}: Props) {
  const [owned, setOwned] = useState(initialOwned);
  const [sp, setSp] = useState(initialSp);
  const [mana, setMana] = useState(initialMana);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pickQuestFor, setPickQuestFor] = useState<string | null>(null);
  const router = useRouter();

  const ownedSet = new Set(owned.map((o) => o.key));
  const ownedMap = new Map(owned.map((o) => [o.key, o]));

  const tiers = ['D', 'C', 'B', 'A', 'S'] as const;
  const grouped = Object.fromEntries(
    tiers.map((t) => [t, catalog.filter((s) => s.rank_required === t)])
  ) as Record<string, SkillDef[]>;

  function flash(kind: 'ok' | 'err', text: string) {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 4000);
  }

  async function unlock(key: string) {
    setBusy(key);
    const res = await fetch('/api/skills/unlock', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ skillKey: key }),
    });
    const json = await res.json();
    setBusy(null);
    if (!json.ok) return flash('err', json.message || 'Unlock failed.');
    const skill = catalog.find((s) => s.key === key)!;
    setOwned((prev) => [...prev, { key, unlocked_at: new Date().toISOString(), last_used_at: null }]);
    setSp((s) => s - skill.cost);
    flash('ok', json.message);
    router.refresh();
  }

  async function activate(key: string, args?: Record<string, any>) {
    setBusy(key);
    const res = await fetch('/api/skills/activate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ skillKey: key, args }),
    });
    const json = await res.json();
    setBusy(null);
    if (!json.ok) return flash('err', json.message || 'Activation failed.');
    const skill = catalog.find((s) => s.key === key)!;
    if (skill.mana_cost) setMana((m) => m - (skill.mana_cost || 0));
    setOwned((prev) =>
      prev.map((o) => (o.key === key ? { ...o, last_used_at: new Date().toISOString() } : o))
    );
    flash('ok', json.message);
    router.refresh();
  }

  // ── Connection lines ────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [lines, setLines] = useState<
    { x1: number; y1: number; x2: number; y2: number; active: boolean; id: string }[]
  >([]);

  function setCardRef(key: string, el: HTMLDivElement | null) {
    if (el) cardRefs.current.set(key, el);
    else cardRefs.current.delete(key);
  }

  function computeLines() {
    const container = containerRef.current;
    if (!container) return;
    const cb = container.getBoundingClientRect();
    const next: typeof lines = [];
    for (const skill of catalog) {
      for (const prereq of skill.prereqs) {
        const from = cardRefs.current.get(prereq);
        const to = cardRefs.current.get(skill.key);
        if (!from || !to) continue;
        const f = from.getBoundingClientRect();
        const t = to.getBoundingClientRect();
        next.push({
          id: `${prereq}->${skill.key}`,
          x1: f.left + f.width / 2 - cb.left,
          y1: f.bottom - cb.top,
          x2: t.left + t.width / 2 - cb.left,
          y2: t.top - cb.top,
          active: ownedSet.has(prereq) && ownedSet.has(skill.key),
        });
      }
    }
    setLines(next);
  }

  useLayoutEffect(() => {
    computeLines();
    // Recompute on layout shifts that don't trigger ResizeObserver (font load etc).
    const id = window.setTimeout(computeLines, 150);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owned.length, catalog]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => computeLines());
    ro.observe(container);
    window.addEventListener('resize', computeLines);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', computeLines);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Rendering ───────────────────────────────────────────────────────
  function renderCard(skill: SkillDef) {
    const owned = ownedSet.has(skill.key);
    const ownedRow = ownedMap.get(skill.key);
    const rankOk = rankAtLeast(rank, skill.rank_required);
    const prereqsOk = skill.prereqs.every((p) => ownedSet.has(p));
    const canUnlock = !owned && rankOk && prereqsOk && sp >= skill.cost;

    // Cooldown gating for active skills.
    let cooldownReady = true;
    let cooldownLabel = '';
    if (owned && skill.kind === 'active' && ownedRow?.last_used_at) {
      const lastUsed = new Date(ownedRow.last_used_at);
      if (skill.cadence === 'day') {
        cooldownReady = lastUsed.toDateString() !== new Date().toDateString();
        if (!cooldownReady) cooldownLabel = 'Ready tomorrow';
      } else if (skill.cadence === 'week') {
        const elapsedMs = Date.now() - lastUsed.getTime();
        cooldownReady = elapsedMs >= 7 * 86400 * 1000;
        if (!cooldownReady) {
          const daysLeft = Math.ceil((7 * 86400 * 1000 - elapsedMs) / 86400000);
          cooldownLabel = `Ready in ${daysLeft}d`;
        }
      }
    }

    const manaOk = !skill.mana_cost || mana >= skill.mana_cost;
    const canUse = owned && skill.kind === 'active' && cooldownReady && manaOk;

    const tone = owned
      ? skill.kind === 'passive'
        ? 'border-accent-purple/70 bg-accent-purple/5 shadow-[0_0_18px_rgba(168,85,247,0.18)]'
        : 'border-accent-cyan/70 bg-accent-cyan/5 shadow-[0_0_18px_rgba(78,203,255,0.18)]'
      : canUnlock
        ? 'border-accent-gold/60 bg-bg-elevated/30'
        : 'border-[#465e7a]/40 bg-bg-elevated/10 opacity-60';

    const needsQuestPick = owned && skill.effect_key === 'rulers_hand';

    return (
      <div
        key={skill.key}
        ref={(el) => setCardRef(skill.key, el)}
        className={`relative p-3 border rounded-sm transition-all sm:min-h-[140px] flex flex-col ${tone}`}
      >
        <div className="flex items-start gap-2">
          <div className="text-xl leading-none mt-0.5">{skill.icon}</div>
          <div className="flex-1 min-w-0">
            <div className="font-mono text-[11px] tracking-[0.2em] uppercase truncate">
              {skill.name}
            </div>
            <div className="text-[9px] font-mono tracking-widest text-[#7aa0c2] mt-0.5">
              {skill.kind === 'passive' ? 'PASSIVE' : `${skill.mana_cost}M · ${skill.cadence?.toUpperCase()}`}
              {' · '}
              {skill.cost} SP
            </div>
          </div>
        </div>
        <p className="text-[11px] mt-2 text-[#a9c7e0] flex-1 leading-snug">{skill.description}</p>
        {skill.prereqs.length > 0 && (
          <div className="text-[9px] font-mono text-[#7aa0c2] mt-1">
            REQ: {skill.prereqs.map((p) => catalog.find((s) => s.key === p)?.name || p).join(' + ')}
          </div>
        )}

        <div className="mt-2 flex items-center gap-2">
          {owned ? (
            skill.kind === 'passive' ? (
              <span className="text-[10px] font-mono text-accent-purple tracking-widest">
                ✓ ACTIVE
              </span>
            ) : needsQuestPick ? (
              <button
                className="sys-btn text-[10px] !py-1 !px-2"
                disabled={!canUse || busy === skill.key}
                onClick={() => setPickQuestFor(skill.key)}
              >
                {cooldownReady ? (manaOk ? 'USE' : 'LOW MANA') : cooldownLabel}
              </button>
            ) : (
              <button
                className="sys-btn text-[10px] !py-1 !px-2"
                disabled={!canUse || busy === skill.key}
                onClick={() => activate(skill.key)}
              >
                {cooldownReady ? (manaOk ? 'USE' : 'LOW MANA') : cooldownLabel}
              </button>
            )
          ) : !rankOk ? (
            <span className="text-[10px] font-mono text-[#465e7a] tracking-widest">
              REQUIRES RANK {skill.rank_required}
            </span>
          ) : !prereqsOk ? (
            <span className="text-[10px] font-mono text-[#465e7a] tracking-widest">
              PREREQ MISSING
            </span>
          ) : (
            <button
              className="sys-btn text-[10px] !py-1 !px-2"
              disabled={!canUnlock || busy === skill.key}
              onClick={() => unlock(skill.key)}
            >
              {sp >= skill.cost ? `UNLOCK · ${skill.cost} SP` : `NEED ${skill.cost} SP`}
            </button>
          )}
        </div>

        {needsQuestPick && pickQuestFor === skill.key && (
          <div className="absolute inset-x-0 -bottom-2 translate-y-full z-10 bg-bg-elevated border border-accent-cyan/40 rounded-sm p-2 shadow-glow">
            <div className="text-[10px] font-mono text-accent-cyan tracking-widest mb-1">
              CHOOSE A QUEST
            </div>
            {inProgressQuests.length === 0 ? (
              <div className="text-[10px] text-[#7aa0c2]">No in-progress quests.</div>
            ) : (
              <div className="flex flex-col gap-1">
                {inProgressQuests.map((q) => (
                  <button
                    key={q.key}
                    className="sys-btn text-[10px] !py-1"
                    disabled={busy === skill.key}
                    onClick={() => {
                      setPickQuestFor(null);
                      activate(skill.key, { questKey: q.key });
                    }}
                  >
                    {q.label}
                  </button>
                ))}
                <button
                  className="text-[10px] font-mono text-[#7aa0c2] mt-1 hover:text-accent-cyan"
                  onClick={() => setPickQuestFor(null)}
                >
                  cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {msg && (
        <div
          className={`mb-3 px-3 py-2 text-[11px] font-mono tracking-widest border rounded-sm ${
            msg.kind === 'ok'
              ? 'border-accent-cyan/50 text-accent-cyan bg-accent-cyan/10'
              : 'border-accent-red/50 text-accent-red bg-accent-red/10'
          }`}
        >
          {msg.text}
        </div>
      )}

      <div ref={containerRef} className="relative">
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none hidden sm:block"
          style={{ zIndex: 0 }}
        >
          {lines.map((l) => (
            <line
              key={l.id}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              stroke={l.active ? '#4ecbff' : '#465e7a'}
              strokeWidth={l.active ? 2 : 1}
              strokeDasharray={l.active ? '' : '4 4'}
              opacity={l.active ? 0.9 : 0.4}
            />
          ))}
        </svg>

        <div className="relative" style={{ zIndex: 1 }}>
          {(['D', 'C', 'B', 'A', 'S'] as const).map((tier) => (
            <div key={tier} className="mb-10 last:mb-0">
              <div className="text-[10px] font-mono tracking-[0.3em] text-accent-purple/80 mb-2">
                {TIER_LABEL[tier]}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {grouped[tier].map((s) => renderCard(s))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
