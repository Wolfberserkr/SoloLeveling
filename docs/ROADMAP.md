# THE SYSTEM — Post-Launch Roadmap

The original 8-phase build (see `README.md`) delivers a complete solo loop:
train → XP / stats / rank → mana economy → dungeons · library · events →
classes · skills · titles → Legacy Boss. This document plans what comes
**after** that arc.

Design principles carried over from Phases 1–8:

- **Server-authoritative.** Every reward-bearing mutation runs in the `game`
  edge function with the service-role key; clients only `SELECT` (RLS).
- **Pure, shared game math.** Rules live in `supabase/functions/_shared/game/`
  (the `@game` alias), unit-tested with Vitest. New systems add a pure module.
- **Tier-B tables.** New tables grant `select` to `authenticated`; writes are
  service-role only (mirror `skills` / `titles` / `legacy_snapshots`).
- **Contained slices.** Each phase ships a small, testable first PR, then widens.

## Sequence

| Phase | Theme | Leverage | Effort | Depends on |
|---|---|---|---|---|
| 9 ✅ | Shadow Army (extraction) | ★★★ thematic + retention | M | skills pattern |
| 10 🔄 | AI System Coach | ★★★ retention | M | Gemini infra, cron |
| 11 | Seasons & live-ops | ★★★ renewable content | M | system_events, cron |
| 12 | Health / wearable sync | ★★★ friction kill | L | OAuth infra |
| 13 | Endgame: Reawakening + 2nd Job | ★★ longevity | M | ranks / classes |
| 14 | Economy & cosmetics (Essence sink) | ★★ | M | essence_stones |
| 15 | Social (cards → guilds) | ★★★ (high risk) | L | privacy / RLS rework |

**Critical path:** 9 → 10 → 11, slotting in 12 once the loop is proven.

---

## Phase 9 — Shadow Army  *(start here)*

**Goal:** every conquest becomes a permanent ally — the signature Solo Leveling
mechanic, currently unused.

**Build:**
- `shadows` table (Tier B): `user_id, shadow_key, source_type, source_ref,
  name, passive jsonb, arisen_at, deployed`.
- Pure `_shared/game/shadows.ts`: shadow archetypes, passive effects, and
  `deployedModifiers(shadows)` — mirrors how `skills` aggregate in
  `progression.ts`.
- Extraction hook: after `boss_clear` / `gate_clear` / `book_finished` /
  `legacy_clear`, surface an **"Arise"** action (`extract-shadow`). Army
  capacity (deployable count) scales with rank.
- Deployed-shadow modifiers fold into `awardXp` / the daily reset, like passive
  skills.
- New **Shadow Army** page + nav tab.

**First slice:** extraction on dungeon boss clears only → a simple army list →
one passive type (XP/stat-domain buff). Then widen the sources.

## Phase 10 — AI System Coach

**Goal:** a weekly narrated review plus adaptive targets, reusing the Gemini
plumbing from Phase 6.

**Build:** extend `_shared/ai.ts`; a `weekly_reviews` table; the Phase 5 cron
triggers Sunday generation over the last 7 days of quests / lifts / sleep /
metrics / retention; plateau & deload detection feeds `training.ts` target
tuning; a "System Assessment" card on Status.

**Shipped:**
- *Weekly review* — `_shared/game/review.ts` (pure summary),
  `_shared/ai.ts#generateWeeklyReview`, the `weekly_reviews` table, and a
  "System Assessment" card on Status; the cron heartbeat auto-generates each
  Monday, with an on-demand request as fallback.
- *Adaptive targets* — `adaptiveLoad` (pure, bounded plateau/deload detection)
  feeds a persistent `profiles.training_load` the coach tunes weekly; the Daily
  Training Quest multiplies its targets by it in `ensureDailyState`.
- *Per-exercise focus* — `summarizeWeek` derives the single movement neglected
  most across the week's hard (non-recovery) days (pure, in `review.ts`); the
  coach names it as the closing directive (`ai.ts`) and the System Assessment
  card surfaces it.
- *Streak-risk nudge* — pure `streak.ts#streakNudge` decides when an unbroken
  streak hangs on *tonight* (alive, unshielded, today still empty); the evening
  cron reminder then names the number on the line instead of the generic poke.

**Next:** fold the weekly review into a Sunday recap push.

## Phase 11 — Seasons & live-ops

**Goal:** turn a finite roadmap into a renewable content cadence.

**Build:** `seasons` config + `season_progress`; a seasonal Gate ladder built on
`system_events`; a free **System Pass** of titles / cosmetics; cron rolls season
transitions.

**First slice:** one 4-week season with a themed Gate ladder + seasonal title
rewards.

## Phase 12 — Health / wearable sync

**Goal:** kill manual-logging churn — the top risk for a multi-year app.

**Build:** OAuth + a sync edge function mapping activities → training quest /
`lift_logs` / `sleep_logs` / `body_metrics`; encrypted token storage with RLS.

**First slice:** **Strava** run import → auto-fill `run_km` (web-OAuth-friendly;
Apple Health needs a native shell, defer).

## Phase 13 — Endgame: Reawakening + 2nd Job

**Goal:** content past Level 100 / Monarch.

**Build:** Reawakening (a prestige reset granting a permanent "Ruler's Authority"
buff); class evolution at S-Rank (e.g. Mage → Archmage) unlocking a new skill
branch.

**First slice:** the Reawakening prestige loop for capped players.

## Phase 14 — Economy & cosmetics

**Goal:** give `essence_stones` long-term purpose beyond skills.

**Build:** a shop; Status-window themes & rank-badge skins; **Artifacts** with
tradeoff modifiers and set bonuses.

**First slice:** purchasable cosmetic Status themes.

## Phase 15 — Social

**Goal:** retention via accountability — highest reward, highest cost.

**Build:** start with a **shareable Status card** (generated PNG, zero privacy
change); then guilds / parties (a new cross-user read model + an anti-cheat
review).

**First slice:** the shareable progress-card image.
