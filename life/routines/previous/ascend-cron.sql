-- Rollback for migration 0038 (Ascend retired). Saved 2026-11-27 from the live
-- job: select schedule, command from cron.job where jobname = 'ascend-reminders';
-- (schedule '9 * * * *', hourly at :09).
--
-- The live command carried the cron secret as a literal. It is not stored in
-- git: replace <CRON_SECRET> with the value of the ascend-notify function's
-- CRON_SECRET (Supabase dashboard -> Edge Functions -> Secrets) before running.
select cron.schedule(
  'ascend-reminders',
  '9 * * * *',
  $cmd$
  select net.http_post(
    url     := 'https://npqpzzarohlvexqpqurg.supabase.co/functions/v1/ascend-notify',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
    body    := '{}'::jsonb
  );
  $cmd$
);
