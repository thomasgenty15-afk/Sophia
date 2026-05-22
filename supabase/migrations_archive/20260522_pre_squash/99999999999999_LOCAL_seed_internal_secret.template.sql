-- LOCAL ONLY TEMPLATE (do not commit a real secret)
--
-- Goal: ensure Vault contains INTERNAL_FUNCTION_SECRET so DB triggers can call Edge Functions.
-- How to use:
-- 1) Copy this file to a new migration name that contains "LOCAL" (still tracked by gitignore if you add it),
--    e.g. `supabase/migrations/99999999999999_LOCAL_seed_internal_secret.sql`
-- 2) Replace __INTERNAL_FUNCTION_SECRET__ with the same value as in `supabase/.env` (INTERNAL_FUNCTION_SECRET)
-- 3) Run: `supabase db reset` (or `supabase migration up` depending on your workflow)
--
-- Why not commit the secret? Because it would recreate the “secret in repo” risk.

do $$
declare
  existing text;
begin
  select decrypted_secret
    into existing
  from vault.decrypted_secrets
  where name = 'INTERNAL_FUNCTION_SECRET'
  limit 1;

  if existing is null then
    perform vault.create_secret('Sophia on fire', 'Sophia on fire');
    raise notice 'Created vault secret INTERNAL_FUNCTION_SECRET';
  else
    raise notice 'Vault secret INTERNAL_FUNCTION_SECRET already exists';
  end if;
end $$;


