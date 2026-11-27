-- Ascend is retired (PR 2 of the Garmin-first work): stop its hourly
-- `ascend-reminders` pg_cron job so it no longer sends pushes. Ascend's code
-- and tables stay in place. To bring it back, run
-- life/routines/previous/ascend-cron.sql.
do $$
begin
  -- Nested + dynamic so the migration still runs where pg_cron isn't installed.
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'cron' and c.relname = 'job') then
      execute $q$select cron.unschedule(jobid) from cron.job where jobname = 'ascend-reminders'$q$;
    end if;
  end if;
end $$;
