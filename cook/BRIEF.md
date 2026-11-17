# Brief: Jarvis dashboard redesign

Target: redesign the Jarvis dashboard (single-file claude.ai artifact, same URL) into a practical, premium, easy-to-navigate app, keeping every feature. Stack: one HTML file, vanilla JS, inline SVG, Google Fonts.
References: none (image hosts are blocked from this container). Same quality as top health and finance apps (Oura, Whoop, Apple Health class), own style. First approved stills become the reference.
Bar (UI mapping): layout and spacing 9/10, light and depth 9/10, color 9/10, typography and components 9/10, information density and clarity 9/10, motion and interaction 9/10. Phone first (390x844), desktop must hold up.
Calibration offset: none yet.
Rules: no external assets except Google Fonts and inline SVG. All motion respects prefers-reduced-motion. Slop ban list applies, with one exception the user chose: the Jarvis core stays as the single signature element. Particles, radar pulses, scan sweeps, data streams, eyebrow labels, monospace uppercase text and em dashes go.
Must keep: every feature (Home, Health, Money, Agenda, More, detail sheets, live Supabase and Garmin data, alerts, tasks, inbox decisions, voice and read-aloud, Ask Jarvis, boot), the bottom tab bar, dark as the main theme with light working.
Time: hard cap 4h. Started: 2026-11-13 16:06 UTC.
Usage: 5h window, about 20% per hour, never 100%.
Hardware: headless Chromium in the container for stills.
Deliverable: phone and desktop stills per round; republish the existing artifact only after the user approves the stills. The live dashboard stays untouched until then.
Permissions: download public reference images yes (blocked in practice), commit cook/ notes to the branch yes, republish the artifact only after approval.
User's words: "redo this artifact using this skill" · "Go for it" (accepted defaults: restrained HUD identity, 9/10 bar, 4h cap)
