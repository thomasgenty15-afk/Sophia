-- Template: schedule the LLM retry worker to run every minute.
-- Replace YOUR_PROJECT_REF and YOUR_INTERNAL_SECRET.
--
-- Purpose:
-- When the realtime request cannot obtain an IA response after trying all Gemini models,
-- we return a template to the user and enqueue a retry job in public.llm_retry_jobs.
-- This cron then processes pending jobs and posts the assistant reply when possible.

SELECT cron.schedule(
  'process-llm-retry-jobs',
  '* * * * *',
  $$
  SELECT
      net.http_post(
          url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-llm-retry-jobs',
          headers:='{"Content-Type": "application/json", "X-Internal-Secret": "YOUR_INTERNAL_SECRET"}'::jsonb,
          body:='{"limit": 20}'::jsonb
      ) as request_id;
  $$
);




