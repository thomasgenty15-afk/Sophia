-- Self-service account deletion (RGPD/CNIL) + data export.
--
-- Design (docs/… flux "Supprimer mon compte") :
--   * T0  : the account is flagged `deletion_pending` with purge_at = now() + 7 days.
--           Access is cut app-side, WhatsApp goes silent, Stripe is cancelled.
--   * J+7 : the `purge-deleted-accounts` edge cron hard-deletes everything and
--           keeps only an anonymised proof-of-deletion row in deletion_records.
--   * Before J+7 the user can log back in and restore the account.
--
-- This migration adds:
--   1. profiles.account_status / purge_at / deletion_requested_at (+ restore snapshot)
--   2. deletion_records          — anonymised proof of deletion (service-role only)
--   3. account_security_confirmations — cross-isolate replay protection for the
--      INV-5 confirmation tokens used by account-deletion-v1
--   4. a private `gdpr-exports` storage bucket (signed-URL delivery only)
--   5. the daily purge cron job

-- 1) Deletion lifecycle columns -------------------------------------------------

alter table public.profiles
  add column if not exists account_status text not null default 'active',
  add column if not exists purge_at timestamptz,
  add column if not exists deletion_requested_at timestamptz,
  -- Snapshot taken at T0 so a restore can put WhatsApp back the way it was.
  add column if not exists pre_deletion_whatsapp_opted_in boolean;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_account_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_account_status_check
      check (account_status in ('active', 'deletion_pending'));
  end if;
end $$;

-- Cron/batch jobs filter on this constantly; only non-active rows are interesting.
create index if not exists idx_profiles_account_status
  on public.profiles (account_status)
  where account_status <> 'active';

create index if not exists idx_profiles_purge_at
  on public.profiles (purge_at)
  where purge_at is not null;

-- Deletion state is managed exclusively by the account-deletion edge functions
-- (service role). Extend the SEC-03/SEC-04 guard so a client can neither fake a
-- deletion nor silently un-delete itself via PostgREST.
CREATE OR REPLACE FUNCTION "public"."guard_profiles_privileged_columns"()
    RETURNS "trigger"
    LANGUAGE "plpgsql"
    -- SECURITY INVOKER (default) on purpose: we need the real caller role.
    SET "search_path" TO ''
    AS $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.access_tier is distinct from old.access_tier then
      raise exception
        'profiles.access_tier is managed by the billing system and cannot be modified directly'
        using errcode = '42501'; -- insufficient_privilege
    end if;

    if new.trial_end is distinct from old.trial_end then
      raise exception
        'profiles.trial_end is managed by the billing system and cannot be modified directly'
        using errcode = '42501';
    end if;

    if new.stripe_customer_id is distinct from old.stripe_customer_id then
      raise exception
        'profiles.stripe_customer_id is managed by the billing system and cannot be modified directly'
        using errcode = '42501';
    end if;

    if new.account_status is distinct from old.account_status
       or new.purge_at is distinct from old.purge_at
       or new.deletion_requested_at is distinct from old.deletion_requested_at
       or new.pre_deletion_whatsapp_opted_in is distinct from old.pre_deletion_whatsapp_opted_in then
      raise exception
        'profiles deletion state is managed by the account-deletion functions and cannot be modified directly'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- 2) Anonymised proof of deletion ----------------------------------------------
--
-- Legal-compliance trace kept AFTER the purge: SHA-256 hashes only, no direct
-- identifiers. user_id_hash makes the purge idempotent (re-runs upsert the same
-- row) without persisting the raw uuid.

create table if not exists public.deletion_records (
  id uuid primary key default gen_random_uuid(),
  user_id_hash text not null unique,
  email_hash text,
  phone_hash text,
  deleted_at timestamptz not null default now()
);

alter table public.deletion_records enable row level security;
-- No policies on purpose: only the service role (which bypasses RLS) may touch it.
revoke all on table public.deletion_records from public, anon, authenticated;
grant all on table public.deletion_records to service_role;

-- 3) Replay protection for destructive-operation confirmation tokens (INV-5) ----
--
-- The HMAC confirmation tokens are stateless; this table backs the
-- pending-confirmation lookup + consumption check across edge isolates.

create table if not exists public.account_security_confirmations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  operation_type text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index if not exists idx_account_security_confirmations_user
  on public.account_security_confirmations (user_id, operation_type);

alter table public.account_security_confirmations enable row level security;
revoke all on table public.account_security_confirmations from public, anon, authenticated;
grant all on table public.account_security_confirmations to service_role;

-- 3b) Hard-delete of the auth user, callable from the purge cron ----------------
--
-- The GoTrue admin API is not reachable from every runtime (local stacks with
-- asymmetric signing keys reject legacy service-role JWTs), so the purge goes
-- through SQL: deleting auth.users cascades the whole auth schema plus every
-- public table with ON DELETE CASCADE, and anonymises the SET NULL ones.

create or replace function public.purge_auth_user(p_user_id uuid)
returns void
language sql
security definer
set search_path to ''
as $$
  delete from auth.users where id = p_user_id;
$$;

revoke all on function public.purge_auth_user(uuid) from public, anon, authenticated;
grant execute on function public.purge_auth_user(uuid) to service_role;

-- 4) Private storage bucket for RGPD exports ------------------------------------
--
-- No storage.objects policies on purpose: uploads happen with the service role
-- and downloads only through short-lived signed URLs.

insert into storage.buckets (id, name, public)
values ('gdpr-exports', 'gdpr-exports', false)
on conflict (id) do nothing;

-- 5) Daily purge cron ------------------------------------------------------------
--
-- Same internal-secret invocation pattern as
-- 20260615133000_recreate_active_pg_cron_jobs.sql (pg_temp helper is
-- session-scoped, so it must be re-declared here).

create or replace function pg_temp.schedule_internal_edge_job(
  p_jobname text,
  p_schedule text,
  p_function_name text,
  p_body jsonb default '{}'::jsonb
)
returns void
language plpgsql
as $$
begin
  perform cron.schedule(
    p_jobname,
    p_schedule,
    format(
      $command$
      with cfg as (
        select
          coalesce((select value from public.app_config where key = 'edge_functions_base_url' limit 1), '') as base_url,
          coalesce((select value from public.app_config where key = 'edge_functions_anon_key' limit 1), '') as anon_key,
          coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'INTERNAL_FUNCTION_SECRET' limit 1), '') as internal_secret
      )
      select
        net.http_post(
          url := rtrim((select base_url from cfg), '/') || '/functions/v1/' || %L,
          headers := jsonb_build_object(
            'content-type', 'application/json',
            'apikey', (select anon_key from cfg),
            'authorization', 'Bearer ' || (select anon_key from cfg),
            'x-internal-secret', (select internal_secret from cfg)
          ),
          body := %L::jsonb
        ) as request_id
      from cfg
      where (select base_url from cfg) <> ''
        and (select anon_key from cfg) <> ''
        and (select internal_secret from cfg) <> '';
      $command$,
      p_function_name,
      p_body::text
    )
  );
end;
$$;

do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'purge-deleted-accounts';
end $$;

-- Daily at 04:20 UTC (after the nightly memory/cleanup jobs). The edge function
-- is idempotent and crash-resumable, so a missed or duplicated run is harmless.
select pg_temp.schedule_internal_edge_job(
  'purge-deleted-accounts',
  '20 4 * * *',
  'purge-deleted-accounts'
);
