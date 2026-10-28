-- ═══════════════════════════════════════════════════════════════════════════
-- 0029_viking_bike.sql — the bike plan on Project Viking.
--
-- Additive only: two new document collections in viking_docs. Nothing is
-- moved or rewritten; existing rows keep their shape.
--
--   coll        doc_id                      data
--   cycle       YYYY-MM-DD_<id>             { date, day (1–8), status, savedAt }
--   benchmarks  <bench>_YYYY-MM-DD_<id>     { date, bench, sec | rpm, hr, source, savedAt }
--
-- Rides stay in `rides`; bike-plan rides add optional fields to the same
-- document (code, km, maxHr, cadence, z2, notes, strava). RLS is unchanged:
-- the owner-only policies from 0028 already cover every collection.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.viking_docs drop constraint if exists viking_docs_coll_check;
alter table public.viking_docs add constraint viking_docs_coll_check check (coll in
  ('settings','weights','waist','nutrition','recovery','workouts','rides','cycle','benchmarks'));
