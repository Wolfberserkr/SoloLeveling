-- ═══════════════════════════════════════════════════════════════════════════
-- 03_life_cron.sql — run ONCE in the Supabase SQL editor after deploying
-- life-bot. Schedules the Life Assistant's minute tick.
--
-- Replace <CRON_SECRET> with the same value you set as the function secret
-- (`npx supabase secrets set CRON_SECRET=…`). It is stored in Vault, not in
-- the cron job text.
-- ═══════════════════════════════════════════════════════════════════════════
create extension if not exists pg_net;
create extension if not exists pg_cron;

select vault.create_secret('<CRON_SECRET>', 'life_cron_secret')
where not exists (select 1 from vault.secrets where name = 'life_cron_secret');

select cron.unschedule(jobid) from cron.job where jobname = 'life-tick';
select cron.schedule('life-tick', '* * * * *', $job$
  select net.http_post(
    url     := 'https://npqpzzarohlvexqpqurg.supabase.co/functions/v1/life-bot',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'life_cron_secret')),
    body    := '{"action":"tick"}'::jsonb,
    timeout_milliseconds := 55000);
$job$);

-- Housekeeping: keep the webhook dedupe table and chat transcript small.
select cron.unschedule(jobid) from cron.job where jobname = 'life-cleanup';
select cron.schedule('life-cleanup', '17 3 * * *', $job$
  delete from public.life_updates_seen where seen_at < now() - interval '3 days';
  delete from public.life_messages where created_at < now() - interval '60 days';
  delete from public.life_nudge_log where sent_at < now() - interval '120 days';
$job$);
