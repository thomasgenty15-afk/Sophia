-- Template pour planifier les tâches Cron dans Supabase
-- Remplacer YOUR_PROJECT_REF et YOUR_INTERNAL_SECRET par vos vraies valeurs.

-- 1. La Ronde de Nuit (Analyse) - Tous les jours à 4h00 du matin
SELECT cron.schedule(
    'detect-future-events',
    '0 4 * * *',
    $$
    SELECT
        net.http_post(
            url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/detect-future-events',
            headers:='{"Content-Type": "application/json", "X-Internal-Secret": "YOUR_INTERNAL_SECRET"}'::jsonb,
            body:='{}'::jsonb
        ) as request_id;
    $$
);

-- 2. Le Réveil (Envoi) - Toutes les 15 minutes
SELECT cron.schedule(
    'process-scheduled-checkins',
    '*/15 * * * *',
    $$
    SELECT
        net.http_post(
            url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-checkins',
            headers:='{"Content-Type": "application/json", "X-Internal-Secret": "YOUR_INTERNAL_SECRET"}'::jsonb,
            body:='{}'::jsonb
        ) as request_id;
    $$
);

