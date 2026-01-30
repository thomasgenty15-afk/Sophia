-- Template: schedule the WhatsApp outbound retry worker to run every minute.
-- Replace YOUR_PROJECT_REF and YOUR_INTERNAL_SECRET.
--
-- Purpose:
-- When an outbound WhatsApp message is explicitly marked failed (via Graph response or status webhook),
-- we set whatsapp_outbound_messages.next_retry_at with backoff. This cron processes due retries safely.

SELECT cron.schedule(
  'process-whatsapp-outbound-retries',
  '* * * * *',
  $$
  SELECT
      net.http_post(
          url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-whatsapp-outbound-retries',
          headers:='{"Content-Type": "application/json", "X-Internal-Secret": "YOUR_INTERNAL_SECRET"}'::jsonb,
          body:='{"limit": 20}'::jsonb
      ) as request_id;
  $$
);



