-- CORRECTIF: Mise à jour des URLs pour pointer vers le projet Supabase réel
-- Remplace les anciennes versions qui pointaient peut-être vers localhost

-- 1. Mise à jour de la fonction du Trigger Welcome Email
create or replace function public.handle_new_profile_welcome_email()
returns trigger
language plpgsql
security definer
as $$
declare
  url text := 'https://iabxchanerdkczbxyjgg.supabase.co/functions/v1/send-welcome-email'; 
  service_role_key text;
begin
  declare
    internal_secret text;
  begin
    select decrypted_secret into internal_secret from vault.decrypted_secrets where name = 'INTERNAL_FUNCTION_SECRET' limit 1;
    
    perform
      net.http_post(
        url := url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Internal-Secret', coalesce(internal_secret, '')
        ),
        body := jsonb_build_object(
          'record', row_to_json(new),
          'type', 'INSERT',
          'table', 'profiles'
        )
      );
  exception when others then
    raise notice 'Erreur trigger welcome email: %', SQLERRM;
  end;

  return new;
end;
$$;


-- 2. Mise à jour du Cron Job Retention Emails
-- On désinscrit l'ancien (mauvaise URL) et on remet le nouveau
select cron.unschedule('trigger-retention-emails');

select cron.schedule(
  'trigger-retention-emails',
  '0 9 * * *',
  $$
  select
    net.http_post(
      url := 'https://iabxchanerdkczbxyjgg.supabase.co/functions/v1/trigger-retention-emails',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Internal-Secret', (select decrypted_secret from vault.decrypted_secrets where name='INTERNAL_FUNCTION_SECRET' limit 1)
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);

