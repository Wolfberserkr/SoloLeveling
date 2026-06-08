// Monarch's Skills — Phase 2 skill-tree system.
//
// Skills are unlocked by spending skill_points (earned 1/level) and are
// gated behind rank tiers (D→National). Most are active abilities that
// cost mana; a few are passive always-on buffs.
//
// State lives in two places:
//   - `hunter_skills` row exists ⇒ skill is unlocked
//   - `last_used_at` enforces cadence (day / week) — only one use per period
//   - Single-use forward buffs (bloodlust, berserker, soul_steal) live in
//     `active_buffs` until consumed by the next relevant event.

import { getAdminSupabase } from './supabase/admin';
import { getUserTz, dateInTz, todayInTz } from './time';
import { unlock as unlockAchievement } from './achievements';

export type SkillKind = 'active' | 'passive';
export type Cadence = 'day' | 'week';

export type SkillDef = {
  key: string;
  name: string;
  description: string;
  rank_required: string; // 'D' | 'C' | 'B' | 'A' | 'S' | 'National'
  cost: number; // skill points
  prereqs: string[]; // other skill keys
  kind: SkillKind;
  mana_cost?: number; // active only
  cadence?: Cadence; // active only
  effect_key?: string; // active only — discriminator
  icon: string;
};

export const SKILLS: SkillDef[] = [
  // ── Tier 1 · Rank D ────────────────────────────────────────────────
  {
    key: 'rulers_hand',
    name: "Ruler's Hand",
    description: 'Reach out and finish an in-progress daily quest for you.',
    rank_required: 'D',
    cost: 1,
    prereqs: [],
    kind: 'active',
    mana_cost: 50,
    cadence: 'day',
    effect_key: 'rulers_hand',
    icon: '◈',
  },
  {
    key: 'bloodlust',
    name: 'Bloodlust',
    description: '+25% XP from your next workout clear.',
    rank_required: 'D',
    cost: 1,
    prereqs: [],
    kind: 'active',
    mana_cost: 30,
    cadence: 'day',
    effect_key: 'bloodlust',
    icon: '◆',
  },
  // ── Tier 2 · Rank C ────────────────────────────────────────────────
  {
    key: 'domain',
    name: 'Domain of the Monarch',
    description: '2× XP from all sources for 2 hours.',
    rank_required: 'C',
    cost: 2,
    prereqs: ['bloodlust'],
    kind: 'active',
    mana_cost: 40,
    cadence: 'day',
    effect_key: 'domain',
    icon: '⬡',
  },
  {
    key: 'mana_surge',
    name: 'Mana Surge',
    description: 'Permanently raises your maximum mana by 25.',
    rank_required: 'C',
    cost: 2,
    prereqs: [],
    kind: 'passive',
    icon: '✺',
  },
  {
    key: 'shadow_exchange',
    name: 'Shadow Exchange',
    description: 'Re-roll your most recently extracted shadow.',
    rank_required: 'C',
    cost: 2,
    prereqs: [],
    kind: 'active',
    mana_cost: 30,
    cadence: 'day',
    effect_key: 'shadow_exchange',
    icon: '⇌',
  },
  // ── Tier 3 · Rank B ────────────────────────────────────────────────
  {
    key: 'berserker',
    name: "Berserker's Will",
    description: '3× XP from your next workout clear. Overrides Bloodlust.',
    rank_required: 'B',
    cost: 3,
    prereqs: ['domain'],
    kind: 'active',
    mana_cost: 60,
    cadence: 'day',
    effect_key: 'berserker',
    icon: '✸',
  },
  {
    key: 'shadow_affinity',
    name: 'Shadow Affinity',
    description: '+10% shadow extraction chance on every dungeon clear.',
    rank_required: 'B',
    cost: 3,
    prereqs: [],
    kind: 'passive',
    icon: '☽',
  },
  {
    key: 'time_skip',
    name: 'Time Skip',
    description: 'Extend the active Gate by 12 hours.',
    rank_required: 'B',
    cost: 3,
    prereqs: [],
    kind: 'active',
    mana_cost: 40,
    cadence: 'day',
    effect_key: 'time_skip',
    icon: '◎',
  },
  // ── Tier 4 · Rank A ────────────────────────────────────────────────
  {
    key: 'soul_steal',
    name: 'Soul Steal',
    description: 'Guarantee a shadow extraction on your next session clear.',
    rank_required: 'A',
    cost: 4,
    prereqs: ['shadow_affinity'],
    kind: 'active',
    mana_cost: 80,
    cadence: 'day',
    effect_key: 'soul_steal',
    icon: '◉',
  },
  {
    key: 'time_reversal',
    name: 'Time Reversal',
    description: "Restore yesterday's lost streak. Once per week.",
    rank_required: 'A',
    cost: 4,
    prereqs: ['time_skip'],
    kind: 'active',
    mana_cost: 100,
    cadence: 'week',
    effect_key: 'time_reversal',
    icon: '↺',
  },
  // ── Tier 5 · Rank S+ ───────────────────────────────────────────────
  {
    key: 'sovereigns_domain',
    name: "Sovereign's Domain",
    description: "Auto-clear today's scheduled dungeon session. Once per week.",
    rank_required: 'S',
    cost: 5,
    prereqs: ['berserker', 'time_reversal'],
    kind: 'active',
    mana_cost: 120,
    cadence: 'week',
    effect_key: 'sovereigns_domain',
    icon: '✦',
  },
  {
    key: 'monarchs_aura',
    name: "Monarch's Aura",
    description: '+1 additional skill point per level up.',
    rank_required: 'S',
    cost: 5,
    prereqs: [],
    kind: 'passive',
    icon: '☀',
  },
];

const RANK_ORDER = ['E', 'D', 'C', 'B', 'A', 'S', 'National'];
const PASSIVE_KEYS = new Set(SKILLS.filter((s) => s.kind === 'passive').map((s) => s.key));

export function skillFor(key: string): SkillDef | undefined {
  return SKILLS.find((s) => s.key === key);
}

export function rankAtLeast(current: string, required: string): boolean {
  return RANK_ORDER.indexOf(current) >= RANK_ORDER.indexOf(required);
}

export type OwnedSkill = {
  key: string;
  unlocked_at: string;
  last_used_at: string | null;
};

export async function listOwned(userId: string): Promise<OwnedSkill[]> {
  const sb = getAdminSupabase();
  const { data } = await sb
    .from('hunter_skills')
    .select('skill_key, unlocked_at, last_used_at')
    .eq('user_id', userId);
  return (data || []).map((r: any) => ({
    key: r.skill_key,
    unlocked_at: r.unlocked_at,
    last_used_at: r.last_used_at,
  }));
}

export async function hasPassive(userId: string, key: string): Promise<boolean> {
  if (!PASSIVE_KEYS.has(key)) return false;
  const sb = getAdminSupabase();
  const { data } = await sb
    .from('hunter_skills')
    .select('skill_key')
    .eq('user_id', userId)
    .eq('skill_key', key)
    .maybeSingle();
  return !!data;
}

// Replaces the MAX_MANA constant for users who own Mana Surge.
export const BASE_MAX_MANA = 150;
export async function maxManaFor(userId: string): Promise<number> {
  return (await hasPassive(userId, 'mana_surge')) ? BASE_MAX_MANA + 25 : BASE_MAX_MANA;
}

// Determines if an active skill can be used right now based on its cadence.
function isCooldownReady(skill: SkillDef, lastUsedAt: string | null, tz: string): boolean {
  if (!lastUsedAt) return true;
  if (skill.cadence === 'day') {
    return dateInTz(tz, new Date(lastUsedAt)) !== todayInTz(tz);
  }
  if (skill.cadence === 'week') {
    return Date.now() - new Date(lastUsedAt).getTime() >= 7 * 86400 * 1000;
  }
  return true;
}

export async function unlockSkill(userId: string, skillKey: string): Promise<{ ok: boolean; message: string }> {
  const skill = skillFor(skillKey);
  if (!skill) return { ok: false, message: 'Unknown skill.' };
  const sb = getAdminSupabase();

  const { data: stats } = await sb
    .from('hunter_stats')
    .select('rank, skill_points')
    .eq('user_id', userId)
    .single();
  if (!stats) return { ok: false, message: 'Stats not found.' };
  if (!rankAtLeast(stats.rank, skill.rank_required))
    return { ok: false, message: `Requires rank ${skill.rank_required}.` };
  if (stats.skill_points < skill.cost)
    return { ok: false, message: `Need ${skill.cost} skill point(s).` };

  const owned = new Set((await listOwned(userId)).map((o) => o.key));
  if (owned.has(skillKey)) return { ok: false, message: 'Already unlocked.' };
  for (const pr of skill.prereqs) {
    if (!owned.has(pr)) return { ok: false, message: `Missing prerequisite: ${skillFor(pr)?.name || pr}.` };
  }

  await sb.from('hunter_skills').insert({ user_id: userId, skill_key: skillKey });
  await sb
    .from('hunter_stats')
    .update({ skill_points: stats.skill_points - skill.cost })
    .eq('user_id', userId);
  await sb.from('notifications').insert({
    user_id: userId,
    kind: 'skill_unlocked',
    title: `[ SKILL LEARNED ]  ${skill.name}`,
    body: skill.description,
  });
  await unlockAchievement(userId, 'first_skill');
  return { ok: true, message: `${skill.name} learned.` };
}

export async function useSkill(
  userId: string,
  skillKey: string,
  args?: Record<string, any>
): Promise<{ ok: boolean; message: string; data?: any }> {
  const skill = skillFor(skillKey);
  if (!skill) return { ok: false, message: 'Unknown skill.' };
  if (skill.kind !== 'active') return { ok: false, message: 'This skill is passive.' };

  const sb = getAdminSupabase();
  const { data: row } = await sb
    .from('hunter_skills')
    .select('skill_key, last_used_at')
    .eq('user_id', userId)
    .eq('skill_key', skillKey)
    .maybeSingle();
  if (!row) return { ok: false, message: 'Skill not learned.' };

  const tz = await getUserTz(userId);
  if (!isCooldownReady(skill, row.last_used_at, tz)) {
    return {
      ok: false,
      message: skill.cadence === 'day' ? 'Already used today.' : 'Already used this week.',
    };
  }

  const { data: stats } = await sb
    .from('hunter_stats')
    .select('mana')
    .eq('user_id', userId)
    .single();
  const cost = skill.mana_cost || 0;
  if (!stats || stats.mana < cost) return { ok: false, message: `Need ${cost} mana.` };

  const effect = await applyActiveEffect(userId, skill, args);
  if (!effect.ok) return effect;

  await sb
    .from('hunter_stats')
    .update({ mana: stats.mana - cost })
    .eq('user_id', userId);
  await sb
    .from('hunter_skills')
    .update({ last_used_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('skill_key', skillKey);
  await sb.from('notifications').insert({
    user_id: userId,
    kind: 'skill_used',
    title: `[ SKILL CAST ]  ${skill.name}`,
    body: effect.message,
  });
  return { ok: true, message: effect.message, data: effect.data };
}

async function applyActiveEffect(
  userId: string,
  skill: SkillDef,
  args?: Record<string, any>
): Promise<{ ok: boolean; message: string; data?: any }> {
  const sb = getAdminSupabase();

  switch (skill.effect_key) {
    case 'rulers_hand': {
      const questKey = args?.questKey as string | undefined;
      if (!questKey) return { ok: false, message: 'Choose a quest to complete.' };
      const { applyRulersHand } = await import('./quests');
      const res = await applyRulersHand(userId, questKey);
      if (!res.ok) return { ok: false, message: res.message };
      return { ok: true, message: `Quest auto-completed: ${res.label}.`, data: res };
    }
    case 'bloodlust':
    case 'berserker': {
      // Single-use forward buff. Old bloodlust/berserker is replaced.
      await sb
        .from('active_buffs')
        .delete()
        .eq('user_id', userId)
        .in('buff_key', ['bloodlust', 'berserker']);
      await sb.from('active_buffs').insert({
        user_id: userId,
        buff_key: skill.effect_key,
        expires_at: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
      });
      const mult = skill.effect_key === 'berserker' ? '3×' : '+25%';
      return { ok: true, message: `${mult} XP buff queued for your next workout.` };
    }
    case 'domain': {
      // 2× XP timed buff for 2 hours.
      await sb.from('active_buffs').insert({
        user_id: userId,
        buff_key: 'domain',
        expires_at: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
      });
      return { ok: true, message: '2× XP active for the next 2 hours.' };
    }
    case 'shadow_exchange': {
      const { rerollLastShadow } = await import('./shadows');
      const res = await rerollLastShadow(userId);
      if (!res.ok) return { ok: false, message: res.message };
      return { ok: true, message: `Re-rolled: ${res.message}`, data: res };
    }
    case 'time_skip': {
      const { extendActiveGate } = await import('./gates');
      const res = await extendActiveGate(userId, 12);
      if (!res.ok) return { ok: false, message: res.message };
      return { ok: true, message: 'Gate extended by 12 hours.' };
    }
    case 'soul_steal': {
      await sb
        .from('active_buffs')
        .delete()
        .eq('user_id', userId)
        .eq('buff_key', 'soul_steal');
      await sb.from('active_buffs').insert({
        user_id: userId,
        buff_key: 'soul_steal',
        expires_at: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
      });
      return { ok: true, message: 'Next session guarantees a shadow extraction.' };
    }
    case 'time_reversal': {
      // Restore yesterday's streak: increment streak by 1 and set last_quest_date
      // to today so today doesn't count as a fresh day-1 reset.
      const { data: s } = await sb
        .from('hunter_stats')
        .select('streak')
        .eq('user_id', userId)
        .single();
      const restored = (s?.streak || 0) + 1;
      const tz = await getUserTz(userId);
      const today = todayInTz(tz);
      await sb
        .from('hunter_stats')
        .update({ streak: restored, last_quest_date: today })
        .eq('user_id', userId);
      return { ok: true, message: `Streak restored to ${restored} day(s).` };
    }
    case 'sovereigns_domain': {
      const { awardXp } = await import('./leveling');
      const { maybeExtractShadow } = await import('./shadows');
      await awardXp(userId, 800, "Sovereign's Domain — session auto-cleared");
      const shadow = await maybeExtractShadow(userId, {
        session_key: 'sovereigns_domain',
        deload: true,
        prCount: 3,
      });
      return {
        ok: true,
        message: shadow ? `+800 XP and extracted ${shadow.name}.` : '+800 XP awarded.',
        data: { shadow },
      };
    }
  }
  return { ok: false, message: 'Effect not implemented.' };
}

// Called by the workout-complete handler to consume Bloodlust / Berserker.
// Returns the XP multiplier (1, 1.25, or 3) and removes the buff row.
export async function consumeWorkoutXpBuff(userId: string): Promise<number> {
  const sb = getAdminSupabase();
  const { data: buffs } = await sb
    .from('active_buffs')
    .select('id, buff_key')
    .eq('user_id', userId)
    .in('buff_key', ['berserker', 'bloodlust']);
  if (!buffs || buffs.length === 0) return 1;
  // Berserker overrides Bloodlust if somehow both present.
  const pick = buffs.find((b: any) => b.buff_key === 'berserker') || buffs[0];
  await sb.from('active_buffs').delete().eq('id', pick.id);
  return pick.buff_key === 'berserker' ? 3 : 1.25;
}

// Called by maybeExtractShadow — returns true if the user's Soul Steal buff
// should force the extraction. Consumes the buff if so.
export async function consumeSoulStealIfPresent(userId: string): Promise<boolean> {
  const sb = getAdminSupabase();
  const { data } = await sb
    .from('active_buffs')
    .select('id')
    .eq('user_id', userId)
    .eq('buff_key', 'soul_steal')
    .maybeSingle();
  if (!data) return false;
  await sb.from('active_buffs').delete().eq('id', data.id);
  return true;
}

// Returns the XP multiplier from active Domain buff (1 or 2).
export async function domainMultiplier(userId: string): Promise<number> {
  const sb = getAdminSupabase();
  const nowIso = new Date().toISOString();
  const { data } = await sb
    .from('active_buffs')
    .select('buff_key, expires_at')
    .eq('user_id', userId)
    .eq('buff_key', 'domain')
    .gte('expires_at', nowIso)
    .maybeSingle();
  return data ? 2 : 1;
}
