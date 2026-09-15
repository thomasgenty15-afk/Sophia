-- Schedule retention emails job (J-1, J+1, etc.)
-- Running daily at 09:00 AM

create extension if not exists "pg_cron" with schema "extensions";
create extension if not exists "pg_net" with schema "extensions";

do $$
declare
  existing_jobid int;
begin
  select jobid into existing_jobid from cron.job where jobname = 'trigger-retention-emails' limit 1;
  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

-- En local (et via migration, à adapter pour la prod si l'URL change)
-- Note: Pour la prod, il est souvent mieux de gérer les crons via le Dashboard Supabase
-- ou d'utiliser une URL dynamique si possible, mais pg_net demande une string.
-- Ici on met l'URL locale par défaut pour le développement.

select cron.schedule(
  'trigger-retention-emails',
  '0 9 * * *', -- Tous les jours à 09:00
  $$
  select
    net.http_post(
      -- URL du projet (Staging/Prod)
      url := 'https://iabxchanerdkczbxyjgg.supabase.co/functions/v1/trigger-retention-emails',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Internal-Secret', (select decrypted_secret from vault.decrypted_secrets where name='INTERNAL_FUNCTION_SECRET' limit 1)
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);

