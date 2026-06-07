# THE SYSTEM — Solo Leveling Hunter Training Protocol

> *"You have acquired the qualifications to become a Player."*

A multi-user training tracker styled after the **Solo Leveling** anime's System
interface. The app turns a real, evidence-based 4-day Upper/Lower strength
program into a Hunter progression game: complete the iconic four-task **Daily
Quest**, clear gym **Dungeons**, earn **XP / stat points / ranks**, collect
**Achievements**, and bank **Power-ups** like Essence Stones, Runes of Focus, and
Shadow Extractions.

This is an unofficial fan project. Not affiliated with the *Solo Leveling*
franchise or its rights-holders.

---

## Features

### The Daily Quest (the iconic four)
Generated fresh every day:

- **PUSH-UPS** — 100 reps (scales with level)
- **SIT-UPS** — 100 reps
- **SQUATS** — 100 reps
- **RUN** — 10 km

Complete all four → XP burst + streak bonus + **Essence Stone** drop.
**Fail the day** → penalty: STR -1, VIT -1, mana drain, streak reset.

### Dungeons (the actual training)
A beginner-friendly 4-day Upper/Lower split:

| Day | Gate           | Focus                          |
|-----|----------------|--------------------------------|
| Mon | **Upper A**    | Bench press + bent-over row    |
| Tue | **Lower A**    | Back squat + RDL               |
| Thu | **Upper B**    | Overhead press + pull-ups      |
| Fri | **Lower B**    | Deadlift + front squat         |

- Each session: warmup → main block → cooldown (45–60 min total)
- Per-exercise demo links (YouTube search), per-set weight × reps logging
- Per-exercise rest timer
- Linear progression on main lifts (+2.5 kg / 5 lb when all sets cleared)
- **Deload every 5 weeks** — auto-detected, drops load to ~60%, grants a
  Shadow Extraction on completion.

### Leveling & Ranks
- Earn XP from quests and dungeon runs
- Level up grants 5 free **stat points** to allocate to STR / AGI / VIT / INT / PER
- Ranks unlock at levels 10 / 25 / 45 / 70 / 100 / 150 → **E → D → C → B → A → S → National**

### Achievements
20+ unlockable feats across common / rare / epic / legendary rarities, e.g.
*The Awakening*, *Bench Breaker*, *Iron Will (30-day streak)*, *Arise (first
Shadow Extraction)*.

### Power-ups (anime-flavoured consumables)
- **◆ Essence Stone** — spend 3 for an extra stat point
- **⚗ Elixir of Life** — full mana refill
- **✺ Rune of Focus** — +50% XP for the next 2 hours
- **☽ Shadow Extraction** — +2 to a chosen stat (earned from deload weeks)

### Progress Charts
Top-set-weight line charts per main lift, total volume, session counts.

---

## Tech stack

- **Next.js 14** App Router (server components + route handlers)
- **better-sqlite3** for the backend store (single-file DB at `data/sololeveling.db`)
- **bcryptjs** + signed cookie sessions for multi-user auth
- **Tailwind CSS** for the dark Solo-Leveling System aesthetic
- **Recharts** for progress charts

The aesthetic mimics the anime's UI windows: cyan/purple glowing borders with
corner brackets, monospace `[ SYSTEM ]` headers, scanline overlays, XP bar, rank
badges, and pop-in **`[ LEVEL UP ]`** / **`[ ACHIEVEMENT UNLOCKED ]`** notices.

---

## Run locally

```bash
cp .env.example .env
# edit SESSION_SECRET
npm install
npm run dev
# → http://localhost:3000
```

The SQLite DB is auto-created on first request at `data/sololeveling.db`.

## Project layout

```
src/
├── app/
│   ├── api/                     # Route handlers (quests, workouts, stats, inventory, auth)
│   ├── dashboard/               # Status Window
│   ├── quests/                  # Daily Quest screen
│   ├── workout/                 # Dungeon list + per-session runner
│   ├── progress/                # Charts
│   ├── achievements/            # Trophy hall
│   ├── inventory/               # Power-ups
│   ├── login/ signup/           # Auth
│   └── page.tsx                 # Landing
├── components/
│   ├── SystemWindow.tsx         # Corner-bracket panel
│   ├── StatusPanel.tsx          # Hunter stat sheet
│   ├── NavBar.tsx
│   ├── Notice.tsx               # Level-up / achievement popups
│   └── AppShell.tsx
└── lib/
    ├── db.ts                    # SQLite schema + connection
    ├── auth.ts                  # Sessions, hashing
    ├── leveling.ts              # XP curve, ranks, stat allocation
    ├── quests.ts                # Daily quest generation + scoring
    ├── achievements.ts          # 20+ achievement defs + auto-unlock
    ├── powerups.ts              # Item effects
    └── program.ts               # The training program (sessions, exercises)
```
