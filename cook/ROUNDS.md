# Cook ledger: Jarvis dashboard redesign

Copy this to `cook/ROUNDS.md` at the start of a run. Keep the header current. Add one round entry per round, newest at the bottom. Label every number as measured or eyeballed.

Started: 2026-11-13 16:06 UTC
Time: floor none | cap 4h (ends 20:06 UTC)
Bar: layout 9 | light/depth 9 | color 9 | type/components 9 | density/clarity 9 | motion 9 (out of 10)
Calibration offset: [none yet] (from [user estimate, date])
Usage: 5h window, about 20% per hour, never 100%
Gate: stills approved no | republish not started
Best so far: r00 baseline (current live design)

## Decisions

Made without asking, one line each.
- 16:08 No outside references: image hosts are blocked by the egress proxy; the bar rests on the rubric and fresh critics, approved stills become the reference.
- 16:08 Shots are 8 fixed UI states rendered from the mock-data harness, so every round is comparable.
- 16:08 Critics see before (r00) on the left and the new round on the right, plus the rubric.

## User feedback inbox

Exact words. Close an item only when a still or clip proves it.
- 16:06 "redo this artifact using this skill" | open

---

## Round 01

Time: 16:06 to 16:40 | total elapsed 0.6h
Usage: not readable
Focus: whole system (the user's request), because r00 carried the HUD noise the brief bans

Changes:
- New tokens (calm navy, Inter, 16px radius), compact sticky top bar, view titles, sentence-case section titles
- Removed particles, radar sweep, pulses, data streams, scan shimmer, number flicker, ring orbit/glint, tile waves, bracket corners, em dashes
- Health rings in one swipe row, streaks card, attention as a left accent bar

Stills: `cook/stills/r01/` | Side by side: `cook/compare/r01/` (r00 left, r01 right)

Scores, eyeballed: critic median (2 critics: same model + Sonnet), no calibration yet

| Shot | Layout | Depth | Color | Type | Clarity |
|---|---|---|---|---|---|
| S01 Home | 6.5 | 6 | 6 | 6 | 5.5 |
| S02 Health | 6 | 6 | 7 | 6.5 | 6 |
| S03 Agenda | 7 | 6 | 6 | 6.5 | 6.5 |
| S04 Money | 7 | 6 | 6 | 6.5 | 6.5 |
| S05 Sleep sheet | 7 | 7 | 5.5 | 7 | 7 |
| S06 Desktop | 5.5 | 6 | 5.5 | 6.5 | 6 |
| S07 Light | 6.5 | 4.5 | 5.5 | 6 | 5.5 |
| S08 More | 7 | 6 | 6.5 | 6.5 | 7 |

Own score (logged, never decides): about 7.5

Measured: shot harness, 0 page errors (playwright pageerror). Color per region not measured (no reference images).

Top gaps from critics:
1. Every card gets its own colored border or stripe; nothing stands out, the UI reads as permanently alarmed. Neutral chrome, one accent, semantic color only on small marks.
2. No hero metric: Home leads with a paragraph, Money with no big number.
3. Emoji as icons; light mode flat (no elevation, weak secondary text); desktop grid has dead areas and a centered rail.

Progress note sent: 16:45
Stop check: bar no | cap not reached | stills approved no -> next round
Next focus: neutral chrome + attention dots, Home hero, one icon set, Money hero, light-mode depth, desktop grid
