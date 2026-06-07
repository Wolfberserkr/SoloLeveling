// Shadow Army — entities extracted from cleared dungeons. Each session rolls
// for an extraction with rarity weighted by PR count + deload status.
//
// Note: distinct from the `shadow_extraction` POWER-UP (a deload-week
// consumable). Same anime, different game mechanic.

import { getAdminSupabase } from './supabase/admin';
import { unlock } from './achievements';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export type Shadow = {
  id: number;
  name: string;
  rarity: Rarity;
  power: number;
  source_session: string | null;
  extracted_at: string;
};

const NAME_POOL: Record<Rarity, string[]> = {
  legendary: ['Igris', 'Bellion', 'Beru', 'Tank', 'Tusk', 'Greed', 'Kaisel'],
  epic: ['Iron', 'Fang', 'Razor', 'Vex', 'Ashen', 'Stormcaller', 'Voidstep'],
  rare: ['Grim', 'Cinder', 'Shade', 'Onyx', 'Rune', 'Hollow', 'Wraith'],
  common: [
    'Pawn', 'Scout', 'Husk', 'Gnaw', 'Crawl', 'Mote', 'Drift', 'Ember',
    'Splint', 'Twig', 'Brack', 'Smolder',
  ],
};

const RARITY_POWER: Record<Rarity, number> = {
  common: 5,
  rare: 15,
  epic: 40,
  legendary: 100,
};

const RARITY_COLOR: Record<Rarity, string> = {
  common: '#9ca3af',
  rare: '#4ecbff',
  epic: '#a855f7',
  legendary: '#ffd166',
};

export function rarityColor(r: Rarity): string {
  return RARITY_COLOR[r];
}

export type ExtractionContext = {
  session_key: string;
  deload: boolean;
  prCount: number;
};

// Returns the inserted shadow, or null if no extraction this session.
export async function maybeExtractShadow(
  userId: string,
  ctx: ExtractionContext
): Promise<Shadow | null> {
  const sb = getAdminSupabase();
  const today = new Date().toISOString().slice(0, 10);

  // Idempotency guard — don't double-extract on a network retry / double-submit.
  const { data: alreadyExtracted } = await sb
    .from('shadows')
    .select('id')
    .eq('user_id', userId)
    .eq('source_session', ctx.session_key)
    .gte('extracted_at', `${today}T00:00:00Z`)
    .lte('extracted_at', `${today}T23:59:59Z`)
    .maybeSingle();
  if (alreadyExtracted) return null;

  // Roll chance: base 25%, +25% deload, +15% per PR (cap at 90%).
  let chance = 0.25;
  if (ctx.deload) chance += 0.25;
  chance += Math.min(0.4, ctx.prCount * 0.15);
  chance = Math.min(0.9, chance);
  if (Math.random() >= chance) return null;

  const rarity = rollRarity(ctx);
  const name = pickName(rarity);
  const power = RARITY_POWER[rarity] + Math.floor(Math.random() * 8);

  const { data: inserted, error } = await sb
    .from('shadows')
    .insert({
      user_id: userId,
      name,
      rarity,
      power,
      source_session: ctx.session_key,
    })
    .select('*')
    .single();
  if (error || !inserted) return null;

  // Increment cached count on hunter_stats.
  const { data: stats } = await sb
    .from('hunter_stats')
    .select('shadows_collected')
    .eq('user_id', userId)
    .single();
  await sb
    .from('hunter_stats')
    .update({ shadows_collected: (stats?.shadows_collected || 0) + 1 })
    .eq('user_id', userId);

  // First shadow ever → Arise achievement (also fires on deload elsewhere).
  await unlock(userId, 'shadow_first');

  await sb.from('notifications').insert({
    user_id: userId,
    kind: 'shadow',
    title: `[ ARISE ]  ${name.toUpperCase()} — ${rarity.toUpperCase()} SHADOW`,
    body: `Power +${power}. The shadow joins your army.`,
  });

  return inserted as Shadow;
}

function rollRarity(ctx: ExtractionContext): Rarity {
  // Base weights, then bias by deload + PRs.
  const w = { common: 60, rare: 25, epic: 12, legendary: 3 };
  if (ctx.deload) {
    w.common -= 10;
    w.rare += 5;
    w.epic += 3;
    w.legendary += 2;
  }
  const prBoost = Math.min(3, ctx.prCount);
  w.common -= prBoost * 5;
  w.rare += prBoost * 2;
  w.epic += prBoost * 2;
  w.legendary += prBoost * 1;

  const total = w.common + w.rare + w.epic + w.legendary;
  let n = Math.random() * total;
  if ((n -= w.common) < 0) return 'common';
  if ((n -= w.rare) < 0) return 'rare';
  if ((n -= w.epic) < 0) return 'epic';
  return 'legendary';
}

function pickName(rarity: Rarity): string {
  const pool = NAME_POOL[rarity];
  return pool[Math.floor(Math.random() * pool.length)];
}

export async function listArmy(userId: string): Promise<Shadow[]> {
  const sb = getAdminSupabase();
  const { data } = await sb
    .from('shadows')
    .select('*')
    .eq('user_id', userId)
    .order('extracted_at', { ascending: false });
  return (data as Shadow[]) || [];
}

export function totalArmyPower(army: Shadow[]): number {
  return army.reduce((sum, s) => sum + s.power, 0);
}
