# THE SYSTEM — Full Audit, Fix Plan, and 5 New Features

> Audit date: 2026-07-05. Line references are as of the commit this document
> landed in; later fixes on this branch shift them.

## Context
Full site audit (bugs, points of failure, performance), an action plan to fix findings, five new Solo Leveling-inspired features applicable to everyday life, and quality-of-life improvements — all in service of "motivate the user, make it hard to put down."

Repo: Vite + React 18 + TS PWA · Supabase (Postgres + RLS + Deno edge functions `game`/`cron`) · pure game math in `supabase/functions/_shared/game/` (`@game` alias, Vitest-covered).

Overall verdict: architecture is solid (server-authoritative XP via `award_xp` RPC, tight RLS, pure tested game math). The problems cluster in: client resilience (timeouts, retries, staleness), a few real server logic bugs, and missing retention levers.

---

## AUDIT FINDINGS

### Critical
| # | Finding | Where |
|---|---|---|
| C1 | `gameAction` has no timeout/AbortController — a hung edge call leaves `busy` flags stuck forever; button dead until full reload | `src/lib/gameApi.ts:5-22` |
| C2 | App cannot boot if `ensure-daily` fails: `loadAll` calls the edge fn first; error boot screen has **no retry button** — one edge outage bricks the client | `src/stores/playerStore.ts:100-121`, `src/App.tsx:74-97` |
| C3 | **Steel Will skill (200 Essence) is broken**: `ensureDailyState` preserves the streak after a shielded missed day, but `completeTraining` computes `newStreak = last_completed_date === yesterday ? n+1 : 1` — so the streak resets to 1 anyway | `supabase/functions/game/index.ts:694-706` vs `:999-1000` |

### High
| # | Finding | Where |
|---|---|---|
| H1 | Auth expiry mid-session: no 401 detection, no redirect to login; user sees cryptic "System link failed" | `src/App.tsx:124`, `playerStore.ts:289` |
| H2 | Player store never reset on SIGNED_OUT (only via MorePage) — stale cross-user data | `src/App.tsx:124`, `MorePage.tsx:24-28` |
| H3 | Data goes stale across midnight/foreground — `loadAll` runs once on mount; no re-fetch on visibility, no pull-to-refresh (and Training page *says* "Pull to refresh" while `overscroll-behavior-y:none` blocks it) | `src/main.tsx:22-24`, `globals.css:29`, `TrainingPage.tsx:52` |
| H4 | Offline = fully unusable despite PWA: runtime cache only covers `/rest/`, not the `game` function, and boot requires it | `vite.config.ts:40-46` |
| H5 | Unguarded state transitions server-side: `completeTraining`/`completeSideQuest`/`completeEvent`/`resolveEncounter` check status then update **without** `.eq('status','pending')` — concurrent/duplicate requests double-award XP, double-increment streak & totals | `game/index.ts:987-990, 1069-1072, 1789-1792, 518-527` |

### Medium
| # | Finding | Where |
|---|---|---|
| M1 | Client computes "today" from device TZ while server uses `profile.timezone` — boss cooldown / legacy-due / skill-cooldown displays wrong when they differ (`SystemAssessmentPanel` does it right; others don't) | `DungeonsPage.tsx:411-414,525-529`, `SkillsPage.tsx:20`, `LegacyPanel.tsx:45` |
| M2 | `readState` swallows all non-profile query errors → partial failures render as empty states ("No training quest found") | `playerStore.ts:289-334` |
| M3 | Mana/essence are read-modify-write in JS (not atomic RPC like `grant_essence`) — concurrent actions lose updates | `game/index.ts:1074, 2226-2227` etc. |
| M4 | Non-transactional multi-step mutations: quest marked completed → `awardXp` fails → XP lost forever (status already resolved) | `game/index.ts:987-1050` |
| M5 | Every mutation triggers a 26-query full `refresh()`; no request sequencing — older snapshot can clobber newer state | `playerStore.ts:174-287` |
| M6 | Evening reminder fires only on exact `hour === reminderHour` — one missed/late cron tick (pg_cron '7 * * * *') silently skips the day's reminder | `cron/index.ts:120-140` |
| M7 | Workout checklist state (gym set ticks, boss confirmations) lives in component state — lost on any refresh/navigation | `DungeonsPage.tsx:80,406,497` |
| M8 | Signup with email confirmation dead-ends silently (no session → bounced to /login, no message) | `LoginPage.tsx:33-38` |
| M9 | `autoUpdate` SW + hourly update checks can reload mid-form, discarding reflections/riddle answers | `vite.config.ts:21`, `main.tsx:18-26` |
| M10 | No global error boundary — render throw = white screen | `src/App.tsx` |
| M11 | Perf: routes not code-split; 18 always-animating blurred motes + pervasive `backdrop-filter` + infinite flicker loops (battery); `prefers-reduced-motion` doesn't stop Framer Motion | `App.tsx:15-22`, `AmbientMotes.tsx`, `globals.css`, `LevelUpSequence.tsx` |
| M12 | `award_xp` daily-cap SELECT-then-INSERT race can slightly exceed the 300 cap under concurrency | `migrations/0001_core.sql:195-203` |
| M13 | Pinch-zoom disabled (`user-scalable=no`) — WCAG 1.4.4 failure | `index.html:7` |

### Low (fix opportunistically)
- Title equip compares display name not key (`TitlesPanel.tsx:22`); gear timers don't tick (`InventoryPanel.tsx:9-15`); alert stack drops >4 stacked awards (`uiStore.ts:41`); `signOut` unguarded (`MorePage.tsx:24`); low-contrast 0.6rem text; PWA REST cache not auth-scoped; `ModuleOffline.tsx` is dead code; timezone is client-writable (self-cheat via TZ-hopping — acceptable for a solo app, note only); duplicate system_messages if two first-requests race `ensureDailyState`.

---

## ACTION PLAN (phased, each phase independently shippable)

### Phase A — Stop the bleeding (critical + high, ~1 PR)
1. **A1** `gameApi.ts`: add 15s AbortController timeout + typed error; detect 401 → force re-login.
2. **A2** Boot resilience: "RE-ESTABLISH LINK" retry button on error BootScreen; `loadAll` falls back to `readState` (table reads) if `ensure-daily` fails so the app still renders.
3. **A3** Fix Steel Will: in `completeTraining`, if `hasStreakShield(skillKeys)` and `last_completed_date === twoDaysAgo`, continue the streak (`current_streak + 1`). Add a Vitest case (new pure helper `nextStreak(lastCompleted, today, shielded)` in `_shared/game/progression.ts` so it's testable).
4. **A4** Guard server state transitions: add `.eq('status','pending')` (and check affected rows, 409 otherwise) to completeTraining / completeSideQuest / completeEvent / resolveEncounter / reviewQuestion.
5. **A5** Auth lifecycle: `onAuthStateChange` → on SIGNED_OUT reset player store + navigate /login.
6. **A6** Freshness: on `visibilitychange→visible`, if local date (in profile TZ) changed or >10 min since last load → `loadAll()`; add a manual refresh button in the top status bar; fix the misleading "Pull to refresh" copy.

### Phase B — Consistency & failure modes (~1 PR)
7. **B1** Use `profile.timezone` for all client "today" math (share one `todayInTz()` helper in `src/lib/units.ts` or new `src/lib/dates.ts`, mirroring `SystemAssessmentPanel.tsx:12-23`).
8. **B2** `readState`: collect per-slice errors; surface a "SYNC INCOMPLETE — retry" banner instead of fake empty states.
9. **B3** Atomic `spend_mana` / `spend_essence` SECURITY DEFINER RPCs (migration 0022, mirroring `grant_essence`); use in game fn. Take profile row lock before cap computation in `award_xp` to close M12.
10. **B4** Order-of-operations in completions: award XP *before* flipping status where possible, or tolerate re-completion when no ledger row exists for the quest.
11. **B5** Cron reminder window: `hour >= reminderHour && hour < reminderHour + 2` (notification_log already dedupes).
12. **B6** Error boundary around routes; email-confirmation message on signup; persist workout checklists to sessionStorage keyed by date; prompt-before-reload SW update when a form is dirty.

### Phase C — Performance & polish (~1 PR)
13. **C1** `React.lazy` route splitting.
14. **C2** Animation budget: pause motes/flicker when `document.hidden`; honor `useReducedMotion()` in Framer components; reduce mote count on low-end (navigator.hardwareConcurrency heuristic).
15. **C3** Drop blanket `refresh()` where the action response already carries the delta (training/side-quest/nutrition paths first); add monotonic token guard to `refresh()`.
16. **C4** Re-enable pinch zoom; contrast pass on 0.6rem text; live gear countdown; delete `ModuleOffline.tsx`.

### Phase D — The 5 new features (see below), each its own slice: migration → pure module in `_shared/game/` → game-fn action → panel. Follow the established Tier-B pattern (select-only to authenticated, service-role writes).

---

## 5 NEW FEATURES (anime → everyday life; none duplicate ROADMAP phases 11–15)

**F1 · Penalty Quest — "The System does not forgive. It tests."** *(anime: the Penalty Zone)*
Miss a day and the streak doesn't just die: next morning a one-shot **Penalty Quest** spawns (yesterday's targets +25%, no XP reward). Clear it before midnight → your streak is **restored** (not incremented). Fail → streak breaks as today. Turns the app's worst moment (broken streak = #1 churn trigger) into its most dramatic comeback beat.
Build: `penalty_quests` table; pure `_shared/game/penalty.ts` (spawn rule, restore rule — unit-tested); hook in `ensureDailyState` where the streak currently zeroes (`game/index.ts:699-706`); banner on TrainingPage; cron morning push "A Penalty Quest has been issued."

**F2 · Instant Dungeon (focus timer) — everyday life, not just gym.** *(anime: dungeon keys / instant dungeons)*
"Use a key" to enter a 25/50/90-min **Instant Dungeon** for deep work, study, chores, or practice. Pick 1–3 "mobs" (subtasks) on entry; a full-screen System timer runs; leaving the app mid-run = "the dungeon collapses" (attempt fails, key returns at midnight). Clear = mob-count-scaled XP + INT/WIS/DIS stat gains; daily key count scales with rank. This extends the loop to the other 15 hours of the day.
Build: `focus_runs` table; `_shared/game/focus.ts` (key allowance, XP table, collapse rules); `start-focus`/`complete-focus`/`abandon-focus` actions with server-side timestamps (no client-forged durations — completion validated against `started_at + duration`); new panel on Training page; Page Visibility API for collapse detection.

**F3 · Daily System Briefing — the morning hook.** *(anime: "The Daily Quest has arrived.")*
One unified takeover screen on first open of each local day (reusing `SystemTakeover.tsx`): today's quest variant + targets, active System Event, knowledge checks due, protein target, streak status, **and the day's single "next milestone"** — then one tap to begin. Companion evening state: after ~20:00 the Training tab shows a live **"GATE CLOSES IN 3:41:22"** countdown to local midnight when the quest is unresolved (loss-framed urgency, zero new backend).
Build: client-first — `getDailySnapshot` already returns nearly everything (`game/index.ts:894-920`); add `briefing_seen` date to a local store; countdown component; extend cron morning push to name the variant.

**F4 · Milestone Tracker — "Quest conditions: 87% met."** *(anime: quest-condition progress readouts)*
Surface the *nearest* upcoming unlock everywhere it's relevant: "2 days → Title: Iron Will", "240 XP → Rank D", "1 session → Boss appears", "3 reps of 'bench' PR". A pure `nextMilestones(state)` selector ranks all progress-teasing candidates (titles thresholds already exist in `progression.ts:132-167`; rank thresholds in `constants.ts`; boss readiness in `dungeons.ts`); Status page gets a "NEXT OBJECTIVES" card, briefing (F3) shows the top one. Anticipation is the cheapest retention lever this app is missing — all data already client-readable.
Build: pure module + client card; no schema change.

**F5 · Shield of Resolve — earnable streak insurance.** *(anime: consumable blessings/elixirs)*
A consumable item (max 1 held) that **auto-consumes** on a missed day to hold the streak. Earned, never bought: 7 consecutive Perfect Clears, or clearing a Penalty Quest (F1), or a rare encounter drop — earning protection is itself a quest. Distinct from Steel Will (late-game passive): this is the early-game safety net that makes a 15-day streak feel *insurable* instead of terrifying.
Build: extend `_shared/game/items.ts` catalog + drop tables; auto-consume check in `ensureDailyState` streak-break branch (same seam as A3/F1); inventory badge + "SHIELD CONSUMED — streak preserved" system message.

Suggested order: **F3 → F4** (client-only, immediate feel), then **F1 + F5** (same code seam), then **F2** (biggest new surface).

---

## QUALITY-OF-LIFE IMPROVEMENTS (rolled into phases above)
Manual refresh + foreground re-sync (A6) · boot retry (A2) · 401 → clean re-login (A1/A5) · real error states instead of fake empties (B2) · workout checklist survives navigation (B6) · signup confirmation message (B6) · no mid-form SW reloads (B6) · pinch zoom restored (C4) · live gear timers (C4) · reduced-motion + battery-friendly ambience (C2) · faster first paint via route splitting (C1) · readable micro-text (C4) · error boundary (B6).

---

## VERIFICATION
- `npm test` — new Vitest cases: streak-shield continuation (A3), penalty spawn/restore (F1), focus-run XP + collapse (F2), milestone selector (F4), shield auto-consume (F5), guarded-transition 409s (H5, via pure helpers where possible).
- `npm run build` — typecheck + PWA build must pass (CI runs this per `.github/workflows/ci.yml`).
- Manual: run `npm run dev`, drive Training/Dungeons/Library flows; simulate edge-fn failure (block the functions URL in devtools) → verify boot retry + stuck-button timeout; flip device clock past midnight → verify foreground re-sync; Lighthouse pass for perf/a11y deltas.
- Migrations numbered from `0022_*` in order; edge functions redeploy via existing `deploy.yml` on merge to main.

## Deliverables on this branch (recommended scope — full package)
1. `docs/AUDIT.md` — this audit (findings + action plan + feature specs) committed for reference.
2. Phase A: critical/high fixes (timeout, boot retry, Steel Will, guarded transitions, auth lifecycle, freshness).
3. Phase B: consistency & failure-mode fixes (timezone helper, error surfacing, atomic RPCs, cron window, error boundary, form/checklist persistence).
4. Phase C: performance & polish (route splitting, animation budget, targeted refresh, a11y).
5. Phase D: features in order F3+F4 (Daily Briefing + Milestone Tracker, client-first) → F1+F5 (Penalty Quest + Shield of Resolve, same streak seam) → F2 (Instant Dungeon focus timer).
Each phase is committed separately and pushed to `claude/site-audit-features-xryl49`; every server change keeps the Tier-B pattern (pure module + Vitest, service-role-only writes).
