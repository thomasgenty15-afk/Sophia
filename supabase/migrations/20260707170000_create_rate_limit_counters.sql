-- Rate limiting infrastructure (SEC-05 / SEC-06)
-- Atomic fixed-window counter used by edge functions to throttle abusable /
-- cost-bearing endpoints (LLM generations, guest onboarding routes, messaging).
--
-- Design notes:
--  * The counter table is service-role-only: RLS is enabled with NO policies,
--    so `authenticated` / `anon` are denied all access (fail-closed). Edge
--    functions reach it exclusively through the SECURITY DEFINER RPC below.
--  * enforce_rate_limit() is atomic (single INSERT ... ON CONFLICT DO UPDATE),
--    so concurrent requests cannot race past the limit (check-then-increment
--    is done in one statement, not two).
--  * Callers combine windows for layered limits, e.g. a short per-minute burst
--    window plus a per-day cost cap, by calling the RPC once per window.

CREATE TABLE IF NOT EXISTS "public"."rate_limit_counters" (
  "bucket_key"   text        NOT NULL,
  "window_start" timestamptz NOT NULL,
  "count"        integer     NOT NULL DEFAULT 0,
  "expires_at"   timestamptz NOT NULL,
  PRIMARY KEY ("bucket_key", "window_start")
);

ALTER TABLE "public"."rate_limit_counters" OWNER TO "postgres";

-- Deny-all: enabling RLS with no policy means only service_role (which bypasses
-- RLS) can read/write. authenticated/anon get nothing.
ALTER TABLE "public"."rate_limit_counters" ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS "rate_limit_counters_expires_at_idx"
  ON "public"."rate_limit_counters" ("expires_at");

COMMENT ON TABLE "public"."rate_limit_counters" IS
  'Fixed-window rate-limit counters. Service-role only (RLS enabled, no policies). Written exclusively via enforce_rate_limit().';

-- Atomic enforce-and-increment. Returns whether the caller is allowed, the
-- current count in the window, and how many seconds until the window resets.
CREATE OR REPLACE FUNCTION "public"."enforce_rate_limit"(
  "p_key"            text,
  "p_window_seconds" integer,
  "p_limit"          integer
) RETURNS TABLE ("allowed" boolean, "current_count" integer, "retry_after_seconds" integer)
    LANGUAGE "plpgsql"
    SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_now          timestamptz := clock_timestamp();
  v_window_start timestamptz;
  v_window_end   timestamptz;
  v_count        integer;
begin
  if p_window_seconds is null or p_window_seconds <= 0
     or p_limit is null or p_limit < 0
     or p_key is null or length(p_key) = 0 then
    raise exception 'enforce_rate_limit: invalid arguments';
  end if;

  -- Align to a fixed window so all requests in the same slice share a row.
  v_window_start := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );
  v_window_end := v_window_start + make_interval(secs => p_window_seconds);

  insert into public.rate_limit_counters (bucket_key, window_start, count, expires_at)
  values (p_key, v_window_start, 1, v_window_end)
  on conflict (bucket_key, window_start)
  do update set count = public.rate_limit_counters.count + 1
  returning public.rate_limit_counters.count into v_count;

  return query select
    (v_count <= p_limit),
    v_count,
    case
      when v_count <= p_limit then 0
      else greatest(1, ceil(extract(epoch from (v_window_end - v_now)))::integer)
    end;
end;
$$;

ALTER FUNCTION "public"."enforce_rate_limit"(text, integer, integer) OWNER TO "postgres";

-- Only the service role (used by edge functions) may call it. Never expose it
-- to the client roles.
REVOKE ALL ON FUNCTION "public"."enforce_rate_limit"(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."enforce_rate_limit"(text, integer, integer) FROM "anon";
REVOKE ALL ON FUNCTION "public"."enforce_rate_limit"(text, integer, integer) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."enforce_rate_limit"(text, integer, integer) TO "service_role";

-- Housekeeping: drop expired counter rows. Safe to run anytime; idempotent.
CREATE OR REPLACE FUNCTION "public"."purge_expired_rate_limit_counters"()
    RETURNS void
    LANGUAGE "sql"
    SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  delete from public.rate_limit_counters where expires_at < clock_timestamp();
$$;

ALTER FUNCTION "public"."purge_expired_rate_limit_counters"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."purge_expired_rate_limit_counters"() FROM PUBLIC;

-- Hourly cleanup via pg_cron when available (matches existing scheduling setup).
DO $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'purge-expired-rate-limit-counters',
      '7 * * * *',
      $cron$ select public.purge_expired_rate_limit_counters(); $cron$
    );
  end if;
exception when others then
  -- Non-fatal: if cron isn't configured (e.g. local), skip silently.
  raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end;
$$;
