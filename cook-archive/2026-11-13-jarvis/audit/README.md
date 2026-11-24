# Dashboard function audit

A Playwright harness that taps every control on the Jarvis dashboard against a mock connector
and checks what each one actually does (which SQL it sends, what the page shows, where focus goes).

- `mock_hr.js` holds the example data (no real data).
- `mkmock.js` builds `audit_page.html` from `jarvis-dashboard.html`, with a connector stub that records every query and can be told to fail or to return no rows.
- `audit.js` runs the checks. `audit_v16.txt` is the run for dashboard version 16: 116 of 116 pass.

Run it from a folder that holds the dashboard source as `jarvis-dashboard.html`:

    node mkmock.js && node audit.js

The six write statements were also planned (EXPLAIN only, nothing executed) against the live
database on 2026-11-14 and all six are valid for the current schema.

## What the first run found (fixed in version 16)

| Area | Found | Fix |
|---|---|---|
| Tasks | A failed save left the box ticked, so the page said done when it was not | The box unticks and re-enables on failure |
| All writes | A write that matched no rows still said "Done" | "Nothing changed. It was already handled." and a reload |
| Sheets | Focus was dropped on close; the page scrolled behind an open sheet; Tab could leave the sheet | Focus returns to the control that opened it; scroll lock; focus trap |
| Sheets | The grab handle was decoration | Drag down to dismiss, quick flick counts, springs back otherwise |
| Tab bar | Arrow keys did nothing in a `tablist` | Arrow, Home and End keys move between tabs |
| Ask | The answer only appeared if it streamed | The final text is shown either way |
| Agenda | Tapping a day scrolled but the selected chip stayed on Today | The tapped day becomes the selected chip |
| Toast | Sat on top of the tab bar and wrapped at half width | Sits above the bar, one line |
