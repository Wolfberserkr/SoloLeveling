# THE SYSTEM — Solo Leveling Hunter Training Protocol

> *"You have acquired the qualifications to become a Player."*

A multi-user training tracker styled after the **Solo Leveling** anime's System
interface. The app turns a real, evidence-based 4-day Upper/Lower strength
program into a Hunter progression game: complete the iconic four-task **Daily
Quest**, clear gym **Dungeons**, earn **XP / stat points / ranks**, collect
**Achievements**, and bank **Power-ups** like Essence Stones, Runes of Focus, and
Shadow Extractions.

Unofficial fan project. Not affiliated with the *Solo Leveling* franchise.

---

## Setup

### 1. Create the Supabase project schema

In the Supabase dashboard → **SQL Editor** → **New query**, paste the contents of
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) and run
it. That creates all tables, the auto-profile trigger for new signups, and the
RLS policies.

### 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...    # Project Settings → API → anon key
SUPABASE_SERVICE_ROLE_KEY=eyJ...        # Project Settings → API → service_role (server-only!)
```

> ⚠️  Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser. It's only read
> from server components, route handlers, and server actions.

### 3. (Optional) Disable email confirmation for faster testing

Supabase requires email confirmation by default. For a smoother demo, go to
**Authentication → Sign In / Up → Email** and turn off "Confirm email." (Turn it
back on for production.)

### 4. Run

```bash
npm install
npm run dev
# → http://localhost:3000
```

---

## Features

### The Daily Quest (the iconic four)
- **PUSH-UPS** 100 · **SIT-UPS** 100 · **SQUATS** 100 · **RUN** 10 km
- Scales with Hunter level
- Streak bonus on clear · Essence Stone drop
- Penalty on fail: STR -1, VIT -1, mana drain, streak reset

### Dungeons (the actual training)
Beginner 4-day Upper/Lower split (Mon/Tue/Thu/Fri):
- Bench Press · Bent Row · Back Squat · RDL · OHP · Pull-ups · Deadlift · Front Squat
- Warmup → main block → cooldown (45–60 min)
- Per-exercise demo links + rest timers
- Linear progression on main lifts
- Auto deload week every 5 weeks → Shadow Extraction reward

### Leveling & Ranks
- XP from quests + dungeon runs
- 5 stat points per level → STR/AGI/VIT/INT/PER
- Ranks unlock E → D → C → B → A → S → National at levels 10/25/45/70/100/150

### Achievements
20+ unlockable feats with common/rare/epic/legendary rarities.

### Power-ups
- **◆ Essence Stone** — spend 3 for an extra stat point
- **⚗ Elixir of Life** — full mana refill
- **✺ Rune of Focus** — +50% XP for 2 hours
- **☽ Shadow Extraction** — +2 to a chosen stat (deload reward)

### Progress
Top-set line charts per main lift · total volume · session count.

---

## Tech stack

- **Next.js 14** (App Router, server components, server actions)
- **Supabase** — Postgres + Auth (`@supabase/ssr` + `@supabase/supabase-js`)
- **Tailwind CSS** — dark Solo-Leveling System aesthetic
- **Recharts** — progress charts

Auth uses Supabase email/password. The DB trigger in the migration auto-creates a
`profiles` row, a fresh `hunter_stats` row, and the *Awakening* achievement
whenever a new user signs up. Server code uses the service-role client for game
logic; Row Level Security policies are in place as defense-in-depth on the
public anon key.

## Deployment

Works on any host that runs Next.js (Vercel, Netlify, Railway, Fly.io, your own
VPS). Just set the three environment variables in the host's dashboard. No
filesystem or sticky-storage required since the database lives in Supabase.

## Project layout

```
supabase/
└── migrations/0001_init.sql   # Schema, trigger, RLS — paste into SQL Editor
middleware.ts                  # Refreshes Supabase auth cookies per request
src/
├── app/                       # Pages + route handlers (all server-async)
├── components/                # System Window, Status Panel, Nav, Notices
└── lib/
    ├── supabase/
    │   ├── server.ts          # User-scoped server client (RLS-respecting)
    │   ├── admin.ts           # Service-role client (bypasses RLS)
    │   └── middleware.ts      # Session refresher
    ├── auth.ts                # signUp / signIn / signOut / getCurrentHunter
    ├── leveling.ts            # XP curve, ranks, stat allocation
    ├── quests.ts              # Daily quest generation + scoring
    ├── achievements.ts        # 20+ defs + auto-unlock checks
    ├── powerups.ts            # Item effects
    └── program.ts             # The training program
```
