-- Trigger pour envoyer l'email de bienvenue à la création du profil

create or replace function public.handle_new_profile_welcome_email()
returns trigger
language plpgsql
security definer
as $$
declare
  -- URL interne Docker/Local ou URL Prod (sera géré par le env var PROJECT_REF en prod via substitution ou config)
  -- En local c'est souvent http://host.docker.internal:54321/functions/v1/...
  -- En prod c'est https://<ref>.supabase.co/functions/v1/...
  -- Ici on met une URL relative si possible ou on construit dynamiquement, 
  -- mais pg_net a besoin d'une URL absolue.
  -- Pour simplifier, on assume que la config de l'URL de base est gérée ou on utilise le hack standard.
  
  -- NOTE: Pour la production, assure-toi que l'URL pointe bien vers ton Edge Function.
  -- Souvent on stocke l'URL de base dans une table de config ou vault, mais ici on va hardcoder le chemin
  -- et laisser le déploiement gérer l'URL via secrets si besoin, ou juste utiliser l'URL du projet.
  
  -- URL du projet (Staging/Prod)
  url text := 'https://iabxchanerdkczbxyjgg.supabase.co/functions/v1/send-welcome-email';  
  -- EN PROD: Il faudra changer ça ou utiliser une variable. 
  -- Supabase recommande les Webhooks via Dashboard pour éviter de hardcoder l'URL en SQL,
  -- mais pour le code, voici la version SQL "pg_net".
  
  service_role_key text;
begin
  -- On récupère la clé service_role (nécessaire pour appeler la fonction si elle vérifie l'auth, 
  -- ou juste pour sécuriser l'appel). Ici on envoie le record.
  
  -- Note: Dans ton projet, tu utilises 'INTERNAL_FUNCTION_SECRET' pour les appels internes.
  -- On va garder cette convention.
  
  declare
    internal_secret text;
  begin
    select decrypted_secret into internal_secret from vault.decrypted_secrets where name = 'INTERNAL_FUNCTION_SECRET' limit 1;
    
    -- Appel asynchrone via pg_net
    perform
      net.http_post(
        url := url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Internal-Secret', coalesce(internal_secret, '') -- Au cas où
        ),
        body := jsonb_build_object(
          'record', row_to_json(new),
          'type', 'INSERT',
          'table', 'profiles'
        )
      );
  exception when others then
    -- On ne veut pas bloquer l'inscription si l'envoi de mail échoue
    raise notice 'Erreur trigger welcome email: %', SQLERRM;
  end;

  return new;
end;
$$;

-- Création du trigger
drop trigger if exists on_profile_created_send_welcome on public.profiles;
create trigger on_profile_created_send_welcome
  after insert on public.profiles
  for each row
  execute function public.handle_new_profile_welcome_email();

