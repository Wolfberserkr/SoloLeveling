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

## Setup (one time)

1. **Database** — open the Supabase SQL editor for project
   `npqpzzarohlvexqpqurg` and run the files in `supabase/migrations/` in order.
2. **Edge functions** — auto-deployed by GitHub Actions
   (`.github/workflows/deploy-functions.yml`) on every push that touches
   `supabase/functions/**`, and on demand via Actions → **Deploy Edge
   Functions** → Run workflow. This needs a one-time repository secret
   **`SUPABASE_ACCESS_TOKEN`** (GitHub → Settings → Secrets and variables →
   Actions; value from Supabase dashboard → Account → Access Tokens).
   To deploy by hand instead:
   ```sh
   npx supabase login          # needs an access token
   npx supabase functions deploy game --project-ref npqpzzarohlvexqpqurg
   npx supabase functions deploy cron --project-ref npqpzzarohlvexqpqurg --no-verify-jwt
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
