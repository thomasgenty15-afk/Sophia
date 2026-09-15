-- Protect billing / entitlement columns on public.profiles (SEC-03 / SEC-04)
--
-- Problem: the row-level policies on `profiles` scope writes to the owner
-- (auth.uid() = id) but are column-blind. Combined with the table-wide GRANT to
-- `authenticated`, a user can PATCH their own row via PostgREST and set
-- access_tier / trial_end directly, self-granting premium/trial without paying.
--
-- Fix: a BEFORE UPDATE trigger that rejects changes to the entitlement columns
-- when the write originates directly from a client role. Legitimate writers are
-- unaffected because every legitimate path runs either as the service role
-- (Stripe edge functions using the service-role key) or inside a SECURITY
-- DEFINER function owned by `postgres` (handle_new_user, recompute_*):
--   * Direct PostgREST update by a user  -> current_user = 'authenticated'  -> BLOCKED
--   * Guest/anon direct update           -> current_user = 'anon'           -> BLOCKED
--   * Stripe edge fn (service-role key)   -> current_user = 'service_role'   -> allowed
--   * recompute_profile_access_tier(...)  -> SECURITY DEFINER as postgres    -> allowed
--   * handle_new_user() at signup         -> SECURITY DEFINER as postgres    -> allowed
--
-- IMPORTANT: this trigger function MUST be SECURITY INVOKER (the default). A
-- SECURITY DEFINER function would see current_user = its owner (postgres) and
-- never block anything.
--
-- Note: `email` is intentionally NOT locked here (users may legitimately set it,
-- e.g. phone-only signups). The email-based trust issue is fixed separately in
-- the stripe-sync-subscription edge function (SEC-09).

CREATE OR REPLACE FUNCTION "public"."guard_profiles_privileged_columns"()
    RETURNS "trigger"
    LANGUAGE "plpgsql"
    -- SECURITY INVOKER (default) on purpose: we need the real caller role.
    SET "search_path" TO ''
    AS $$
begin
  -- Only guard writes coming straight from the client-facing roles. Any
  -- server-side context (service_role or a SECURITY DEFINER function running as
  -- postgres) is trusted and passes through unchanged.
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
  end if;

  return new;
end;
$$;

ALTER FUNCTION "public"."guard_profiles_privileged_columns"() OWNER TO "postgres";

DROP TRIGGER IF EXISTS "guard_profiles_privileged_columns_biu" ON "public"."profiles";

CREATE TRIGGER "guard_profiles_privileged_columns_biu"
    BEFORE UPDATE ON "public"."profiles"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."guard_profiles_privileged_columns"();
