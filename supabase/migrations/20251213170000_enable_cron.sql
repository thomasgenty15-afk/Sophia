-- Enable pg_cron and pg_net extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Note: Scheduling the job requires knowing the Edge Function URL and Service Key.
-- This is usually done via the Supabase Dashboard or a post-deployment script.
-- Example:
-- SELECT cron.schedule(
--   'morning-checkup',
--   '0 9 * * *',
--   $$
--   select
--       net.http_post(
--           url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/trigger-checkup',
--           headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_KEY"}'::jsonb,
--           body:='{}'::jsonb
--       ) as request_id;
--   $$
-- );

