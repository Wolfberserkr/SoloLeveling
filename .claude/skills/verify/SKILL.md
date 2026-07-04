---
name: verify
description: Build, launch, and drive this app in headless Chromium to verify UI changes end-to-end.
---

# Verifying UI changes in this repo

The app is a Vite + React PWA backed by Supabase (auth, PostgREST, edge
functions). There is no test backend, so drive the real UI with the Supabase
HTTP layer stubbed at the network boundary.

## Recipe that works

1. `npm run dev -- --port 5199 --strictPort` (no env needed — `src/lib/supabase.ts`
   has live-project defaults; requests get intercepted anyway).
2. Playwright (`playwright-core`, executablePath
   `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` or wherever
   `$PLAYWRIGHT_BROWSERS_PATH` points), context with `serviceWorkers: 'block'`.
3. Fake login: `addInitScript` that seeds
   `localStorage['sb-npqpzzarohlvexqpqurg-auth-token']` with a session object
   (`access_token` = any JWT-shaped string, future `expires_at`, `user.id`).
   `supabase.auth.getSession()` reads it without a network call.
4. `context.route('**://npqpzzarohlvexqpqurg.supabase.co/**', …)` and fulfill:
   - `/functions/v1/game` — parse `{action}` from the POST body; `ensure-daily`
     must return `{training, quests, dungeon, gym_done_today}`.
   - `/rest/v1/<table>` — return a fixture per table name (see
     `readState` in `src/stores/playerStore.ts` for the full list of ~25
     tables it reads). `.single()`/`.maybeSingle()` tables want a bare object
     (or `null`), the rest want arrays. Unknown tables → `[]`.
   - `/auth/v1/*` — echo the session JSON.
5. Viewport 390×844 (it's a mobile-first PWA). Screenshot after ~700 ms so the
   clip-wipe materialize animations settle.

## Gotchas

- `getByText` on short strings hits strict-mode violations — popup headers
  repeat words from event bodies; match full strings like
  `'[ SYSTEM ] · Emergency Quest'`.
- `GlitchText` scrambles titles for the first ~1 s; screenshots may catch
  mid-glitch garbage — that's the intended effect, not a bug.
- Push-related UI (`navigator.serviceWorker.ready`) never resolves with
  service workers blocked, so push toggles/hints stay hidden in this harness.
- A working driver script template lives in the session that added
  `SystemPopup` (fixtures for profile/training/system_events + route handler);
  rebuilding it from the notes above takes ~50 lines.

## Flows worth driving

- Status screen: `/` after seeding session (default route).
- System Event popup (`SystemPopup`): fixture `system_events` row with
  `status: 'active'`, `local_date` = today (browser-local `en-CA` date).
  Ack persistence keys: `system-popup-acked-event` / `system-popup-acked-reminder`.
- Reminder popup: `training_quests` row `status: 'pending'` + profile
  `reminder_hour` ≤ current hour, and no active event (events win).
- Training page event panel: navigate to `/training` with the event fixture.
