# THE SYSTEM — Solo Leveling: Real-Life Progression

A 1–2 year real-life transformation RPG. Not entertainment — structured
transformation under game-like feedback loops. Daily training quests, gym
dungeons, a book-powered intellect engine, random system events, and a
90-day Legacy Boss: your past self.

Built as an installable PWA: **Vite + React + TypeScript + Tailwind +
Framer Motion**, backed by **Supabase** (Postgres + Auth + Edge Functions).
All XP, mana, and currency mutations run server-side in edge functions —
the client cannot forge progress (RLS enforces it).

## Status — complete (8 of 8)

| Phase | System | Status |
|---|---|---|
| 1 | Core: Status window · Daily Training Quest · XP/levels | ✅ |
| 2 | Mana economy · daily quest loop · streaks · Perfect Clear | ✅ |
| 3 | Gym Dungeons (training phases) · Boss Fights · body metrics | ✅ |
| 4 | Library: Read → Reflect → Apply → Retain · knowledge checks | ✅ |
| 5 | Cron · push notifications · random System Events | ✅ |
| 6 | AI (Gemini) question banks & riddles | ✅ |
| 7 | Ranks · living Stats · Titles · Classes · Skills | ✅ |
| 8 | Legacy Boss (past self) · polish · PWA hardening | ✅ |

**Phase 7** brings the dormant identity fields to life: `rank` promotes by
level (E→Monarch), the nine attributes grow from what you actually do, Titles
are earned and equipped, a Class is chosen at C-Rank from your strongest stat
group, and Essence Stones buy passive + active Skills.

**Phase 8** closes the loop: every 90 days the System snapshots your measurable
self; when it comes due, that past self rises as a **Legacy Boss** you must
surpass on every core measure. Plus a split vendor bundle, an offline banner,
and an install prompt. All mechanics live in `_shared/game/{progression,legacy}.ts`
(pure, unit-tested) and are enforced server-side.

## Post-launch — in progress

The core 8-phase loop is complete; the [post-launch roadmap](docs/ROADMAP.md)
extends it. Shipped so far:

| Phase | System | Status |
|---|---|---|
| 9 | Shadow Army: conquests Arise as deployable allies (passive buffs) | ✅ |
| 10 | AI System Coach: weekly assessment (read-only) | 🔄 |
| 11 | Fuel Protocol: daily protein target + supplement stack → XP | ✅ |

**Phase 9** turns every boss, gate, finished tome, cleared Legacy, and encounter
into an extractable **shadow** (`_shared/game/shadows.ts`); arisen shadows deploy
up to a rank-scaled army capacity and fold passive XP/stat/mana buffs into the
same gates as skills.

**Phase 10** adds the **AI System Coach**: each completed week is aggregated by
pure math (`_shared/game/review.ts`) and narrated by Gemini in the System's voice
(`_shared/ai.ts`), stored one-per-week in `weekly_reviews`. The cron heartbeat
auto-generates the assessment each Monday; players can also request it on demand
from their Status. The same review tunes **adaptive targets** — a bounded
plateau/deload detector nudges a persistent `training_load` that the Daily
Training Quest scales by, so a strong, recovered week earns progressive overload
and a rough one earns a deload.

**Phase 11** adds the **Fuel Protocol** (`_shared/game/nutrition.ts`): a daily
nutrition quest on the Training page. Protein accumulates through the day
toward a personal target (`profiles.protein_target_g`, player-editable);
meeting it pays XP once per day, and checking off the supplement stack
(creatine + micros) pays a small bonus — both server-gated by once-per-day
flags in `nutrition_logs`. Calories track alongside as an informational
ceiling (no XP — eating less is not gamified), and the weekly System Coach
now sees fueled days in its assessment. The 6-month personalized training campaign built on
top of all this lives in [docs/SPARTAN_PROTOCOL.md](docs/SPARTAN_PROTOCOL.md).

## Architecture

```
src/                          React SPA (PWA)
supabase/migrations/          schema + RLS (anti-cheat boundary)
supabase/functions/game/      trusted player actions (XP, quests)
supabase/functions/_shared/game/   PURE game math, shared client+server,
                                   unit-tested (alias @game in Vite)
```

XP curve: `totalXp(L) = round(425·(L^1.55 − 1))`, repeatables capped at
300 XP/day → Level 10 ≈ 2 months, Level 50 ≈ 24 months. Verified in
`tests/xpCurve.test.ts`.

### UI gotcha — calendar grid (don't reintroduce the row gap)

The month calendar (`src/features/reset/ProgressView.tsx` → `Calendar`) uses a
7-column CSS grid of square (`aspect-ratio: 1`) cells. **Never render empty
placeholder `<div>`s to pad the days before the 1st.** A placeholder element
still participates in row sizing, and an `aspect-ratio` cell whose width
resolves against a stale container width (the portal lives in a
`position: fixed; overflow-y: auto` scroller) can inflate the row it sits in —
which showed up as a phantom vertical gap between the first and second week.

Offset the first day with `gridColumnStart: startDow + 1` instead, so **every**
grid item is a real, identically-sized day cell and no leading placeholder can
ever make one row taller than the rest. Same rule applies to any future
calendar/grid: position the first item, don't pad with empty cells.

## Setup (one time)

1. **Database** — open the Supabase SQL editor for project
   `npqpzzarohlvexqpqurg` and run the files in `supabase/migrations/` in order.
2. **Edge function** — with the Supabase CLI:
   ```sh
   npx supabase login          # needs an access token
   npx supabase functions deploy game --project-ref npqpzzarohlvexqpqurg
   ```
3. **Frontend env** — copy `.env.example` to `.env` and paste the project
   anon key (Supabase dashboard → Settings → API).
4. ```sh
   npm install
   npm run dev        # or: npm run build → deploy dist/ (Vercel config included)
   ```

## Commands

```sh
npm run dev        # dev server
npm test           # game-math test suite (XP pacing, training scaling)
npm run build      # typecheck + production build (PWA)
```

## Deploy

The backend deploys automatically. Pushing to `main` runs
`.github/workflows/deploy.yml`, which applies any new database migrations and
redeploys the `game` + `cron` edge functions. Each step is gated on its secret,
so add these under **Settings → Secrets and variables → Actions**:

| Secret | Enables | Where to get it |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | edge-function deploys | supabase.com/dashboard/account/tokens |
| `SUPABASE_DB_PASSWORD` | `supabase db push` migrations | project DB password (Settings → Database) |

Migration history was baselined (`0001`–`0019` marked applied), so `db push`
only applies files added afterward — keep new migrations numbered in order
(`0020_*.sql`, …) or use `supabase migration new`. Function secrets the runtime
needs (`GEMINI_API_KEY`, `VAPID_*`, `CRON_SECRET`) are set once with
`npx supabase secrets set …`, not in CI.

To deploy by hand instead:

```sh
npx supabase functions deploy game --project-ref npqpzzarohlvexqpqurg
npx supabase functions deploy cron --project-ref npqpzzarohlvexqpqurg
```
