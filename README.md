# THE SYSTEM — Solo Leveling: Real-Life Progression

A 1–2 year real-life transformation RPG. Not entertainment — structured
transformation under game-like feedback loops. Daily training quests, gym
dungeons, a book-powered intellect engine, random system events, and a
90-day Legacy Boss: your past self.

Built as an installable PWA: **Vite + React + TypeScript + Tailwind +
Framer Motion**, backed by **Supabase** (Postgres + Auth + Edge Functions).
All XP, mana, and currency mutations run server-side in edge functions —
the client cannot forge progress (RLS enforces it).

## Status — Phase 1 of 8

| Phase | System | Status |
|---|---|---|
| 1 | Core: Status window · Daily Training Quest · XP/levels | ✅ |
| 2 | Mana economy · daily quest loop · streaks · Perfect Clear | — |
| 3 | Gym Dungeons (training phases) · Boss Fights · body metrics | — |
| 4 | Library: Read → Reflect → Apply → Retain · knowledge checks | — |
| 5 | Cron · push notifications · random System Events | — |
| 6 | AI (Claude) question banks & riddles | — |
| 7 | Skills · Classes · Ranks · Titles | — |
| 8 | Legacy Boss (past self) · polish · PWA hardening | — |

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
   `npqpzzarohlvexqpqurg` and run `supabase/migrations/0001_core.sql`.
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
