-- Ajouter la planification de l'Archiviste (Memory Echo)
-- Fréquence : Tous les jours à 10h00, mais la logique interne bloque si < 10 jours depuis le dernier.
-- Cela permet le glissement "tous les 10 jours" naturellement (dès que le cooldown expire, le cron du lendemain le chope).

SELECT cron.schedule(
    'trigger-memory-echo',
    '0 10 * * *', -- Tous les jours à 10h00
    $$
    SELECT
        net.http_post(
            url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/trigger-memory-echo',
            headers:='{"Content-Type": "application/json", "X-Internal-Secret": "YOUR_INTERNAL_SECRET"}'::jsonb,
            body:='{}'::jsonb
        ) as request_id;
    $$
);

