


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";






CREATE TYPE "public"."aspect_status" AS ENUM (
    'active',
    'deferred',
    'rejected'
);


ALTER TYPE "public"."aspect_status" OWNER TO "postgres";


CREATE TYPE "public"."aspect_uncertainty" AS ENUM (
    'low',
    'medium',
    'high'
);


ALTER TYPE "public"."aspect_uncertainty" OWNER TO "postgres";


CREATE TYPE "public"."chat_agent_mode" AS ENUM (
    'dispatcher',
    'sentry',
    'investigator',
    'architect',
    'companion',
    'philosopher',
    'assistant',
    'librarian'
);


ALTER TYPE "public"."chat_agent_mode" OWNER TO "postgres";


CREATE TYPE "public"."chat_role" AS ENUM (
    'user',
    'assistant',
    'system'
);


ALTER TYPE "public"."chat_role" OWNER TO "postgres";


CREATE TYPE "public"."checkin_status" AS ENUM (
    'pending',
    'sent',
    'cancelled',
    'awaiting_user',
    'retrying',
    'failed'
);


ALTER TYPE "public"."checkin_status" OWNER TO "postgres";


CREATE TYPE "public"."cycle_status" AS ENUM (
    'draft',
    'clarification_needed',
    'structured',
    'prioritized',
    'questionnaire_in_progress',
    'signup_pending',
    'profile_pending',
    'ready_for_plan',
    'active',
    'completed',
    'abandoned'
);


ALTER TYPE "public"."cycle_status" OWNER TO "postgres";


CREATE TYPE "public"."deferred_reason" AS ENUM (
    'not_priority_now',
    'later_cycle',
    'out_of_scope',
    'user_choice',
    'unclear'
);


ALTER TYPE "public"."deferred_reason" OWNER TO "postgres";


CREATE TYPE "public"."habit_state" AS ENUM (
    'active_building',
    'in_maintenance',
    'stalled'
);


ALTER TYPE "public"."habit_state" OWNER TO "postgres";


CREATE TYPE "public"."metric_kind" AS ENUM (
    'north_star',
    'progress_marker',
    'support_metric',
    'custom'
);


ALTER TYPE "public"."metric_kind" OWNER TO "postgres";


CREATE TYPE "public"."metric_scope" AS ENUM (
    'cycle',
    'transformation'
);


ALTER TYPE "public"."metric_scope" OWNER TO "postgres";


CREATE TYPE "public"."metric_status" AS ENUM (
    'active',
    'paused',
    'completed',
    'archived'
);


ALTER TYPE "public"."metric_status" OWNER TO "postgres";


CREATE TYPE "public"."plan_dimension" AS ENUM (
    'support',
    'missions',
    'habits',
    'clarifications'
);


ALTER TYPE "public"."plan_dimension" OWNER TO "postgres";


CREATE TYPE "public"."plan_item_kind" AS ENUM (
    'framework',
    'exercise',
    'task',
    'milestone',
    'habit'
);


ALTER TYPE "public"."plan_item_kind" OWNER TO "postgres";


CREATE TYPE "public"."plan_item_status" AS ENUM (
    'pending',
    'active',
    'in_maintenance',
    'completed',
    'deactivated',
    'cancelled',
    'stalled'
);


ALTER TYPE "public"."plan_item_status" OWNER TO "postgres";


CREATE TYPE "public"."plan_status" AS ENUM (
    'draft',
    'generated',
    'active',
    'paused',
    'completed',
    'archived'
);


ALTER TYPE "public"."plan_status" OWNER TO "postgres";


CREATE TYPE "public"."support_function" AS ENUM (
    'practice',
    'rescue',
    'understanding'
);


ALTER TYPE "public"."support_function" OWNER TO "postgres";


CREATE TYPE "public"."support_mode" AS ENUM (
    'always_available',
    'recommended_now',
    'unlockable'
);


ALTER TYPE "public"."support_mode" OWNER TO "postgres";


CREATE TYPE "public"."tracking_type" AS ENUM (
    'boolean',
    'count',
    'scale',
    'text',
    'milestone'
);


ALTER TYPE "public"."tracking_type" OWNER TO "postgres";


CREATE TYPE "public"."transformation_status" AS ENUM (
    'draft',
    'ready',
    'pending',
    'active',
    'completed',
    'cancelled',
    'archived',
    'abandoned'
);


ALTER TYPE "public"."transformation_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_app_config_get"("_key" "text") RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  select value
  from public.app_config
  where key = _key
  limit 1
$$;


ALTER FUNCTION "public"."_app_config_get"("_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_expected_edge_base_url"() RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  select
    case
      when length(trim(coalesce(public._app_config_get('supabase_project_ref'), ''))) = 0
        then null
      else
        'https://' || trim(public._app_config_get('supabase_project_ref')) || '.supabase.co'
    end
$$;


ALTER FUNCTION "public"."_expected_edge_base_url"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_trg_recompute_profile_access_tier_from_profiles"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.recompute_profile_access_tier(new.id);
  return new;
end;
$$;


ALTER FUNCTION "public"."_trg_recompute_profile_access_tier_from_profiles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_trg_recompute_profile_access_tier_from_subscriptions"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.recompute_profile_access_tier(coalesce(new.user_id, old.user_id));
  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."_trg_recompute_profile_access_tier_from_subscriptions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_validate_app_config_edge_base_url"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  expected text;
  incoming text;
begin
  perform set_config('search_path', 'public,extensions', true);

  -- Only validate the specific key.
  if new.key <> 'edge_functions_base_url' then
    return new;
  end if;

  expected := public._expected_edge_base_url();
  incoming := trim(coalesce(new.value, ''));

  -- If project ref isn't set, allow (but you should set it to enable this guard).
  if expected is null then
    return new;
  end if;

  -- Allow local dev base URL patterns explicitly.
  if incoming like 'http://host.docker.internal:%' or incoming like 'http://localhost:%' then
    return new;
  end if;

  -- Enforce exact match for hosted projects.
  if incoming <> expected then
    raise exception
      using
        errcode = '22023',
        message = format(
          'Invalid edge_functions_base_url=%s (expected %s for supabase_project_ref=%s). Refusing to prevent cross-project calls.',
          incoming,
          expected,
          trim(public._app_config_get('supabase_project_ref'))
        );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."_validate_app_config_edge_base_url"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."architect_quote_tags_are_valid"("input_tags" "text"[]) RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  tag text;
begin
  if input_tags is null then
    return false;
  end if;

  if cardinality(input_tags) > 12 then
    return false;
  end if;

  foreach tag in array input_tags loop
    if tag is null or btrim(tag) = '' or char_length(tag) > 40 then
      return false;
    end if;
  end loop;

  return true;
end;
$$;


ALTER FUNCTION "public"."architect_quote_tags_are_valid"("input_tags" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."architect_reflection_tags_are_valid"("input_tags" "text"[]) RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  tag text;
begin
  if input_tags is null then
    return false;
  end if;

  if cardinality(input_tags) > 12 then
    return false;
  end if;

  foreach tag in array input_tags loop
    if tag is null or btrim(tag) = '' or char_length(tag) > 40 then
      return false;
    end if;
  end loop;

  return true;
end;
$$;


ALTER FUNCTION "public"."architect_reflection_tags_are_valid"("input_tags" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."architect_story_bullet_points_are_valid"("input_points" "text"[]) RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  point text;
begin
  if input_points is null then
    return false;
  end if;

  if cardinality(input_points) > 24 then
    return false;
  end if;

  foreach point in array input_points loop
    if point is null or btrim(point) = '' or char_length(point) > 500 then
      return false;
    end if;
  end loop;

  return true;
end;
$$;


ALTER FUNCTION "public"."architect_story_bullet_points_are_valid"("input_points" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."architect_story_tags_are_valid"("input_tags" "text"[]) RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  tag text;
begin
  if input_tags is null then
    return false;
  end if;

  if cardinality(input_tags) > 16 then
    return false;
  end if;

  foreach tag in array input_tags loop
    if tag is null or btrim(tag) = '' or char_length(tag) > 48 then
      return false;
    end if;
  end loop;

  return true;
end;
$$;


ALTER FUNCTION "public"."architect_story_tags_are_valid"("input_tags" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backfill_whatsapp_template_cost_events"("p_from" timestamp with time zone DEFAULT ("now"() - '90 days'::interval)) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  inserted_count bigint := 0;
begin
  insert into public.whatsapp_cost_events (
    event_date,
    user_id,
    outbound_message_id,
    provider_message_id,
    purpose,
    template_name,
    template_language,
    unit_cost_eur,
    final_cost_eur,
    currency,
    billable,
    billing_status,
    billed_at,
    metadata
  )
  select
    coalesce((s.status_timestamp)::date, now()::date) as event_date,
    m.user_id,
    m.id as outbound_message_id,
    m.provider_message_id,
    nullif(m.metadata->>'purpose', '') as purpose,
    nullif(coalesce(m.metadata->>'template_name', m.graph_payload->'template'->>'name'), '') as template_name,
    nullif(coalesce(m.metadata->>'template_language', m.graph_payload->'template'->'language'->>'code'), '') as template_language,
    coalesce((m.metadata->>'unit_cost_eur')::numeric, 0.0712) as unit_cost_eur,
    coalesce((m.metadata->>'unit_cost_eur')::numeric, 0.0712) as final_cost_eur,
    'EUR' as currency,
    true as billable,
    'sent' as billing_status,
    coalesce(s.status_timestamp, now()) as billed_at,
    jsonb_build_object('source', 'backfill', 'status_event_id', s.id)
  from public.whatsapp_outbound_messages m
  join lateral (
    select se.id, se.status_timestamp
    from public.whatsapp_outbound_status_events se
    where se.provider_message_id = m.provider_message_id
      and lower(se.status) = 'sent'
    order by se.created_at asc
    limit 1
  ) s on true
  where m.message_type = 'template'
    and m.created_at >= p_from
    and m.provider_message_id is not null
  on conflict (provider_message_id) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;


ALTER FUNCTION "public"."backfill_whatsapp_template_cost_events"("p_from" timestamp with time zone) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."conversation_eval_judge_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "eval_run_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 30 NOT NULL,
    "next_attempt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_attempt_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "locked_at" timestamp with time zone,
    "locked_by" "text",
    "last_error" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "conversation_eval_judge_jobs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."conversation_eval_judge_jobs" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_conversation_eval_judge_jobs"("p_limit" integer DEFAULT 10, "p_worker_id" "text" DEFAULT 'worker'::"text") RETURNS SETOF "public"."conversation_eval_judge_jobs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  with cte as (
    select id
    from public.conversation_eval_judge_jobs
    where
      status = 'pending'
      and attempt_count < max_attempts
      and next_attempt_at <= now()
    order by next_attempt_at asc
    limit greatest(1, least(coalesce(p_limit, 10), 100))
    for update skip locked
  )
  update public.conversation_eval_judge_jobs j
  set
    status = 'processing',
    locked_at = now(),
    locked_by = coalesce(nullif(trim(p_worker_id), ''), 'worker'),
    updated_at = now()
  where j.id in (select id from cte)
  returning j.*;
end;
$$;


ALTER FUNCTION "public"."claim_conversation_eval_judge_jobs"("p_limit" integer, "p_worker_id" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."llm_retry_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "scope" "text" DEFAULT 'web'::"text" NOT NULL,
    "channel" "text" DEFAULT 'web'::"text" NOT NULL,
    "message" "text" NOT NULL,
    "message_hash" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 30 NOT NULL,
    "next_attempt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_attempt_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "locked_at" timestamp with time zone,
    "locked_by" "text",
    "last_error" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "llm_retry_jobs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."llm_retry_jobs" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_llm_retry_jobs"("p_limit" integer DEFAULT 20, "p_worker_id" "text" DEFAULT 'worker'::"text") RETURNS SETOF "public"."llm_retry_jobs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  with cte as (
    select id
    from public.llm_retry_jobs
    where
      status = 'pending'
      and attempt_count < max_attempts
      and next_attempt_at <= now()
    order by next_attempt_at asc
    limit greatest(1, least(coalesce(p_limit, 20), 200))
    for update skip locked
  )
  update public.llm_retry_jobs j
  set
    status = 'processing',
    locked_at = now(),
    locked_by = coalesce(nullif(trim(p_worker_id), ''), 'worker'),
    updated_at = now()
  where j.id in (select id from cte)
  returning j.*;
end;
$$;


ALTER FUNCTION "public"."claim_llm_retry_jobs"("p_limit" integer, "p_worker_id" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_outbound_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "request_id" "text",
    "user_id" "uuid",
    "to_e164" "text" NOT NULL,
    "reply_to_wamid_in" "text",
    "message_type" "text" NOT NULL,
    "content_preview" "text" DEFAULT ''::"text" NOT NULL,
    "graph_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "provider_message_id" "text",
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 8 NOT NULL,
    "last_attempt_at" timestamp with time zone,
    "next_retry_at" timestamp with time zone,
    "locked_at" timestamp with time zone,
    "locked_by" "text",
    "last_error_code" "text",
    "last_error_message" "text",
    "last_error" "jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "whatsapp_outbound_messages_message_type_check" CHECK (("message_type" = ANY (ARRAY['text'::"text", 'template'::"text"]))),
    CONSTRAINT "whatsapp_outbound_messages_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'sent'::"text", 'delivered'::"text", 'read'::"text", 'failed'::"text", 'cancelled'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."whatsapp_outbound_messages" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_whatsapp_outbound_retries"("p_limit" integer DEFAULT 20, "p_worker_id" "text" DEFAULT 'worker'::"text") RETURNS SETOF "public"."whatsapp_outbound_messages"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  with cte as (
    select id
    from public.whatsapp_outbound_messages
    where
      status = 'failed'
      and attempt_count < max_attempts
      and next_retry_at is not null
      and next_retry_at <= now()
      and (
        locked_at is null
        or locked_at < now() - interval '10 minutes'
      )
    order by next_retry_at asc
    limit greatest(1, least(coalesce(p_limit, 20), 200))
    for update skip locked
  )
  update public.whatsapp_outbound_messages m
  set
    locked_at = now(),
    locked_by = coalesce(nullif(trim(p_worker_id), ''), 'worker'),
    updated_at = now()
  where m.id in (select id from cte)
  returning m.*;
end;
$$;


ALTER FUNCTION "public"."claim_whatsapp_outbound_retries"("p_limit" integer, "p_worker_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_expired_architect_draft_scopes"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  deleted_count integer := 0;
begin
  with expired_scopes as (
    select user_id, scope
    from public.conversation_scope_memories
    where updated_at < now() - interval '7 days'
      and (
        scope like 'story:draft:%' or
        scope like 'reflection:draft:%'
      )
  ), deleted_messages as (
    delete from public.chat_messages cm
    using expired_scopes es
    where cm.user_id = es.user_id
      and cm.scope = es.scope
    returning cm.user_id, cm.scope
  ), deleted_memories as (
    delete from public.conversation_scope_memories csm
    using expired_scopes es
    where csm.user_id = es.user_id
      and csm.scope = es.scope
    returning csm.user_id, csm.scope
  )
  select count(*)::integer into deleted_count
  from deleted_memories;

  return coalesce(deleted_count, 0);
end;
$$;


ALTER FUNCTION "public"."cleanup_expired_architect_draft_scopes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_whatsapp_scheduling_for_user"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_user_id is null then
    return;
  end if;

  update public.scheduled_checkins
  set
    status = 'cancelled',
    processed_at = now()
  where user_id = p_user_id
    and status::text in ('pending', 'retrying', 'awaiting_user')
    and scheduled_for >= now()
    and (
      event_context = 'morning_active_actions_nudge'
      or event_context like 'recurring_reminder:%'
    );

  update public.whatsapp_pending_actions
  set
    status = 'cancelled',
    processed_at = now()
  where user_id = p_user_id
    and status = 'pending'
    and (
      (
        kind = 'scheduled_checkin'
        and (
          coalesce(payload->>'event_context', '') = 'morning_active_actions_nudge'
          or coalesce(payload->>'event_context', '') like 'recurring_reminder:%'
        )
      )
      or (
        kind = 'proactive_template_candidate'
        and coalesce(payload->>'purpose', '') = 'recurring_reminder'
      )
    );
end;
$$;


ALTER FUNCTION "public"."cleanup_whatsapp_scheduling_for_user"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_whatsapp_monthly_quota"("p_user_id" "uuid", "p_quota_key" "text", "p_month_key" "text", "p_limit" integer) RETURNS TABLE("allowed" boolean, "used_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_used_count integer;
begin
  if p_limit is null or p_limit < 1 then
    raise exception 'p_limit must be >= 1';
  end if;

  insert into public.whatsapp_monthly_quotas (
    user_id,
    quota_key,
    month_key,
    used_count
  )
  values (
    p_user_id,
    p_quota_key,
    p_month_key,
    0
  )
  on conflict (user_id, quota_key, month_key) do nothing;

  update public.whatsapp_monthly_quotas
  set
    used_count = public.whatsapp_monthly_quotas.used_count + 1,
    updated_at = now()
  where user_id = p_user_id
    and quota_key = p_quota_key
    and month_key = p_month_key
    and public.whatsapp_monthly_quotas.used_count < p_limit
  returning public.whatsapp_monthly_quotas.used_count into v_used_count;

  if found then
    return query select true, v_used_count;
    return;
  end if;

  select q.used_count
  into v_used_count
  from public.whatsapp_monthly_quotas q
  where q.user_id = p_user_id
    and q.quota_key = p_quota_key
    and q.month_key = p_month_key;

  return query select false, coalesce(v_used_count, 0);
end;
$$;


ALTER FUNCTION "public"."consume_whatsapp_monthly_quota"("p_user_id" "uuid", "p_quota_key" "text", "p_month_key" "text", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cost_bucket"("ts" timestamp with time zone, "bucket" "text") RETURNS timestamp with time zone
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case lower(coalesce(bucket, 'day'))
    when 'month' then date_trunc('month', ts)
    when 'week' then date_trunc('week', ts)
    else date_trunc('day', ts)
  end
$$;


ALTER FUNCTION "public"."cost_bucket"("ts" timestamp with time zone, "bucket" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_single_master_admin"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  u_email text;
  others integer;
begin
  select lower(email)
    into u_email
  from auth.users
  where id = new.user_id;

  if u_email is null then
    raise exception 'internal_admins: user email not found';
  end if;

  if u_email <> 'thomasgenty15@gmail.com' then
    raise exception 'internal_admins: only master admin email is allowed';
  end if;

  select count(*) into others
  from public.internal_admins
  where user_id <> new.user_id;

  if others > 0 then
    raise exception 'internal_admins: only one admin row is allowed';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_single_master_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_conversation_eval_judge_job"("p_eval_run_id" "uuid", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id uuid;
begin
  if p_eval_run_id is null then
    raise exception 'eval_run_id is required';
  end if;

  insert into public.conversation_eval_judge_jobs (
    eval_run_id, next_attempt_at, metadata
  )
  values (
    p_eval_run_id,
    now(),
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (eval_run_id) do update
    set
      -- Reset failed/processing jobs back to pending so the worker can retry.
      status = 'pending',
      attempt_count = public.conversation_eval_judge_jobs.attempt_count,
      next_attempt_at = least(public.conversation_eval_judge_jobs.next_attempt_at, now()),
      updated_at = now(),
      locked_at = null,
      locked_by = null,
      last_error = null,
      metadata = public.conversation_eval_judge_jobs.metadata || excluded.metadata
  returning id into v_id;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."enqueue_conversation_eval_judge_job"("p_eval_run_id" "uuid", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_llm_retry_job"("p_user_id" "uuid", "p_scope" "text", "p_channel" "text", "p_message" "text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id uuid;
  v_scope text;
  v_channel text;
  v_message text;
  v_hash text;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;
  if auth.uid() <> p_user_id then
    raise exception 'Forbidden';
  end if;

  v_scope := coalesce(nullif(trim(p_scope), ''), 'web');
  v_channel := coalesce(nullif(trim(p_channel), ''), 'web');
  v_message := coalesce(nullif(trim(p_message), ''), '');
  if v_message = '' then
    raise exception 'Message is empty';
  end if;

  v_hash := md5(v_message);

  insert into public.llm_retry_jobs (
    user_id, scope, channel, message, message_hash, next_attempt_at, metadata
  )
  values (
    p_user_id,
    v_scope,
    v_channel,
    v_message,
    v_hash,
    now() + interval '2 minutes' + ((random() * 40.0 - 20.0) * interval '1 second'),
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (user_id, scope, message_hash)
    where status = any (array['pending'::text, 'processing'::text])
  do update
    set
      updated_at = now(),
      -- move next attempt forward (keep jitter) in case we re-hit failure quickly
      next_attempt_at = greatest(public.llm_retry_jobs.next_attempt_at, now() + interval '2 minutes' + ((random() * 40.0 - 20.0) * interval '1 second')),
      metadata = public.llm_retry_jobs.metadata || excluded.metadata
  returning id into v_id;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."enqueue_llm_retry_job"("p_user_id" "uuid", "p_scope" "text", "p_channel" "text", "p_message" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_cost_by_operation"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text" DEFAULT 'day'::"text", "p_whatsapp_eur_to_usd" numeric DEFAULT 1.08, "p_provider" "text" DEFAULT NULL::"text", "p_model" "text" DEFAULT NULL::"text", "p_family" "text" DEFAULT NULL::"text", "p_operation" "text" DEFAULT NULL::"text") RETURNS TABLE("bucket_start" timestamp with time zone, "operation_family" "text", "operation_name" "text", "source" "text", "provider" "text", "model" "text", "cost_domain" "text", "ai_cost_usd" numeric, "whatsapp_cost_eur" numeric, "total_cost_usd" numeric, "total_calls" bigint, "total_tokens" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with admin_guard as (
    select 1 as ok
    where exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid())
  ),
  base as (
    select *
    from public.cost_fact_events c, admin_guard
    where c.created_at >= p_start
      and c.created_at < p_end
      and (coalesce(p_provider, '') = '' or lower(coalesce(c.provider, '')) = lower(p_provider))
      and (coalesce(p_model, '') = '' or lower(coalesce(c.model, '')) = lower(p_model))
      and (coalesce(p_family, '') = '' or public.normalize_cost_operation_family(c.operation_family, c.source) = lower(p_family))
      and (coalesce(p_operation, '') = '' or public.normalize_cost_operation_name(c.operation_name, c.source) = lower(p_operation))
  )
  select
    public.cost_bucket(b.created_at, p_bucket) as bucket_start,
    b.operation_family,
    b.operation_name,
    b.source,
    b.provider,
    b.model,
    b.cost_domain,
    sum(b.cost_usd)::numeric as ai_cost_usd,
    sum(b.cost_eur)::numeric as whatsapp_cost_eur,
    (sum(b.cost_usd) + sum(b.cost_eur) * p_whatsapp_eur_to_usd)::numeric as total_cost_usd,
    count(*)::bigint as total_calls,
    sum(b.total_tokens)::bigint as total_tokens
  from base b
  group by 1,2,3,4,5,6,7
  order by 1 desc, total_cost_usd desc;
$$;


ALTER FUNCTION "public"."get_admin_cost_by_operation"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_cost_by_user"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text" DEFAULT 'day'::"text", "p_whatsapp_eur_to_usd" numeric DEFAULT 1.08, "p_provider" "text" DEFAULT NULL::"text", "p_model" "text" DEFAULT NULL::"text", "p_family" "text" DEFAULT NULL::"text", "p_operation" "text" DEFAULT NULL::"text") RETURNS TABLE("bucket_start" timestamp with time zone, "user_id" "uuid", "full_name" "text", "email" "text", "ai_cost_usd" numeric, "whatsapp_cost_eur" numeric, "total_cost_usd" numeric, "total_calls" bigint, "total_tokens" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with admin_guard as (
    select 1 as ok
    where exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid())
  ),
  base as (
    select *
    from public.cost_fact_events c, admin_guard
    where c.created_at >= p_start
      and c.created_at < p_end
      and c.user_id is not null
      and (coalesce(p_provider, '') = '' or lower(coalesce(c.provider, '')) = lower(p_provider))
      and (coalesce(p_model, '') = '' or lower(coalesce(c.model, '')) = lower(p_model))
      and (coalesce(p_family, '') = '' or public.normalize_cost_operation_family(c.operation_family, c.source) = lower(p_family))
      and (coalesce(p_operation, '') = '' or public.normalize_cost_operation_name(c.operation_name, c.source) = lower(p_operation))
  )
  select
    public.cost_bucket(b.created_at, p_bucket) as bucket_start,
    b.user_id,
    coalesce(p.full_name, 'Unknown') as full_name,
    coalesce(p.email, '') as email,
    sum(b.cost_usd)::numeric as ai_cost_usd,
    sum(b.cost_eur)::numeric as whatsapp_cost_eur,
    (sum(b.cost_usd) + sum(b.cost_eur) * p_whatsapp_eur_to_usd)::numeric as total_cost_usd,
    count(*)::bigint as total_calls,
    sum(b.total_tokens)::bigint as total_tokens
  from base b
  left join public.profiles p on p.id = b.user_id
  group by 1, 2, 3, 4
  order by 1 desc, total_cost_usd desc;
$$;


ALTER FUNCTION "public"."get_admin_cost_by_user"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_cost_compare_previous"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_whatsapp_eur_to_usd" numeric DEFAULT 1.08, "p_provider" "text" DEFAULT NULL::"text", "p_model" "text" DEFAULT NULL::"text", "p_family" "text" DEFAULT NULL::"text", "p_operation" "text" DEFAULT NULL::"text") RETURNS TABLE("current_total_cost_usd" numeric, "previous_total_cost_usd" numeric, "delta_cost_usd" numeric, "delta_pct" numeric, "current_calls" bigint, "previous_calls" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with admin_guard as (
    select 1 as ok
    where exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid())
  ),
  dur as (
    select greatest(extract(epoch from (p_end - p_start)), 1) as seconds
  ),
  cur as (
    select
      coalesce(sum(c.cost_usd + (c.cost_eur * p_whatsapp_eur_to_usd)), 0)::numeric as total_cost,
      count(*)::bigint as calls
    from public.cost_fact_events c, admin_guard
    where c.created_at >= p_start
      and c.created_at < p_end
      and (coalesce(p_provider, '') = '' or lower(coalesce(c.provider, '')) = lower(p_provider))
      and (coalesce(p_model, '') = '' or lower(coalesce(c.model, '')) = lower(p_model))
      and (coalesce(p_family, '') = '' or public.normalize_cost_operation_family(c.operation_family, c.source) = lower(p_family))
      and (coalesce(p_operation, '') = '' or public.normalize_cost_operation_name(c.operation_name, c.source) = lower(p_operation))
  ),
  prev as (
    select
      coalesce(sum(c.cost_usd + (c.cost_eur * p_whatsapp_eur_to_usd)), 0)::numeric as total_cost,
      count(*)::bigint as calls
    from public.cost_fact_events c, dur d, admin_guard
    where c.created_at >= (p_start - make_interval(secs => d.seconds))
      and c.created_at < p_start
      and (coalesce(p_provider, '') = '' or lower(coalesce(c.provider, '')) = lower(p_provider))
      and (coalesce(p_model, '') = '' or lower(coalesce(c.model, '')) = lower(p_model))
      and (coalesce(p_family, '') = '' or public.normalize_cost_operation_family(c.operation_family, c.source) = lower(p_family))
      and (coalesce(p_operation, '') = '' or public.normalize_cost_operation_name(c.operation_name, c.source) = lower(p_operation))
  )
  select
    cur.total_cost as current_total_cost_usd,
    prev.total_cost as previous_total_cost_usd,
    (cur.total_cost - prev.total_cost)::numeric as delta_cost_usd,
    case
      when prev.total_cost = 0 then null
      else (((cur.total_cost - prev.total_cost) / prev.total_cost) * 100)::numeric
    end as delta_pct,
    cur.calls as current_calls,
    prev.calls as previous_calls
  from cur, prev;
$$;


ALTER FUNCTION "public"."get_admin_cost_compare_previous"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_cost_data_quality"("p_start" timestamp with time zone, "p_end" timestamp with time zone) RETURNS TABLE("missing_user_events" bigint, "unpriced_events" bigint, "missing_operation_events" bigint, "missing_source_events" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with admin_guard as (
    select 1 as ok
    where exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid())
  ),
  base as (
    select ue.*
    from public.llm_usage_events ue, admin_guard
    where ue.created_at >= p_start and ue.created_at < p_end
  )
  select
    count(*) filter (where user_id is null)::bigint as missing_user_events,
    count(*) filter (where coalesce(cost_unpriced, false) = true)::bigint as unpriced_events,
    count(*) filter (where coalesce(operation_family, '') = '' or coalesce(operation_name, '') = '')::bigint as missing_operation_events,
    count(*) filter (where coalesce(source, '') = '')::bigint as missing_source_events
  from base;
$$;


ALTER FUNCTION "public"."get_admin_cost_data_quality"("p_start" timestamp with time zone, "p_end" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_cost_overview"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text" DEFAULT 'day'::"text", "p_whatsapp_eur_to_usd" numeric DEFAULT 1.08, "p_provider" "text" DEFAULT NULL::"text", "p_model" "text" DEFAULT NULL::"text", "p_family" "text" DEFAULT NULL::"text", "p_operation" "text" DEFAULT NULL::"text") RETURNS TABLE("bucket_start" timestamp with time zone, "total_cost_usd" numeric, "ai_cost_usd" numeric, "whatsapp_cost_eur" numeric, "whatsapp_cost_usd" numeric, "total_calls" bigint, "total_tokens" bigint, "unique_users" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with admin_guard as (
    select 1 as ok
    where exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid())
  ),
  base as (
    select *
    from public.cost_fact_events c, admin_guard
    where c.created_at >= p_start
      and c.created_at < p_end
      and (coalesce(p_provider, '') = '' or lower(coalesce(c.provider, '')) = lower(p_provider))
      and (coalesce(p_model, '') = '' or lower(coalesce(c.model, '')) = lower(p_model))
      and (coalesce(p_family, '') = '' or public.normalize_cost_operation_family(c.operation_family, c.source) = lower(p_family))
      and (coalesce(p_operation, '') = '' or public.normalize_cost_operation_name(c.operation_name, c.source) = lower(p_operation))
  )
  select
    public.cost_bucket(b.created_at, p_bucket) as bucket_start,
    (sum(b.cost_usd) + sum(b.cost_eur) * p_whatsapp_eur_to_usd)::numeric as total_cost_usd,
    sum(b.cost_usd)::numeric as ai_cost_usd,
    sum(b.cost_eur)::numeric as whatsapp_cost_eur,
    (sum(b.cost_eur) * p_whatsapp_eur_to_usd)::numeric as whatsapp_cost_usd,
    count(*)::bigint as total_calls,
    sum(b.total_tokens)::bigint as total_tokens,
    count(distinct b.user_id)::bigint as unique_users
  from base b
  group by 1
  order by 1 desc;
$$;


ALTER FUNCTION "public"."get_admin_cost_overview"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_daily_cost_synthesis"("p_target_day" "date", "p_whatsapp_eur_to_usd" numeric DEFAULT 1.08, "p_provider" "text" DEFAULT NULL::"text", "p_model" "text" DEFAULT NULL::"text", "p_family" "text" DEFAULT NULL::"text", "p_operation" "text" DEFAULT NULL::"text") RETURNS TABLE("target_day" "date", "ai_cost_usd" numeric, "whatsapp_cost_eur" numeric, "total_cost_usd" numeric, "total_calls" bigint, "total_tokens" bigint, "unique_users" bigint, "unpriced_event_count" bigint, "top_operation_family" "text", "top_model" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with admin_guard as (
    select 1 as ok
    where exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid())
  ),
  day_range as (
    select p_target_day::timestamptz as s, (p_target_day::timestamptz + interval '1 day') as e
  ),
  facts as (
    select c.*
    from public.cost_fact_events c, day_range d, admin_guard
    where c.created_at >= d.s
      and c.created_at < d.e
      and (coalesce(p_provider, '') = '' or lower(coalesce(c.provider, '')) = lower(p_provider))
      and (coalesce(p_model, '') = '' or lower(coalesce(c.model, '')) = lower(p_model))
      and (coalesce(p_family, '') = '' or public.normalize_cost_operation_family(c.operation_family, c.source) = lower(p_family))
      and (coalesce(p_operation, '') = '' or public.normalize_cost_operation_name(c.operation_name, c.source) = lower(p_operation))
  ),
  top_family as (
    select operation_family
    from facts
    group by 1
    order by sum(cost_usd + (cost_eur * p_whatsapp_eur_to_usd)) desc
    limit 1
  ),
  top_model as (
    select model
    from facts
    group by 1
    order by sum(cost_usd + (cost_eur * p_whatsapp_eur_to_usd)) desc
    limit 1
  )
  select
    p_target_day as target_day,
    coalesce(sum(f.cost_usd), 0)::numeric as ai_cost_usd,
    coalesce(sum(f.cost_eur), 0)::numeric as whatsapp_cost_eur,
    coalesce(sum(f.cost_usd + (f.cost_eur * p_whatsapp_eur_to_usd)), 0)::numeric as total_cost_usd,
    count(*)::bigint as total_calls,
    coalesce(sum(f.total_tokens), 0)::bigint as total_tokens,
    count(distinct f.user_id)::bigint as unique_users,
    (
      select count(*)::bigint
      from public.llm_usage_events ue, day_range d
      where ue.created_at >= d.s
        and ue.created_at < d.e
        and coalesce(ue.cost_unpriced, false) = true
        and (coalesce(p_provider, '') = '' or lower(coalesce(ue.provider, '')) = lower(p_provider))
        and (coalesce(p_model, '') = '' or lower(coalesce(ue.model, '')) = lower(p_model))
        and (coalesce(p_family, '') = '' or public.normalize_cost_operation_family(ue.operation_family, ue.source) = lower(p_family))
        and (coalesce(p_operation, '') = '' or public.normalize_cost_operation_name(ue.operation_name, ue.source) = lower(p_operation))
    ) as unpriced_event_count,
    (select operation_family from top_family) as top_operation_family,
    (select model from top_model) as top_model
  from facts f;
$$;


ALTER FUNCTION "public"."get_admin_daily_cost_synthesis"("p_target_day" "date", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_user_operation_breakdown"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_user_id" "uuid", "p_whatsapp_eur_to_usd" numeric DEFAULT 1.08, "p_provider" "text" DEFAULT NULL::"text", "p_model" "text" DEFAULT NULL::"text", "p_family" "text" DEFAULT NULL::"text", "p_operation" "text" DEFAULT NULL::"text") RETURNS TABLE("operation_family" "text", "operation_name" "text", "source" "text", "provider" "text", "model" "text", "cost_domain" "text", "ai_cost_usd" numeric, "whatsapp_cost_eur" numeric, "total_cost_usd" numeric, "total_calls" bigint, "total_tokens" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with admin_guard as (
    select 1 as ok
    where exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid())
  ),
  base as (
    select *
    from public.cost_fact_events c, admin_guard
    where c.created_at >= p_start
      and c.created_at < p_end
      and c.user_id = p_user_id
      and (coalesce(p_provider, '') = '' or lower(coalesce(c.provider, '')) = lower(p_provider))
      and (coalesce(p_model, '') = '' or lower(coalesce(c.model, '')) = lower(p_model))
      and (coalesce(p_family, '') = '' or public.normalize_cost_operation_family(c.operation_family, c.source) = lower(p_family))
      and (coalesce(p_operation, '') = '' or public.normalize_cost_operation_name(c.operation_name, c.source) = lower(p_operation))
  )
  select
    b.operation_family,
    b.operation_name,
    b.source,
    b.provider,
    b.model,
    b.cost_domain,
    sum(b.cost_usd)::numeric as ai_cost_usd,
    sum(b.cost_eur)::numeric as whatsapp_cost_eur,
    (sum(b.cost_usd) + sum(b.cost_eur) * p_whatsapp_eur_to_usd)::numeric as total_cost_usd,
    count(*)::bigint as total_calls,
    sum(b.total_tokens)::bigint as total_tokens
  from base b
  group by 1,2,3,4,5,6
  order by total_cost_usd desc, total_calls desc;
$$;


ALTER FUNCTION "public"."get_admin_user_operation_breakdown"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_user_id" "uuid", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_user_stats"("period_start" timestamp with time zone) RETURNS TABLE("user_id" "uuid", "full_name" "text", "email" "text", "plans_count" bigint, "messages_count" bigint, "total_cost_usd" numeric, "total_revenue_usd" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid()) then
    raise exception 'Access denied';
  end if;

  return query
  select
    p.id as user_id,
    coalesce(p.full_name, 'Unknown') as full_name,
    coalesce(u.email, 'No Email') as email,
    count(distinct pl.id) as plans_count,
    count(distinct m.id) as messages_count,
    coalesce(sum(ue.cost_usd), 0) as total_cost_usd,
    0::numeric as total_revenue_usd
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.user_plans_v2 pl on pl.user_id = p.id and pl.created_at >= period_start
  left join public.chat_messages m on m.user_id = p.id and m.created_at >= period_start
  left join public.llm_usage_events ue on ue.user_id = p.id and ue.created_at >= period_start
  group by p.id, p.full_name, u.email
  order by total_cost_usd desc, messages_count desc;
end;
$$;


ALTER FUNCTION "public"."get_admin_user_stats"("period_start" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_global_ai_cost"("period_start" timestamp with time zone) RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- Check if the requesting user is an internal admin
  if not exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid()) then
    raise exception 'Access denied';
  end if;

  return (
    select coalesce(sum(cost_usd), 0)
    from public.llm_usage_events
    where created_at >= period_start
  );
end;
$$;


ALTER FUNCTION "public"."get_global_ai_cost"("period_start" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_production_log"("p_since" timestamp with time zone DEFAULT ("now"() - '24:00:00'::interval), "p_limit" integer DEFAULT 200, "p_only_errors" boolean DEFAULT false, "p_source" "text" DEFAULT NULL::"text") RETURNS TABLE("ts" timestamp with time zone, "severity" "text", "source" "text", "event_type" "text", "title" "text", "user_id" "uuid", "details" "jsonb")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- Admin gate
  if not exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid()) then
    raise exception 'forbidden';
  end if;

  return query
  with events as (
    ---------------------------------------------------------------------------
    -- Emails / comms
    ---------------------------------------------------------------------------
    select
      cl.created_at as ts,
      case
        when cl.status = 'failed' then 'error'
        when cl.status in ('sent','delivered') then 'info'
        else 'warn'
      end as severity,
      cl.channel as source,
      cl.type as event_type,
      case
        when cl.status = 'failed' then 'Email failed'
        when cl.status = 'delivered' then 'Email delivered'
        else 'Email sent'
      end || ' · ' || cl.type as title,
      cl.user_id,
      jsonb_build_object(
        'status', cl.status,
        'channel', cl.channel,
        'type', cl.type,
        'metadata', cl.metadata
      ) as details
    from public.communication_logs cl
    where cl.created_at >= p_since

    union all

    ---------------------------------------------------------------------------
    -- Chat activity (web/whatsapp) from chat_messages
    ---------------------------------------------------------------------------
    select
      cm.created_at as ts,
      case
        when (cm.metadata ? 'error') or (cm.metadata ? 'exception') or (cm.metadata ? 'failed') or (cm.metadata ->> 'level') = 'error' then 'error'
        else 'info'
      end as severity,
      coalesce(cm.metadata ->> 'channel', 'web') as source,
      'chat_message' as event_type,
      'Chat · ' ||
        coalesce(cm.metadata ->> 'channel', 'web') ||
        ' · ' || cm.role::text ||
        case when cm.agent_used is not null then ' · ' || cm.agent_used::text else '' end
      as title,
      cm.user_id,
      jsonb_build_object(
        'id', cm.id,
        'role', cm.role,
        'agent_used', cm.agent_used,
        'content_preview', left(cm.content, 180),
        'metadata', cm.metadata
      ) as details
    from public.chat_messages cm
    where cm.created_at >= p_since

    union all

    ---------------------------------------------------------------------------
    -- Scheduled checkins lifecycle
    ---------------------------------------------------------------------------
    select
      coalesce(sc.processed_at, sc.created_at) as ts,
      case
        when sc.status::text in ('cancelled','expired') then 'warn'
        when sc.status::text in ('awaiting_user') then 'warn'
        else 'info'
      end as severity,
      'checkins' as source,
      'scheduled_checkin' as event_type,
      'Scheduled check-in · ' || sc.status::text as title,
      sc.user_id,
      jsonb_build_object(
        'id', sc.id,
        'status', sc.status::text,
        'scheduled_for', sc.scheduled_for,
        'event_context', sc.event_context,
        'processed_at', sc.processed_at
      ) as details
    from public.scheduled_checkins sc
    where coalesce(sc.processed_at, sc.created_at) >= p_since

    union all

    ---------------------------------------------------------------------------
    -- WhatsApp pending actions (used for template flows / throttling)
    ---------------------------------------------------------------------------
    select
      wpa.created_at as ts,
      case
        when wpa.status = 'expired' then 'warn'
        when wpa.status = 'cancelled' then 'warn'
        else 'info'
      end as severity,
      'whatsapp' as source,
      'whatsapp_pending_action' as event_type,
      'WhatsApp pending action · ' || wpa.kind || ' · ' || wpa.status as title,
      wpa.user_id,
      jsonb_build_object(
        'id', wpa.id,
        'kind', wpa.kind,
        'status', wpa.status,
        'scheduled_checkin_id', wpa.scheduled_checkin_id,
        'expires_at', wpa.expires_at,
        'processed_at', wpa.processed_at,
        'payload', wpa.payload
      ) as details
    from public.whatsapp_pending_actions wpa
    where wpa.created_at >= p_since

    union all

    ---------------------------------------------------------------------------
    -- LLM usage (cost/tokens) + potential errors if metadata contains an error field
    ---------------------------------------------------------------------------
    select
      ue.created_at as ts,
      case
        when (ue.metadata ? 'error') or (ue.metadata ? 'exception') or (ue.metadata ? 'failed') then 'error'
        else 'info'
      end as severity,
      coalesce(nullif(split_part(ue.source, ':', 1), ''), 'llm') as source,
      'llm_usage' as event_type,
      'LLM ' || ue.kind || ' · ' || ue.model as title,
      null::uuid as user_id,
      jsonb_build_object(
        'provider', ue.provider,
        'model', ue.model,
        'kind', ue.kind,
        'prompt_tokens', ue.prompt_tokens,
        'output_tokens', ue.output_tokens,
        'total_tokens', ue.total_tokens,
        'cost_usd', ue.cost_usd,
        'request_id', ue.request_id,
        'metadata', ue.metadata
      ) as details
    from public.llm_usage_events ue
    where ue.created_at >= p_since

    union all

    ---------------------------------------------------------------------------
    -- Stripe webhook idempotency events (received)
    ---------------------------------------------------------------------------
    select
      swe.received_at as ts,
      'info' as severity,
      'stripe' as source,
      'stripe_webhook' as event_type,
      'Stripe webhook received' as title,
      null::uuid as user_id,
      jsonb_build_object('event_id', swe.id) as details
    from public.stripe_webhook_events swe
    where swe.received_at >= p_since

    union all

    ---------------------------------------------------------------------------
    -- Evals (helpful for spotting systemic failures during testing)
    ---------------------------------------------------------------------------
    select
      cer.created_at as ts,
      case
        when cer.status = 'failed' or cer.error is not null then 'error'
        else 'info'
      end as severity,
      'evals' as source,
      'conversation_eval_run' as event_type,
      'Eval run · ' || coalesce(cer.scenario_key, cer.dataset_key, 'unknown') as title,
      null::uuid as user_id,
      jsonb_build_object(
        'id', cer.id,
        'status', cer.status,
        'dataset_key', cer.dataset_key,
        'scenario_key', cer.scenario_key,
        'issues_count', coalesce(jsonb_array_length(cer.issues), 0),
        'suggestions_count', coalesce(jsonb_array_length(cer.suggestions), 0),
        'error', cer.error
      ) as details
    from public.conversation_eval_runs cer
    where cer.created_at >= p_since

    union all

    ---------------------------------------------------------------------------
    -- Edge Functions / backend errors
    ---------------------------------------------------------------------------
    select
      sel.created_at as ts,
      sel.severity as severity,
      coalesce(nullif(sel.source, ''), 'edge') as source,
      'edge_function_error' as event_type,
      'Edge error · ' || sel.function_name as title,
      sel.user_id,
      jsonb_build_object(
        'id', sel.id,
        'function_name', sel.function_name,
        'request_id', sel.request_id,
        'message', sel.message,
        'stack', sel.stack,
        'metadata', sel.metadata
      ) as details
    from public.system_error_logs sel
    where sel.created_at >= p_since
  )
  select e.ts, e.severity, e.source, e.event_type, e.title, e.user_id, e.details
  from events e
  where
    (not p_only_errors or e.severity = 'error')
    and (p_source is null or e.source = p_source)
  order by e.ts desc
  limit greatest(1, least(p_limit, 1000));
end;
$$;


ALTER FUNCTION "public"."get_production_log"("p_since" timestamp with time zone, "p_limit" integer, "p_only_errors" boolean, "p_source" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_production_log"("p_since" timestamp with time zone DEFAULT ("now"() - '24:00:00'::interval), "p_limit" integer DEFAULT 200, "p_only_errors" boolean DEFAULT false, "p_source" "text" DEFAULT NULL::"text", "p_include_chat" boolean DEFAULT false) RETURNS TABLE("ts" timestamp with time zone, "severity" "text", "source" "text", "event_type" "text", "title" "text", "user_id" "uuid", "details" "jsonb")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- Admin gate
  if not exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid()) then
    raise exception 'forbidden';
  end if;

  return query
  with events as (
    ---------------------------------------------------------------------------
    -- Emails / comms
    ---------------------------------------------------------------------------
    select
      cl.created_at as ts,
      case
        when cl.status = 'failed' then 'error'
        when cl.status in ('sent','delivered') then 'info'
        else 'warn'
      end as severity,
      cl.channel as source,
      cl.type as event_type,
      case
        when cl.status = 'failed' then 'Email failed'
        when cl.status = 'delivered' then 'Email delivered'
        else 'Email sent'
      end || ' · ' || cl.type as title,
      cl.user_id,
      jsonb_build_object(
        'status', cl.status,
        'channel', cl.channel,
        'type', cl.type,
        'metadata', cl.metadata
      ) as details
    from public.communication_logs cl
    where cl.created_at >= p_since

    union all

    ---------------------------------------------------------------------------
    -- Chat activity (web/whatsapp) from chat_messages (NOISY; gated in outer filter)
    ---------------------------------------------------------------------------
    select
      cm.created_at as ts,
      case
        when (cm.metadata ? 'error') or (cm.metadata ? 'exception') or (cm.metadata ? 'failed') or (cm.metadata ->> 'level') = 'error' then 'error'
        else 'info'
      end as severity,
      coalesce(cm.metadata ->> 'channel', 'web') as source,
      'chat_message' as event_type,
      'Chat · ' ||
        coalesce(cm.metadata ->> 'channel', 'web') ||
        ' · ' || cm.role::text ||
        case when cm.agent_used is not null then ' · ' || cm.agent_used::text else '' end
      as title,
      cm.user_id,
      jsonb_build_object(
        'id', cm.id,
        'role', cm.role,
        'agent_used', cm.agent_used,
        'content_preview', left(cm.content, 180),
        'metadata', cm.metadata
      ) as details
    from public.chat_messages cm
    where cm.created_at >= p_since

    union all

    ---------------------------------------------------------------------------
    -- Scheduled checkins lifecycle
    ---------------------------------------------------------------------------
    select
      coalesce(sc.processed_at, sc.created_at) as ts,
      case
        when sc.status::text in ('cancelled','expired') then 'warn'
        when sc.status::text in ('awaiting_user') then 'warn'
        else 'info'
      end as severity,
      'checkins' as source,
      'scheduled_checkin' as event_type,
      'Scheduled check-in · ' || sc.status::text as title,
      sc.user_id,
      jsonb_build_object(
        'id', sc.id,
        'status', sc.status::text,
        'scheduled_for', sc.scheduled_for,
        'event_context', sc.event_context,
        'processed_at', sc.processed_at
      ) as details
    from public.scheduled_checkins sc
    where coalesce(sc.processed_at, sc.created_at) >= p_since

    union all

    ---------------------------------------------------------------------------
    -- WhatsApp pending actions (used for template flows / throttling)
    ---------------------------------------------------------------------------
    select
      wpa.created_at as ts,
      case
        when wpa.status = 'expired' then 'warn'
        when wpa.status = 'cancelled' then 'warn'
        else 'info'
      end as severity,
      'whatsapp' as source,
      'whatsapp_pending_action' as event_type,
      'WhatsApp pending action · ' || wpa.kind || ' · ' || wpa.status as title,
      wpa.user_id,
      jsonb_build_object(
        'id', wpa.id,
        'kind', wpa.kind,
        'status', wpa.status,
        'scheduled_checkin_id', wpa.scheduled_checkin_id,
        'expires_at', wpa.expires_at,
        'processed_at', wpa.processed_at,
        'payload', wpa.payload
      ) as details
    from public.whatsapp_pending_actions wpa
    where wpa.created_at >= p_since

    union all

    ---------------------------------------------------------------------------
    -- LLM usage (cost/tokens) + potential errors if metadata contains an error field
    ---------------------------------------------------------------------------
    select
      ue.created_at as ts,
      case
        when (ue.metadata ? 'error') or (ue.metadata ? 'exception') or (ue.metadata ? 'failed') then 'error'
        else 'info'
      end as severity,
      coalesce(nullif(split_part(ue.source, ':', 1), ''), 'llm') as source,
      'llm_usage' as event_type,
      'LLM ' || ue.kind || ' · ' || ue.model as title,
      null::uuid as user_id,
      jsonb_build_object(
        'provider', ue.provider,
        'model', ue.model,
        'kind', ue.kind,
        'prompt_tokens', ue.prompt_tokens,
        'output_tokens', ue.output_tokens,
        'total_tokens', ue.total_tokens,
        'cost_usd', ue.cost_usd,
        'request_id', ue.request_id,
        'metadata', ue.metadata
      ) as details
    from public.llm_usage_events ue
    where ue.created_at >= p_since

    union all

    ---------------------------------------------------------------------------
    -- Stripe webhook idempotency events (received)
    ---------------------------------------------------------------------------
    select
      swe.received_at as ts,
      'info' as severity,
      'stripe' as source,
      'stripe_webhook' as event_type,
      'Stripe webhook received' as title,
      null::uuid as user_id,
      jsonb_build_object('event_id', swe.id) as details
    from public.stripe_webhook_events swe
    where swe.received_at >= p_since

    union all

    ---------------------------------------------------------------------------
    -- Evals (helpful for spotting systemic failures during testing)
    ---------------------------------------------------------------------------
    select
      cer.created_at as ts,
      case
        when cer.status = 'failed' or cer.error is not null then 'error'
        else 'info'
      end as severity,
      'evals' as source,
      'conversation_eval_run' as event_type,
      'Eval run · ' || coalesce(cer.scenario_key, cer.dataset_key, 'unknown') as title,
      null::uuid as user_id,
      jsonb_build_object(
        'id', cer.id,
        'status', cer.status,
        'dataset_key', cer.dataset_key,
        'scenario_key', cer.scenario_key,
        'issues_count', coalesce(jsonb_array_length(cer.issues), 0),
        'suggestions_count', coalesce(jsonb_array_length(cer.suggestions), 0),
        'error', cer.error
      ) as details
    from public.conversation_eval_runs cer
    where cer.created_at >= p_since

    union all

    ---------------------------------------------------------------------------
    -- Edge Functions / backend errors
    ---------------------------------------------------------------------------
    select
      sel.created_at as ts,
      sel.severity as severity,
      coalesce(nullif(sel.source, ''), 'edge') as source,
      'edge_function_error' as event_type,
      'Edge error · ' || sel.function_name as title,
      sel.user_id,
      jsonb_build_object(
        'id', sel.id,
        'function_name', sel.function_name,
        'request_id', sel.request_id,
        'message', sel.message,
        'stack', sel.stack,
        'metadata', sel.metadata
      ) as details
    from public.system_error_logs sel
    where sel.created_at >= p_since
  )
  select e.ts, e.severity, e.source, e.event_type, e.title, e.user_id, e.details
  from events e
  where
    (not p_only_errors or e.severity = 'error')
    and (p_source is null or e.source = p_source)
    and (p_include_chat or e.event_type <> 'chat_message')
  order by e.ts desc
  limit greatest(1, least(p_limit, 1000));
end;
$$;


ALTER FUNCTION "public"."get_production_log"("p_since" timestamp with time zone, "p_limit" integer, "p_only_errors" boolean, "p_source" "text", "p_include_chat" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_usage_by_model"("period_start" timestamp with time zone) RETURNS TABLE("model" "text", "total_cost_usd" numeric, "total_tokens" bigint, "call_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- Check if the requesting user is an internal admin
  if not exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid()) then
    raise exception 'Access denied';
  end if;

  return query
  select
    coalesce(ue.model, '(unknown)') as model,
    coalesce(sum(ue.cost_usd), 0) as total_cost_usd,
    coalesce(sum(ue.total_tokens), 0) as total_tokens,
    count(*) as call_count
  from public.llm_usage_events ue
  where ue.created_at >= period_start
  group by 1
  order by total_cost_usd desc;
end;
$$;


ALTER FUNCTION "public"."get_usage_by_model"("period_start" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_usage_by_source"("period_start" timestamp with time zone) RETURNS TABLE("source" "text", "total_cost_usd" numeric, "total_tokens" bigint, "call_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- Check if the requesting user is an internal admin
  if not exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid()) then
    raise exception 'Access denied';
  end if;

  return query
  select
    coalesce(ue.source, '(unknown)') as source,
    coalesce(sum(ue.cost_usd), 0) as total_cost_usd,
    coalesce(sum(ue.total_tokens), 0) as total_tokens,
    count(*) as call_count
  from public.llm_usage_events ue
  where ue.created_at >= period_start
  group by 1
  order by total_cost_usd desc;
end;
$$;


ALTER FUNCTION "public"."get_usage_by_source"("period_start" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_unlocked_principles_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if old.unlocked_principles is distinct from new.unlocked_principles then
    raise exception 'Direct modification of unlocked_principles is not allowed'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."guard_unlocked_principles_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_v2_plan_item_activation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  cond jsonb;
  cond_type text;
  dep_ids uuid[];
  dep_id uuid;
  dep_row public.user_plan_items%rowtype;
  required_count int;
  positive_count int;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if old.status <> 'pending' or new.status <> 'active' then
    return new;
  end if;

  cond := coalesce(new.activation_condition, old.activation_condition);
  cond_type := coalesce(cond->>'type', '');

  if cond is null or cond_type = '' or cond_type = 'immediate' then
    return new;
  end if;

  dep_ids := array[]::uuid[];
  if jsonb_typeof(cond->'depends_on') = 'string' then
    dep_ids := array[(cond->>'depends_on')::uuid];
  elsif jsonb_typeof(cond->'depends_on') = 'array' then
    select coalesce(array_agg(value::uuid), array[]::uuid[])
      into dep_ids
    from jsonb_array_elements_text(cond->'depends_on');
  end if;

  if cond_type in ('after_item_completion', 'after_milestone') then
    if coalesce(array_length(dep_ids, 1), 0) = 0 then
      raise exception 'V2 activation blocked: missing prerequisite items'
        using errcode = 'P0001';
    end if;

    foreach dep_id in array dep_ids loop
      select *
        into dep_row
      from public.user_plan_items
      where id = dep_id
        and plan_id = new.plan_id
        and user_id = new.user_id;

      if not found then
        raise exception 'V2 activation blocked: prerequisite item % not found', dep_id
          using errcode = 'P0001';
      end if;

      if dep_row.status <> 'completed'
         and dep_row.status <> 'in_maintenance'
         and coalesce(dep_row.current_habit_state::text, '') <> 'in_maintenance' then
        raise exception 'V2 activation blocked: prerequisite item % not complete', dep_id
          using errcode = 'P0001';
      end if;
    end loop;

    return new;
  end if;

  if cond_type = 'after_habit_traction' then
    if coalesce(array_length(dep_ids, 1), 0) = 0 then
      raise exception 'V2 activation blocked: missing habit dependency'
        using errcode = 'P0001';
    end if;

    dep_id := dep_ids[1];
    select *
      into dep_row
    from public.user_plan_items
    where id = dep_id
      and plan_id = new.plan_id
      and user_id = new.user_id;

    if not found then
      raise exception 'V2 activation blocked: habit dependency % not found', dep_id
        using errcode = 'P0001';
    end if;

    required_count := greatest(coalesce((cond->>'min_completions')::int, 3), 1);

    select count(*)
      into positive_count
    from public.user_plan_item_entries
    where plan_item_id = dep_id
      and entry_kind in ('checkin', 'progress', 'partial');

    if greatest(coalesce(dep_row.current_reps, 0), coalesce(positive_count, 0)) < required_count then
      raise exception 'V2 activation blocked: habit traction not reached for %', dep_id
        using errcode = 'P0001';
    end if;

    return new;
  end if;

  raise exception 'V2 activation blocked: unsupported activation_condition type %', cond_type
    using errcode = 'P0001';
end;
$$;


ALTER FUNCTION "public"."guard_v2_plan_item_activation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_conversation_scope_memory_message_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  safe_scope text;
begin
  if new.user_id is null then
    return new;
  end if;

  if coalesce(new.role::text, '') not in ('user', 'assistant') then
    return new;
  end if;

  safe_scope := coalesce(nullif(trim(new.scope), ''), 'web');

  if not (
    safe_scope = 'whatsapp' or
    safe_scope like 'module:%' or
    safe_scope like 'story:%' or
    safe_scope like 'reflection:%'
  ) then
    return new;
  end if;

  insert into public.conversation_scope_memories (
    user_id,
    scope,
    summary_text,
    pending_message_count,
    updated_at
  )
  values (
    new.user_id,
    safe_scope,
    '',
    1,
    now()
  )
  on conflict (user_id, scope)
  do update set
    pending_message_count =
      public.conversation_scope_memories.pending_message_count + 1,
    updated_at = now();

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_conversation_scope_memory_message_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_core_identity_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  base_url text;
  url text;
  anon_key text;
  secret text;
begin
  perform set_config('search_path', 'public,extensions', true);

  select value into base_url from public.app_config where key = 'edge_functions_base_url' limit 1;
  base_url := coalesce(base_url, 'https://ybyqxwnwjvuxckolsddn.supabase.co');
  url := base_url || '/functions/v1/update-core-identity';

  select value into anon_key from public.app_config where key = 'edge_functions_anon_key' limit 1;
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'INTERNAL_FUNCTION_SECRET' limit 1;

  if anon_key is null or length(trim(anon_key)) = 0 then
    raise notice '[handle_core_identity_trigger] edge_functions_anon_key missing; skipping edge call.';
    return new;
  end if;
  if secret is null or length(trim(secret)) = 0 then
    raise notice '[handle_core_identity_trigger] INTERNAL_FUNCTION_SECRET missing; skipping edge call.';
    return new;
  end if;

  begin
    perform net.http_post(
      url := url,
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'apikey', anon_key,
        'authorization', 'Bearer ' || anon_key,
        'x-internal-secret', secret,
        'x-supabase-event-type', 'webhook'
      ),
      body := jsonb_build_object(
        'type', TG_OP,
        'table', TG_TABLE_NAME,
        'record', row_to_json(new),
        'old_record', row_to_json(old)
      )
    );
  exception when others then
    raise notice '[handle_core_identity_trigger] net.http_post failed: %', SQLERRM;
  end;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_core_identity_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_forge_level_progression"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  week_id int;
  card_id int;
  level_id int;
  next_module_id text;
  unlock_delay interval := '4 days'; -- Fixed delay between levels
BEGIN
  -- We ONLY proceed if the module is marked as COMPLETED
  -- and it wasn't completed before (or we want to ensure next step exists)
  IF NEW.status = 'completed' AND NEW.completed_at IS NOT NULL THEN
      
      -- Parsing module ID: format a{X}_c{Y}_m{Z}
      week_id := substring(NEW.module_id from 'a(\d+)_')::int;
      card_id := substring(NEW.module_id from '_c(\d+)_')::int;
      level_id := substring(NEW.module_id from '_m(\d+)')::int;

      -- Valid Forge module (Levels 1-4 trigger next level, 5 stops)
      IF week_id IS NOT NULL AND card_id IS NOT NULL AND level_id IS NOT NULL AND level_id < 5 THEN
          
          next_module_id := 'a' || week_id || '_c' || card_id || '_m' || (level_id + 1);

          -- Insert the NEXT module state
          INSERT INTO public.user_module_state_entries (
              user_id,
              module_id,
              status,
              available_at,
              updated_at,
              completed_at,
              content
          )
          VALUES (
              NEW.user_id,
              next_module_id,
              'available',
              NEW.completed_at + unlock_delay,
              now(),
              NULL,
              '{}'::jsonb -- FIX: Insert empty JSON object instead of NULL
          )
          ON CONFLICT (user_id, module_id) 
          DO NOTHING; 

      END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_forge_level_progression"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_module_activity_unlock"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  week_num integer;
  current_week_id text;
  next_week_id text;
  current_state_id uuid;
  is_first_update boolean;
  total_questions integer;
  answered_questions integer;
  week_start_date timestamptz;
begin
  week_num := substring(new.module_id from '^a(\d+)')::integer;

  if week_num is not null then
    current_week_id := 'week_' || week_num;
    next_week_id := 'week_' || (week_num + 1);

    select id, first_updated_at is null, first_updated_at
    into current_state_id, is_first_update, week_start_date
    from public.user_week_states
    where user_id = new.user_id and module_id = current_week_id;

    if current_state_id is not null then
      update public.user_week_states
      set updated_at = now()
      where id = current_state_id;

      if is_first_update then
        update public.user_week_states
        set first_updated_at = now()
        where id = current_state_id;

        week_start_date := now();

        if week_num < 12 then
          insert into public.user_week_states (user_id, module_id, status, available_at)
          values (
            new.user_id,
            next_week_id,
            'available',
            now() + interval '7 days'
          )
          on conflict (user_id, module_id) do nothing;
        elsif week_num = 12 then
          insert into public.user_week_states (user_id, module_id, status, available_at)
          values (
            new.user_id,
            'forge_access',
            'available',
            now() + interval '7 days'
          )
          on conflict (user_id, module_id) do nothing;
        end if;
      end if;

      if week_num = 1 then
        total_questions := 4;
      else
        total_questions := 3;
      end if;

      select count(distinct module_id) into answered_questions
      from public.user_module_state_entries
      where user_id = new.user_id
      and module_id like 'a' || week_num || '_c%_m1';

      if answered_questions >= total_questions then
        update public.user_week_states
        set status = 'completed',
            completed_at = now()
        where id = current_state_id
        and status != 'completed';
      end if;
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_module_activity_unlock"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_module_entry_archive"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Check if content ACTUALLY changed
  -- We cast to text to compare JSONB content easily, or use standard operator
  IF NEW.content IS DISTINCT FROM OLD.content THEN
      
      -- Optional: Don't archive if the OLD content was empty/null (initial state)
      -- If you want to keep history from the very first draft, remove this check.
      -- But usually, archiving "empty" -> "draft 1" is useless.
      IF OLD.content IS NOT NULL AND OLD.content::text != '{}'::text AND OLD.content::text != '{"content": ""}' THEN
          
          INSERT INTO public.user_module_archives (
              entry_id, 
              user_id, 
              module_id, 
              content, 
              archived_at
          )
          VALUES (
              OLD.id, 
              OLD.user_id, 
              OLD.module_id, 
              OLD.content, 
              now()
          );
          
      END IF;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_module_entry_archive"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_module_memory_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  base_url text;
  url text;
  anon_key text;
  secret text;
begin
  perform set_config('search_path', 'public,extensions', true);

  select value into base_url from public.app_config where key = 'edge_functions_base_url' limit 1;
  base_url := coalesce(base_url, 'https://ybyqxwnwjvuxckolsddn.supabase.co');
  url := base_url || '/functions/v1/create-module-memory';

  select value into anon_key from public.app_config where key = 'edge_functions_anon_key' limit 1;
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'INTERNAL_FUNCTION_SECRET' limit 1;

  if anon_key is null or length(trim(anon_key)) = 0 then
    raise notice '[handle_module_memory_trigger] edge_functions_anon_key missing; skipping edge call.';
    return new;
  end if;
  if secret is null or length(trim(secret)) = 0 then
    raise notice '[handle_module_memory_trigger] INTERNAL_FUNCTION_SECRET missing; skipping edge call.';
    return new;
  end if;

  begin
    perform net.http_post(
      url := url,
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'apikey', anon_key,
        'authorization', 'Bearer ' || anon_key,
        'x-internal-secret', secret,
        'x-supabase-event-type', 'webhook'
      ),
      body := jsonb_build_object(
        'type', TG_OP,
        'table', TG_TABLE_NAME,
        'record', row_to_json(new),
        'old_record', row_to_json(old)
      )
    );
  exception when others then
    raise notice '[handle_module_memory_trigger] net.http_post failed: %', SQLERRM;
  end;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_module_memory_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_profile_welcome_email"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  base_url text;
  url text;
  anon_key text;
  secret text;
begin
  -- Base URL
  select value into base_url
  from public.app_config
  where key = 'edge_functions_base_url'
  limit 1;

  -- Safe fallback (should be overridden by app_config in each environment)
  base_url := coalesce(base_url, 'https://ybyqxwnwjvuxckolsddn.supabase.co');
  url := base_url || '/functions/v1/send-welcome-email';

  -- Anon key (for Kong)
  select value into anon_key
  from public.app_config
  where key = 'edge_functions_anon_key'
  limit 1;

  -- Internal secret (for ensureInternalRequest)
  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'INTERNAL_FUNCTION_SECRET'
  limit 1;

  if anon_key is null or length(trim(anon_key)) = 0 then
    raise notice 'edge_functions_anon_key missing; skipping welcome email.';
    return new;
  end if;

  if secret is null or length(trim(secret)) = 0 then
    raise notice 'INTERNAL_FUNCTION_SECRET missing; skipping welcome email.';
    return new;
  end if;

  -- Never block signup if the HTTP call fails.
  begin
    perform net.http_post(
      url := url,
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'apikey', anon_key,
        'authorization', 'Bearer ' || anon_key,
        'x-internal-secret', secret
      ),
      body := jsonb_build_object(
        'record', row_to_json(new),
        'type', 'INSERT',
        'table', 'profiles'
      )
    );
  exception when others then
    raise notice 'Warning: Welcome email trigger failed (ignored): %', SQLERRM;
  end;

  return new;
exception when others then
  raise notice 'Warning: Welcome email trigger failed (ignored): %', SQLERRM;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_profile_welcome_email"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_phone text;
  v_existing_profile_id uuid;
begin
  -- Extract and normalize phone from metadata
  v_phone := nullif(coalesce(new.raw_user_meta_data->>'phone', new.phone, ''), '');

  -- Check if this phone is already used by a verified or WhatsApp-active profile
  if v_phone is not null then
    select p.id into v_existing_profile_id
    from public.profiles p
    where p.phone_number = v_phone
      and (p.phone_verified_at is not null or p.whatsapp_opted_in = true)
    limit 1;

    if v_existing_profile_id is not null then
      raise exception 'Ce numéro de téléphone est déjà utilisé par un autre compte.'
        using errcode = 'unique_violation';
    end if;
  end if;

  -- Insert the new profile
  insert into public.profiles (id, full_name, avatar_url, phone_number, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', ''),
    v_phone,
    new.email
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    avatar_url = excluded.avatar_url,
    phone_number = excluded.phone_number,
    email = excluded.email,
    updated_at = now();

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_user_architect_quotes_write"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.quote_text := btrim(coalesce(new.quote_text, ''));
  new.author := nullif(btrim(coalesce(new.author, '')), '');
  new.source_context := nullif(btrim(coalesce(new.source_context, '')), '');
  new.tags := public.normalize_architect_quote_tags(coalesce(new.tags, '{}'::text[]));
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_user_architect_quotes_write"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_user_architect_reflections_write"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.title := btrim(coalesce(new.title, ''));
  new.content := btrim(coalesce(new.content, ''));

  if new.title = '' and new.content <> '' then
    new.title := 'Sans titre';
  end if;

  new.tags := public.normalize_architect_reflection_tags(coalesce(new.tags, '{}'::text[]));
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_user_architect_reflections_write"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_user_architect_stories_write"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.title := btrim(coalesce(new.title, ''));
  new.duration_label := nullif(btrim(coalesce(new.duration_label, '')), '');
  new.bullet_points := public.normalize_architect_story_bullet_points(coalesce(new.bullet_points, '{}'::text[]));
  new.speech_map := btrim(regexp_replace(coalesce(new.speech_map, ''), E'\\r\\n?', E'\n', 'g'));
  new.topic_tags := public.normalize_architect_story_tags(coalesce(new.topic_tags, '{}'::text[]));
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_user_architect_stories_write"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_user_chat_state_synthesizer_threshold"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  threshold int := 15;
  old_count int := 0;
  new_count int := 0;
  safe_scope text;
begin
  old_count := coalesce(old.unprocessed_msg_count, 0);
  new_count := coalesce(new.unprocessed_msg_count, 0);
  safe_scope := coalesce(nullif(trim(new.scope), ''), 'web');

  if new.user_id is null then
    return new;
  end if;

  if (
    safe_scope = 'whatsapp' or
    safe_scope like 'module:%' or
    safe_scope like 'story:%' or
    safe_scope like 'reflection:%'
  ) then
    return new;
  end if;

  if new_count >= threshold and old_count < threshold then
    perform public.request_trigger_synthesizer_for_state(new.user_id, safe_scope);
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_user_chat_state_synthesizer_threshold"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_user_email_confirmed_onboarding"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  base_url text;
  anon_key text;
  secret text;
  welcome_url text;
  wa_optin_url text;
begin
  -- React only when email is confirmed:
  -- - INSERT with email_confirmed_at already set
  -- - UPDATE where email_confirmed_at transitions null -> non-null
  if tg_op not in ('INSERT', 'UPDATE') then
    return new;
  end if;

  if new.email_confirmed_at is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.email_confirmed_at is not null then
    return new;
  end if;

  -- Base URL + headers for Edge function gateway.
  begin
    select value into base_url
    from public.app_config
    where key = 'edge_functions_base_url'
    limit 1;
  exception when others then
    base_url := null;
  end;
  base_url := coalesce(base_url, 'https://ybyqxwnwjvuxckolsddn.supabase.co');

  begin
    select value into anon_key
    from public.app_config
    where key = 'edge_functions_anon_key'
    limit 1;
  exception when others then
    anon_key := null;
  end;

  begin
    select decrypted_secret into secret
    from vault.decrypted_secrets
    where name = 'INTERNAL_FUNCTION_SECRET'
    limit 1;
  exception when others then
    secret := null;
  end;

  if anon_key is null or length(trim(anon_key)) = 0 then
    raise notice 'edge_functions_anon_key missing; skipping email-confirmed onboarding dispatch.';
    return new;
  end if;

  if secret is null or length(trim(secret)) = 0 then
    raise notice 'INTERNAL_FUNCTION_SECRET missing; skipping email-confirmed onboarding dispatch.';
    return new;
  end if;

  welcome_url := base_url || '/functions/v1/send-welcome-email';
  wa_optin_url := base_url || '/functions/v1/whatsapp-optin';

  -- Best effort only: never block auth update.
  begin
    perform net.http_post(
      url := welcome_url,
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'apikey', anon_key,
        'authorization', 'Bearer ' || anon_key,
        'x-internal-secret', secret
      ),
      body := jsonb_build_object(
        'record', jsonb_build_object(
          'id', new.id,
          'email', new.email,
          'full_name', coalesce(new.raw_user_meta_data->>'full_name', '')
        ),
        'type', 'UPDATE',
        'table', 'auth.users',
        'reason', 'email_confirmed'
      )
    );
  exception when others then
    raise notice 'Warning: send-welcome-email dispatch failed (ignored): %', SQLERRM;
  end;

  begin
    perform net.http_post(
      url := wa_optin_url,
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'apikey', anon_key,
        'authorization', 'Bearer ' || anon_key,
        'x-internal-secret', secret
      ),
      body := jsonb_build_object(
        'user_id', new.id,
        'reason', 'email_confirmed'
      )
    );
  exception when others then
    raise notice 'Warning: whatsapp-optin dispatch failed (ignored): %', SQLERRM;
  end;

  return new;
exception when others then
  raise notice 'Warning: email-confirmed onboarding trigger failed (ignored): %', SQLERRM;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_user_email_confirmed_onboarding"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_user_email_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.profiles
  set email = new.email,
      updated_at = now()
  where id = new.id;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_user_email_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_v2_principle_unlock_from_entry"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.entry_kind in ('skip', 'blocker') then
    perform public.unlock_transformation_principle(
      new.user_id,
      new.transformation_id,
      'wabi_sabi'
    );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_v2_principle_unlock_from_entry"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_v2_principle_unlock_from_item_transition"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if (
    coalesce(old.status::text, '') <> 'in_maintenance' and new.status = 'in_maintenance'
  ) or (
    coalesce(old.current_habit_state::text, '') <> 'in_maintenance' and new.current_habit_state = 'in_maintenance'
  ) then
    perform public.unlock_transformation_principle(
      new.user_id,
      new.transformation_id,
      'hara_hachi_bu'
    );
  end if;

  if (
    coalesce(old.status::text, '') <> 'stalled' and new.status = 'stalled'
  ) or (
    coalesce(old.current_habit_state::text, '') <> 'stalled' and new.current_habit_state = 'stalled'
  ) then
    perform public.unlock_transformation_principle(
      new.user_id,
      new.transformation_id,
      'gambaru'
    );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_v2_principle_unlock_from_item_transition"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_week12_manual_unlock"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.module_id = 'week_12'
     and new.status = 'available'
     and new.available_at <= now()
  then
    insert into public.user_week_states (user_id, module_id, status, available_at)
    values (
      new.user_id,
      'forge_access',
      'available',
      now() + interval '7 days'
    )
    on conflict (user_id, module_id) do nothing;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_week12_manual_unlock"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_whatsapp_scheduling_access_tier_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  was_eligible boolean := false;
  is_eligible boolean := false;
  should_queue_access_ended boolean := false;
begin
  was_eligible := public.whatsapp_scheduling_access_eligible(old.access_tier);
  is_eligible := public.whatsapp_scheduling_access_eligible(new.access_tier);
  should_queue_access_ended :=
    lower(coalesce(new.access_tier, '')) = 'none'
    and lower(coalesce(old.access_tier, '')) in ('trial', 'system', 'alliance', 'architecte');

  if should_queue_access_ended then
    perform public.queue_whatsapp_access_ended_notification(new.id, old.access_tier, new.access_tier);
  end if;

  if was_eligible = is_eligible then
    return new;
  end if;

  if not is_eligible then
    perform public.cleanup_whatsapp_scheduling_for_user(new.id);
    return new;
  end if;

  if coalesce(new.whatsapp_opted_in, false) then
    perform public.request_morning_active_action_checkins_refresh(new.id);
    perform public.request_recurring_reminder_checkins_refresh(new.id, true);
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_whatsapp_scheduling_access_tier_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_app_write_access"("uid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  t_end timestamptz;
  disable_gate boolean := false;
begin
  if uid is null then
    return false;
  end if;

  if exists (
    select 1
    from public.internal_admins ia
    where ia.user_id = uid
  ) then
    return true;
  end if;

  begin
    select
      case
        when lower(trim(c.value)) in ('1','true','t','yes','y','on') then true
        else false
      end
    into disable_gate
    from public.app_config c
    where c.key = 'disable_write_gate'
    limit 1;
  exception when others then
    disable_gate := false;
  end;

  if disable_gate then
    return true;
  end if;

  select p.trial_end into t_end
  from public.profiles p
  where p.id = uid;

  if t_end is not null and now() < t_end then
    return true;
  end if;

  if exists (
    select 1
    from public.subscriptions s
    where s.user_id = uid
      and lower(coalesce(s.status, '')) in ('active', 'trialing')
      and (s.current_period_end is null or now() < s.current_period_end)
  ) then
    return true;
  end if;

  return false;
end;
$$;


ALTER FUNCTION "public"."has_app_write_access"("uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."initialize_user_modules"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- Insert ONLY the first module/week state for a new user.
  insert into public.user_week_states (user_id, module_id, status, available_at)
  values (new.id, 'week_1', 'available', now())
  on conflict (user_id, module_id) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."initialize_user_modules"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_verified_phone_in_use"("p_phone" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.phone_number = p_phone
      and (p.phone_verified_at is not null or p.whatsapp_opted_in = true)
  );
$$;


ALTER FUNCTION "public"."is_verified_phone_in_use"("p_phone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_conversation_event"("p_eval_run_id" "uuid" DEFAULT NULL::"uuid", "p_request_id" "text" DEFAULT NULL::"text", "p_source" "text" DEFAULT 'unknown'::"text", "p_event" "text" DEFAULT 'event'::"text", "p_level" "text" DEFAULT 'info'::"text", "p_payload" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  caller_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  caller_uid uuid := auth.uid();
  safe_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  payload_size int;
begin
  if p_request_id is null or btrim(p_request_id) = '' then
    return;
  end if;

  if caller_role <> 'service_role' then
    if caller_uid is null then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    if not exists (
      select 1
      from public.internal_admins ia
      where ia.user_id = caller_uid
    ) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  payload_size := pg_column_size(safe_payload);
  if payload_size > 16384 then
    safe_payload := jsonb_build_object(
      'truncated', true,
      'reason', 'payload_too_large',
      'size_bytes', payload_size
    );
  end if;

  insert into public.conversation_eval_events (eval_run_id, request_id, source, event, level, payload)
  values (
    p_eval_run_id,
    btrim(p_request_id),
    left(coalesce(p_source, 'unknown'), 80),
    left(coalesce(p_event, 'event'), 120),
    case when p_level in ('debug','info','warn','error') then p_level else 'info' end,
    safe_payload
  );
end;
$$;


ALTER FUNCTION "public"."log_conversation_event"("p_eval_run_id" "uuid", "p_request_id" "text", "p_source" "text", "p_event" "text", "p_level" "text", "p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_turn_summary_log"("p_request_id" "text", "p_user_id" "uuid", "p_channel" "text", "p_scope" "text", "p_payload" "jsonb", "p_latency_total_ms" integer DEFAULT NULL::integer, "p_latency_dispatcher_ms" integer DEFAULT NULL::integer, "p_latency_context_ms" integer DEFAULT NULL::integer, "p_latency_agent_ms" integer DEFAULT NULL::integer, "p_dispatcher_model" "text" DEFAULT NULL::"text", "p_dispatcher_safety" "text" DEFAULT NULL::"text", "p_dispatcher_intent" "text" DEFAULT NULL::"text", "p_dispatcher_intent_conf" real DEFAULT NULL::real, "p_dispatcher_interrupt" "text" DEFAULT NULL::"text", "p_dispatcher_topic_depth" "text" DEFAULT NULL::"text", "p_dispatcher_flow_resolution" "text" DEFAULT NULL::"text", "p_context_profile" "text" DEFAULT NULL::"text", "p_context_elements" "text"[] DEFAULT NULL::"text"[], "p_context_tokens" integer DEFAULT NULL::integer, "p_target_dispatcher" "text" DEFAULT NULL::"text", "p_target_initial" "text" DEFAULT NULL::"text", "p_target_final" "text" DEFAULT NULL::"text", "p_risk_score" integer DEFAULT NULL::integer, "p_agent_model" "text" DEFAULT NULL::"text", "p_agent_outcome" "text" DEFAULT NULL::"text", "p_agent_tool" "text" DEFAULT NULL::"text", "p_checkup_active" boolean DEFAULT NULL::boolean, "p_toolflow_active" boolean DEFAULT NULL::boolean, "p_supervisor_stack_top" "text" DEFAULT NULL::"text", "p_aborted" boolean DEFAULT false, "p_abort_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  caller_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  if p_request_id is null or btrim(p_request_id) = '' then
    return;
  end if;

  if p_channel not in ('web', 'whatsapp') then
    return;
  end if;

  -- Guardrails:
  -- - For user-authenticated calls: require p_user_id == auth.uid()
  -- - For server-side contexts (WhatsApp webhook): allow service_role to specify p_user_id
  if caller_role <> 'service_role' then
    if p_user_id is null or p_user_id <> auth.uid() then
      return;
    end if;
  else
    if p_user_id is null then
      return;
    end if;
  end if;

  insert into public.turn_summary_logs (
    request_id,
    user_id,
    channel,
    scope,
    latency_total_ms,
    latency_dispatcher_ms,
    latency_context_ms,
    latency_agent_ms,
    dispatcher_model,
    dispatcher_safety,
    dispatcher_intent,
    dispatcher_intent_conf,
    dispatcher_interrupt,
    dispatcher_topic_depth,
    dispatcher_flow_resolution,
    context_profile,
    context_elements,
    context_tokens,
    target_dispatcher,
    target_initial,
    target_final,
    risk_score,
    agent_model,
    agent_outcome,
    agent_tool,
    checkup_active,
    toolflow_active,
    supervisor_stack_top,
    aborted,
    abort_reason,
    payload
  ) values (
    btrim(p_request_id),
    p_user_id,
    p_channel,
    coalesce(p_scope, 'unknown'),
    p_latency_total_ms,
    p_latency_dispatcher_ms,
    p_latency_context_ms,
    p_latency_agent_ms,
    p_dispatcher_model,
    p_dispatcher_safety,
    p_dispatcher_intent,
    p_dispatcher_intent_conf,
    p_dispatcher_interrupt,
    p_dispatcher_topic_depth,
    p_dispatcher_flow_resolution,
    p_context_profile,
    p_context_elements,
    p_context_tokens,
    p_target_dispatcher,
    p_target_initial,
    p_target_final,
    p_risk_score,
    p_agent_model,
    p_agent_outcome,
    p_agent_tool,
    p_checkup_active,
    p_toolflow_active,
    p_supervisor_stack_top,
    coalesce(p_aborted, false),
    p_abort_reason,
    coalesce(p_payload, '{}'::jsonb)
  );
end;
$$;


ALTER FUNCTION "public"."log_turn_summary_log"("p_request_id" "text", "p_user_id" "uuid", "p_channel" "text", "p_scope" "text", "p_payload" "jsonb", "p_latency_total_ms" integer, "p_latency_dispatcher_ms" integer, "p_latency_context_ms" integer, "p_latency_agent_ms" integer, "p_dispatcher_model" "text", "p_dispatcher_safety" "text", "p_dispatcher_intent" "text", "p_dispatcher_intent_conf" real, "p_dispatcher_interrupt" "text", "p_dispatcher_topic_depth" "text", "p_dispatcher_flow_resolution" "text", "p_context_profile" "text", "p_context_elements" "text"[], "p_context_tokens" integer, "p_target_dispatcher" "text", "p_target_initial" "text", "p_target_final" "text", "p_risk_score" integer, "p_agent_model" "text", "p_agent_outcome" "text", "p_agent_tool" "text", "p_checkup_active" boolean, "p_toolflow_active" boolean, "p_supervisor_stack_top" "text", "p_aborted" boolean, "p_abort_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_proactive_job_sent"("p_job" "text", "p_user_id" "uuid", "p_local_date" "date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.proactive_job_state (user_id, job, last_sent_local_date, last_sent_at)
  values (p_user_id, p_job, p_local_date, now())
  on conflict (user_id, job) do update
  set
    last_sent_local_date = excluded.last_sent_local_date,
    last_sent_at = excluded.last_sent_at;
end;
$$;


ALTER FUNCTION "public"."mark_proactive_job_sent"("p_job" "text", "p_user_id" "uuid", "p_local_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_proactive_job_sent_batch"("p_job" "text", "p_user_ids" "uuid"[], "p_local_dates" "date"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_user_ids is null or p_local_dates is null then
    return;
  end if;
  if array_length(p_user_ids, 1) is distinct from array_length(p_local_dates, 1) then
    raise exception 'mark_proactive_job_sent_batch: arrays must have same length';
  end if;

  insert into public.proactive_job_state (user_id, job, last_sent_local_date, last_sent_at)
  select
    u as user_id,
    p_job as job,
    d as last_sent_local_date,
    now() as last_sent_at
  from unnest(p_user_ids, p_local_dates) as t(u, d)
  on conflict (user_id, job) do update
  set
    last_sent_local_date = excluded.last_sent_local_date,
    last_sent_at = excluded.last_sent_at;
end;
$$;


ALTER FUNCTION "public"."mark_proactive_job_sent_batch"("p_job" "text", "p_user_ids" "uuid"[], "p_local_dates" "date"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_core_identity_by_embedding"("target_user_id" "uuid", "query_embedding" "public"."vector", "match_threshold" double precision DEFAULT 0.52, "match_count" integer DEFAULT 2) RETURNS TABLE("id" "uuid", "week_id" "text", "content" "text", "similarity" double precision, "last_updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  caller_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  if caller_role <> 'service_role' and auth.uid() <> target_user_id then
    raise exception 'forbidden';
  end if;

  return query
  select
    uci.id,
    uci.week_id,
    uci.content,
    1 - (uci.identity_embedding <=> query_embedding) as similarity,
    uci.last_updated_at
  from public.user_core_identity uci
  where uci.user_id = target_user_id
    and uci.identity_embedding is not null
    and 1 - (uci.identity_embedding <=> query_embedding) > match_threshold
  order by uci.identity_embedding <=> query_embedding
  limit greatest(1, match_count);
end;
$$;


ALTER FUNCTION "public"."match_core_identity_by_embedding"("target_user_id" "uuid", "query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."maybe_add_master_admin_from_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  u_email text;
begin
  select lower(email)
    into u_email
  from auth.users
  where id = new.id;

  if u_email = 'thomasgenty15@gmail.com' then
    insert into public.internal_admins (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."maybe_add_master_admin_from_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_architect_quote_tags"("input_tags" "text"[]) RETURNS "text"[]
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  raw_tag text;
  cleaned_tag text;
  result_tags text[] := '{}'::text[];
  seen_tags text[] := '{}'::text[];
begin
  if input_tags is null then
    return '{}'::text[];
  end if;

  foreach raw_tag in array input_tags loop
    cleaned_tag := nullif(btrim(coalesce(raw_tag, '')), '');
    if cleaned_tag is null then
      continue;
    end if;

    if lower(cleaned_tag) = any(seen_tags) then
      continue;
    end if;

    seen_tags := array_append(seen_tags, lower(cleaned_tag));
    result_tags := array_append(result_tags, cleaned_tag);
  end loop;

  return result_tags;
end;
$$;


ALTER FUNCTION "public"."normalize_architect_quote_tags"("input_tags" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_architect_reflection_tags"("input_tags" "text"[]) RETURNS "text"[]
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  raw_tag text;
  cleaned_tag text;
  result_tags text[] := '{}'::text[];
  seen_tags text[] := '{}'::text[];
begin
  if input_tags is null then
    return '{}'::text[];
  end if;

  foreach raw_tag in array input_tags loop
    cleaned_tag := nullif(btrim(coalesce(raw_tag, '')), '');
    if cleaned_tag is null then
      continue;
    end if;

    if lower(cleaned_tag) = any(seen_tags) then
      continue;
    end if;

    seen_tags := array_append(seen_tags, lower(cleaned_tag));
    result_tags := array_append(result_tags, cleaned_tag);
  end loop;

  return result_tags;
end;
$$;


ALTER FUNCTION "public"."normalize_architect_reflection_tags"("input_tags" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_architect_story_bullet_points"("input_points" "text"[]) RETURNS "text"[]
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  raw_point text;
  cleaned_point text;
  result_points text[] := '{}'::text[];
begin
  if input_points is null then
    return '{}'::text[];
  end if;

  foreach raw_point in array input_points loop
    cleaned_point := nullif(regexp_replace(btrim(coalesce(raw_point, '')), '\s+', ' ', 'g'), '');
    if cleaned_point is null then
      continue;
    end if;

    result_points := array_append(result_points, cleaned_point);
  end loop;

  return result_points;
end;
$$;


ALTER FUNCTION "public"."normalize_architect_story_bullet_points"("input_points" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_architect_story_tags"("input_tags" "text"[]) RETURNS "text"[]
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  raw_tag text;
  cleaned_tag text;
  result_tags text[] := '{}'::text[];
  seen_tags text[] := '{}'::text[];
begin
  if input_tags is null then
    return '{}'::text[];
  end if;

  foreach raw_tag in array input_tags loop
    cleaned_tag := nullif(regexp_replace(btrim(coalesce(raw_tag, '')), '\s+', ' ', 'g'), '');
    if cleaned_tag is null then
      continue;
    end if;

    if lower(cleaned_tag) = any(seen_tags) then
      continue;
    end if;

    seen_tags := array_append(seen_tags, lower(cleaned_tag));
    result_tags := array_append(result_tags, cleaned_tag);
  end loop;

  return result_tags;
end;
$$;


ALTER FUNCTION "public"."normalize_architect_story_tags"("input_tags" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_cost_operation_family"("p_operation_family" "text", "p_source" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case
    when lower(trim(coalesce(p_operation_family, ''))) not in ('', 'other') then lower(trim(p_operation_family))
    when lower(coalesce(p_source, '')) like '%embed%' then 'embedding'
    when lower(coalesce(p_source, '')) like '%generate-plan%' or lower(coalesce(p_source, '')) like '%plan%' then 'plan_generation'
    when lower(coalesce(p_source, '')) like '%dispatcher%' then 'dispatcher'
    when lower(coalesce(p_source, '')) like '%summary%' then 'summarize_context'
    when lower(coalesce(p_source, '')) like '%ethical%' then 'ethics_check'
    when lower(coalesce(p_source, '')) like '%companion%' or lower(coalesce(p_source, '')) like '%firefighter%' or lower(coalesce(p_source, '')) like '%sentry%' then 'message_generation'
    when lower(coalesce(p_source, '')) like '%memorizer%' or lower(coalesce(p_source, '')) like '%topic_memory%' or lower(coalesce(p_source, '')) like '%topic_%' or lower(coalesce(p_source, '')) like '%synthesizer%' then 'memorizer'
    when lower(coalesce(p_source, '')) like '%watcher%' then 'watcher'
    when lower(coalesce(p_source, '')) like '%schedule%' or lower(coalesce(p_source, '')) like '%checkin%' or lower(coalesce(p_source, '')) like '%reminder%' then 'scheduling'
    when lower(coalesce(p_source, '')) like '%duplicate%' then 'duplicate_check'
    else 'other'
  end
$$;


ALTER FUNCTION "public"."normalize_cost_operation_family"("p_operation_family" "text", "p_source" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_cost_operation_name"("p_operation_name" "text", "p_source" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select lower(trim(coalesce(nullif(p_operation_name, ''), nullif(p_source, ''), 'unknown')))
$$;


ALTER FUNCTION "public"."normalize_cost_operation_name"("p_operation_name" "text", "p_source" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."on_profile_created_seed_default_coach_preferences"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.seed_default_coach_preferences(new.id);
  return new;
end;
$$;


ALTER FUNCTION "public"."on_profile_created_seed_default_coach_preferences"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."queue_whatsapp_access_ended_notification"("p_user_id" "uuid", "p_previous_access_tier" "text", "p_new_access_tier" "text" DEFAULT 'none'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  ended_reason text;
  profile_whatsapp_opted_in boolean;
  profile_phone_invalid boolean;
  profile_phone_number text;
begin
  if p_user_id is null then
    return;
  end if;

  if lower(coalesce(p_new_access_tier, '')) <> 'none' then
    return;
  end if;

  ended_reason :=
    case
      when lower(coalesce(p_previous_access_tier, '')) = 'trial' then 'trial_ended'
      when lower(coalesce(p_previous_access_tier, '')) in ('system', 'alliance', 'architecte') then 'subscription_ended'
      else null
    end;

  if ended_reason is null then
    return;
  end if;

  select
    p.whatsapp_opted_in,
    p.phone_invalid,
    p.phone_number
  into
    profile_whatsapp_opted_in,
    profile_phone_invalid,
    profile_phone_number
  from public.profiles p
  where p.id = p_user_id
  limit 1;

  if coalesce(profile_whatsapp_opted_in, false) is not true
     or coalesce(profile_phone_invalid, false) is true
     or coalesce(profile_phone_number, '') = '' then
    return;
  end if;

  update public.whatsapp_pending_actions
  set
    status = 'cancelled',
    processed_at = now()
  where user_id = p_user_id
    and status = 'pending'
    and kind in ('access_ended_notification', 'access_reactivation_offer');

  insert into public.whatsapp_pending_actions (
    user_id,
    kind,
    status,
    payload,
    expires_at
  )
  values (
    p_user_id,
    'access_ended_notification',
    'pending',
    jsonb_build_object(
      'ended_reason', ended_reason,
      'from_access_tier', lower(coalesce(p_previous_access_tier, '')),
      'to_access_tier', 'none',
      'upgrade_path', '/upgrade',
      'source', 'access_tier_transition'
    ),
    now() + interval '14 days'
  );
end;
$$;


ALTER FUNCTION "public"."queue_whatsapp_access_ended_notification"("p_user_id" "uuid", "p_previous_access_tier" "text", "p_new_access_tier" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recompute_my_access_tier"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  uid uuid;
  tier text;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'Unauthorized';
  end if;

  perform public.recompute_profile_access_tier(uid);

  select p.access_tier into tier
  from public.profiles p
  where p.id = uid;

  return coalesce(tier, 'none');
end;
$$;


ALTER FUNCTION "public"."recompute_my_access_tier"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recompute_profile_access_tier"("uid" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  t_end timestamptz;
  sub_status text;
  sub_end timestamptz;
  sub_tier text;
  sub_active boolean;
  next_tier text;
begin
  if uid is null then
    return;
  end if;

  select p.trial_end into t_end
  from public.profiles p
  where p.id = uid;

  select s.status, s.current_period_end, s.tier
    into sub_status, sub_end, sub_tier
  from public.subscriptions s
  where s.user_id = uid;

  sub_active :=
    (lower(coalesce(sub_status,'')) in ('active','trialing'))
    and (sub_end is null or now() < sub_end);

  if sub_active and sub_tier is not null and sub_tier in ('system','alliance','architecte') then
    next_tier := sub_tier;
  elsif t_end is not null and now() < t_end then
    next_tier := 'trial';
  else
    next_tier := 'none';
  end if;

  update public.profiles
  set access_tier = next_tier
  where id = uid;
end;
$$;


ALTER FUNCTION "public"."recompute_profile_access_tier"("uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recompute_time_based_access_tiers"("p_limit" integer DEFAULT 5000) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  r record;
  processed int := 0;
  capped_limit int := greatest(1, least(coalesce(p_limit, 5000), 50000));
begin
  for r in
    select p.id
    from public.profiles p
    where p.access_tier <> 'none'
    order by p.id
    limit capped_limit
  loop
    perform public.recompute_profile_access_tier(r.id);
    processed := processed + 1;
  end loop;

  return processed;
end;
$$;


ALTER FUNCTION "public"."recompute_time_based_access_tiers"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_whatsapp_monthly_quota"("p_user_id" "uuid", "p_quota_key" "text", "p_month_key" "text") RETURNS TABLE("used_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_used_count integer;
begin
  update public.whatsapp_monthly_quotas
  set
    used_count = greatest(public.whatsapp_monthly_quotas.used_count - 1, 0),
    updated_at = now()
  where user_id = p_user_id
    and quota_key = p_quota_key
    and month_key = p_month_key
  returning public.whatsapp_monthly_quotas.used_count into v_used_count;

  return query select coalesce(v_used_count, 0);
end;
$$;


ALTER FUNCTION "public"."release_whatsapp_monthly_quota"("p_user_id" "uuid", "p_quota_key" "text", "p_month_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_morning_active_action_checkins_refresh"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  base_url text;
  anon_key text;
  internal_secret text;
begin
  if p_user_id is null then
    return;
  end if;

  select value into base_url
  from public.app_config
  where key = 'edge_functions_base_url'
  limit 1;

  select value into anon_key
  from public.app_config
  where key = 'edge_functions_anon_key'
  limit 1;

  select decrypted_secret into internal_secret
  from vault.decrypted_secrets
  where name = 'INTERNAL_FUNCTION_SECRET'
  limit 1;

  if coalesce(base_url, '') = '' or coalesce(anon_key, '') = '' or coalesce(internal_secret, '') = '' then
    raise notice '[request_morning_active_action_checkins_refresh] missing edge config; skipped async refresh for user %', p_user_id;
    return;
  end if;

  perform net.http_post(
    url := rtrim(base_url, '/') || '/functions/v1/schedule-whatsapp-v2-checkins',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'apikey', anon_key,
      'authorization', 'Bearer ' || anon_key,
      'x-internal-secret', internal_secret
    ),
    body := jsonb_build_object(
      'user_id', p_user_id,
      'full_reset', true
    )
  );
end;
$$;


ALTER FUNCTION "public"."request_morning_active_action_checkins_refresh"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_recurring_reminder_checkins_refresh"("p_user_id" "uuid", "p_full_reset" boolean DEFAULT true) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  base_url text;
  anon_key text;
  internal_secret text;
  profile_access_tier text;
  profile_whatsapp_opted_in boolean;
begin
  if p_user_id is null then
    return;
  end if;

  if coalesce(p_full_reset, true) then
    update public.scheduled_checkins
    set
      status = 'cancelled',
      processed_at = now()
    where user_id = p_user_id
      and status::text in ('pending', 'retrying', 'awaiting_user')
      and scheduled_for >= now()
      and event_context like 'recurring_reminder:%';
  end if;

  select
    p.access_tier,
    p.whatsapp_opted_in
  into
    profile_access_tier,
    profile_whatsapp_opted_in
  from public.profiles p
  where p.id = p_user_id
  limit 1;

  if coalesce(profile_whatsapp_opted_in, false) is not true then
    return;
  end if;

  if not public.whatsapp_scheduling_access_eligible(profile_access_tier) then
    return;
  end if;

  select value into base_url
  from public.app_config
  where key = 'edge_functions_base_url'
  limit 1;

  select value into anon_key
  from public.app_config
  where key = 'edge_functions_anon_key'
  limit 1;

  select decrypted_secret into internal_secret
  from vault.decrypted_secrets
  where name = 'INTERNAL_FUNCTION_SECRET'
  limit 1;

  if coalesce(base_url, '') = '' or coalesce(anon_key, '') = '' or coalesce(internal_secret, '') = '' then
    raise notice '[request_recurring_reminder_checkins_refresh] missing edge config; skipped async refresh for user %', p_user_id;
    return;
  end if;

  perform net.http_post(
    url := rtrim(base_url, '/') || '/functions/v1/schedule-whatsapp-v2-checkins',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'apikey', anon_key,
      'authorization', 'Bearer ' || anon_key,
      'x-internal-secret', internal_secret
    ),
    body := jsonb_build_object(
      'user_id', p_user_id,
      'full_reset', coalesce(p_full_reset, true),
      'include_today_if_future', true
    )
  );
end;
$$;


ALTER FUNCTION "public"."request_recurring_reminder_checkins_refresh"("p_user_id" "uuid", "p_full_reset" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_trigger_synthesizer_for_state"("p_user_id" "uuid", "p_scope" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  base_url text;
  anon_key text;
  internal_secret text;
  safe_scope text;
begin
  if p_user_id is null then
    return;
  end if;

  safe_scope := coalesce(nullif(trim(p_scope), ''), 'web');

  select value into base_url
  from public.app_config
  where key = 'edge_functions_base_url'
  limit 1;

  select value into anon_key
  from public.app_config
  where key = 'edge_functions_anon_key'
  limit 1;

  select decrypted_secret into internal_secret
  from vault.decrypted_secrets
  where name = 'INTERNAL_FUNCTION_SECRET'
  limit 1;

  if coalesce(base_url, '') = '' or coalesce(anon_key, '') = '' or coalesce(internal_secret, '') = '' then
    raise notice '[request_trigger_synthesizer_for_state] missing edge config; skipped dispatch for user % scope %', p_user_id, safe_scope;
    return;
  end if;

  perform net.http_post(
    url := rtrim(base_url, '/') || '/functions/v1/trigger-synthesizer-batch',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'apikey', anon_key,
      'authorization', 'Bearer ' || anon_key,
      'x-internal-secret', internal_secret
    ),
    body := jsonb_build_object(
      'user_id', p_user_id,
      'scope', safe_scope,
      'reason', 'threshold_crossed'
    )
  );
end;
$$;


ALTER FUNCTION "public"."request_trigger_synthesizer_for_state"("p_user_id" "uuid", "p_scope" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."scheduled_checkins_enforce_min_gap_1h"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  conflicting_scheduled_for timestamptz;
  attempts int := 0;
begin
  -- Explicit user reminders are commitments. Do not rewrite the time after
  -- Sophia confirmed it.
  if new.recurring_reminder_id is not null
    or new.event_context like 'recurring_reminder:%'
    or new.event_context like 'one_shot_reminder:%'
    or new.message_payload->>'reminder_kind' = 'one_shot' then
    return new;
  end if;

  -- Only enforce on active/sent checkins.
  if new.status::text not in ('pending', 'awaiting_user', 'sent') then
    return new;
  end if;

  -- Ensure deterministic convergence in pathological cases.
  while attempts < 48 loop
    select max(sc.scheduled_for)
      into conflicting_scheduled_for
    from public.scheduled_checkins sc
    where sc.user_id = new.user_id
      and sc.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and sc.status::text in ('pending', 'awaiting_user', 'sent')
      and abs(extract(epoch from (sc.scheduled_for - new.scheduled_for))) < 3600;

    exit when conflicting_scheduled_for is null;

    -- Move after the latest conflicting checkin to guarantee >= 1h spacing.
    new.scheduled_for := conflicting_scheduled_for + interval '1 hour';
    attempts := attempts + 1;
  end loop;

  return new;
end;
$$;


ALTER FUNCTION "public"."scheduled_checkins_enforce_min_gap_1h"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_default_coach_preferences"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_user_id is null then
    return;
  end if;

  if to_regclass('public.user_profile_facts') is null then
    return;
  end if;

  insert into public.user_profile_facts (
    user_id,
    scope,
    key,
    value,
    status,
    confidence,
    source_type,
    reason,
    updated_at
  )
  values
    (p_user_id, 'global', 'coach.tone', jsonb_build_object('value', 'warm_direct', 'label', 'Bienveillant ferme'), 'active', 1.0, 'system_default', 'Default coach preferences (v4 canonical)', now()),
    (p_user_id, 'global', 'coach.challenge_level', jsonb_build_object('value', 'balanced', 'label', 'Équilibré'), 'active', 1.0, 'system_default', 'Default coach preferences (v4 canonical)', now()),
    (p_user_id, 'global', 'coach.feedback_style', jsonb_build_object('value', 'positive_then_fix', 'label', 'Positif puis amélioration'), 'active', 1.0, 'system_default', 'Default coach preferences (v4 canonical)', now()),
    (p_user_id, 'global', 'coach.talk_propensity', jsonb_build_object('value', 'balanced', 'label', 'Équilibrée'), 'active', 1.0, 'system_default', 'Default coach preferences (v4 canonical)', now()),
    (p_user_id, 'global', 'coach.message_length', jsonb_build_object('value', 'short', 'label', 'Courte'), 'active', 1.0, 'system_default', 'Default coach preferences (v4 canonical)', now()),
    (p_user_id, 'global', 'coach.message_format', jsonb_build_object('value', 'adaptive', 'label', 'Mix adaptatif'), 'active', 1.0, 'system_default', 'Default coach preferences (v4 canonical)', now()),
    (p_user_id, 'global', 'coach.primary_focus', jsonb_build_object('value', 'discipline', 'label', 'Discipline / action'), 'active', 1.0, 'system_default', 'Default coach preferences (v4 canonical)', now()),
    (p_user_id, 'global', 'coach.emotional_personalization', jsonb_build_object('value', 'warm', 'label', 'Chaleureux'), 'active', 1.0, 'system_default', 'Default coach preferences (v4 canonical)', now()),
    (p_user_id, 'global', 'coach.question_tendency', jsonb_build_object('value', 'normal', 'label', 'Normale'), 'active', 1.0, 'system_default', 'Default coach preferences (v4 canonical)', now())
  on conflict (user_id, scope, key)
  do update set
    value = excluded.value,
    status = 'active',
    confidence = 1.0,
    source_type = 'system_default',
    reason = excluded.reason,
    updated_at = now();
end;
$$;


ALTER FUNCTION "public"."seed_default_coach_preferences"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_phone_verified_on_whatsapp_optin"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- When whatsapp_opted_in becomes true, ensure phone_verified_at is set
  if new.whatsapp_opted_in = true and new.phone_number is not null and new.phone_verified_at is null then
    new.phone_verified_at := now();
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."sync_phone_verified_on_whatsapp_optin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_memory_items_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."tg_memory_items_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."tg_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transfer_verified_phone_to_user"("p_user_id" "uuid", "p_phone" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_phone text;
  v_old_user_id uuid;
begin
  v_phone := nullif(trim(p_phone), '');
  if v_phone is null then
    raise exception 'missing phone';
  end if;

  -- Lock the current verified owner (if any) to avoid races.
  select p.id
    into v_old_user_id
  from public.profiles p
  where p.phone_number = v_phone
    and p.phone_verified_at is not null
    and p.phone_number is not null
  limit 1
  for update;

  -- If the phone is verified elsewhere, clear it from the old account.
  if v_old_user_id is not null and v_old_user_id <> p_user_id then
    update public.profiles
    set
      phone_number = null,
      phone_verified_at = null,
      phone_invalid = false,
      whatsapp_opted_in = false,
      whatsapp_bilan_opted_in = false,
      whatsapp_opted_out_at = now(),
      whatsapp_optout_reason = 'phone_transferred',
      whatsapp_optout_confirmed_at = null,
      whatsapp_state = null,
      whatsapp_state_updated_at = now()
    where id = v_old_user_id;
  end if;

  -- Set the phone as verified on the target user.
  update public.profiles
  set
    phone_number = v_phone,
    phone_verified_at = now(),
    phone_invalid = false,
    whatsapp_opted_in = true,
    whatsapp_opted_out_at = null,
    whatsapp_optout_reason = null,
    whatsapp_optout_confirmed_at = null,
    whatsapp_last_inbound_at = now(),
    whatsapp_state_updated_at = coalesce(whatsapp_state_updated_at, now())
  where id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'old_user_id', v_old_user_id,
    'user_id', p_user_id,
    'phone', v_phone
  );
end;
$$;


ALTER FUNCTION "public"."transfer_verified_phone_to_user"("p_user_id" "uuid", "p_phone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unlock_transformation_principle"("p_user_id" "uuid", "p_transformation_id" "uuid", "p_principle" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_user_id is null or p_transformation_id is null then
    return;
  end if;

  if p_principle not in ('kaizen', 'ikigai', 'hara_hachi_bu', 'wabi_sabi', 'gambaru') then
    return;
  end if;

  update public.user_transformations
  set unlocked_principles =
        coalesce(unlocked_principles, '{"kaizen": true}'::jsonb) ||
        jsonb_build_object(p_principle, true),
      updated_at = now()
  where id = p_transformation_id
    and exists (
      select 1 from public.user_cycles c
      where c.id = user_transformations.cycle_id
        and c.user_id = p_user_id
    )
    and coalesce((unlocked_principles ->> p_principle)::boolean, false) is distinct from true;
end;
$$;


ALTER FUNCTION "public"."unlock_transformation_principle"("p_user_id" "uuid", "p_transformation_id" "uuid", "p_principle" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_modified_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_modified_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."whatsapp_scheduling_access_eligible"("p_access_tier" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select lower(coalesce(p_access_tier, '')) in ('trial', 'alliance', 'architecte');
$$;


ALTER FUNCTION "public"."whatsapp_scheduling_access_eligible"("p_access_tier" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_config" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."chat_role" NOT NULL,
    "content" "text" NOT NULL,
    "agent_used" "public"."chat_agent_mode",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "scope" "text" DEFAULT 'web'::"text" NOT NULL
);


ALTER TABLE "public"."chat_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."communication_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "channel" "text" NOT NULL,
    "type" "text" NOT NULL,
    "status" "text" DEFAULT 'sent'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "communication_logs_channel_check" CHECK (("channel" = ANY (ARRAY['email'::"text", 'whatsapp'::"text", 'sms'::"text"])))
);


ALTER TABLE "public"."communication_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."confirmation_tokens_consumed" (
    "token_id" "uuid" NOT NULL,
    "consumed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."confirmation_tokens_consumed" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_eval_events" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "eval_run_id" "uuid",
    "request_id" "text" NOT NULL,
    "source" "text" NOT NULL,
    "level" "text" DEFAULT 'info'::"text" NOT NULL,
    "event" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "conversation_eval_events_level_check" CHECK (("level" = ANY (ARRAY['debug'::"text", 'info'::"text", 'warn'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."conversation_eval_events" OWNER TO "postgres";


ALTER TABLE "public"."conversation_eval_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."conversation_eval_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."conversation_eval_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "dataset_key" "text" NOT NULL,
    "scenario_key" "text" NOT NULL,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "transcript" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "state_before" "jsonb",
    "state_after" "jsonb",
    "issues" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "suggestions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "metrics" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "error" "text",
    CONSTRAINT "conversation_eval_runs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'running'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."conversation_eval_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_scope_memories" (
    "user_id" "uuid" NOT NULL,
    "scope" "text" NOT NULL,
    "summary_text" "text" DEFAULT ''::"text" NOT NULL,
    "pending_message_count" integer DEFAULT 0 NOT NULL,
    "last_compaction_at" timestamp with time zone,
    "last_compacted_message_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "conversation_scope_memories_pending_message_count_check" CHECK (("pending_message_count" >= 0))
);


ALTER TABLE "public"."conversation_scope_memories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_turn_traces" (
    "turn_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "source_message_id" "text" NOT NULL,
    "ts" timestamp with time zone NOT NULL,
    "safety_pregate" "jsonb" NOT NULL,
    "dispatcher_run" "jsonb" NOT NULL,
    "turn_frame" "jsonb" NOT NULL,
    "route_decision" "jsonb" NOT NULL,
    "direct_effects" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "skill_run" "jsonb",
    "tool_skill_run" "jsonb",
    "recommendation_tool_run" "jsonb",
    "confirmation_token_outcomes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "memory_write_candidates_emitted" integer DEFAULT 0 NOT NULL,
    "response_owner" "text" NOT NULL,
    "total_latency_ms" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."conversation_turn_traces" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."llm_usage_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "request_id" "text",
    "source" "text",
    "provider" "text" DEFAULT 'gemini'::"text" NOT NULL,
    "model" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "prompt_tokens" integer,
    "output_tokens" integer,
    "total_tokens" integer,
    "cost_usd" numeric,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "user_id" "uuid",
    "operation_family" "text" DEFAULT 'other'::"text" NOT NULL,
    "operation_name" "text",
    "channel" "text" DEFAULT 'system'::"text" NOT NULL,
    "status" "text" DEFAULT 'success'::"text" NOT NULL,
    "latency_ms" integer,
    "provider_request_id" "text",
    "pricing_version" "text",
    "input_price_per_1k_tokens_usd" numeric,
    "output_price_per_1k_tokens_usd" numeric,
    "cost_unpriced" boolean DEFAULT false NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "step_index" integer,
    CONSTRAINT "llm_usage_events_kind_check" CHECK (("kind" = ANY (ARRAY['generate'::"text", 'embed'::"text"])))
);


ALTER TABLE "public"."llm_usage_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_cost_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "event_date" "date" NOT NULL,
    "user_id" "uuid",
    "outbound_message_id" "uuid",
    "provider_message_id" "text" NOT NULL,
    "purpose" "text",
    "template_name" "text",
    "template_language" "text",
    "unit_cost_eur" numeric DEFAULT 0.0712 NOT NULL,
    "final_cost_eur" numeric DEFAULT 0.0712 NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "billable" boolean DEFAULT true NOT NULL,
    "billing_status" "text" DEFAULT 'sent'::"text" NOT NULL,
    "billed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."whatsapp_cost_events" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."cost_fact_events" AS
 SELECT "ue"."created_at",
    "ue"."user_id",
    COALESCE("ue"."operation_family", 'other'::"text") AS "operation_family",
    COALESCE("ue"."operation_name", "ue"."source", 'unknown'::"text") AS "operation_name",
    "ue"."source",
    "ue"."provider",
    "ue"."model",
    "ue"."kind",
    COALESCE("ue"."total_tokens", 0) AS "total_tokens",
    COALESCE("ue"."cost_usd", (0)::numeric) AS "cost_usd",
    (0)::numeric AS "cost_eur",
    'ai'::"text" AS "cost_domain"
   FROM "public"."llm_usage_events" "ue"
UNION ALL
 SELECT "wce"."billed_at" AS "created_at",
    "wce"."user_id",
    'whatsapp_template'::"text" AS "operation_family",
    COALESCE("wce"."purpose", 'template_send'::"text") AS "operation_name",
    'whatsapp-template'::"text" AS "source",
    'meta'::"text" AS "provider",
    COALESCE("wce"."template_name", 'template'::"text") AS "model",
    'template'::"text" AS "kind",
    0 AS "total_tokens",
    (0)::numeric AS "cost_usd",
    COALESCE("wce"."final_cost_eur", (0)::numeric) AS "cost_eur",
    'whatsapp'::"text" AS "cost_domain"
   FROM "public"."whatsapp_cost_events" "wce"
  WHERE (("wce"."billable" = true) AND ("lower"("wce"."billing_status") = 'sent'::"text"));


ALTER VIEW "public"."cost_fact_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."internal_admins" (
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."internal_admins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."llm_pricing" (
    "provider" "text" NOT NULL,
    "model" "text" NOT NULL,
    "input_per_1k_tokens_usd" numeric DEFAULT 0 NOT NULL,
    "output_per_1k_tokens_usd" numeric DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "pricing_version" "text" DEFAULT 'v1'::"text" NOT NULL,
    "effective_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."llm_pricing" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memory_change_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "operation_type" "text" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "replacement_id" "uuid",
    "source_message_id" "uuid",
    "extraction_run_id" "uuid",
    "reason" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "memory_change_log_operation_type_check" CHECK (("operation_type" = ANY (ARRAY['invalidate'::"text", 'supersede'::"text", 'hide'::"text", 'delete'::"text", 'merge'::"text", 'restore'::"text", 'promote'::"text", 'archive_expired'::"text", 'redaction_propagated'::"text"]))),
    CONSTRAINT "memory_change_log_target_type_check" CHECK (("target_type" = ANY (ARRAY['memory_item'::"text", 'entity'::"text", 'topic'::"text"])))
);


ALTER TABLE "public"."memory_change_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memory_eval_annotations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewer_user_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "scope" "text",
    "window_from" timestamp with time zone NOT NULL,
    "window_to" timestamp with time zone NOT NULL,
    "target_type" "text" NOT NULL,
    "target_key" "text" NOT NULL,
    "turn_id" "text",
    "request_id" "text",
    "dimension" "text" NOT NULL,
    "label" "text" NOT NULL,
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "memory_eval_annotations_dimension_check" CHECK (("dimension" = ANY (ARRAY['overall'::"text", 'identification'::"text", 'persistence'::"text", 'retrieval'::"text", 'injection'::"text", 'surface'::"text"]))),
    CONSTRAINT "memory_eval_annotations_label_check" CHECK (("label" = ANY (ARRAY['good'::"text", 'partial'::"text", 'miss'::"text", 'harmful'::"text"]))),
    CONSTRAINT "memory_eval_annotations_target_type_check" CHECK (("target_type" = ANY (ARRAY['window'::"text", 'turn'::"text"])))
);


ALTER TABLE "public"."memory_eval_annotations" OWNER TO "postgres";


COMMENT ON TABLE "public"."memory_eval_annotations" IS 'Manual qualitative annotations for memory trace windows/turns and dimensions.';



CREATE TABLE IF NOT EXISTS "public"."memory_extraction_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "batch_hash" "text" NOT NULL,
    "prompt_version" "text" NOT NULL,
    "model_name" "text" NOT NULL,
    "embedding_model" "text",
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "trigger_type" "text" NOT NULL,
    "input_message_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "proposed_item_count" integer DEFAULT 0 NOT NULL,
    "accepted_item_count" integer DEFAULT 0 NOT NULL,
    "rejected_item_count" integer DEFAULT 0 NOT NULL,
    "proposed_entity_count" integer DEFAULT 0 NOT NULL,
    "accepted_entity_count" integer DEFAULT 0 NOT NULL,
    "duration_ms" integer,
    "error_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "memory_extraction_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'completed'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."memory_extraction_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memory_item_action_occurrences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "memory_item_action_id" "uuid" NOT NULL,
    "action_occurrence_id" "uuid" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."memory_item_action_occurrences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memory_item_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "memory_item_id" "uuid" NOT NULL,
    "plan_item_id" "uuid",
    "observation_window_start" timestamp with time zone,
    "observation_window_end" timestamp with time zone,
    "aggregation_kind" "text" DEFAULT 'single_occurrence'::"text" NOT NULL,
    "confidence" numeric(3,2) DEFAULT 0.70 NOT NULL,
    "extraction_run_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_memory_item_actions_window" CHECK ((("observation_window_end" IS NULL) OR ("observation_window_start" IS NULL) OR ("observation_window_end" >= "observation_window_start"))),
    CONSTRAINT "memory_item_actions_aggregation_kind_check" CHECK (("aggregation_kind" = ANY (ARRAY['single_occurrence'::"text", 'week_summary'::"text", 'streak_summary'::"text", 'possible_pattern'::"text"]))),
    CONSTRAINT "memory_item_actions_confidence_check" CHECK ((("confidence" >= (0)::numeric) AND ("confidence" <= (1)::numeric)))
);


ALTER TABLE "public"."memory_item_actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memory_item_entities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "memory_item_id" "uuid" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "relation_type" "text" DEFAULT 'mentions'::"text" NOT NULL,
    "confidence" numeric(3,2) DEFAULT 0.70 NOT NULL,
    "extraction_run_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "memory_item_entities_confidence_check" CHECK ((("confidence" >= (0)::numeric) AND ("confidence" <= (1)::numeric))),
    CONSTRAINT "memory_item_entities_relation_type_check" CHECK (("relation_type" = ANY (ARRAY['mentions'::"text", 'about'::"text"])))
);


ALTER TABLE "public"."memory_item_entities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memory_item_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "memory_item_id" "uuid" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_id" "uuid",
    "source_message_id" "uuid",
    "source_created_at" timestamp with time zone,
    "source_scope" "text",
    "evidence_quote" "text",
    "evidence_summary" "text",
    "extraction_run_id" "uuid",
    "confidence" numeric(3,2) DEFAULT 0.70 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "memory_item_sources_confidence_check" CHECK ((("confidence" >= (0)::numeric) AND ("confidence" <= (1)::numeric))),
    CONSTRAINT "memory_item_sources_source_type_check" CHECK (("source_type" = ANY (ARRAY['chat_message'::"text", 'action_occurrence'::"text", 'plan_item'::"text", 'scheduled_checkin'::"text", 'skill_run'::"text", 'weekly_review'::"text", 'manual_correction'::"text", 'system_signal'::"text"])))
);


ALTER TABLE "public"."memory_item_sources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memory_item_topics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "memory_item_id" "uuid" NOT NULL,
    "topic_id" "uuid" NOT NULL,
    "relation_type" "text" DEFAULT 'about'::"text" NOT NULL,
    "confidence" numeric(3,2) DEFAULT 0.70 NOT NULL,
    "first_observed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_observed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "observed_count" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "extraction_run_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "memory_item_topics_confidence_check" CHECK ((("confidence" >= (0)::numeric) AND ("confidence" <= (1)::numeric))),
    CONSTRAINT "memory_item_topics_relation_type_check" CHECK (("relation_type" = ANY (ARRAY['about'::"text", 'supports'::"text", 'mentioned_with'::"text", 'blocks'::"text", 'helps'::"text"]))),
    CONSTRAINT "memory_item_topics_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'retracted'::"text"])))
);


ALTER TABLE "public"."memory_item_topics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memory_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "status" "text" DEFAULT 'candidate'::"text" NOT NULL,
    "content_text" "text" NOT NULL,
    "normalized_summary" "text",
    "structured_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "domain_keys" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "confidence" numeric(3,2) DEFAULT 0.70 NOT NULL,
    "importance_score" numeric(3,2) DEFAULT 0 NOT NULL,
    "sensitivity_level" "text" DEFAULT 'normal'::"text" NOT NULL,
    "sensitivity_categories" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "requires_user_initiated" boolean DEFAULT false NOT NULL,
    "source_message_id" "uuid",
    "source_scope" "text",
    "source_hash" "text",
    "observed_at" timestamp with time zone,
    "event_start_at" timestamp with time zone,
    "event_end_at" timestamp with time zone,
    "time_precision" "text",
    "timezone" "text",
    "valid_from" timestamp with time zone,
    "valid_until" timestamp with time zone,
    "canonical_key" "text",
    "embedding" "public"."vector"(768),
    "embedding_model" "text",
    "superseded_by_item_id" "uuid",
    "extraction_run_id" "uuid",
    "last_retrieved_at" timestamp with time zone,
    "version" integer DEFAULT 1 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_memory_items_event_end_after_start" CHECK ((("event_end_at" IS NULL) OR ("event_start_at" IS NULL) OR ("event_end_at" >= "event_start_at"))),
    CONSTRAINT "chk_memory_items_event_has_start" CHECK ((("kind" <> 'event'::"text") OR ("event_start_at" IS NOT NULL))),
    CONSTRAINT "memory_items_confidence_check" CHECK ((("confidence" >= (0)::numeric) AND ("confidence" <= (1)::numeric))),
    CONSTRAINT "memory_items_importance_score_check" CHECK ((("importance_score" >= (0)::numeric) AND ("importance_score" <= (1)::numeric))),
    CONSTRAINT "memory_items_kind_check" CHECK (("kind" = ANY (ARRAY['fact'::"text", 'statement'::"text", 'event'::"text", 'action_observation'::"text"]))),
    CONSTRAINT "memory_items_sensitivity_level_check" CHECK (("sensitivity_level" = ANY (ARRAY['normal'::"text", 'sensitive'::"text", 'safety'::"text"]))),
    CONSTRAINT "memory_items_status_check" CHECK (("status" = ANY (ARRAY['candidate'::"text", 'active'::"text", 'superseded'::"text", 'invalidated'::"text", 'hidden_by_user'::"text", 'deleted_by_user'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."memory_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memory_message_processing" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "message_id" "uuid" NOT NULL,
    "extraction_run_id" "uuid" NOT NULL,
    "processing_role" "text" NOT NULL,
    "processing_status" "text" DEFAULT 'completed'::"text" NOT NULL,
    "prompt_version" "text" NOT NULL,
    "model_name" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "memory_message_processing_processing_role_check" CHECK (("processing_role" = ANY (ARRAY['primary'::"text", 'context_only'::"text", 'skipped_noise'::"text", 'reprocessed_for_correction'::"text"]))),
    CONSTRAINT "memory_message_processing_processing_status_check" CHECK (("processing_status" = ANY (ARRAY['completed'::"text", 'skipped'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."memory_message_processing" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memory_observability_events" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "request_id" "text",
    "turn_id" "text",
    "user_id" "uuid" NOT NULL,
    "channel" "text",
    "scope" "text",
    "source_component" "text" NOT NULL,
    "event_name" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "memory_observability_events_channel_check" CHECK (("channel" = ANY (ARRAY['web'::"text", 'whatsapp'::"text"])))
);


ALTER TABLE "public"."memory_observability_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."memory_observability_events" IS 'Detailed append-only memory/debug ledger. Enable writes with MEMORY_OBSERVABILITY_ON=1.';



ALTER TABLE "public"."memory_observability_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."memory_observability_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."memory_weekly_review_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "iso_year" integer NOT NULL,
    "iso_week" integer NOT NULL,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "attempt_count" integer DEFAULT 1 NOT NULL,
    "processed_message_count" integer DEFAULT 0 NOT NULL,
    "compacted_topic_count" integer DEFAULT 0 NOT NULL,
    "possible_pattern_count" integer DEFAULT 0 NOT NULL,
    "error_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "memory_weekly_review_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'completed'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."memory_weekly_review_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."proactive_job_state" (
    "user_id" "uuid" NOT NULL,
    "job" "text" NOT NULL,
    "last_sent_local_date" "date",
    "last_sent_at" timestamp with time zone,
    "last_attempt_local_date" "date",
    "last_attempt_at" timestamp with time zone,
    "attempt_count" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."proactive_job_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "full_name" "text",
    "avatar_url" "text",
    "onboarding_completed" boolean DEFAULT false,
    "birth_date" "date",
    "gender" "text",
    "phone_number" "text",
    "email" "text",
    "timezone" "text",
    "whatsapp_opted_in" boolean DEFAULT false NOT NULL,
    "phone_invalid" boolean DEFAULT false NOT NULL,
    "whatsapp_last_inbound_at" timestamp with time zone,
    "whatsapp_last_outbound_at" timestamp with time zone,
    "whatsapp_optin_sent_at" timestamp with time zone,
    "whatsapp_bilan_opted_in" boolean DEFAULT false NOT NULL,
    "trial_start" timestamp with time zone DEFAULT "now"(),
    "trial_end" timestamp with time zone DEFAULT ("now"() + '14 days'::interval),
    "stripe_customer_id" "text",
    "whatsapp_opted_out_at" timestamp with time zone,
    "whatsapp_optout_reason" "text",
    "whatsapp_optout_confirmed_at" timestamp with time zone,
    "whatsapp_state" "text",
    "whatsapp_state_updated_at" timestamp with time zone,
    "phone_verified_at" timestamp with time zone,
    "whatsapp_onboarding_started_at" timestamp with time zone,
    "access_tier" "text" DEFAULT 'none'::"text" NOT NULL,
    "locale" "text" DEFAULT 'fr-FR'::"text" NOT NULL,
    "tz_follow_device" boolean DEFAULT false NOT NULL,
    "whatsapp_deferred_onboarding" "jsonb",
    "whatsapp_bilan_paused_until" timestamp with time zone,
    "whatsapp_bilan_missed_streak" integer DEFAULT 0 NOT NULL,
    "whatsapp_bilan_last_prompt_at" timestamp with time zone,
    "whatsapp_bilan_winback_step" integer DEFAULT 0 NOT NULL,
    "whatsapp_bilan_last_winback_at" timestamp with time zone,
    "whatsapp_coaching_paused_until" timestamp with time zone,
    "morning_active_action_checkins_seeded_at" timestamp with time zone,
    "install_app_dismissed_until" timestamp with time zone,
    "install_app_marked_installed_at" timestamp with time zone,
    "install_app_last_prompted_at" timestamp with time zone,
    CONSTRAINT "profiles_access_tier_check" CHECK (("access_tier" = ANY (ARRAY['none'::"text", 'trial'::"text", 'system'::"text", 'alliance'::"text", 'architecte'::"text"]))),
    CONSTRAINT "profiles_gender_check" CHECK (("gender" = ANY (ARRAY['male'::"text", 'female'::"text", 'other'::"text"]))),
    CONSTRAINT "profiles_whatsapp_bilan_missed_streak_check" CHECK ((("whatsapp_bilan_missed_streak" >= 0) AND ("whatsapp_bilan_missed_streak" <= 30))),
    CONSTRAINT "profiles_whatsapp_bilan_winback_step_check" CHECK ((("whatsapp_bilan_winback_step" >= 0) AND ("whatsapp_bilan_winback_step" <= 3)))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."whatsapp_deferred_onboarding" IS 'Array of deferred onboarding steps (e.g., ["motivation", "personal_fact"]) to be asked later when user is in a calm moment';



COMMENT ON COLUMN "public"."profiles"."install_app_dismissed_until" IS 'When the install app prompt may be shown again after a user postpones it.';



COMMENT ON COLUMN "public"."profiles"."install_app_marked_installed_at" IS 'When the user explicitly said the app is already installed or accepted install.';



COMMENT ON COLUMN "public"."profiles"."install_app_last_prompted_at" IS 'Last time the install app prompt was shown in the dashboard.';



CREATE TABLE IF NOT EXISTS "public"."scheduled_checkins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "event_context" "text" NOT NULL,
    "draft_message" "text",
    "scheduled_for" timestamp with time zone NOT NULL,
    "status" "public"."checkin_status" DEFAULT 'pending'::"public"."checkin_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "message_mode" "text" DEFAULT 'static'::"text" NOT NULL,
    "message_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "origin" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "delivery_attempt_count" integer DEFAULT 0 NOT NULL,
    "delivery_last_error" "text",
    "delivery_last_error_at" timestamp with time zone,
    "delivery_last_request_id" "text",
    "recurring_reminder_id" "uuid",
    CONSTRAINT "scheduled_checkins_message_mode_check" CHECK (("message_mode" = ANY (ARRAY['static'::"text", 'dynamic'::"text"]))),
    CONSTRAINT "scheduled_checkins_origin_check" CHECK (("origin" = ANY (ARRAY['watcher'::"text", 'rendez_vous'::"text", 'action_morning'::"text", 'action_review'::"text", 'action_followup'::"text", 'weekly_planning'::"text", 'weekly_review'::"text", 'level_review'::"text", 'unknown'::"text"])))
);


ALTER TABLE "public"."scheduled_checkins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stripe_webhook_events" (
    "id" "text" NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."stripe_webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "stripe_subscription_id" "text",
    "stripe_price_id" "text",
    "status" "text" NOT NULL,
    "cancel_at_period_end" boolean DEFAULT false NOT NULL,
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tier" "text",
    "interval" "text",
    CONSTRAINT "subscriptions_interval_check" CHECK ((("interval" IS NULL) OR ("interval" = ANY (ARRAY['monthly'::"text", 'yearly'::"text"])))),
    CONSTRAINT "subscriptions_tier_check" CHECK ((("tier" IS NULL) OR ("tier" = ANY (ARRAY['system'::"text", 'alliance'::"text", 'architecte'::"text"]))))
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_error_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "severity" "text" DEFAULT 'error'::"text" NOT NULL,
    "source" "text" DEFAULT 'edge'::"text" NOT NULL,
    "function_name" "text" NOT NULL,
    "title" "text",
    "message" "text" NOT NULL,
    "stack" "text",
    "request_id" "text",
    "user_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "system_error_logs_severity_check" CHECK (("severity" = ANY (ARRAY['info'::"text", 'warn'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."system_error_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_runtime_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cycle_id" "uuid",
    "transformation_id" "uuid",
    "snapshot_type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "system_runtime_snapshots_snapshot_type_check" CHECK (("snapshot_type" = ANY (ARRAY['conversation_pulse'::"text", 'momentum_state_v2'::"text", 'active_load'::"text", 'repair_mode'::"text", 'weekly_digest'::"text", 'cycle_created_v2'::"text", 'cycle_structured_v2'::"text", 'cycle_prioritized_v2'::"text", 'cycle_profile_completed_v2'::"text", 'transformation_activated_v2'::"text", 'transformation_completed_v2'::"text", 'transformation_handoff_generated_v2'::"text", 'plan_generated_v2'::"text", 'plan_activated_v2'::"text", 'conversation_pulse_generated_v2'::"text", 'weekly_digest_generated_v2'::"text", 'momentum_state_updated_v2'::"text", 'active_load_recomputed_v2'::"text", 'daily_bilan_decided_v2'::"text", 'daily_bilan_completed_v2'::"text", 'weekly_bilan_decided_v2'::"text", 'weekly_bilan_completed_v2'::"text", 'proactive_window_decided_v2'::"text", 'morning_nudge_generated_v2'::"text", 'rendez_vous_state_changed_v2'::"text", 'repair_mode_entered_v2'::"text", 'repair_mode_exited_v2'::"text", 'plan_item_entry_logged_v2'::"text", 'metric_recorded_v2'::"text", 'memory_retrieval_executed_v2'::"text", 'memory_persisted_v2'::"text", 'memory_handoff_v2'::"text", 'coaching_blocker_detected_v2'::"text", 'coaching_intervention_proposed_v2'::"text", 'coaching_intervention_rendered_v2'::"text", 'coaching_follow_up_captured_v2'::"text", 'coaching_technique_deprioritized_v2'::"text", 'cooldown_entry'::"text"])))
);


ALTER TABLE "public"."system_runtime_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."turn_summary_logs" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "request_id" "text",
    "user_id" "uuid" NOT NULL,
    "channel" "text" NOT NULL,
    "scope" "text" NOT NULL,
    "latency_total_ms" integer,
    "latency_dispatcher_ms" integer,
    "latency_context_ms" integer,
    "latency_agent_ms" integer,
    "dispatcher_model" "text",
    "dispatcher_safety" "text",
    "dispatcher_intent" "text",
    "dispatcher_intent_conf" real,
    "dispatcher_interrupt" "text",
    "dispatcher_topic_depth" "text",
    "dispatcher_flow_resolution" "text",
    "context_profile" "text",
    "context_elements" "text"[],
    "context_tokens" integer,
    "target_dispatcher" "text",
    "target_initial" "text",
    "target_final" "text",
    "risk_score" integer,
    "agent_model" "text",
    "agent_outcome" "text",
    "agent_tool" "text",
    "checkup_active" boolean,
    "toolflow_active" boolean,
    "supervisor_stack_top" "text",
    "aborted" boolean DEFAULT false,
    "abort_reason" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "turn_summary_logs_channel_check" CHECK (("channel" = ANY (ARRAY['web'::"text", 'whatsapp'::"text"])))
);


ALTER TABLE "public"."turn_summary_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."turn_summary_logs" IS 'Optional per-turn debugging logs. Enable via TURN_SUMMARY_DB_ENABLED=1. Auto-deleted after 7 days.';



ALTER TABLE "public"."turn_summary_logs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."turn_summary_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_architect_quotes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "quote_text" "text" NOT NULL,
    "author" "text",
    "source_context" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_architect_quotes_author_check" CHECK ((("author" IS NULL) OR ("char_length"("author") <= 160))),
    CONSTRAINT "user_architect_quotes_quote_text_check" CHECK ((("char_length"("quote_text") >= 1) AND ("char_length"("quote_text") <= 3000))),
    CONSTRAINT "user_architect_quotes_source_context_check" CHECK ((("source_context" IS NULL) OR ("char_length"("source_context") <= 240))),
    CONSTRAINT "user_architect_quotes_tags_check" CHECK ("public"."architect_quote_tags_are_valid"("tags"))
);


ALTER TABLE "public"."user_architect_quotes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_architect_reflections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "content" "text" DEFAULT ''::"text" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_architect_reflections_content_check" CHECK (("char_length"("content") <= 12000)),
    CONSTRAINT "user_architect_reflections_tags_check" CHECK ("public"."architect_reflection_tags_are_valid"("tags")),
    CONSTRAINT "user_architect_reflections_title_check" CHECK ((("char_length"("title") >= 1) AND ("char_length"("title") <= 160)))
);


ALTER TABLE "public"."user_architect_reflections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_architect_stories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "duration_label" "text",
    "bullet_points" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "speech_map" "text" DEFAULT ''::"text" NOT NULL,
    "topic_tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_architect_stories_bullet_points_check" CHECK ("public"."architect_story_bullet_points_are_valid"("bullet_points")),
    CONSTRAINT "user_architect_stories_duration_label_check" CHECK ((("duration_label" IS NULL) OR ("char_length"("duration_label") <= 80))),
    CONSTRAINT "user_architect_stories_speech_map_check" CHECK (("char_length"("speech_map") <= 8000)),
    CONSTRAINT "user_architect_stories_title_check" CHECK ((("char_length"("title") >= 1) AND ("char_length"("title") <= 180))),
    CONSTRAINT "user_architect_stories_topic_tags_check" CHECK ("public"."architect_story_tags_are_valid"("topic_tags"))
);


ALTER TABLE "public"."user_architect_stories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_architect_wishes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "category" "text" DEFAULT 'experience'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_architect_wishes_category_check" CHECK (("category" = ANY (ARRAY['experience'::"text", 'achievement'::"text", 'growth'::"text", 'contribution'::"text"]))),
    CONSTRAINT "user_architect_wishes_description_length" CHECK (("char_length"("description") <= 2000)),
    CONSTRAINT "user_architect_wishes_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text"]))),
    CONSTRAINT "user_architect_wishes_status_completed_consistency" CHECK (((("status" = 'active'::"text") AND ("completed_at" IS NULL)) OR (("status" = 'completed'::"text") AND ("completed_at" IS NOT NULL)))),
    CONSTRAINT "user_architect_wishes_title_nonempty" CHECK ((("char_length"("btrim"("title")) >= 1) AND ("char_length"("btrim"("title")) <= 160)))
);


ALTER TABLE "public"."user_architect_wishes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_attack_cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cycle_id" "uuid" NOT NULL,
    "transformation_id" "uuid",
    "phase_id" "text",
    "source" "text" NOT NULL,
    "status" "text" NOT NULL,
    "content" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "scope_kind" "text" DEFAULT 'transformation'::"text" NOT NULL,
    "plan_item_id" "uuid",
    CONSTRAINT "user_attack_cards_scope_kind_check" CHECK (("scope_kind" = ANY (ARRAY['transformation'::"text", 'out_of_plan'::"text"]))),
    CONSTRAINT "user_attack_cards_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'prefill_plan'::"text", 'prefill_classification'::"text", 'system'::"text"]))),
    CONSTRAINT "user_attack_cards_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'suggested'::"text", 'active'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."user_attack_cards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_chat_states" (
    "user_id" "uuid" NOT NULL,
    "current_mode" "public"."chat_agent_mode" DEFAULT 'companion'::"public"."chat_agent_mode" NOT NULL,
    "risk_level" integer DEFAULT 0,
    "investigation_state" "jsonb",
    "short_term_context" "text",
    "last_interaction_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "unprocessed_msg_count" integer DEFAULT 0,
    "last_processed_at" timestamp with time zone DEFAULT "now"(),
    "scope" "text" DEFAULT 'web'::"text" NOT NULL,
    "temp_memory" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "user_chat_states_risk_level_check" CHECK ((("risk_level" >= 0) AND ("risk_level" <= 10)))
);


ALTER TABLE "public"."user_chat_states" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_core_identity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "week_id" "text" NOT NULL,
    "content" "text" NOT NULL,
    "last_updated_at" timestamp with time zone DEFAULT "now"(),
    "identity_embedding" "public"."vector"(768)
);


ALTER TABLE "public"."user_core_identity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_core_identity_archive" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "identity_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "week_id" "text" NOT NULL,
    "content" "text" NOT NULL,
    "archived_at" timestamp with time zone DEFAULT "now"(),
    "reason" "text"
);


ALTER TABLE "public"."user_core_identity_archive" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_cycle_drafts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "anonymous_session_id" "text" NOT NULL,
    "status" "text" NOT NULL,
    "raw_intake_text" "text" DEFAULT ''::"text" NOT NULL,
    "draft_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_cycle_drafts_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'structured'::"text", 'prioritized'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."user_cycle_drafts" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_cycle_drafts" IS 'Best-effort server cache for onboarding V2 drafts keyed by anonymous_session_id; accessed via edge functions using service_role.';



CREATE TABLE IF NOT EXISTS "public"."user_cycles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "public"."cycle_status" DEFAULT 'draft'::"public"."cycle_status" NOT NULL,
    "raw_intake_text" "text" NOT NULL,
    "intake_language" "text",
    "duration_months" smallint,
    "birth_date_snapshot" "date",
    "gender_snapshot" "text",
    "active_transformation_id" "uuid",
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "archived_at" timestamp with time zone,
    "validated_structure" "jsonb",
    "requested_pace" "text",
    CONSTRAINT "user_cycles_duration_months_check" CHECK ((("duration_months" IS NULL) OR (("duration_months" >= 1) AND ("duration_months" <= 6)))),
    CONSTRAINT "user_cycles_requested_pace_check" CHECK ((("requested_pace" IS NULL) OR ("requested_pace" = ANY (ARRAY['cool'::"text", 'normal'::"text", 'intense'::"text"])))),
    CONSTRAINT "user_cycles_version_check" CHECK (("version" >= 1))
);


ALTER TABLE "public"."user_cycles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_defense_cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "transformation_id" "uuid",
    "content" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cycle_id" "uuid" NOT NULL,
    "scope_kind" "text" DEFAULT 'transformation'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "phase_id" "text",
    "plan_item_id" "uuid",
    "source" "text" DEFAULT 'system'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    CONSTRAINT "user_defense_cards_scope_kind_check" CHECK (("scope_kind" = ANY (ARRAY['transformation'::"text", 'out_of_plan'::"text"]))),
    CONSTRAINT "user_defense_cards_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'prefill_plan'::"text", 'prefill_classification'::"text", 'system'::"text"]))),
    CONSTRAINT "user_defense_cards_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'suggested'::"text", 'active'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."user_defense_cards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_defense_wins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "defense_card_id" "uuid" NOT NULL,
    "impulse_id" "text" NOT NULL,
    "trigger_id" "text",
    "source" "text" NOT NULL,
    "logged_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_defense_wins_source_check" CHECK (("source" = ANY (ARRAY['quick_log'::"text", 'conversation'::"text"])))
);


ALTER TABLE "public"."user_defense_wins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_entities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "aliases" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "normalized_key" "text",
    "relation_to_user" "text",
    "description" "text",
    "confidence" numeric(3,2) DEFAULT 0.70 NOT NULL,
    "sensitivity_level" "text" DEFAULT 'normal'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "merged_into_entity_id" "uuid",
    "embedding" "public"."vector"(768),
    "embedding_model" "text",
    "version" integer DEFAULT 1 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_entities_confidence_check" CHECK ((("confidence" >= (0)::numeric) AND ("confidence" <= (1)::numeric))),
    CONSTRAINT "user_entities_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['person'::"text", 'organization'::"text", 'place'::"text", 'project'::"text", 'object'::"text", 'group'::"text", 'other'::"text"]))),
    CONSTRAINT "user_entities_sensitivity_level_check" CHECK (("sensitivity_level" = ANY (ARRAY['normal'::"text", 'sensitive'::"text", 'safety'::"text"]))),
    CONSTRAINT "user_entities_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'merged'::"text", 'archived'::"text", 'hidden_by_user'::"text", 'deleted_by_user'::"text"])))
);


ALTER TABLE "public"."user_entities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_habit_week_occurrences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cycle_id" "uuid" NOT NULL,
    "transformation_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "plan_item_id" "uuid" NOT NULL,
    "week_start_date" "date" NOT NULL,
    "ordinal" integer NOT NULL,
    "planned_day" "text" NOT NULL,
    "original_planned_day" "text",
    "actual_day" "text",
    "status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "source" "text" DEFAULT 'default_generated'::"text" NOT NULL,
    "validated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "default_day" "text" NOT NULL,
    CONSTRAINT "user_habit_week_occurrences_actual_day_check" CHECK ((("actual_day" IS NULL) OR ("actual_day" = ANY (ARRAY['mon'::"text", 'tue'::"text", 'wed'::"text", 'thu'::"text", 'fri'::"text", 'sat'::"text", 'sun'::"text"])))),
    CONSTRAINT "user_habit_week_occurrences_default_day_check" CHECK (("default_day" = ANY (ARRAY['mon'::"text", 'tue'::"text", 'wed'::"text", 'thu'::"text", 'fri'::"text", 'sat'::"text", 'sun'::"text"]))),
    CONSTRAINT "user_habit_week_occurrences_ordinal_check" CHECK ((("ordinal" >= 1) AND ("ordinal" <= 7))),
    CONSTRAINT "user_habit_week_occurrences_original_planned_day_check" CHECK ((("original_planned_day" IS NULL) OR ("original_planned_day" = ANY (ARRAY['mon'::"text", 'tue'::"text", 'wed'::"text", 'thu'::"text", 'fri'::"text", 'sat'::"text", 'sun'::"text"])))),
    CONSTRAINT "user_habit_week_occurrences_planned_day_check" CHECK (("planned_day" = ANY (ARRAY['mon'::"text", 'tue'::"text", 'wed'::"text", 'thu'::"text", 'fri'::"text", 'sat'::"text", 'sun'::"text"]))),
    CONSTRAINT "user_habit_week_occurrences_source_check" CHECK (("source" = ANY (ARRAY['default_generated'::"text", 'weekly_confirmed'::"text", 'auto_rescheduled'::"text", 'manual_change'::"text"]))),
    CONSTRAINT "user_habit_week_occurrences_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'done'::"text", 'partial'::"text", 'missed'::"text", 'rescheduled'::"text"])))
);


ALTER TABLE "public"."user_habit_week_occurrences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_habit_week_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cycle_id" "uuid" NOT NULL,
    "transformation_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "plan_item_id" "uuid" NOT NULL,
    "week_start_date" "date" NOT NULL,
    "status" "text" DEFAULT 'pending_confirmation'::"text" NOT NULL,
    "confirmed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_habit_week_plans_status_check" CHECK (("status" = ANY (ARRAY['pending_confirmation'::"text", 'confirmed'::"text", 'auto_applied'::"text"])))
);


ALTER TABLE "public"."user_habit_week_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_habit_week_reschedule_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cycle_id" "uuid" NOT NULL,
    "transformation_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "plan_item_id" "uuid" NOT NULL,
    "week_start_date" "date" NOT NULL,
    "occurrence_id" "uuid" NOT NULL,
    "from_day" "text" NOT NULL,
    "to_day" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_habit_week_reschedule_events_from_day_check" CHECK (("from_day" = ANY (ARRAY['mon'::"text", 'tue'::"text", 'wed'::"text", 'thu'::"text", 'fri'::"text", 'sat'::"text", 'sun'::"text"]))),
    CONSTRAINT "user_habit_week_reschedule_events_reason_check" CHECK (("reason" = ANY (ARRAY['auto_missed'::"text", 'manual_reschedule'::"text"]))),
    CONSTRAINT "user_habit_week_reschedule_events_to_day_check" CHECK (("to_day" = ANY (ARRAY['mon'::"text", 'tue'::"text", 'wed'::"text", 'thu'::"text", 'fri'::"text", 'sat'::"text", 'sun'::"text"])))
);


ALTER TABLE "public"."user_habit_week_reschedule_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_inspiration_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cycle_id" "uuid" NOT NULL,
    "transformation_id" "uuid",
    "phase_id" "text",
    "source" "text" NOT NULL,
    "status" "text" NOT NULL,
    "inspiration_type" "text" NOT NULL,
    "angle" "text",
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "cta_label" "text",
    "cta_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "effort_level" "text" NOT NULL,
    "context_window" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "scope_kind" "text" DEFAULT 'transformation'::"text" NOT NULL,
    CONSTRAINT "user_inspiration_items_context_window_check" CHECK (("context_window" = ANY (ARRAY['anytime'::"text", 'morning'::"text", 'afternoon'::"text", 'evening'::"text", 'during_friction'::"text"]))),
    CONSTRAINT "user_inspiration_items_effort_level_check" CHECK (("effort_level" = ANY (ARRAY['light'::"text", 'medium'::"text", 'high'::"text"]))),
    CONSTRAINT "user_inspiration_items_scope_kind_check" CHECK (("scope_kind" = ANY (ARRAY['transformation'::"text", 'out_of_plan'::"text"]))),
    CONSTRAINT "user_inspiration_items_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'prefill_plan'::"text", 'prefill_classification'::"text", 'system'::"text"]))),
    CONSTRAINT "user_inspiration_items_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'suggested'::"text", 'active'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."user_inspiration_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_level_tool_recommendation_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recommendation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cycle_id" "uuid" NOT NULL,
    "transformation_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_level_tool_recommendation_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['generated'::"text", 'marked_installed'::"text", 'marked_purchased'::"text", 'marked_already_owned'::"text", 'marked_not_relevant'::"text", 'superseded_after_plan_adjustment'::"text", 'regenerated_after_plan_adjustment'::"text"])))
);


ALTER TABLE "public"."user_level_tool_recommendation_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_level_tool_recommendations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cycle_id" "uuid" NOT NULL,
    "transformation_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "plan_version" integer NOT NULL,
    "plan_updated_at" timestamp with time zone NOT NULL,
    "target_level_id" "text",
    "target_level_order" integer NOT NULL,
    "priority_rank" integer NOT NULL,
    "tool_type" "text" NOT NULL,
    "category_key" "text" NOT NULL,
    "subcategory_key" "text",
    "display_name" "text" NOT NULL,
    "brand_name" "text",
    "reason" "text" NOT NULL,
    "why_this_level" "text" NOT NULL,
    "confidence_score" integer NOT NULL,
    "status" "text" DEFAULT 'recommended'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "superseded_by_recommendation_id" "uuid",
    "superseded_reason" "text",
    "level_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_level_tool_recommendations_category_key_check" CHECK (("category_key" = ANY (ARRAY['measurement_tracking'::"text", 'symptom_tracking'::"text", 'sleep_support'::"text", 'nutrition_prep'::"text", 'hydration_support'::"text", 'movement_training'::"text", 'recovery_mobility'::"text", 'pain_relief_support'::"text", 'distraction_blocking'::"text", 'reproductive_health'::"text", 'consumption_reduction'::"text", 'workspace_ergonomics'::"text"]))),
    CONSTRAINT "user_level_tool_recommendations_confidence_score_check" CHECK ((("confidence_score" >= 95) AND ("confidence_score" <= 100))),
    CONSTRAINT "user_level_tool_recommendations_plan_version_check" CHECK (("plan_version" >= 1)),
    CONSTRAINT "user_level_tool_recommendations_priority_rank_check" CHECK ((("priority_rank" >= 1) AND ("priority_rank" <= 2))),
    CONSTRAINT "user_level_tool_recommendations_status_check" CHECK (("status" = ANY (ARRAY['recommended'::"text", 'installed'::"text", 'purchased'::"text", 'already_owned'::"text", 'not_relevant'::"text"]))),
    CONSTRAINT "user_level_tool_recommendations_superseded_reason_check" CHECK ((("superseded_reason" IS NULL) OR ("superseded_reason" = ANY (ARRAY['level_rewritten'::"text", 'level_removed'::"text", 'regenerated_after_plan_change'::"text", 'level_recommendation_set_changed'::"text"])))),
    CONSTRAINT "user_level_tool_recommendations_target_level_order_check" CHECK (("target_level_order" >= 2)),
    CONSTRAINT "user_level_tool_recommendations_tool_type_check" CHECK (("tool_type" = ANY (ARRAY['app'::"text", 'product'::"text"])))
);


ALTER TABLE "public"."user_level_tool_recommendations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cycle_id" "uuid" NOT NULL,
    "transformation_id" "uuid",
    "scope" "public"."metric_scope" NOT NULL,
    "kind" "public"."metric_kind" NOT NULL,
    "status" "public"."metric_status" DEFAULT 'active'::"public"."metric_status" NOT NULL,
    "title" "text" NOT NULL,
    "unit" "text",
    "current_value" "text",
    "target_value" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_metrics_scope_transformation_check" CHECK (((("scope" = 'cycle'::"public"."metric_scope") AND ("transformation_id" IS NULL)) OR (("scope" = 'transformation'::"public"."metric_scope") AND ("transformation_id" IS NOT NULL))))
);


ALTER TABLE "public"."user_metrics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_module_archives" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entry_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "module_id" "text" NOT NULL,
    "content" "jsonb" NOT NULL,
    "archived_at" timestamp with time zone DEFAULT "now"(),
    "ai_summary" "text"
);


ALTER TABLE "public"."user_module_archives" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_module_state_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "module_id" "text" NOT NULL,
    "content" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'available'::"text" NOT NULL,
    "available_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "ai_summary" "text",
    CONSTRAINT "user_module_entries_status_check" CHECK (("status" = ANY (ARRAY['available'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."user_module_state_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_plan_item_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cycle_id" "uuid" NOT NULL,
    "transformation_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "plan_item_id" "uuid" NOT NULL,
    "entry_kind" "text" NOT NULL,
    "outcome" "text" NOT NULL,
    "value_numeric" numeric,
    "value_text" "text",
    "difficulty_level" "text",
    "blocker_hint" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "effective_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "user_plan_item_entries_difficulty_level_check" CHECK ((("difficulty_level" IS NULL) OR ("difficulty_level" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"])))),
    CONSTRAINT "user_plan_item_entries_entry_kind_check" CHECK (("entry_kind" = ANY (ARRAY['checkin'::"text", 'progress'::"text", 'skip'::"text", 'partial'::"text", 'blocker'::"text", 'support_feedback'::"text"])))
);


ALTER TABLE "public"."user_plan_item_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_plan_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cycle_id" "uuid" NOT NULL,
    "transformation_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "dimension" "public"."plan_dimension" NOT NULL,
    "kind" "public"."plan_item_kind" NOT NULL,
    "status" "public"."plan_item_status" DEFAULT 'pending'::"public"."plan_item_status" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "tracking_type" "public"."tracking_type" NOT NULL,
    "activation_order" integer,
    "activation_condition" "jsonb",
    "current_habit_state" "public"."habit_state",
    "support_mode" "public"."support_mode",
    "support_function" "public"."support_function",
    "target_reps" integer,
    "current_reps" integer,
    "cadence_label" "text",
    "scheduled_days" "text"[],
    "time_of_day" "text",
    "start_after_item_id" "uuid",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "activated_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "phase_id" "text",
    "phase_order" integer,
    "defense_card_id" "uuid",
    "attack_card_id" "uuid",
    "cards_status" "text" DEFAULT 'not_required'::"text" NOT NULL,
    "cards_generated_at" timestamp with time zone,
    CONSTRAINT "user_plan_items_activation_order_check" CHECK ((("activation_order" IS NULL) OR ("activation_order" >= 1))),
    CONSTRAINT "user_plan_items_cards_status_check" CHECK (("cards_status" = ANY (ARRAY['not_required'::"text", 'not_started'::"text", 'generating'::"text", 'ready'::"text", 'failed'::"text"]))),
    CONSTRAINT "user_plan_items_current_habit_state_check" CHECK ((("dimension" = 'habits'::"public"."plan_dimension") OR ("current_habit_state" IS NULL))),
    CONSTRAINT "user_plan_items_current_reps_check" CHECK ((("current_reps" IS NULL) OR ("current_reps" >= 0))),
    CONSTRAINT "user_plan_items_scheduled_days_check" CHECK ((("scheduled_days" IS NULL) OR ((("cardinality"("scheduled_days") >= 1) AND ("cardinality"("scheduled_days") <= 7)) AND ("scheduled_days" <@ ARRAY['mon'::"text", 'tue'::"text", 'wed'::"text", 'thu'::"text", 'fri'::"text", 'sat'::"text", 'sun'::"text"])))),
    CONSTRAINT "user_plan_items_support_fields_check" CHECK ((("dimension" = 'support'::"public"."plan_dimension") OR (("support_mode" IS NULL) AND ("support_function" IS NULL)))),
    CONSTRAINT "user_plan_items_target_reps_check" CHECK ((("target_reps" IS NULL) OR ("target_reps" >= 0)))
);


ALTER TABLE "public"."user_plan_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_plan_level_generation_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "review_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "cycle_id" "uuid" NOT NULL,
    "transformation_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "from_phase_id" "text" NOT NULL,
    "to_phase_id" "text",
    "decision" "text" NOT NULL,
    "decision_reason" "text" NOT NULL,
    "generation_input" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "previous_current_level_runtime" "jsonb",
    "next_current_level_runtime" "jsonb",
    "previous_plan_blueprint" "jsonb",
    "next_plan_blueprint" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_plan_level_generation_events_decision_check" CHECK (("decision" = ANY (ARRAY['keep'::"text", 'shorten'::"text", 'extend'::"text", 'lighten'::"text"])))
);


ALTER TABLE "public"."user_plan_level_generation_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_plan_level_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cycle_id" "uuid" NOT NULL,
    "transformation_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "phase_id" "text" NOT NULL,
    "level_order" integer NOT NULL,
    "level_title" "text" NOT NULL,
    "duration_weeks" integer,
    "questionnaire_schema" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "answers" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "review_summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "review_mode" "text" DEFAULT 'user_review'::"text" NOT NULL,
    "auto_reason" "text",
    CONSTRAINT "user_plan_level_reviews_duration_weeks_check" CHECK ((("duration_weeks" IS NULL) OR (("duration_weeks" >= 1) AND ("duration_weeks" <= 12)))),
    CONSTRAINT "user_plan_level_reviews_level_order_check" CHECK (("level_order" >= 1)),
    CONSTRAINT "user_plan_level_reviews_review_mode_check" CHECK (("review_mode" = ANY (ARRAY['user_review'::"text", 'auto_timeout'::"text"])))
);


ALTER TABLE "public"."user_plan_level_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_plan_review_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "transformation_id" "uuid" NOT NULL,
    "plan_id" "uuid",
    "surface" "text" NOT NULL,
    "user_comment" "text" NOT NULL,
    "prior_thread" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "plan_snapshot" "jsonb" NOT NULL,
    "review_kind" "text" NOT NULL,
    "decision" "text" NOT NULL,
    "understanding" "text" NOT NULL,
    "impact" "text" NOT NULL,
    "proposed_changes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "regeneration_feedback" "text",
    "clarification_question" "text",
    "status" "text" DEFAULT 'proposed'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "applied_at" timestamp with time zone,
    "adjustment_scope" "text",
    "control_mode" "text",
    "resistance_note" "text",
    "principle_reminder" "text",
    "offer_complete_level" boolean DEFAULT false NOT NULL,
    "conversation_mode" "text",
    "assistant_message" "text",
    "conversation_thread" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "session_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "message_count" integer DEFAULT 0 NOT NULL,
    "precision_count" integer DEFAULT 0 NOT NULL,
    "preview_plan_id" "uuid",
    "finalized_plan_id" "uuid",
    "effective_start_date" "date",
    "session_expires_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "user_change_summary" "text",
    CONSTRAINT "user_plan_review_requests_adjustment_scope_check" CHECK ((("adjustment_scope" IS NULL) OR ("adjustment_scope" = ANY (ARRAY['current_level_only'::"text", 'future_levels_only'::"text", 'current_plus_future'::"text", 'full_plan'::"text"])))),
    CONSTRAINT "user_plan_review_requests_control_mode_check" CHECK ((("control_mode" IS NULL) OR ("control_mode" = ANY (ARRAY['clarify_only'::"text", 'adjust_current_level'::"text", 'adjust_future_levels'::"text", 'advance_ready'::"text"])))),
    CONSTRAINT "user_plan_review_requests_conversation_mode_check" CHECK ((("conversation_mode" IS NULL) OR ("conversation_mode" = ANY (ARRAY['level_adjustment'::"text", 'plan_adjustment'::"text", 'explanation_chat'::"text", 'guardrail_chat'::"text"])))),
    CONSTRAINT "user_plan_review_requests_decision_check" CHECK (("decision" = ANY (ARRAY['no_change'::"text", 'minor_adjustment'::"text", 'partial_replan'::"text", 'full_replan'::"text"]))),
    CONSTRAINT "user_plan_review_requests_message_count_check" CHECK (("message_count" >= 0)),
    CONSTRAINT "user_plan_review_requests_precision_count_check" CHECK (("precision_count" >= 0)),
    CONSTRAINT "user_plan_review_requests_review_kind_check" CHECK (("review_kind" = ANY (ARRAY['clarification'::"text", 'preference_change'::"text", 'invalidating_fact'::"text"]))),
    CONSTRAINT "user_plan_review_requests_session_status_check" CHECK (("session_status" = ANY (ARRAY['active'::"text", 'preview_ready'::"text", 'completed'::"text", 'expired'::"text", 'restarted'::"text"]))),
    CONSTRAINT "user_plan_review_requests_status_check" CHECK (("status" = ANY (ARRAY['proposed'::"text", 'applied'::"text", 'dismissed'::"text"]))),
    CONSTRAINT "user_plan_review_requests_surface_check" CHECK (("surface" = ANY (ARRAY['onboarding_preview'::"text", 'active_plan'::"text"])))
);


ALTER TABLE "public"."user_plan_review_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_plans_v2" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cycle_id" "uuid" NOT NULL,
    "transformation_id" "uuid" NOT NULL,
    "status" "public"."plan_status" DEFAULT 'draft'::"public"."plan_status" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "title" "text",
    "content" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "generation_attempts" integer DEFAULT 0 NOT NULL,
    "last_generation_reason" "text",
    "activated_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "archived_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "generation_feedback" "text",
    "generation_input_snapshot" "jsonb",
    CONSTRAINT "user_plans_v2_generation_attempts_check" CHECK ((("generation_attempts" >= 0) AND ("generation_attempts" <= 50))),
    CONSTRAINT "user_plans_v2_version_check" CHECK (("version" >= 1))
);


ALTER TABLE "public"."user_plans_v2" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_potion_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cycle_id" "uuid" NOT NULL,
    "transformation_id" "uuid",
    "phase_id" "text",
    "potion_type" "text" NOT NULL,
    "source" "text" NOT NULL,
    "status" "text" NOT NULL,
    "questionnaire_schema" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "questionnaire_answers" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "free_text" "text",
    "content" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "follow_up_strategy" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "scope_kind" "text" DEFAULT 'transformation'::"text" NOT NULL,
    CONSTRAINT "user_potion_sessions_potion_type_check" CHECK (("potion_type" = ANY (ARRAY['rappel'::"text", 'courage'::"text", 'guerison'::"text", 'clarte'::"text", 'amour'::"text", 'apaisement'::"text"]))),
    CONSTRAINT "user_potion_sessions_scope_kind_check" CHECK (("scope_kind" = ANY (ARRAY['transformation'::"text", 'out_of_plan'::"text"]))),
    CONSTRAINT "user_potion_sessions_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'prefill_plan'::"text", 'prefill_classification'::"text", 'system'::"text"]))),
    CONSTRAINT "user_potion_sessions_status_check" CHECK (("status" = ANY (ARRAY['completed'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."user_potion_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_professional_support_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recommendation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cycle_id" "uuid" NOT NULL,
    "transformation_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_professional_support_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['generated'::"text", 'dismissed_not_needed'::"text", 'marked_booked'::"text", 'marked_completed'::"text", 'retimed_after_plan_change'::"text"])))
);


ALTER TABLE "public"."user_professional_support_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_professional_support_recommendations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cycle_id" "uuid" NOT NULL,
    "transformation_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "professional_key" "text" NOT NULL,
    "priority_rank" integer NOT NULL,
    "recommendation_level" "text" NOT NULL,
    "summary" "text",
    "reason" "text" NOT NULL,
    "timing_kind" "text" NOT NULL,
    "target_phase_id" "text",
    "target_level_order" integer,
    "timing_reason" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_professional_support_recommenda_recommendation_level_check" CHECK (("recommendation_level" = ANY (ARRAY['optional'::"text", 'recommended'::"text"]))),
    CONSTRAINT "user_professional_support_recommendati_target_level_order_check" CHECK ((("target_level_order" IS NULL) OR ("target_level_order" >= 1))),
    CONSTRAINT "user_professional_support_recommendation_professional_key_check" CHECK (("professional_key" = ANY (ARRAY['general_practitioner'::"text", 'sports_physician'::"text", 'dietitian'::"text", 'nutrition_physician'::"text", 'endocrinologist'::"text", 'cardiologist'::"text", 'gastroenterologist'::"text", 'sleep_specialist'::"text", 'ent_specialist'::"text", 'urologist'::"text", 'andrologist'::"text", 'gynecologist'::"text", 'midwife'::"text", 'fertility_specialist'::"text", 'sexologist'::"text", 'physiotherapist'::"text", 'pelvic_floor_physio'::"text", 'pain_specialist'::"text", 'psychologist'::"text", 'psychotherapist'::"text", 'psychiatrist'::"text", 'cbt_therapist'::"text", 'neuropsychologist'::"text", 'addiction_specialist'::"text", 'smoking_cessation_specialist'::"text", 'couples_therapist'::"text", 'relationship_counselor'::"text", 'family_mediator'::"text", 'sports_coach'::"text", 'strength_conditioning_coach'::"text", 'yoga_pilates_teacher'::"text", 'occupational_therapist'::"text", 'adhd_coach'::"text", 'career_coach'::"text", 'work_psychologist'::"text", 'executive_coach'::"text", 'speech_coach'::"text", 'budget_counselor'::"text", 'debt_advisor'::"text", 'social_worker'::"text", 'lawyer'::"text", 'notary'::"text"]))),
    CONSTRAINT "user_professional_support_recommendations_priority_rank_check" CHECK ((("priority_rank" >= 1) AND ("priority_rank" <= 3))),
    CONSTRAINT "user_professional_support_recommendations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'not_needed'::"text", 'booked'::"text", 'completed'::"text"]))),
    CONSTRAINT "user_professional_support_recommendations_timing_kind_check" CHECK (("timing_kind" = ANY (ARRAY['now'::"text", 'after_phase1'::"text", 'during_target_level'::"text", 'before_next_level'::"text", 'if_blocked'::"text"])))
);


ALTER TABLE "public"."user_professional_support_recommendations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profile_facts" (
    "user_id" "uuid" NOT NULL,
    "scope" "text" DEFAULT 'global'::"text" NOT NULL,
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "confidence" double precision DEFAULT 1.0 NOT NULL,
    "source_type" "text" DEFAULT 'explicit_user'::"text" NOT NULL,
    "last_source_message_id" "uuid",
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_confirmed_at" timestamp with time zone,
    "version" integer DEFAULT 1 NOT NULL,
    "previous_values" "jsonb" DEFAULT '[]'::"jsonb"
);


ALTER TABLE "public"."user_profile_facts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_recurring_reminders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "message_instruction" "text" NOT NULL,
    "rationale" "text",
    "local_time_hhmm" "text" NOT NULL,
    "scheduled_days" "text"[] NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "deactivated_at" timestamp with time zone,
    "last_drafted_at" timestamp with time zone,
    "last_draft_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "unanswered_probe_count" integer DEFAULT 0 NOT NULL,
    "probe_last_sent_at" timestamp with time zone,
    "probe_paused_at" timestamp with time zone,
    "personalization_level" integer DEFAULT 1 NOT NULL,
    "context_policy" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "classification_reason" "text",
    "last_classified_at" timestamp with time zone,
    "cycle_id" "uuid",
    "transformation_id" "uuid",
    "scope_kind" "text" DEFAULT 'out_of_plan'::"text" NOT NULL,
    "initiative_kind" "text" DEFAULT 'base_free'::"text" NOT NULL,
    "source_kind" "text" DEFAULT 'user_created'::"text" NOT NULL,
    "source_potion_session_id" "uuid",
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "ended_reason" "text",
    "archived_at" timestamp with time zone,
    "initiative_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "target_kind" "text" DEFAULT 'none'::"text" NOT NULL,
    "target_plan_item_id" "uuid",
    "target_action_family_key" "text",
    "target_generated_temp_id" "text",
    "target_binding_policy" "text" DEFAULT 'none'::"text" NOT NULL,
    "target_lifecycle_policy" "text" DEFAULT 'independent'::"text" NOT NULL,
    CONSTRAINT "user_recurring_reminders_ended_reason_check" CHECK ((("ended_reason" IS NULL) OR ("ended_reason" = ANY (ARRAY['user'::"text", 'plan_completed'::"text", 'plan_stopped'::"text", 'expired'::"text"])))),
    CONSTRAINT "user_recurring_reminders_initiative_kind_check" CHECK (("initiative_kind" = ANY (ARRAY['base_free'::"text", 'plan_free'::"text", 'potion_follow_up'::"text"]))),
    CONSTRAINT "user_recurring_reminders_local_time_hhmm_check" CHECK (("local_time_hhmm" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'::"text")),
    CONSTRAINT "user_recurring_reminders_personalization_level_check" CHECK ((("personalization_level" >= 1) AND ("personalization_level" <= 3))),
    CONSTRAINT "user_recurring_reminders_scheduled_days_check" CHECK ((("cardinality"("scheduled_days") >= 1) AND ("cardinality"("scheduled_days") <= 7) AND ("scheduled_days" <@ ARRAY['mon'::"text", 'tue'::"text", 'wed'::"text", 'thu'::"text", 'fri'::"text", 'sat'::"text", 'sun'::"text"]))),
    CONSTRAINT "user_recurring_reminders_scope_kind_check" CHECK (("scope_kind" = ANY (ARRAY['transformation'::"text", 'out_of_plan'::"text"]))),
    CONSTRAINT "user_recurring_reminders_source_kind_check" CHECK (("source_kind" = ANY (ARRAY['user_created'::"text", 'potion_generated'::"text"]))),
    CONSTRAINT "user_recurring_reminders_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'completed'::"text", 'expired'::"text", 'archived'::"text"]))),
    CONSTRAINT "user_recurring_reminders_target_binding_policy_check" CHECK (("target_binding_policy" = ANY (ARRAY['none'::"text", 'snapshot'::"text", 'live_action'::"text", 'live_action_family'::"text"]))),
    CONSTRAINT "user_recurring_reminders_target_kind_check" CHECK (("target_kind" = ANY (ARRAY['none'::"text", 'transformation'::"text", 'plan_item'::"text", 'action_family'::"text"]))),
    CONSTRAINT "user_recurring_reminders_target_lifecycle_policy_check" CHECK (("target_lifecycle_policy" = ANY (ARRAY['independent'::"text", 'while_target_active'::"text", 'while_family_in_current_plan'::"text"]))),
    CONSTRAINT "user_recurring_reminders_unanswered_probe_count_check" CHECK ((("unanswered_probe_count" >= 0) AND ("unanswered_probe_count" <= 2)))
);


ALTER TABLE "public"."user_recurring_reminders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_relation_preferences" (
    "user_id" "uuid" NOT NULL,
    "preferred_contact_windows" "text"[],
    "disliked_contact_windows" "text"[],
    "preferred_tone" "text",
    "preferred_message_length" "text",
    "max_proactive_intensity" "text",
    "soft_no_contact_rules" "jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_relation_preferences_max_proactive_intensity_check" CHECK ((("max_proactive_intensity" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"])) OR ("max_proactive_intensity" IS NULL))),
    CONSTRAINT "user_relation_preferences_preferred_message_length_check" CHECK ((("preferred_message_length" = ANY (ARRAY['short'::"text", 'medium'::"text"])) OR ("preferred_message_length" IS NULL))),
    CONSTRAINT "user_relation_preferences_preferred_tone_check" CHECK ((("preferred_tone" = ANY (ARRAY['gentle'::"text", 'direct'::"text", 'mixed'::"text"])) OR ("preferred_tone" IS NULL)))
);


ALTER TABLE "public"."user_relation_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_rendez_vous" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cycle_id" "uuid" NOT NULL,
    "transformation_id" "uuid",
    "kind" "text" NOT NULL,
    "state" "text" DEFAULT 'draft'::"text" NOT NULL,
    "budget_class" "text" NOT NULL,
    "trigger_reason" "text" NOT NULL,
    "confidence" "text" NOT NULL,
    "scheduled_for" timestamp with time zone,
    "posture" "text" NOT NULL,
    "source_refs" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "linked_checkin_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "delivered_at" timestamp with time zone,
    CONSTRAINT "user_rendez_vous_budget_class_check" CHECK (("budget_class" = ANY (ARRAY['silent'::"text", 'light'::"text", 'notable'::"text"]))),
    CONSTRAINT "user_rendez_vous_confidence_check" CHECK (("confidence" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"]))),
    CONSTRAINT "user_rendez_vous_confidence_not_low_check" CHECK (("confidence" <> 'low'::"text")),
    CONSTRAINT "user_rendez_vous_kind_check" CHECK (("kind" = ANY (ARRAY['pre_event_grounding'::"text", 'post_friction_repair'::"text", 'weekly_reset'::"text", 'mission_preparation'::"text", 'transition_handoff'::"text"]))),
    CONSTRAINT "user_rendez_vous_posture_check" CHECK (("posture" = ANY (ARRAY['gentle'::"text", 'supportive'::"text", 'preparatory'::"text", 'repair'::"text"]))),
    CONSTRAINT "user_rendez_vous_scheduled_for_required_check" CHECK ((("state" = ANY (ARRAY['draft'::"text", 'cancelled'::"text"])) OR ("scheduled_for" IS NOT NULL))),
    CONSTRAINT "user_rendez_vous_state_check" CHECK (("state" = ANY (ARRAY['draft'::"text", 'scheduled'::"text", 'delivered'::"text", 'skipped'::"text", 'cancelled'::"text", 'completed'::"text"]))),
    CONSTRAINT "user_rendez_vous_trigger_reason_check" CHECK (("btrim"("trigger_reason") <> ''::"text"))
);


ALTER TABLE "public"."user_rendez_vous" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_support_cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cycle_id" "uuid" NOT NULL,
    "transformation_id" "uuid",
    "phase_id" "text",
    "source" "text" NOT NULL,
    "status" "text" NOT NULL,
    "content" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "scope_kind" "text" DEFAULT 'transformation'::"text" NOT NULL,
    CONSTRAINT "user_support_cards_scope_kind_check" CHECK (("scope_kind" = ANY (ARRAY['transformation'::"text", 'out_of_plan'::"text"]))),
    CONSTRAINT "user_support_cards_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'prefill_plan'::"text", 'prefill_classification'::"text", 'system'::"text"]))),
    CONSTRAINT "user_support_cards_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'suggested'::"text", 'active'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."user_support_cards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_topic_keywords" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "topic_id" "uuid" NOT NULL,
    "keyword" "text" NOT NULL,
    "keyword_embedding" "public"."vector"(768) NOT NULL,
    "source" "text" DEFAULT 'llm_extracted'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_topic_keywords" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_topic_memories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "first_mentioned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lifecycle_stage" "text" DEFAULT 'candidate'::"text" NOT NULL,
    "search_doc" "text" DEFAULT ''::"text" NOT NULL,
    "search_doc_embedding" "public"."vector"(768),
    "search_doc_version" integer DEFAULT 1 NOT NULL,
    "pending_changes_count" integer DEFAULT 0 NOT NULL,
    "last_compacted_at" timestamp with time zone,
    "summary_version" integer DEFAULT 1 NOT NULL,
    "sensitivity_max" "text" DEFAULT 'normal'::"text" NOT NULL,
    "archived_reason" "text",
    "merged_into_topic_id" "uuid",
    CONSTRAINT "user_topic_memories_lifecycle_stage_check" CHECK (("lifecycle_stage" = ANY (ARRAY['candidate'::"text", 'durable'::"text", 'dormant'::"text", 'archived'::"text"]))),
    CONSTRAINT "user_topic_memories_sensitivity_max_check" CHECK (("sensitivity_max" = ANY (ARRAY['normal'::"text", 'sensitive'::"text", 'safety'::"text"])))
);


ALTER TABLE "public"."user_topic_memories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_transformation_aspects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cycle_id" "uuid" NOT NULL,
    "transformation_id" "uuid",
    "label" "text" NOT NULL,
    "raw_excerpt" "text",
    "status" "public"."aspect_status" DEFAULT 'active'::"public"."aspect_status" NOT NULL,
    "uncertainty_level" "public"."aspect_uncertainty" NOT NULL,
    "deferred_reason" "public"."deferred_reason",
    "source_rank" integer,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_transformation_aspects_deferred_reason_check" CHECK ((("status" = 'deferred'::"public"."aspect_status") OR ("deferred_reason" IS NULL))),
    CONSTRAINT "user_transformation_aspects_source_rank_check" CHECK ((("source_rank" IS NULL) OR ("source_rank" >= 1)))
);


ALTER TABLE "public"."user_transformation_aspects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_transformation_closure_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cycle_id" "uuid" NOT NULL,
    "transformation_id" "uuid" NOT NULL,
    "plan_id" "uuid",
    "helpfulness_rating" integer NOT NULL,
    "improvement_reasons" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "improvement_detail" "text",
    "most_helpful_area" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "user_transformation_closure_feedback_helpfulness_rating_check" CHECK ((("helpfulness_rating" >= 1) AND ("helpfulness_rating" <= 10))),
    CONSTRAINT "user_transformation_closure_feedback_most_helpful_area_check" CHECK (("most_helpful_area" = ANY (ARRAY['habits'::"text", 'one_off_actions'::"text", 'sophia_messages'::"text", 'plan_structure'::"text", 'progress_tracking'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."user_transformation_closure_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_transformations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cycle_id" "uuid" NOT NULL,
    "priority_order" integer NOT NULL,
    "status" "public"."transformation_status" DEFAULT 'draft'::"public"."transformation_status" NOT NULL,
    "title" "text",
    "internal_summary" "text" NOT NULL,
    "user_summary" "text" NOT NULL,
    "success_definition" "text",
    "main_constraint" "text",
    "questionnaire_schema" "jsonb",
    "questionnaire_answers" "jsonb",
    "completion_summary" "text",
    "handoff_payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "activated_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "ordering_rationale" "text",
    "unlocked_principles" "jsonb" DEFAULT '{"kaizen": true}'::"jsonb" NOT NULL,
    "base_de_vie_payload" "jsonb",
    CONSTRAINT "user_transformations_priority_order_check" CHECK (("priority_order" >= 1))
);


ALTER TABLE "public"."user_transformations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_victory_ledger" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cycle_id" "uuid" NOT NULL,
    "transformation_id" "uuid",
    "plan_item_id" "uuid",
    "title" "text" NOT NULL,
    "summary" "text" NOT NULL,
    "confidence" "text" NOT NULL,
    "source_kind" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "user_victory_ledger_confidence_check" CHECK (("confidence" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"]))),
    CONSTRAINT "user_victory_ledger_source_kind_check" CHECK (("source_kind" = ANY (ARRAY['daily'::"text", 'weekly'::"text", 'chat'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."user_victory_ledger" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_week_states" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "module_id" "text" NOT NULL,
    "status" "text" NOT NULL,
    "available_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "first_updated_at" timestamp with time zone,
    CONSTRAINT "user_week_states_status_check" CHECK (("status" = ANY (ARRAY['available'::"text", 'active'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."user_week_states" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weekly_bilan_suggestion_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "week_start" "date" NOT NULL,
    "proposal_id" "text" NOT NULL,
    "recommendation" "text" NOT NULL,
    "primary_action_title" "text",
    "decisions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "outcome" "text" NOT NULL,
    "summary" "text",
    "applied_changes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "weekly_bilan_suggestion_events_outcome_check" CHECK (("outcome" = ANY (ARRAY['accepted'::"text", 'rejected'::"text", 'applied'::"text", 'failed'::"text"]))),
    CONSTRAINT "weekly_bilan_suggestion_events_recommendation_check" CHECK (("recommendation" = ANY (ARRAY['activate'::"text", 'deactivate'::"text", 'swap'::"text"])))
);


ALTER TABLE "public"."weekly_bilan_suggestion_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_inbound_dedup" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "request_id" "text",
    "webhook_request_id" "text",
    "wamid_in" "text" NOT NULL,
    "from_e164" "text",
    "user_id" "uuid",
    "status" "text" DEFAULT 'received'::"text" NOT NULL,
    "processed_at" timestamp with time zone,
    "chat_message_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."whatsapp_inbound_dedup" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_link_requests" (
    "phone_e164" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "last_prompted_at" timestamp with time zone,
    "attempts" integer DEFAULT 0 NOT NULL,
    "linked_user_id" "uuid",
    "last_email_attempt" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whatsapp_link_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'linked'::"text", 'blocked'::"text", 'confirm_email'::"text", 'support_required'::"text"])))
);


ALTER TABLE "public"."whatsapp_link_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_link_tokens" (
    "token" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "consumed_at" timestamp with time zone,
    "consumed_phone_e164" "text",
    CONSTRAINT "whatsapp_link_tokens_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'consumed'::"text", 'revoked'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."whatsapp_link_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_monthly_quotas" (
    "user_id" "uuid" NOT NULL,
    "quota_key" "text" NOT NULL,
    "month_key" "text" NOT NULL,
    "used_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whatsapp_monthly_quotas_month_key_check" CHECK (("month_key" ~ '^\d{4}-\d{2}$'::"text")),
    CONSTRAINT "whatsapp_monthly_quotas_used_count_check" CHECK (("used_count" >= 0))
);


ALTER TABLE "public"."whatsapp_monthly_quotas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_optin_recovery" (
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "provider_message_id" "text",
    "error_code" "text",
    "error_message" "text",
    "first_detected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email_sent_at" timestamp with time zone,
    "resolved_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whatsapp_optin_recovery_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'resolved'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."whatsapp_optin_recovery" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_outbound_status_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "provider_message_id" "text" NOT NULL,
    "status" "text" NOT NULL,
    "status_timestamp" timestamp with time zone,
    "recipient_id" "text",
    "raw" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."whatsapp_outbound_status_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_pending_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "scheduled_checkin_id" "uuid",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "not_before" timestamp with time zone,
    CONSTRAINT "whatsapp_pending_actions_kind_check" CHECK (("kind" = ANY (ARRAY['scheduled_checkin'::"text", 'deferred_send'::"text", 'proactive_template_candidate'::"text", 'access_ended_notification'::"text", 'access_reactivation_offer'::"text", 'rendez_vous'::"text"]))),
    CONSTRAINT "whatsapp_pending_actions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'done'::"text", 'cancelled'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."whatsapp_pending_actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_unlinked_inbound_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "phone_e164" "text" NOT NULL,
    "wa_message_id" "text" NOT NULL,
    "wa_type" "text",
    "text_content" "text",
    "interactive_id" "text",
    "interactive_title" "text",
    "wa_profile_name" "text",
    "raw" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."whatsapp_unlinked_inbound_messages" OWNER TO "postgres";


ALTER TABLE ONLY "public"."app_config"
    ADD CONSTRAINT "app_config_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."communication_logs"
    ADD CONSTRAINT "communication_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."confirmation_tokens_consumed"
    ADD CONSTRAINT "confirmation_tokens_consumed_pkey" PRIMARY KEY ("token_id");



ALTER TABLE ONLY "public"."conversation_eval_events"
    ADD CONSTRAINT "conversation_eval_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_eval_judge_jobs"
    ADD CONSTRAINT "conversation_eval_judge_jobs_eval_run_id_uniq" UNIQUE ("eval_run_id");



ALTER TABLE ONLY "public"."conversation_eval_judge_jobs"
    ADD CONSTRAINT "conversation_eval_judge_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_eval_runs"
    ADD CONSTRAINT "conversation_eval_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_scope_memories"
    ADD CONSTRAINT "conversation_scope_memories_pkey" PRIMARY KEY ("user_id", "scope");



ALTER TABLE ONLY "public"."conversation_turn_traces"
    ADD CONSTRAINT "conversation_turn_traces_pkey" PRIMARY KEY ("turn_id");



ALTER TABLE ONLY "public"."internal_admins"
    ADD CONSTRAINT "internal_admins_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."llm_pricing"
    ADD CONSTRAINT "llm_pricing_pkey" PRIMARY KEY ("provider", "model");



ALTER TABLE ONLY "public"."llm_retry_jobs"
    ADD CONSTRAINT "llm_retry_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."llm_usage_events"
    ADD CONSTRAINT "llm_usage_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memory_change_log"
    ADD CONSTRAINT "memory_change_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memory_eval_annotations"
    ADD CONSTRAINT "memory_eval_annotations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memory_extraction_runs"
    ADD CONSTRAINT "memory_extraction_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memory_extraction_runs"
    ADD CONSTRAINT "memory_extraction_runs_user_id_batch_hash_prompt_version_key" UNIQUE ("user_id", "batch_hash", "prompt_version");



ALTER TABLE ONLY "public"."memory_item_action_occurrences"
    ADD CONSTRAINT "memory_item_action_occurrence_memory_item_action_id_action__key" UNIQUE ("memory_item_action_id", "action_occurrence_id");



ALTER TABLE ONLY "public"."memory_item_action_occurrences"
    ADD CONSTRAINT "memory_item_action_occurrences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memory_item_actions"
    ADD CONSTRAINT "memory_item_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memory_item_entities"
    ADD CONSTRAINT "memory_item_entities_memory_item_id_entity_id_relation_type_key" UNIQUE ("memory_item_id", "entity_id", "relation_type");



ALTER TABLE ONLY "public"."memory_item_entities"
    ADD CONSTRAINT "memory_item_entities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memory_item_sources"
    ADD CONSTRAINT "memory_item_sources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memory_item_topics"
    ADD CONSTRAINT "memory_item_topics_memory_item_id_topic_id_relation_type_key" UNIQUE ("memory_item_id", "topic_id", "relation_type");



ALTER TABLE ONLY "public"."memory_item_topics"
    ADD CONSTRAINT "memory_item_topics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memory_items"
    ADD CONSTRAINT "memory_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memory_message_processing"
    ADD CONSTRAINT "memory_message_processing_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memory_message_processing"
    ADD CONSTRAINT "memory_message_processing_user_id_message_id_processing_rol_key" UNIQUE ("user_id", "message_id", "processing_role");



ALTER TABLE ONLY "public"."memory_observability_events"
    ADD CONSTRAINT "memory_observability_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memory_weekly_review_runs"
    ADD CONSTRAINT "memory_weekly_review_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memory_weekly_review_runs"
    ADD CONSTRAINT "memory_weekly_review_runs_user_id_iso_year_iso_week_key" UNIQUE ("user_id", "iso_year", "iso_week");



ALTER TABLE ONLY "public"."proactive_job_state"
    ADD CONSTRAINT "proactive_job_state_pkey" PRIMARY KEY ("user_id", "job");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scheduled_checkins"
    ADD CONSTRAINT "scheduled_checkins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stripe_webhook_events"
    ADD CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_stripe_subscription_id_key" UNIQUE ("stripe_subscription_id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."system_error_logs"
    ADD CONSTRAINT "system_error_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_runtime_snapshots"
    ADD CONSTRAINT "system_runtime_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."turn_summary_logs"
    ADD CONSTRAINT "turn_summary_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_architect_quotes"
    ADD CONSTRAINT "user_architect_quotes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_architect_reflections"
    ADD CONSTRAINT "user_architect_reflections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_architect_stories"
    ADD CONSTRAINT "user_architect_stories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_architect_wishes"
    ADD CONSTRAINT "user_architect_wishes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_attack_cards"
    ADD CONSTRAINT "user_attack_cards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_chat_states"
    ADD CONSTRAINT "user_chat_states_pkey" PRIMARY KEY ("user_id", "scope");



ALTER TABLE ONLY "public"."user_core_identity_archive"
    ADD CONSTRAINT "user_core_identity_archive_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_core_identity"
    ADD CONSTRAINT "user_core_identity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_core_identity"
    ADD CONSTRAINT "user_core_identity_user_id_week_id_key" UNIQUE ("user_id", "week_id");



ALTER TABLE ONLY "public"."user_cycle_drafts"
    ADD CONSTRAINT "user_cycle_drafts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_cycles"
    ADD CONSTRAINT "user_cycles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_defense_cards"
    ADD CONSTRAINT "user_defense_cards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_defense_wins"
    ADD CONSTRAINT "user_defense_wins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_entities"
    ADD CONSTRAINT "user_entities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_habit_week_occurrences"
    ADD CONSTRAINT "user_habit_week_occurrences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_habit_week_occurrences"
    ADD CONSTRAINT "user_habit_week_occurrences_unique" UNIQUE ("user_id", "plan_item_id", "week_start_date", "ordinal");



ALTER TABLE ONLY "public"."user_habit_week_plans"
    ADD CONSTRAINT "user_habit_week_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_habit_week_plans"
    ADD CONSTRAINT "user_habit_week_plans_unique" UNIQUE ("user_id", "plan_item_id", "week_start_date");



ALTER TABLE ONLY "public"."user_habit_week_reschedule_events"
    ADD CONSTRAINT "user_habit_week_reschedule_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_inspiration_items"
    ADD CONSTRAINT "user_inspiration_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_level_tool_recommendation_events"
    ADD CONSTRAINT "user_level_tool_recommendation_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_level_tool_recommendations"
    ADD CONSTRAINT "user_level_tool_recommendations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_metrics"
    ADD CONSTRAINT "user_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_module_archives"
    ADD CONSTRAINT "user_module_archives_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_module_state_entries"
    ADD CONSTRAINT "user_module_state_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_week_states"
    ADD CONSTRAINT "user_module_states_user_id_module_id_key" UNIQUE ("user_id", "module_id");



ALTER TABLE ONLY "public"."user_plan_item_entries"
    ADD CONSTRAINT "user_plan_item_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_plan_items"
    ADD CONSTRAINT "user_plan_items_id_plan_cycle_transformation_key" UNIQUE ("id", "plan_id", "cycle_id", "transformation_id");



ALTER TABLE ONLY "public"."user_plan_items"
    ADD CONSTRAINT "user_plan_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_plan_items"
    ADD CONSTRAINT "user_plan_items_plan_id_id_key" UNIQUE ("plan_id", "id");



ALTER TABLE ONLY "public"."user_plan_level_generation_events"
    ADD CONSTRAINT "user_plan_level_generation_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_plan_level_reviews"
    ADD CONSTRAINT "user_plan_level_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_plan_review_requests"
    ADD CONSTRAINT "user_plan_review_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_plans_v2"
    ADD CONSTRAINT "user_plans_v2_id_cycle_transformation_key" UNIQUE ("id", "cycle_id", "transformation_id");



ALTER TABLE ONLY "public"."user_plans_v2"
    ADD CONSTRAINT "user_plans_v2_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_plans_v2"
    ADD CONSTRAINT "user_plans_v2_transformation_version_key" UNIQUE ("transformation_id", "version");



ALTER TABLE ONLY "public"."user_potion_sessions"
    ADD CONSTRAINT "user_potion_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_professional_support_events"
    ADD CONSTRAINT "user_professional_support_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_professional_support_recommendations"
    ADD CONSTRAINT "user_professional_support_rec_transformation_id_professiona_key" UNIQUE ("transformation_id", "professional_key");



ALTER TABLE ONLY "public"."user_professional_support_recommendations"
    ADD CONSTRAINT "user_professional_support_recommendations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_profile_facts"
    ADD CONSTRAINT "user_profile_facts_pkey" PRIMARY KEY ("user_id", "scope", "key");



ALTER TABLE ONLY "public"."user_recurring_reminders"
    ADD CONSTRAINT "user_recurring_reminders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_relation_preferences"
    ADD CONSTRAINT "user_relation_preferences_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_rendez_vous"
    ADD CONSTRAINT "user_rendez_vous_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_support_cards"
    ADD CONSTRAINT "user_support_cards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_support_cards"
    ADD CONSTRAINT "user_support_cards_transformation_id_key" UNIQUE ("transformation_id");



ALTER TABLE ONLY "public"."user_topic_keywords"
    ADD CONSTRAINT "user_topic_keywords_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_topic_keywords"
    ADD CONSTRAINT "user_topic_keywords_user_id_keyword_key" UNIQUE ("user_id", "keyword");



ALTER TABLE ONLY "public"."user_topic_memories"
    ADD CONSTRAINT "user_topic_memories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_topic_memories"
    ADD CONSTRAINT "user_topic_memories_user_id_slug_key" UNIQUE ("user_id", "slug");



ALTER TABLE ONLY "public"."user_transformation_aspects"
    ADD CONSTRAINT "user_transformation_aspects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_transformation_closure_feedback"
    ADD CONSTRAINT "user_transformation_closure_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_transformation_closure_feedback"
    ADD CONSTRAINT "user_transformation_closure_feedback_transformation_key" UNIQUE ("transformation_id");



ALTER TABLE ONLY "public"."user_transformations"
    ADD CONSTRAINT "user_transformations_cycle_id_id_key" UNIQUE ("cycle_id", "id");



ALTER TABLE ONLY "public"."user_transformations"
    ADD CONSTRAINT "user_transformations_cycle_priority_key" UNIQUE ("cycle_id", "priority_order");



ALTER TABLE ONLY "public"."user_transformations"
    ADD CONSTRAINT "user_transformations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_victory_ledger"
    ADD CONSTRAINT "user_victory_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_week_states"
    ADD CONSTRAINT "user_week_states_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_bilan_suggestion_events"
    ADD CONSTRAINT "weekly_bilan_suggestion_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_cost_events"
    ADD CONSTRAINT "whatsapp_cost_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_inbound_dedup"
    ADD CONSTRAINT "whatsapp_inbound_dedup_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_link_requests"
    ADD CONSTRAINT "whatsapp_link_requests_pkey" PRIMARY KEY ("phone_e164");



ALTER TABLE ONLY "public"."whatsapp_link_tokens"
    ADD CONSTRAINT "whatsapp_link_tokens_pkey" PRIMARY KEY ("token");



ALTER TABLE ONLY "public"."whatsapp_monthly_quotas"
    ADD CONSTRAINT "whatsapp_monthly_quotas_pkey" PRIMARY KEY ("user_id", "quota_key", "month_key");



ALTER TABLE ONLY "public"."whatsapp_optin_recovery"
    ADD CONSTRAINT "whatsapp_optin_recovery_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."whatsapp_outbound_messages"
    ADD CONSTRAINT "whatsapp_outbound_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_outbound_status_events"
    ADD CONSTRAINT "whatsapp_outbound_status_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_pending_actions"
    ADD CONSTRAINT "whatsapp_pending_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_unlinked_inbound_messages"
    ADD CONSTRAINT "whatsapp_unlinked_inbound_messages_pkey" PRIMARY KEY ("id");



CREATE INDEX "attack_cards_plan_item_idx" ON "public"."user_attack_cards" USING "btree" ("plan_item_id", "generated_at" DESC) WHERE ("plan_item_id" IS NOT NULL);



CREATE INDEX "attack_cards_user_scope_idx" ON "public"."user_attack_cards" USING "btree" ("user_id", "cycle_id", "scope_kind", "transformation_id");



CREATE INDEX "attack_cards_user_scope_status_generated_idx" ON "public"."user_attack_cards" USING "btree" ("user_id", "cycle_id", "scope_kind", "transformation_id", "status", "generated_at" DESC);



CREATE INDEX "communication_logs_type_idx" ON "public"."communication_logs" USING "btree" ("type");



CREATE INDEX "communication_logs_user_id_idx" ON "public"."communication_logs" USING "btree" ("user_id");



CREATE INDEX "conversation_eval_events_request_idx" ON "public"."conversation_eval_events" USING "btree" ("request_id", "created_at" DESC);



CREATE INDEX "conversation_eval_events_run_idx" ON "public"."conversation_eval_events" USING "btree" ("eval_run_id", "created_at" DESC);



CREATE INDEX "conversation_eval_events_turn_summary_ttl_idx" ON "public"."conversation_eval_events" USING "btree" ("created_at" DESC) WHERE (("eval_run_id" IS NULL) AND ("source" = 'turn_summary'::"text"));



CREATE INDEX "conversation_eval_judge_jobs_next_attempt_idx" ON "public"."conversation_eval_judge_jobs" USING "btree" ("next_attempt_at") WHERE ("status" = ANY (ARRAY['pending'::"text", 'processing'::"text"]));



CREATE INDEX "conversation_scope_memories_architect_draft_ttl_idx" ON "public"."conversation_scope_memories" USING "btree" ("updated_at") WHERE (("scope" ~~ 'story:draft:%'::"text") OR ("scope" ~~ 'reflection:draft:%'::"text"));



CREATE INDEX "conversation_scope_memories_user_updated_idx" ON "public"."conversation_scope_memories" USING "btree" ("user_id", "updated_at" DESC);



CREATE INDEX "defense_cards_plan_item_idx" ON "public"."user_defense_cards" USING "btree" ("plan_item_id", "generated_at" DESC) WHERE ("plan_item_id" IS NOT NULL);



CREATE INDEX "defense_cards_user_scope_generated_idx" ON "public"."user_defense_cards" USING "btree" ("user_id", "cycle_id", "scope_kind", "transformation_id", "phase_id", "generated_at" DESC);



CREATE INDEX "defense_cards_user_scope_idx" ON "public"."user_defense_cards" USING "btree" ("user_id", "cycle_id", "scope_kind", "transformation_id");



CREATE INDEX "defense_wins_card_idx" ON "public"."user_defense_wins" USING "btree" ("defense_card_id", "logged_at" DESC);



CREATE INDEX "idx_chat_messages_user_created" ON "public"."chat_messages" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_chat_messages_user_scope_created" ON "public"."chat_messages" USING "btree" ("user_id", "scope", "created_at" DESC);



CREATE INDEX "idx_conversation_turn_traces_user_ts" ON "public"."conversation_turn_traces" USING "btree" ("user_id", "ts" DESC);



CREATE INDEX "idx_core_identity_archive_parent" ON "public"."user_core_identity_archive" USING "btree" ("identity_id");



CREATE INDEX "idx_core_identity_user" ON "public"."user_core_identity" USING "btree" ("user_id");



CREATE INDEX "idx_memory_change_log_user_target" ON "public"."memory_change_log" USING "btree" ("user_id", "target_type", "target_id", "created_at" DESC);



CREATE INDEX "idx_memory_extraction_runs_user_status" ON "public"."memory_extraction_runs" USING "btree" ("user_id", "status", "started_at" DESC);



CREATE INDEX "idx_memory_item_action_occurrences_action" ON "public"."memory_item_action_occurrences" USING "btree" ("memory_item_action_id");



CREATE INDEX "idx_memory_item_action_occurrences_occurrence" ON "public"."memory_item_action_occurrences" USING "btree" ("user_id", "action_occurrence_id");



CREATE INDEX "idx_memory_item_actions_item" ON "public"."memory_item_actions" USING "btree" ("memory_item_id");



CREATE INDEX "idx_memory_item_actions_plan" ON "public"."memory_item_actions" USING "btree" ("user_id", "plan_item_id") WHERE ("plan_item_id" IS NOT NULL);



CREATE INDEX "idx_memory_item_actions_window" ON "public"."memory_item_actions" USING "btree" ("user_id", "observation_window_start", "observation_window_end");



CREATE INDEX "idx_memory_item_entities_entity" ON "public"."memory_item_entities" USING "btree" ("user_id", "entity_id");



CREATE INDEX "idx_memory_item_entities_item" ON "public"."memory_item_entities" USING "btree" ("memory_item_id");



CREATE INDEX "idx_memory_item_sources_item" ON "public"."memory_item_sources" USING "btree" ("memory_item_id");



CREATE INDEX "idx_memory_item_sources_user_source" ON "public"."memory_item_sources" USING "btree" ("user_id", "source_type", "source_id");



CREATE INDEX "idx_memory_item_topics_item" ON "public"."memory_item_topics" USING "btree" ("memory_item_id");



CREATE INDEX "idx_memory_item_topics_topic" ON "public"."memory_item_topics" USING "btree" ("user_id", "topic_id", "status");



CREATE INDEX "idx_memory_items_canonical_key" ON "public"."memory_items" USING "btree" ("user_id", "canonical_key") WHERE ("canonical_key" IS NOT NULL);



CREATE INDEX "idx_memory_items_domain_keys" ON "public"."memory_items" USING "gin" ("domain_keys");



CREATE INDEX "idx_memory_items_embedding" ON "public"."memory_items" USING "hnsw" ("embedding" "public"."vector_cosine_ops") WHERE ("embedding" IS NOT NULL);



CREATE INDEX "idx_memory_items_sensitivity" ON "public"."memory_items" USING "btree" ("user_id", "sensitivity_level");



CREATE INDEX "idx_memory_items_user_observed" ON "public"."memory_items" USING "btree" ("user_id", "observed_at" DESC NULLS LAST);



CREATE INDEX "idx_memory_items_user_status_importance" ON "public"."memory_items" USING "btree" ("user_id", "status", "importance_score" DESC NULLS LAST, "observed_at" DESC NULLS LAST);



CREATE INDEX "idx_memory_items_user_status_kind" ON "public"."memory_items" USING "btree" ("user_id", "status", "kind");



CREATE INDEX "idx_memory_items_user_status_observed_at" ON "public"."memory_items" USING "btree" ("user_id", "status", "observed_at" DESC NULLS LAST);



CREATE INDEX "idx_memory_message_processing_run" ON "public"."memory_message_processing" USING "btree" ("extraction_run_id");



CREATE INDEX "idx_memory_message_processing_user_message" ON "public"."memory_message_processing" USING "btree" ("user_id", "message_id");



CREATE INDEX "idx_memory_weekly_review_runs_user" ON "public"."memory_weekly_review_runs" USING "btree" ("user_id", "iso_year" DESC, "iso_week" DESC);



CREATE INDEX "idx_topic_keywords_embedding" ON "public"."user_topic_keywords" USING "hnsw" ("keyword_embedding" "public"."vector_cosine_ops");



CREATE INDEX "idx_topic_keywords_keyword" ON "public"."user_topic_keywords" USING "btree" ("user_id", "keyword");



CREATE INDEX "idx_topic_keywords_user_topic" ON "public"."user_topic_keywords" USING "btree" ("user_id", "topic_id");



CREATE INDEX "idx_topic_memories_user_slug" ON "public"."user_topic_memories" USING "btree" ("user_id", "slug");



CREATE INDEX "idx_topic_memories_user_status" ON "public"."user_topic_memories" USING "btree" ("user_id", "status");



CREATE INDEX "idx_user_chat_states_user_scope" ON "public"."user_chat_states" USING "btree" ("user_id", "scope");



CREATE INDEX "idx_user_core_identity_embedding" ON "public"."user_core_identity" USING "hnsw" ("identity_embedding" "public"."vector_cosine_ops");



CREATE INDEX "idx_user_core_identity_user_updated" ON "public"."user_core_identity" USING "btree" ("user_id", "last_updated_at" DESC);



CREATE INDEX "idx_user_entities_aliases" ON "public"."user_entities" USING "gin" ("aliases");



CREATE INDEX "idx_user_entities_embedding" ON "public"."user_entities" USING "hnsw" ("embedding" "public"."vector_cosine_ops") WHERE ("embedding" IS NOT NULL);



CREATE INDEX "idx_user_entities_normalized_key" ON "public"."user_entities" USING "btree" ("user_id", "normalized_key") WHERE ("normalized_key" IS NOT NULL);



CREATE INDEX "idx_user_entities_user_type_status" ON "public"."user_entities" USING "btree" ("user_id", "entity_type", "status");



CREATE INDEX "idx_user_profile_facts_user_key" ON "public"."user_profile_facts" USING "btree" ("user_id", "key");



CREATE INDEX "idx_user_profile_facts_user_scope" ON "public"."user_profile_facts" USING "btree" ("user_id", "scope");



CREATE INDEX "idx_user_recurring_reminders_target_action_family" ON "public"."user_recurring_reminders" USING "btree" ("user_id", "target_action_family_key", "status") WHERE ("target_action_family_key" IS NOT NULL);



CREATE INDEX "idx_user_recurring_reminders_target_plan_item" ON "public"."user_recurring_reminders" USING "btree" ("target_plan_item_id", "status") WHERE ("target_plan_item_id" IS NOT NULL);



CREATE INDEX "idx_user_recurring_reminders_target_user_status" ON "public"."user_recurring_reminders" USING "btree" ("user_id", "target_kind", "status", "updated_at" DESC);



CREATE INDEX "idx_user_topic_memories_lifecycle" ON "public"."user_topic_memories" USING "btree" ("user_id", "lifecycle_stage", "status");



CREATE INDEX "idx_user_topic_memories_search_embedding" ON "public"."user_topic_memories" USING "hnsw" ("search_doc_embedding" "public"."vector_cosine_ops") WHERE ("search_doc_embedding" IS NOT NULL);



CREATE INDEX "idx_user_transformation_closure_feedback_user_id" ON "public"."user_transformation_closure_feedback" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "inspiration_items_user_scope_idx" ON "public"."user_inspiration_items" USING "btree" ("user_id", "cycle_id", "scope_kind", "status", "generated_at" DESC);



CREATE INDEX "inspiration_items_user_transformation_idx" ON "public"."user_inspiration_items" USING "btree" ("user_id", "transformation_id", "status", "generated_at" DESC);



CREATE UNIQUE INDEX "llm_retry_jobs_dedupe_pending" ON "public"."llm_retry_jobs" USING "btree" ("user_id", "scope", "message_hash") WHERE ("status" = ANY (ARRAY['pending'::"text", 'processing'::"text"]));



CREATE INDEX "llm_retry_jobs_next_attempt_idx" ON "public"."llm_retry_jobs" USING "btree" ("next_attempt_at") WHERE ("status" = ANY (ARRAY['pending'::"text", 'processing'::"text"]));



CREATE INDEX "llm_retry_jobs_user_scope_idx" ON "public"."llm_retry_jobs" USING "btree" ("user_id", "scope", "created_at" DESC);



CREATE INDEX "llm_usage_events_created_at_idx" ON "public"."llm_usage_events" USING "btree" ("created_at");



CREATE INDEX "llm_usage_events_created_at_user_idx" ON "public"."llm_usage_events" USING "btree" ("created_at", "user_id");



CREATE INDEX "llm_usage_events_model_provider_idx" ON "public"."llm_usage_events" USING "btree" ("model", "provider");



CREATE INDEX "llm_usage_events_operation_idx" ON "public"."llm_usage_events" USING "btree" ("operation_family", "operation_name");



CREATE INDEX "llm_usage_events_request_id_idx" ON "public"."llm_usage_events" USING "btree" ("request_id");



CREATE INDEX "llm_usage_events_status_idx" ON "public"."llm_usage_events" USING "btree" ("status");



CREATE INDEX "llm_usage_events_user_id_idx" ON "public"."llm_usage_events" USING "btree" ("user_id");



CREATE UNIQUE INDEX "memory_eval_annotations_reviewer_target_dimension_idx" ON "public"."memory_eval_annotations" USING "btree" ("reviewer_user_id", "target_key", "dimension");



CREATE INDEX "memory_eval_annotations_user_window_idx" ON "public"."memory_eval_annotations" USING "btree" ("user_id", "window_from" DESC, "window_to" DESC);



CREATE INDEX "memory_observability_events_event_idx" ON "public"."memory_observability_events" USING "btree" ("event_name", "created_at" DESC);



CREATE INDEX "memory_observability_events_request_idx" ON "public"."memory_observability_events" USING "btree" ("request_id");



CREATE INDEX "memory_observability_events_user_idx" ON "public"."memory_observability_events" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "potion_sessions_user_scope_idx" ON "public"."user_potion_sessions" USING "btree" ("user_id", "cycle_id", "scope_kind", "transformation_id", "generated_at" DESC);



CREATE INDEX "potion_sessions_user_scope_type_idx" ON "public"."user_potion_sessions" USING "btree" ("user_id", "cycle_id", "scope_kind", "transformation_id", "potion_type", "generated_at" DESC);



CREATE INDEX "profiles_morning_active_action_seed_queue_idx" ON "public"."profiles" USING "btree" ("id") WHERE ("morning_active_action_checkins_seeded_at" IS NULL);



CREATE INDEX "profiles_phone_number_idx" ON "public"."profiles" USING "btree" ("phone_number");



CREATE UNIQUE INDEX "profiles_phone_number_verified_unique" ON "public"."profiles" USING "btree" ("phone_number") WHERE (("phone_verified_at" IS NOT NULL) AND ("phone_number" IS NOT NULL));



CREATE INDEX "profiles_whatsapp_bilan_opted_in_idx" ON "public"."profiles" USING "btree" ("whatsapp_bilan_opted_in");



CREATE INDEX "profiles_whatsapp_bilan_paused_until_idx" ON "public"."profiles" USING "btree" ("whatsapp_bilan_paused_until");



CREATE INDEX "profiles_whatsapp_coaching_paused_until_idx" ON "public"."profiles" USING "btree" ("whatsapp_coaching_paused_until");



CREATE INDEX "profiles_whatsapp_last_inbound_idx" ON "public"."profiles" USING "btree" ("whatsapp_last_inbound_at" DESC);



CREATE INDEX "profiles_whatsapp_onboarding_started_at_idx" ON "public"."profiles" USING "btree" ("whatsapp_onboarding_started_at");



CREATE INDEX "profiles_whatsapp_opted_in_idx" ON "public"."profiles" USING "btree" ("whatsapp_opted_in");



CREATE INDEX "profiles_whatsapp_opted_out_at_idx" ON "public"."profiles" USING "btree" ("whatsapp_opted_out_at" DESC);



CREATE INDEX "profiles_whatsapp_state_idx" ON "public"."profiles" USING "btree" ("whatsapp_state");



CREATE INDEX "scheduled_checkins_recurring_reminder_idx" ON "public"."scheduled_checkins" USING "btree" ("recurring_reminder_id", "status", "scheduled_for" DESC) WHERE ("recurring_reminder_id" IS NOT NULL);



CREATE UNIQUE INDEX "scheduled_checkins_user_event_time_unique" ON "public"."scheduled_checkins" USING "btree" ("user_id", "event_context", "scheduled_for");



CREATE INDEX "subscriptions_current_period_end_idx" ON "public"."subscriptions" USING "btree" ("current_period_end");



CREATE INDEX "subscriptions_status_idx" ON "public"."subscriptions" USING "btree" ("status");



CREATE INDEX "subscriptions_user_id_idx" ON "public"."subscriptions" USING "btree" ("user_id");



CREATE INDEX "support_cards_user_scope_idx" ON "public"."user_support_cards" USING "btree" ("user_id", "cycle_id", "scope_kind", "transformation_id");



CREATE INDEX "support_cards_user_transformation_idx" ON "public"."user_support_cards" USING "btree" ("user_id", "transformation_id");



CREATE INDEX "system_error_logs_created_at_idx" ON "public"."system_error_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "system_error_logs_function_name_idx" ON "public"."system_error_logs" USING "btree" ("function_name", "created_at" DESC);



CREATE INDEX "system_error_logs_request_id_idx" ON "public"."system_error_logs" USING "btree" ("request_id");



CREATE INDEX "system_error_logs_severity_idx" ON "public"."system_error_logs" USING "btree" ("severity", "created_at" DESC);



CREATE INDEX "system_error_logs_user_id_idx" ON "public"."system_error_logs" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "system_runtime_snapshots_cycle_type_created_idx" ON "public"."system_runtime_snapshots" USING "btree" ("cycle_id", "snapshot_type", "created_at" DESC) WHERE ("cycle_id" IS NOT NULL);



CREATE INDEX "system_runtime_snapshots_transformation_type_created_idx" ON "public"."system_runtime_snapshots" USING "btree" ("transformation_id", "snapshot_type", "created_at" DESC) WHERE ("transformation_id" IS NOT NULL);



CREATE INDEX "system_runtime_snapshots_user_type_created_idx" ON "public"."system_runtime_snapshots" USING "btree" ("user_id", "snapshot_type", "created_at" DESC);



CREATE INDEX "turn_summary_logs_created_at_idx" ON "public"."turn_summary_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "turn_summary_logs_request_idx" ON "public"."turn_summary_logs" USING "btree" ("request_id");



CREATE INDEX "turn_summary_logs_user_idx" ON "public"."turn_summary_logs" USING "btree" ("user_id", "created_at" DESC);



CREATE UNIQUE INDEX "uniq_memory_item_sources" ON "public"."memory_item_sources" USING "btree" ("memory_item_id", "source_type", "source_id", "source_message_id") NULLS NOT DISTINCT;



CREATE INDEX "user_architect_quotes_tags_gin_idx" ON "public"."user_architect_quotes" USING "gin" ("tags");



CREATE INDEX "user_architect_quotes_user_created_idx" ON "public"."user_architect_quotes" USING "btree" ("user_id", "created_at" DESC, "id" DESC);



CREATE INDEX "user_architect_quotes_user_updated_idx" ON "public"."user_architect_quotes" USING "btree" ("user_id", "updated_at" DESC, "id" DESC);



CREATE INDEX "user_architect_reflections_tags_gin_idx" ON "public"."user_architect_reflections" USING "gin" ("tags");



CREATE INDEX "user_architect_reflections_user_created_idx" ON "public"."user_architect_reflections" USING "btree" ("user_id", "created_at" DESC, "id" DESC);



CREATE INDEX "user_architect_reflections_user_updated_idx" ON "public"."user_architect_reflections" USING "btree" ("user_id", "updated_at" DESC, "id" DESC);



CREATE INDEX "user_architect_stories_topic_tags_gin_idx" ON "public"."user_architect_stories" USING "gin" ("topic_tags");



CREATE INDEX "user_architect_stories_user_created_idx" ON "public"."user_architect_stories" USING "btree" ("user_id", "created_at" DESC, "id" DESC);



CREATE INDEX "user_architect_stories_user_updated_idx" ON "public"."user_architect_stories" USING "btree" ("user_id", "updated_at" DESC, "id" DESC);



CREATE INDEX "user_architect_wishes_user_category_created_idx" ON "public"."user_architect_wishes" USING "btree" ("user_id", "category", "created_at" DESC);



CREATE INDEX "user_architect_wishes_user_status_created_idx" ON "public"."user_architect_wishes" USING "btree" ("user_id", "status", "created_at" DESC);



CREATE INDEX "user_attack_cards_out_of_plan_user_cycle_generated_idx" ON "public"."user_attack_cards" USING "btree" ("user_id", "cycle_id", "generated_at" DESC) WHERE ("scope_kind" = 'out_of_plan'::"text");



CREATE UNIQUE INDEX "user_cycle_drafts_anonymous_session_id_key" ON "public"."user_cycle_drafts" USING "btree" ("anonymous_session_id");



CREATE INDEX "user_cycle_drafts_expires_at_idx" ON "public"."user_cycle_drafts" USING "btree" ("expires_at");



CREATE INDEX "user_cycles_active_transformation_idx" ON "public"."user_cycles" USING "btree" ("active_transformation_id") WHERE ("active_transformation_id" IS NOT NULL);



CREATE UNIQUE INDEX "user_cycles_one_active_per_user_idx" ON "public"."user_cycles" USING "btree" ("user_id") WHERE ("status" = 'active'::"public"."cycle_status");



CREATE INDEX "user_cycles_user_status_idx" ON "public"."user_cycles" USING "btree" ("user_id", "status", "updated_at" DESC);



CREATE INDEX "user_defense_cards_out_of_plan_user_cycle_generated_idx" ON "public"."user_defense_cards" USING "btree" ("user_id", "cycle_id", "generated_at" DESC) WHERE ("scope_kind" = 'out_of_plan'::"text");



CREATE INDEX "user_habit_week_occurrences_user_week_idx" ON "public"."user_habit_week_occurrences" USING "btree" ("user_id", "week_start_date" DESC, "plan_item_id", "ordinal");



CREATE INDEX "user_habit_week_plans_user_week_idx" ON "public"."user_habit_week_plans" USING "btree" ("user_id", "week_start_date" DESC);



CREATE INDEX "user_habit_week_reschedule_events_occurrence_idx" ON "public"."user_habit_week_reschedule_events" USING "btree" ("occurrence_id", "created_at");



CREATE INDEX "user_habit_week_reschedule_events_user_week_idx" ON "public"."user_habit_week_reschedule_events" USING "btree" ("user_id", "week_start_date" DESC, "plan_item_id", "created_at");



CREATE INDEX "user_level_tool_recommendation_events_recommendation_idx" ON "public"."user_level_tool_recommendation_events" USING "btree" ("recommendation_id", "created_at" DESC);



CREATE INDEX "user_level_tool_recommendation_events_transformation_idx" ON "public"."user_level_tool_recommendation_events" USING "btree" ("transformation_id", "created_at" DESC);



CREATE INDEX "user_level_tool_recommendations_active_idx" ON "public"."user_level_tool_recommendations" USING "btree" ("transformation_id", "is_active", "target_level_order", "priority_rank");



CREATE UNIQUE INDEX "user_level_tool_recommendations_active_level_rank_idx" ON "public"."user_level_tool_recommendations" USING "btree" ("plan_id", "target_level_order", "priority_rank") WHERE ("is_active" = true);



CREATE INDEX "user_level_tool_recommendations_plan_idx" ON "public"."user_level_tool_recommendations" USING "btree" ("plan_id", "updated_at" DESC);



CREATE INDEX "user_metrics_cycle_status_idx" ON "public"."user_metrics" USING "btree" ("cycle_id", "status", "updated_at" DESC);



CREATE UNIQUE INDEX "user_metrics_one_active_north_star_per_cycle_idx" ON "public"."user_metrics" USING "btree" ("cycle_id") WHERE (("scope" = 'cycle'::"public"."metric_scope") AND ("kind" = 'north_star'::"public"."metric_kind") AND ("status" = 'active'::"public"."metric_status"));



CREATE INDEX "user_metrics_scope_kind_idx" ON "public"."user_metrics" USING "btree" ("scope", "kind", "status");



CREATE INDEX "user_metrics_transformation_status_idx" ON "public"."user_metrics" USING "btree" ("transformation_id", "status", "updated_at" DESC) WHERE ("transformation_id" IS NOT NULL);



CREATE INDEX "user_module_archives_entry_idx" ON "public"."user_module_archives" USING "btree" ("entry_id");



CREATE INDEX "user_module_archives_user_module_idx" ON "public"."user_module_archives" USING "btree" ("user_id", "module_id");



CREATE UNIQUE INDEX "user_module_state_entries_user_module_idx" ON "public"."user_module_state_entries" USING "btree" ("user_id", "module_id");



CREATE INDEX "user_plan_item_entries_cycle_idx" ON "public"."user_plan_item_entries" USING "btree" ("cycle_id", "effective_at" DESC, "created_at" DESC);



CREATE INDEX "user_plan_item_entries_plan_idx" ON "public"."user_plan_item_entries" USING "btree" ("plan_id", "effective_at" DESC, "created_at" DESC);



CREATE INDEX "user_plan_item_entries_plan_item_effective_idx" ON "public"."user_plan_item_entries" USING "btree" ("plan_item_id", "effective_at" DESC, "created_at" DESC);



CREATE INDEX "user_plan_item_entries_transformation_idx" ON "public"."user_plan_item_entries" USING "btree" ("transformation_id", "effective_at" DESC, "created_at" DESC);



CREATE INDEX "user_plan_items_cards_status_idx" ON "public"."user_plan_items" USING "btree" ("plan_id", "cards_status", "phase_order", "activation_order");



CREATE INDEX "user_plan_items_cycle_status_idx" ON "public"."user_plan_items" USING "btree" ("cycle_id", "status", "updated_at" DESC);



CREATE INDEX "user_plan_items_dimension_status_idx" ON "public"."user_plan_items" USING "btree" ("dimension", "status", "activation_order");



CREATE INDEX "user_plan_items_phase_idx" ON "public"."user_plan_items" USING "btree" ("plan_id", "phase_order");



CREATE INDEX "user_plan_items_plan_status_idx" ON "public"."user_plan_items" USING "btree" ("plan_id", "status", "activation_order");



CREATE INDEX "user_plan_items_start_after_idx" ON "public"."user_plan_items" USING "btree" ("start_after_item_id") WHERE ("start_after_item_id" IS NOT NULL);



CREATE INDEX "user_plan_items_transformation_status_idx" ON "public"."user_plan_items" USING "btree" ("transformation_id", "status", "updated_at" DESC);



CREATE INDEX "user_plan_level_generation_events_plan_created_idx" ON "public"."user_plan_level_generation_events" USING "btree" ("plan_id", "created_at" DESC);



CREATE INDEX "user_plan_level_generation_events_plan_phase_idx" ON "public"."user_plan_level_generation_events" USING "btree" ("plan_id", "from_phase_id", "created_at" DESC);



CREATE INDEX "user_plan_level_generation_events_transformation_created_idx" ON "public"."user_plan_level_generation_events" USING "btree" ("transformation_id", "created_at" DESC);



CREATE INDEX "user_plan_level_reviews_plan_created_idx" ON "public"."user_plan_level_reviews" USING "btree" ("plan_id", "created_at" DESC);



CREATE INDEX "user_plan_level_reviews_plan_phase_idx" ON "public"."user_plan_level_reviews" USING "btree" ("plan_id", "phase_id", "created_at" DESC);



CREATE INDEX "user_plan_level_reviews_transformation_created_idx" ON "public"."user_plan_level_reviews" USING "btree" ("transformation_id", "created_at" DESC);



CREATE INDEX "user_plan_review_requests_transformation_idx" ON "public"."user_plan_review_requests" USING "btree" ("transformation_id", "created_at" DESC);



CREATE INDEX "user_plan_review_requests_transformation_status_idx" ON "public"."user_plan_review_requests" USING "btree" ("transformation_id", "session_status", "updated_at" DESC);



CREATE INDEX "user_plan_review_requests_user_idx" ON "public"."user_plan_review_requests" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "user_plans_v2_cycle_status_idx" ON "public"."user_plans_v2" USING "btree" ("cycle_id", "status", "updated_at" DESC);



CREATE UNIQUE INDEX "user_plans_v2_one_active_per_transformation_idx" ON "public"."user_plans_v2" USING "btree" ("transformation_id") WHERE ("status" = 'active'::"public"."plan_status");



CREATE INDEX "user_plans_v2_transformation_status_idx" ON "public"."user_plans_v2" USING "btree" ("transformation_id", "status", "updated_at" DESC);



CREATE INDEX "user_plans_v2_user_status_idx" ON "public"."user_plans_v2" USING "btree" ("user_id", "status", "updated_at" DESC);



CREATE INDEX "user_professional_support_events_recommendation_idx" ON "public"."user_professional_support_events" USING "btree" ("recommendation_id", "created_at" DESC);



CREATE INDEX "user_professional_support_events_transformation_idx" ON "public"."user_professional_support_events" USING "btree" ("transformation_id", "created_at" DESC);



CREATE INDEX "user_professional_support_recommendations_active_idx" ON "public"."user_professional_support_recommendations" USING "btree" ("transformation_id", "is_active", "priority_rank");



CREATE INDEX "user_professional_support_recommendations_plan_idx" ON "public"."user_professional_support_recommendations" USING "btree" ("plan_id", "updated_at" DESC);



CREATE INDEX "user_recurring_reminders_active_idx" ON "public"."user_recurring_reminders" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "user_recurring_reminders_personalization_idx" ON "public"."user_recurring_reminders" USING "btree" ("user_id", "personalization_level", "updated_at" DESC);



CREATE INDEX "user_recurring_reminders_potion_source_idx" ON "public"."user_recurring_reminders" USING "btree" ("source_potion_session_id") WHERE ("source_potion_session_id" IS NOT NULL);



CREATE INDEX "user_recurring_reminders_scope_idx" ON "public"."user_recurring_reminders" USING "btree" ("user_id", "scope_kind", "status", "updated_at" DESC);



CREATE INDEX "user_recurring_reminders_transformation_idx" ON "public"."user_recurring_reminders" USING "btree" ("transformation_id", "initiative_kind", "status", "updated_at" DESC);



CREATE INDEX "user_recurring_reminders_user_status_idx" ON "public"."user_recurring_reminders" USING "btree" ("user_id", "status", "updated_at" DESC);



CREATE INDEX "user_rendez_vous_user_scheduled_for_idx" ON "public"."user_rendez_vous" USING "btree" ("user_id", "scheduled_for") WHERE ("scheduled_for" IS NOT NULL);



CREATE INDEX "user_rendez_vous_user_state_idx" ON "public"."user_rendez_vous" USING "btree" ("user_id", "state");



CREATE UNIQUE INDEX "user_support_cards_one_out_of_plan_per_cycle_idx" ON "public"."user_support_cards" USING "btree" ("user_id", "cycle_id") WHERE ("scope_kind" = 'out_of_plan'::"text");



CREATE INDEX "user_transformation_aspects_cycle_idx" ON "public"."user_transformation_aspects" USING "btree" ("cycle_id", "status", "created_at" DESC);



CREATE INDEX "user_transformation_aspects_transformation_idx" ON "public"."user_transformation_aspects" USING "btree" ("transformation_id", "status", "created_at" DESC) WHERE ("transformation_id" IS NOT NULL);



CREATE INDEX "user_transformations_cycle_status_idx" ON "public"."user_transformations" USING "btree" ("cycle_id", "status", "priority_order");



CREATE INDEX "user_transformations_cycle_status_priority_idx" ON "public"."user_transformations" USING "btree" ("cycle_id", "status", "priority_order", "updated_at" DESC);



CREATE INDEX "user_victory_ledger_cycle_created_idx" ON "public"."user_victory_ledger" USING "btree" ("cycle_id", "created_at" DESC);



CREATE INDEX "user_victory_ledger_plan_item_created_idx" ON "public"."user_victory_ledger" USING "btree" ("plan_item_id", "created_at" DESC) WHERE ("plan_item_id" IS NOT NULL);



CREATE INDEX "user_victory_ledger_transformation_created_idx" ON "public"."user_victory_ledger" USING "btree" ("transformation_id", "created_at" DESC) WHERE ("transformation_id" IS NOT NULL);



CREATE INDEX "user_week_states_user_idx" ON "public"."user_week_states" USING "btree" ("user_id");



CREATE UNIQUE INDEX "user_week_states_user_module_idx" ON "public"."user_week_states" USING "btree" ("user_id", "module_id");



CREATE INDEX "weekly_bilan_suggestion_events_user_week_idx" ON "public"."weekly_bilan_suggestion_events" USING "btree" ("user_id", "week_start", "created_at" DESC);



CREATE INDEX "whatsapp_cost_events_event_date_idx" ON "public"."whatsapp_cost_events" USING "btree" ("event_date");



CREATE UNIQUE INDEX "whatsapp_cost_events_provider_message_id_key" ON "public"."whatsapp_cost_events" USING "btree" ("provider_message_id");



CREATE INDEX "whatsapp_cost_events_user_id_idx" ON "public"."whatsapp_cost_events" USING "btree" ("user_id");



CREATE INDEX "whatsapp_inbound_dedup_user_id_idx" ON "public"."whatsapp_inbound_dedup" USING "btree" ("user_id");



CREATE UNIQUE INDEX "whatsapp_inbound_dedup_wamid_in_key" ON "public"."whatsapp_inbound_dedup" USING "btree" ("wamid_in");



CREATE INDEX "whatsapp_link_requests_status_idx" ON "public"."whatsapp_link_requests" USING "btree" ("status");



CREATE INDEX "whatsapp_link_tokens_expires_at_idx" ON "public"."whatsapp_link_tokens" USING "btree" ("expires_at");



CREATE INDEX "whatsapp_link_tokens_user_id_idx" ON "public"."whatsapp_link_tokens" USING "btree" ("user_id");



CREATE INDEX "whatsapp_optin_recovery_email_sent_idx" ON "public"."whatsapp_optin_recovery" USING "btree" ("email_sent_at" DESC);



CREATE INDEX "whatsapp_optin_recovery_status_idx" ON "public"."whatsapp_optin_recovery" USING "btree" ("status", "updated_at" DESC);



CREATE UNIQUE INDEX "whatsapp_outbound_messages_provider_message_id_key" ON "public"."whatsapp_outbound_messages" USING "btree" ("provider_message_id") WHERE ("provider_message_id" IS NOT NULL);



CREATE INDEX "whatsapp_outbound_messages_status_next_retry_idx" ON "public"."whatsapp_outbound_messages" USING "btree" ("status", "next_retry_at");



CREATE INDEX "whatsapp_outbound_messages_user_id_idx" ON "public"."whatsapp_outbound_messages" USING "btree" ("user_id");



CREATE UNIQUE INDEX "whatsapp_outbound_status_events_dedup_key" ON "public"."whatsapp_outbound_status_events" USING "btree" ("provider_message_id", "status", "status_timestamp");



CREATE INDEX "whatsapp_pending_actions_deferred_due_idx" ON "public"."whatsapp_pending_actions" USING "btree" ("status", "not_before", "created_at" DESC) WHERE ("kind" = 'deferred_send'::"text");



CREATE INDEX "whatsapp_pending_actions_lookup_idx" ON "public"."whatsapp_pending_actions" USING "btree" ("user_id", "kind", "status", "created_at" DESC);



CREATE INDEX "whatsapp_pending_actions_proactive_candidate_idx" ON "public"."whatsapp_pending_actions" USING "btree" ("user_id", "status", "not_before", "created_at" DESC) WHERE ("kind" = 'proactive_template_candidate'::"text");



CREATE INDEX "whatsapp_unlinked_inbound_messages_phone_created_idx" ON "public"."whatsapp_unlinked_inbound_messages" USING "btree" ("phone_e164", "created_at" DESC);



CREATE UNIQUE INDEX "whatsapp_unlinked_inbound_messages_wa_message_id_ux" ON "public"."whatsapp_unlinked_inbound_messages" USING "btree" ("wa_message_id");



CREATE OR REPLACE TRIGGER "enforce_single_master_admin_trg" BEFORE INSERT OR UPDATE ON "public"."internal_admins" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_single_master_admin"();



CREATE OR REPLACE TRIGGER "guard_unlocked_principles_update" BEFORE UPDATE ON "public"."user_transformations" FOR EACH ROW EXECUTE FUNCTION "public"."guard_unlocked_principles_update"();



CREATE OR REPLACE TRIGGER "guard_v2_plan_item_activation" BEFORE UPDATE ON "public"."user_plan_items" FOR EACH ROW EXECUTE FUNCTION "public"."guard_v2_plan_item_activation"();



CREATE OR REPLACE TRIGGER "normalize_user_architect_quotes" BEFORE INSERT OR UPDATE ON "public"."user_architect_quotes" FOR EACH ROW EXECUTE FUNCTION "public"."handle_user_architect_quotes_write"();



CREATE OR REPLACE TRIGGER "normalize_user_architect_reflections" BEFORE INSERT OR UPDATE ON "public"."user_architect_reflections" FOR EACH ROW EXECUTE FUNCTION "public"."handle_user_architect_reflections_write"();



CREATE OR REPLACE TRIGGER "normalize_user_architect_stories" BEFORE INSERT OR UPDATE ON "public"."user_architect_stories" FOR EACH ROW EXECUTE FUNCTION "public"."handle_user_architect_stories_write"();



CREATE OR REPLACE TRIGGER "on_forge_level_progression" AFTER INSERT OR UPDATE ON "public"."user_module_state_entries" FOR EACH ROW EXECUTE FUNCTION "public"."handle_forge_level_progression"();



CREATE OR REPLACE TRIGGER "on_module_activity_unlock" AFTER INSERT OR UPDATE ON "public"."user_module_state_entries" FOR EACH ROW EXECUTE FUNCTION "public"."handle_module_activity_unlock"();



CREATE OR REPLACE TRIGGER "on_module_created_memory" AFTER INSERT ON "public"."user_module_state_entries" FOR EACH ROW WHEN (("length"(("new"."content")::"text") > 10)) EXECUTE FUNCTION "public"."handle_module_memory_trigger"();



CREATE OR REPLACE TRIGGER "on_module_entry_update" AFTER UPDATE ON "public"."user_module_state_entries" FOR EACH ROW EXECUTE FUNCTION "public"."handle_module_entry_archive"();



CREATE OR REPLACE TRIGGER "on_module_updated_memory" AFTER UPDATE ON "public"."user_module_state_entries" FOR EACH ROW WHEN ((("new"."content" IS DISTINCT FROM "old"."content") AND ("length"(("new"."content")::"text") > 10))) EXECUTE FUNCTION "public"."handle_module_memory_trigger"();



CREATE OR REPLACE TRIGGER "on_profile_created_init_modules" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."initialize_user_modules"();



CREATE OR REPLACE TRIGGER "on_profile_created_master_admin" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."maybe_add_master_admin_from_profile"();



CREATE OR REPLACE TRIGGER "on_profile_created_seed_default_coach_preferences_trigger" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."on_profile_created_seed_default_coach_preferences"();



CREATE OR REPLACE TRIGGER "on_profiles_trial_change_recompute_access" AFTER INSERT OR UPDATE OF "trial_end" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."_trg_recompute_profile_access_tier_from_profiles"();



CREATE OR REPLACE TRIGGER "on_subscriptions_change_recompute_access" AFTER INSERT OR UPDATE OF "status", "current_period_end", "tier" ON "public"."subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."_trg_recompute_profile_access_tier_from_subscriptions"();



CREATE OR REPLACE TRIGGER "on_subscriptions_change_recompute_access_delete" AFTER DELETE ON "public"."subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."_trg_recompute_profile_access_tier_from_subscriptions"();



CREATE OR REPLACE TRIGGER "on_week12_manual_unlock" AFTER INSERT OR UPDATE ON "public"."user_week_states" FOR EACH ROW WHEN ((("new"."module_id" = 'week_12'::"text") AND ("new"."status" = 'available'::"text") AND ("new"."available_at" <= "now"()))) EXECUTE FUNCTION "public"."handle_week12_manual_unlock"();



CREATE OR REPLACE TRIGGER "on_week_completed_identity" AFTER UPDATE ON "public"."user_week_states" FOR EACH ROW WHEN ((("new"."status" = 'completed'::"text") AND ("old"."status" IS DISTINCT FROM "new"."status"))) EXECUTE FUNCTION "public"."handle_core_identity_trigger"();



CREATE OR REPLACE TRIGGER "sync_phone_verified_on_whatsapp_optin_trigger" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW WHEN (("new"."whatsapp_opted_in" IS DISTINCT FROM "old"."whatsapp_opted_in")) EXECUTE FUNCTION "public"."sync_phone_verified_on_whatsapp_optin"();



CREATE OR REPLACE TRIGGER "trg_chat_messages_scope_memory_insert" AFTER INSERT ON "public"."chat_messages" FOR EACH ROW EXECUTE FUNCTION "public"."handle_conversation_scope_memory_message_insert"();



CREATE OR REPLACE TRIGGER "trg_memory_item_actions_updated_at" BEFORE UPDATE ON "public"."memory_item_actions" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_memory_item_entities_updated_at" BEFORE UPDATE ON "public"."memory_item_entities" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_memory_item_topics_updated_at" BEFORE UPDATE ON "public"."memory_item_topics" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_memory_items_set_updated_at" BEFORE UPDATE ON "public"."memory_items" FOR EACH ROW EXECUTE FUNCTION "public"."tg_memory_items_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_memory_weekly_review_runs_updated_at" BEFORE UPDATE ON "public"."memory_weekly_review_runs" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_refresh_whatsapp_scheduling_on_access_tier_change" AFTER UPDATE OF "access_tier" ON "public"."profiles" FOR EACH ROW WHEN (("old"."access_tier" IS DISTINCT FROM "new"."access_tier")) EXECUTE FUNCTION "public"."handle_whatsapp_scheduling_access_tier_change"();



CREATE OR REPLACE TRIGGER "trg_scheduled_checkins_enforce_min_gap_1h" BEFORE INSERT OR UPDATE OF "user_id", "scheduled_for", "status" ON "public"."scheduled_checkins" FOR EACH ROW EXECUTE FUNCTION "public"."scheduled_checkins_enforce_min_gap_1h"();



CREATE OR REPLACE TRIGGER "trg_user_chat_states_trigger_synthesizer_threshold" AFTER UPDATE OF "unprocessed_msg_count" ON "public"."user_chat_states" FOR EACH ROW WHEN (("new"."unprocessed_msg_count" IS DISTINCT FROM "old"."unprocessed_msg_count")) EXECUTE FUNCTION "public"."handle_user_chat_state_synthesizer_threshold"();



CREATE OR REPLACE TRIGGER "trg_user_entities_updated_at" BEFORE UPDATE ON "public"."user_entities" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_user_topic_memories_updated_at" BEFORE UPDATE ON "public"."user_topic_memories" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_validate_app_config_edge_base_url" BEFORE INSERT OR UPDATE ON "public"."app_config" FOR EACH ROW EXECUTE FUNCTION "public"."_validate_app_config_edge_base_url"();



CREATE OR REPLACE TRIGGER "unlock_v2_principles_from_entry" AFTER INSERT ON "public"."user_plan_item_entries" FOR EACH ROW EXECUTE FUNCTION "public"."handle_v2_principle_unlock_from_entry"();



CREATE OR REPLACE TRIGGER "unlock_v2_principles_from_item_transition" AFTER UPDATE ON "public"."user_plan_items" FOR EACH ROW EXECUTE FUNCTION "public"."handle_v2_principle_unlock_from_item_transition"();



CREATE OR REPLACE TRIGGER "update_user_architect_quotes_modtime" BEFORE UPDATE ON "public"."user_architect_quotes" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_column"();



CREATE OR REPLACE TRIGGER "update_user_architect_reflections_modtime" BEFORE UPDATE ON "public"."user_architect_reflections" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_column"();



CREATE OR REPLACE TRIGGER "update_user_architect_stories_modtime" BEFORE UPDATE ON "public"."user_architect_stories" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_column"();



CREATE OR REPLACE TRIGGER "update_user_chat_states_modtime" BEFORE UPDATE ON "public"."user_chat_states" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_column"();



CREATE OR REPLACE TRIGGER "update_user_cycle_drafts_modtime" BEFORE UPDATE ON "public"."user_cycle_drafts" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_column"();



CREATE OR REPLACE TRIGGER "update_user_cycles_modtime" BEFORE UPDATE ON "public"."user_cycles" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_column"();



CREATE OR REPLACE TRIGGER "update_user_metrics_modtime" BEFORE UPDATE ON "public"."user_metrics" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_column"();



CREATE OR REPLACE TRIGGER "update_user_plan_items_modtime" BEFORE UPDATE ON "public"."user_plan_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_column"();



CREATE OR REPLACE TRIGGER "update_user_plans_v2_modtime" BEFORE UPDATE ON "public"."user_plans_v2" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_column"();



CREATE OR REPLACE TRIGGER "update_user_rendez_vous_modtime" BEFORE UPDATE ON "public"."user_rendez_vous" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_column"();



CREATE OR REPLACE TRIGGER "update_user_transformation_aspects_modtime" BEFORE UPDATE ON "public"."user_transformation_aspects" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_column"();



CREATE OR REPLACE TRIGGER "update_user_transformations_modtime" BEFORE UPDATE ON "public"."user_transformations" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_column"();



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."communication_logs"
    ADD CONSTRAINT "communication_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_eval_events"
    ADD CONSTRAINT "conversation_eval_events_eval_run_id_fkey" FOREIGN KEY ("eval_run_id") REFERENCES "public"."conversation_eval_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_eval_judge_jobs"
    ADD CONSTRAINT "conversation_eval_judge_jobs_eval_run_id_fkey" FOREIGN KEY ("eval_run_id") REFERENCES "public"."conversation_eval_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_eval_runs"
    ADD CONSTRAINT "conversation_eval_runs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversation_scope_memories"
    ADD CONSTRAINT "conversation_scope_memories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_turn_traces"
    ADD CONSTRAINT "conversation_turn_traces_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_item_actions"
    ADD CONSTRAINT "fk_memory_item_actions_extraction_run" FOREIGN KEY ("extraction_run_id") REFERENCES "public"."memory_extraction_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."memory_item_entities"
    ADD CONSTRAINT "fk_memory_item_entities_extraction_run" FOREIGN KEY ("extraction_run_id") REFERENCES "public"."memory_extraction_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."memory_item_sources"
    ADD CONSTRAINT "fk_memory_item_sources_extraction_run" FOREIGN KEY ("extraction_run_id") REFERENCES "public"."memory_extraction_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."memory_item_topics"
    ADD CONSTRAINT "fk_memory_item_topics_extraction_run" FOREIGN KEY ("extraction_run_id") REFERENCES "public"."memory_extraction_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."memory_items"
    ADD CONSTRAINT "fk_memory_items_extraction_run" FOREIGN KEY ("extraction_run_id") REFERENCES "public"."memory_extraction_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."internal_admins"
    ADD CONSTRAINT "internal_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."llm_retry_jobs"
    ADD CONSTRAINT "llm_retry_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."llm_usage_events"
    ADD CONSTRAINT "llm_usage_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."memory_change_log"
    ADD CONSTRAINT "memory_change_log_source_message_id_fkey" FOREIGN KEY ("source_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."memory_change_log"
    ADD CONSTRAINT "memory_change_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_eval_annotations"
    ADD CONSTRAINT "memory_eval_annotations_reviewer_user_id_fkey" FOREIGN KEY ("reviewer_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_eval_annotations"
    ADD CONSTRAINT "memory_eval_annotations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_extraction_runs"
    ADD CONSTRAINT "memory_extraction_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_item_action_occurrences"
    ADD CONSTRAINT "memory_item_action_occurrences_memory_item_action_id_fkey" FOREIGN KEY ("memory_item_action_id") REFERENCES "public"."memory_item_actions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_item_action_occurrences"
    ADD CONSTRAINT "memory_item_action_occurrences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_item_actions"
    ADD CONSTRAINT "memory_item_actions_memory_item_id_fkey" FOREIGN KEY ("memory_item_id") REFERENCES "public"."memory_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_item_actions"
    ADD CONSTRAINT "memory_item_actions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_item_entities"
    ADD CONSTRAINT "memory_item_entities_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "public"."user_entities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_item_entities"
    ADD CONSTRAINT "memory_item_entities_memory_item_id_fkey" FOREIGN KEY ("memory_item_id") REFERENCES "public"."memory_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_item_entities"
    ADD CONSTRAINT "memory_item_entities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_item_sources"
    ADD CONSTRAINT "memory_item_sources_memory_item_id_fkey" FOREIGN KEY ("memory_item_id") REFERENCES "public"."memory_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_item_sources"
    ADD CONSTRAINT "memory_item_sources_source_message_id_fkey" FOREIGN KEY ("source_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."memory_item_sources"
    ADD CONSTRAINT "memory_item_sources_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_item_topics"
    ADD CONSTRAINT "memory_item_topics_memory_item_id_fkey" FOREIGN KEY ("memory_item_id") REFERENCES "public"."memory_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_item_topics"
    ADD CONSTRAINT "memory_item_topics_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."user_topic_memories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_item_topics"
    ADD CONSTRAINT "memory_item_topics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_items"
    ADD CONSTRAINT "memory_items_source_message_id_fkey" FOREIGN KEY ("source_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."memory_items"
    ADD CONSTRAINT "memory_items_superseded_by_item_id_fkey" FOREIGN KEY ("superseded_by_item_id") REFERENCES "public"."memory_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."memory_items"
    ADD CONSTRAINT "memory_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_message_processing"
    ADD CONSTRAINT "memory_message_processing_extraction_run_id_fkey" FOREIGN KEY ("extraction_run_id") REFERENCES "public"."memory_extraction_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_message_processing"
    ADD CONSTRAINT "memory_message_processing_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_message_processing"
    ADD CONSTRAINT "memory_message_processing_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_observability_events"
    ADD CONSTRAINT "memory_observability_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_weekly_review_runs"
    ADD CONSTRAINT "memory_weekly_review_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."proactive_job_state"
    ADD CONSTRAINT "proactive_job_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scheduled_checkins"
    ADD CONSTRAINT "scheduled_checkins_recurring_reminder_id_fkey" FOREIGN KEY ("recurring_reminder_id") REFERENCES "public"."user_recurring_reminders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."scheduled_checkins"
    ADD CONSTRAINT "scheduled_checkins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."system_error_logs"
    ADD CONSTRAINT "system_error_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."system_runtime_snapshots"
    ADD CONSTRAINT "system_runtime_snapshots_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "public"."user_cycles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."system_runtime_snapshots"
    ADD CONSTRAINT "system_runtime_snapshots_transformation_id_fkey" FOREIGN KEY ("transformation_id") REFERENCES "public"."user_transformations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."system_runtime_snapshots"
    ADD CONSTRAINT "system_runtime_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."turn_summary_logs"
    ADD CONSTRAINT "turn_summary_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_architect_quotes"
    ADD CONSTRAINT "user_architect_quotes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_architect_reflections"
    ADD CONSTRAINT "user_architect_reflections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_architect_stories"
    ADD CONSTRAINT "user_architect_stories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_architect_wishes"
    ADD CONSTRAINT "user_architect_wishes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_attack_cards"
    ADD CONSTRAINT "user_attack_cards_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "public"."user_cycles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_attack_cards"
    ADD CONSTRAINT "user_attack_cards_plan_item_id_fkey" FOREIGN KEY ("plan_item_id") REFERENCES "public"."user_plan_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_attack_cards"
    ADD CONSTRAINT "user_attack_cards_transformation_id_fkey" FOREIGN KEY ("transformation_id") REFERENCES "public"."user_transformations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_attack_cards"
    ADD CONSTRAINT "user_attack_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_chat_states"
    ADD CONSTRAINT "user_chat_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_core_identity_archive"
    ADD CONSTRAINT "user_core_identity_archive_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "public"."user_core_identity"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_core_identity_archive"
    ADD CONSTRAINT "user_core_identity_archive_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_core_identity"
    ADD CONSTRAINT "user_core_identity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_cycles"
    ADD CONSTRAINT "user_cycles_active_transformation_fk" FOREIGN KEY ("id", "active_transformation_id") REFERENCES "public"."user_transformations"("cycle_id", "id");



ALTER TABLE ONLY "public"."user_cycles"
    ADD CONSTRAINT "user_cycles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_defense_cards"
    ADD CONSTRAINT "user_defense_cards_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "public"."user_cycles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_defense_cards"
    ADD CONSTRAINT "user_defense_cards_plan_item_id_fkey" FOREIGN KEY ("plan_item_id") REFERENCES "public"."user_plan_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_defense_cards"
    ADD CONSTRAINT "user_defense_cards_transformation_id_fkey" FOREIGN KEY ("transformation_id") REFERENCES "public"."user_transformations"("id");



ALTER TABLE ONLY "public"."user_defense_cards"
    ADD CONSTRAINT "user_defense_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_defense_wins"
    ADD CONSTRAINT "user_defense_wins_defense_card_id_fkey" FOREIGN KEY ("defense_card_id") REFERENCES "public"."user_defense_cards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_entities"
    ADD CONSTRAINT "user_entities_merged_into_entity_id_fkey" FOREIGN KEY ("merged_into_entity_id") REFERENCES "public"."user_entities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_entities"
    ADD CONSTRAINT "user_entities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_habit_week_occurrences"
    ADD CONSTRAINT "user_habit_week_occurrences_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "public"."user_cycles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_habit_week_occurrences"
    ADD CONSTRAINT "user_habit_week_occurrences_plan_item_fk" FOREIGN KEY ("plan_item_id", "plan_id", "cycle_id", "transformation_id") REFERENCES "public"."user_plan_items"("id", "plan_id", "cycle_id", "transformation_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_habit_week_occurrences"
    ADD CONSTRAINT "user_habit_week_occurrences_transformation_id_fkey" FOREIGN KEY ("transformation_id") REFERENCES "public"."user_transformations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_habit_week_occurrences"
    ADD CONSTRAINT "user_habit_week_occurrences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_habit_week_plans"
    ADD CONSTRAINT "user_habit_week_plans_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "public"."user_cycles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_habit_week_plans"
    ADD CONSTRAINT "user_habit_week_plans_plan_item_fk" FOREIGN KEY ("plan_item_id", "plan_id", "cycle_id", "transformation_id") REFERENCES "public"."user_plan_items"("id", "plan_id", "cycle_id", "transformation_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_habit_week_plans"
    ADD CONSTRAINT "user_habit_week_plans_transformation_id_fkey" FOREIGN KEY ("transformation_id") REFERENCES "public"."user_transformations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_habit_week_plans"
    ADD CONSTRAINT "user_habit_week_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_habit_week_reschedule_events"
    ADD CONSTRAINT "user_habit_week_reschedule_events_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "public"."user_cycles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_habit_week_reschedule_events"
    ADD CONSTRAINT "user_habit_week_reschedule_events_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "public"."user_habit_week_occurrences"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_habit_week_reschedule_events"
    ADD CONSTRAINT "user_habit_week_reschedule_events_plan_item_fk" FOREIGN KEY ("plan_item_id", "plan_id", "cycle_id", "transformation_id") REFERENCES "public"."user_plan_items"("id", "plan_id", "cycle_id", "transformation_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_habit_week_reschedule_events"
    ADD CONSTRAINT "user_habit_week_reschedule_events_transformation_id_fkey" FOREIGN KEY ("transformation_id") REFERENCES "public"."user_transformations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_habit_week_reschedule_events"
    ADD CONSTRAINT "user_habit_week_reschedule_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_inspiration_items"
    ADD CONSTRAINT "user_inspiration_items_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "public"."user_cycles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_inspiration_items"
    ADD CONSTRAINT "user_inspiration_items_transformation_id_fkey" FOREIGN KEY ("transformation_id") REFERENCES "public"."user_transformations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_inspiration_items"
    ADD CONSTRAINT "user_inspiration_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_level_tool_recommendations"
    ADD CONSTRAINT "user_level_tool_recommendatio_superseded_by_recommendation_fkey" FOREIGN KEY ("superseded_by_recommendation_id") REFERENCES "public"."user_level_tool_recommendations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_level_tool_recommendation_events"
    ADD CONSTRAINT "user_level_tool_recommendation_events_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "public"."user_cycles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_level_tool_recommendation_events"
    ADD CONSTRAINT "user_level_tool_recommendation_events_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."user_plans_v2"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_level_tool_recommendation_events"
    ADD CONSTRAINT "user_level_tool_recommendation_events_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "public"."user_level_tool_recommendations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_level_tool_recommendation_events"
    ADD CONSTRAINT "user_level_tool_recommendation_events_transformation_id_fkey" FOREIGN KEY ("transformation_id") REFERENCES "public"."user_transformations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_level_tool_recommendation_events"
    ADD CONSTRAINT "user_level_tool_recommendation_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_level_tool_recommendations"
    ADD CONSTRAINT "user_level_tool_recommendations_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "public"."user_cycles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_level_tool_recommendations"
    ADD CONSTRAINT "user_level_tool_recommendations_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."user_plans_v2"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_level_tool_recommendations"
    ADD CONSTRAINT "user_level_tool_recommendations_transformation_id_fkey" FOREIGN KEY ("transformation_id") REFERENCES "public"."user_transformations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_level_tool_recommendations"
    ADD CONSTRAINT "user_level_tool_recommendations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_metrics"
    ADD CONSTRAINT "user_metrics_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "public"."user_cycles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_metrics"
    ADD CONSTRAINT "user_metrics_cycle_transformation_fk" FOREIGN KEY ("cycle_id", "transformation_id") REFERENCES "public"."user_transformations"("cycle_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_metrics"
    ADD CONSTRAINT "user_metrics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_module_archives"
    ADD CONSTRAINT "user_module_archives_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "public"."user_module_state_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_module_archives"
    ADD CONSTRAINT "user_module_archives_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_module_state_entries"
    ADD CONSTRAINT "user_module_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_week_states"
    ADD CONSTRAINT "user_module_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_plan_item_entries"
    ADD CONSTRAINT "user_plan_item_entries_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "public"."user_cycles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_plan_item_entries"
    ADD CONSTRAINT "user_plan_item_entries_plan_item_fk" FOREIGN KEY ("plan_item_id", "plan_id", "cycle_id", "transformation_id") REFERENCES "public"."user_plan_items"("id", "plan_id", "cycle_id", "transformation_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_plan_item_entries"
    ADD CONSTRAINT "user_plan_item_entries_transformation_id_fkey" FOREIGN KEY ("transformation_id") REFERENCES "public"."user_transformations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_plan_item_entries"
    ADD CONSTRAINT "user_plan_item_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_plan_items"
    ADD CONSTRAINT "user_plan_items_attack_card_id_fkey" FOREIGN KEY ("attack_card_id") REFERENCES "public"."user_attack_cards"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_plan_items"
    ADD CONSTRAINT "user_plan_items_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "public"."user_cycles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_plan_items"
    ADD CONSTRAINT "user_plan_items_defense_card_id_fkey" FOREIGN KEY ("defense_card_id") REFERENCES "public"."user_defense_cards"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_plan_items"
    ADD CONSTRAINT "user_plan_items_plan_fk" FOREIGN KEY ("plan_id", "cycle_id", "transformation_id") REFERENCES "public"."user_plans_v2"("id", "cycle_id", "transformation_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_plan_items"
    ADD CONSTRAINT "user_plan_items_start_after_item_fk" FOREIGN KEY ("start_after_item_id") REFERENCES "public"."user_plan_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_plan_items"
    ADD CONSTRAINT "user_plan_items_transformation_id_fkey" FOREIGN KEY ("transformation_id") REFERENCES "public"."user_transformations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_plan_items"
    ADD CONSTRAINT "user_plan_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_plan_level_generation_events"
    ADD CONSTRAINT "user_plan_level_generation_events_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "public"."user_cycles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_plan_level_generation_events"
    ADD CONSTRAINT "user_plan_level_generation_events_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."user_plans_v2"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_plan_level_generation_events"
    ADD CONSTRAINT "user_plan_level_generation_events_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "public"."user_plan_level_reviews"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_plan_level_generation_events"
    ADD CONSTRAINT "user_plan_level_generation_events_transformation_id_fkey" FOREIGN KEY ("transformation_id") REFERENCES "public"."user_transformations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_plan_level_generation_events"
    ADD CONSTRAINT "user_plan_level_generation_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_plan_level_reviews"
    ADD CONSTRAINT "user_plan_level_reviews_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "public"."user_cycles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_plan_level_reviews"
    ADD CONSTRAINT "user_plan_level_reviews_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."user_plans_v2"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_plan_level_reviews"
    ADD CONSTRAINT "user_plan_level_reviews_transformation_id_fkey" FOREIGN KEY ("transformation_id") REFERENCES "public"."user_transformations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_plan_level_reviews"
    ADD CONSTRAINT "user_plan_level_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_plan_review_requests"
    ADD CONSTRAINT "user_plan_review_requests_finalized_plan_id_fkey" FOREIGN KEY ("finalized_plan_id") REFERENCES "public"."user_plans_v2"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_plan_review_requests"
    ADD CONSTRAINT "user_plan_review_requests_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."user_plans_v2"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_plan_review_requests"
    ADD CONSTRAINT "user_plan_review_requests_preview_plan_id_fkey" FOREIGN KEY ("preview_plan_id") REFERENCES "public"."user_plans_v2"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_plan_review_requests"
    ADD CONSTRAINT "user_plan_review_requests_transformation_id_fkey" FOREIGN KEY ("transformation_id") REFERENCES "public"."user_transformations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_plan_review_requests"
    ADD CONSTRAINT "user_plan_review_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_plans_v2"
    ADD CONSTRAINT "user_plans_v2_cycle_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."user_cycles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_plans_v2"
    ADD CONSTRAINT "user_plans_v2_cycle_transformation_fk" FOREIGN KEY ("cycle_id", "transformation_id") REFERENCES "public"."user_transformations"("cycle_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_plans_v2"
    ADD CONSTRAINT "user_plans_v2_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_potion_sessions"
    ADD CONSTRAINT "user_potion_sessions_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "public"."user_cycles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_potion_sessions"
    ADD CONSTRAINT "user_potion_sessions_transformation_id_fkey" FOREIGN KEY ("transformation_id") REFERENCES "public"."user_transformations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_potion_sessions"
    ADD CONSTRAINT "user_potion_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_professional_support_events"
    ADD CONSTRAINT "user_professional_support_events_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "public"."user_cycles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_professional_support_events"
    ADD CONSTRAINT "user_professional_support_events_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."user_plans_v2"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_professional_support_events"
    ADD CONSTRAINT "user_professional_support_events_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "public"."user_professional_support_recommendations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_professional_support_events"
    ADD CONSTRAINT "user_professional_support_events_transformation_id_fkey" FOREIGN KEY ("transformation_id") REFERENCES "public"."user_transformations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_professional_support_events"
    ADD CONSTRAINT "user_professional_support_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_professional_support_recommendations"
    ADD CONSTRAINT "user_professional_support_recommendation_transformation_id_fkey" FOREIGN KEY ("transformation_id") REFERENCES "public"."user_transformations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_professional_support_recommendations"
    ADD CONSTRAINT "user_professional_support_recommendations_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "public"."user_cycles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_professional_support_recommendations"
    ADD CONSTRAINT "user_professional_support_recommendations_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."user_plans_v2"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_professional_support_recommendations"
    ADD CONSTRAINT "user_professional_support_recommendations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profile_facts"
    ADD CONSTRAINT "user_profile_facts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_recurring_reminders"
    ADD CONSTRAINT "user_recurring_reminders_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "public"."user_cycles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_recurring_reminders"
    ADD CONSTRAINT "user_recurring_reminders_source_potion_session_id_fkey" FOREIGN KEY ("source_potion_session_id") REFERENCES "public"."user_potion_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_recurring_reminders"
    ADD CONSTRAINT "user_recurring_reminders_target_plan_item_id_fkey" FOREIGN KEY ("target_plan_item_id") REFERENCES "public"."user_plan_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_recurring_reminders"
    ADD CONSTRAINT "user_recurring_reminders_transformation_id_fkey" FOREIGN KEY ("transformation_id") REFERENCES "public"."user_transformations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_recurring_reminders"
    ADD CONSTRAINT "user_recurring_reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_relation_preferences"
    ADD CONSTRAINT "user_relation_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_rendez_vous"
    ADD CONSTRAINT "user_rendez_vous_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "public"."user_cycles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_rendez_vous"
    ADD CONSTRAINT "user_rendez_vous_linked_checkin_id_fkey" FOREIGN KEY ("linked_checkin_id") REFERENCES "public"."scheduled_checkins"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_rendez_vous"
    ADD CONSTRAINT "user_rendez_vous_transformation_id_fkey" FOREIGN KEY ("transformation_id") REFERENCES "public"."user_transformations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_rendez_vous"
    ADD CONSTRAINT "user_rendez_vous_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_support_cards"
    ADD CONSTRAINT "user_support_cards_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "public"."user_cycles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_support_cards"
    ADD CONSTRAINT "user_support_cards_transformation_id_fkey" FOREIGN KEY ("transformation_id") REFERENCES "public"."user_transformations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_support_cards"
    ADD CONSTRAINT "user_support_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_topic_keywords"
    ADD CONSTRAINT "user_topic_keywords_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."user_topic_memories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_topic_keywords"
    ADD CONSTRAINT "user_topic_keywords_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_topic_memories"
    ADD CONSTRAINT "user_topic_memories_merged_into_topic_id_fkey" FOREIGN KEY ("merged_into_topic_id") REFERENCES "public"."user_topic_memories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_topic_memories"
    ADD CONSTRAINT "user_topic_memories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_transformation_aspects"
    ADD CONSTRAINT "user_transformation_aspects_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "public"."user_cycles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_transformation_aspects"
    ADD CONSTRAINT "user_transformation_aspects_transformation_id_fkey" FOREIGN KEY ("transformation_id") REFERENCES "public"."user_transformations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_transformation_closure_feedback"
    ADD CONSTRAINT "user_transformation_closure_feedback_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "public"."user_cycles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_transformation_closure_feedback"
    ADD CONSTRAINT "user_transformation_closure_feedback_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."user_plans_v2"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_transformation_closure_feedback"
    ADD CONSTRAINT "user_transformation_closure_feedback_transformation_id_fkey" FOREIGN KEY ("transformation_id") REFERENCES "public"."user_transformations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_transformation_closure_feedback"
    ADD CONSTRAINT "user_transformation_closure_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_transformations"
    ADD CONSTRAINT "user_transformations_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "public"."user_cycles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_victory_ledger"
    ADD CONSTRAINT "user_victory_ledger_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "public"."user_cycles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_victory_ledger"
    ADD CONSTRAINT "user_victory_ledger_plan_item_id_fkey" FOREIGN KEY ("plan_item_id") REFERENCES "public"."user_plan_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_victory_ledger"
    ADD CONSTRAINT "user_victory_ledger_transformation_id_fkey" FOREIGN KEY ("transformation_id") REFERENCES "public"."user_transformations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_victory_ledger"
    ADD CONSTRAINT "user_victory_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weekly_bilan_suggestion_events"
    ADD CONSTRAINT "weekly_bilan_suggestion_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_cost_events"
    ADD CONSTRAINT "whatsapp_cost_events_outbound_message_id_fkey" FOREIGN KEY ("outbound_message_id") REFERENCES "public"."whatsapp_outbound_messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_cost_events"
    ADD CONSTRAINT "whatsapp_cost_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_inbound_dedup"
    ADD CONSTRAINT "whatsapp_inbound_dedup_chat_message_id_fkey" FOREIGN KEY ("chat_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_inbound_dedup"
    ADD CONSTRAINT "whatsapp_inbound_dedup_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_link_requests"
    ADD CONSTRAINT "whatsapp_link_requests_linked_user_id_fkey" FOREIGN KEY ("linked_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_link_tokens"
    ADD CONSTRAINT "whatsapp_link_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_monthly_quotas"
    ADD CONSTRAINT "whatsapp_monthly_quotas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_optin_recovery"
    ADD CONSTRAINT "whatsapp_optin_recovery_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_outbound_messages"
    ADD CONSTRAINT "whatsapp_outbound_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_pending_actions"
    ADD CONSTRAINT "whatsapp_pending_actions_scheduled_checkin_id_fkey" FOREIGN KEY ("scheduled_checkin_id") REFERENCES "public"."scheduled_checkins"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_pending_actions"
    ADD CONSTRAINT "whatsapp_pending_actions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "No direct access to whatsapp_pending_actions (select none)" ON "public"."whatsapp_pending_actions" FOR SELECT USING (false);



CREATE POLICY "Users can delete their own messages" ON "public"."chat_messages" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own attack cards" ON "public"."user_attack_cards" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own defense wins" ON "public"."user_defense_wins" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_defense_cards" "card"
  WHERE (("card"."id" = "user_defense_wins"."defense_card_id") AND ("card"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert their own chat state" ON "public"."user_chat_states" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own messages" ON "public"."chat_messages" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own module state entries" ON "public"."user_module_state_entries" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own transformation closure feedback" ON "public"."user_transformation_closure_feedback" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own week states" ON "public"."user_week_states" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own attack cards" ON "public"."user_attack_cards" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own defense cards" ON "public"."user_defense_cards" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own defense wins" ON "public"."user_defense_wins" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_defense_cards" "card"
  WHERE (("card"."id" = "user_defense_wins"."defense_card_id") AND ("card"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can read own inspiration items" ON "public"."user_inspiration_items" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own potion sessions" ON "public"."user_potion_sessions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own support cards" ON "public"."user_support_cards" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own attack cards" ON "public"."user_attack_cards" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own chat state" ON "public"."user_chat_states" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own module state entries" ON "public"."user_module_state_entries" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own scheduled checkins" ON "public"."scheduled_checkins" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own transformation closure feedback" ON "public"."user_transformation_closure_feedback" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own week states" ON "public"."user_week_states" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own chat state" ON "public"."user_chat_states" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own identity" ON "public"."user_core_identity" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own identity archive" ON "public"."user_core_identity_archive" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own logs" ON "public"."communication_logs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own messages" ON "public"."chat_messages" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own module archives" ON "public"."user_module_archives" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own module state entries" ON "public"."user_module_state_entries" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own scheduled checkins" ON "public"."scheduled_checkins" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own transformation closure feedback" ON "public"."user_transformation_closure_feedback" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own week states" ON "public"."user_week_states" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users own profiles" ON "public"."profiles" USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."app_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."communication_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."confirmation_tokens_consumed" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversation_eval_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversation_eval_events_internal_admin_all" ON "public"."conversation_eval_events" USING ((EXISTS ( SELECT 1
   FROM "public"."internal_admins" "ia"
  WHERE ("ia"."user_id" = "auth"."uid"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."internal_admins" "ia"
  WHERE ("ia"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."conversation_eval_judge_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversation_eval_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversation_eval_runs_internal_admin_all" ON "public"."conversation_eval_runs" USING ((EXISTS ( SELECT 1
   FROM "public"."internal_admins" "ia"
  WHERE ("ia"."user_id" = "auth"."uid"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."internal_admins" "ia"
  WHERE ("ia"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."conversation_scope_memories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversation_turn_traces" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."internal_admins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "internal_admins_read_self" ON "public"."internal_admins" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."llm_pricing" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "llm_pricing_internal_admin_all" ON "public"."llm_pricing" USING ((EXISTS ( SELECT 1
   FROM "public"."internal_admins" "ia"
  WHERE ("ia"."user_id" = "auth"."uid"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."internal_admins" "ia"
  WHERE ("ia"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."llm_retry_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."llm_usage_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "llm_usage_events_internal_admin_all" ON "public"."llm_usage_events" USING ((EXISTS ( SELECT 1
   FROM "public"."internal_admins" "ia"
  WHERE ("ia"."user_id" = "auth"."uid"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."internal_admins" "ia"
  WHERE ("ia"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."memory_change_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."memory_eval_annotations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "memory_eval_annotations_internal_admin_all" ON "public"."memory_eval_annotations" USING ((EXISTS ( SELECT 1
   FROM "public"."internal_admins" "ia"
  WHERE ("ia"."user_id" = "auth"."uid"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."internal_admins" "ia"
  WHERE ("ia"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."memory_extraction_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."memory_item_action_occurrences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."memory_item_actions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."memory_item_entities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."memory_item_sources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."memory_item_topics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."memory_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."memory_message_processing" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."memory_observability_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "memory_observability_events_internal_admin_all" ON "public"."memory_observability_events" USING ((EXISTS ( SELECT 1
   FROM "public"."internal_admins" "ia"
  WHERE ("ia"."user_id" = "auth"."uid"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."internal_admins" "ia"
  WHERE ("ia"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."memory_weekly_review_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."proactive_job_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rls_chat_messages_delete_own" ON "public"."chat_messages" FOR DELETE USING ((("auth"."uid"() = "user_id") AND "public"."has_app_write_access"("auth"."uid"())));



CREATE POLICY "rls_chat_messages_insert_own" ON "public"."chat_messages" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."has_app_write_access"("auth"."uid"())));



CREATE POLICY "rls_chat_messages_select_own" ON "public"."chat_messages" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_chat_messages_update_own" ON "public"."chat_messages" FOR UPDATE USING ((("auth"."uid"() = "user_id") AND "public"."has_app_write_access"("auth"."uid"()))) WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."has_app_write_access"("auth"."uid"())));



CREATE POLICY "rls_conversation_scope_memories_delete_own" ON "public"."conversation_scope_memories" FOR DELETE USING ((("auth"."uid"() = "user_id") AND "public"."has_app_write_access"("auth"."uid"())));



CREATE POLICY "rls_conversation_scope_memories_insert_own" ON "public"."conversation_scope_memories" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."has_app_write_access"("auth"."uid"())));



CREATE POLICY "rls_conversation_scope_memories_select_own" ON "public"."conversation_scope_memories" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_conversation_scope_memories_update_own" ON "public"."conversation_scope_memories" FOR UPDATE USING ((("auth"."uid"() = "user_id") AND "public"."has_app_write_access"("auth"."uid"()))) WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."has_app_write_access"("auth"."uid"())));



CREATE POLICY "rls_memory_change_log_insert_own" ON "public"."memory_change_log" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_memory_change_log_select_own" ON "public"."memory_change_log" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_memory_change_log_update_own" ON "public"."memory_change_log" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_memory_extraction_runs_insert_own" ON "public"."memory_extraction_runs" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_memory_extraction_runs_select_own" ON "public"."memory_extraction_runs" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_memory_extraction_runs_update_own" ON "public"."memory_extraction_runs" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_memory_item_action_occurrences_insert_own" ON "public"."memory_item_action_occurrences" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_memory_item_action_occurrences_select_own" ON "public"."memory_item_action_occurrences" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_memory_item_action_occurrences_update_own" ON "public"."memory_item_action_occurrences" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_memory_item_actions_insert_own" ON "public"."memory_item_actions" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_memory_item_actions_select_own" ON "public"."memory_item_actions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_memory_item_actions_update_own" ON "public"."memory_item_actions" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_memory_item_entities_insert_own" ON "public"."memory_item_entities" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_memory_item_entities_select_own" ON "public"."memory_item_entities" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_memory_item_entities_update_own" ON "public"."memory_item_entities" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_memory_item_sources_insert_own" ON "public"."memory_item_sources" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_memory_item_sources_select_own" ON "public"."memory_item_sources" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_memory_item_sources_update_own" ON "public"."memory_item_sources" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_memory_item_topics_insert_own" ON "public"."memory_item_topics" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_memory_item_topics_select_own" ON "public"."memory_item_topics" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_memory_item_topics_update_own" ON "public"."memory_item_topics" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_memory_items_insert_own" ON "public"."memory_items" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_memory_items_select_own" ON "public"."memory_items" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_memory_items_update_own" ON "public"."memory_items" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_memory_message_processing_insert_own" ON "public"."memory_message_processing" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_memory_message_processing_select_own" ON "public"."memory_message_processing" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_memory_message_processing_update_own" ON "public"."memory_message_processing" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_memory_weekly_review_runs_select_own" ON "public"."memory_weekly_review_runs" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_profiles_insert_self" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "rls_profiles_select_self" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "rls_profiles_update_self" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "rls_scheduled_checkins_select_own" ON "public"."scheduled_checkins" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_scheduled_checkins_update_own" ON "public"."scheduled_checkins" FOR UPDATE USING ((("auth"."uid"() = "user_id") AND "public"."has_app_write_access"("auth"."uid"()))) WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."has_app_write_access"("auth"."uid"())));



CREATE POLICY "rls_subscriptions_select_own" ON "public"."subscriptions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_system_runtime_snapshots_delete_own" ON "public"."system_runtime_snapshots" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_system_runtime_snapshots_insert_own" ON "public"."system_runtime_snapshots" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_system_runtime_snapshots_select_own" ON "public"."system_runtime_snapshots" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_system_runtime_snapshots_update_own" ON "public"."system_runtime_snapshots" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_topic_keywords_delete" ON "public"."user_topic_keywords" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_topic_keywords_insert" ON "public"."user_topic_keywords" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_topic_keywords_select" ON "public"."user_topic_keywords" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_topic_keywords_update" ON "public"."user_topic_keywords" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_topic_memories_insert" ON "public"."user_topic_memories" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_topic_memories_select" ON "public"."user_topic_memories" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_topic_memories_update" ON "public"."user_topic_memories" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_architect_quotes_delete_own" ON "public"."user_architect_quotes" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_architect_quotes_insert_own" ON "public"."user_architect_quotes" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_architect_quotes_select_own" ON "public"."user_architect_quotes" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_architect_quotes_update_own" ON "public"."user_architect_quotes" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_architect_reflections_delete_own" ON "public"."user_architect_reflections" FOR DELETE TO "authenticated" USING ((("auth"."uid"() = "user_id") AND "public"."has_app_write_access"("auth"."uid"())));



CREATE POLICY "rls_user_architect_reflections_insert_own" ON "public"."user_architect_reflections" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."has_app_write_access"("auth"."uid"())));



CREATE POLICY "rls_user_architect_reflections_select_own" ON "public"."user_architect_reflections" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_architect_reflections_update_own" ON "public"."user_architect_reflections" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "user_id") AND "public"."has_app_write_access"("auth"."uid"()))) WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."has_app_write_access"("auth"."uid"())));



CREATE POLICY "rls_user_architect_stories_delete_own" ON "public"."user_architect_stories" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_architect_stories_insert_own" ON "public"."user_architect_stories" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_architect_stories_select_own" ON "public"."user_architect_stories" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_architect_stories_update_own" ON "public"."user_architect_stories" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_architect_wishes_delete_own" ON "public"."user_architect_wishes" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_architect_wishes_insert_own" ON "public"."user_architect_wishes" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_architect_wishes_select_own" ON "public"."user_architect_wishes" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_architect_wishes_update_own" ON "public"."user_architect_wishes" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_chat_states_delete_own" ON "public"."user_chat_states" FOR DELETE USING ((("auth"."uid"() = "user_id") AND "public"."has_app_write_access"("auth"."uid"())));



CREATE POLICY "rls_user_chat_states_insert_own" ON "public"."user_chat_states" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."has_app_write_access"("auth"."uid"())));



CREATE POLICY "rls_user_chat_states_select_own" ON "public"."user_chat_states" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_chat_states_update_own" ON "public"."user_chat_states" FOR UPDATE USING ((("auth"."uid"() = "user_id") AND "public"."has_app_write_access"("auth"."uid"()))) WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."has_app_write_access"("auth"."uid"())));



CREATE POLICY "rls_user_cycles_delete_own" ON "public"."user_cycles" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_cycles_insert_own" ON "public"."user_cycles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_cycles_select_own" ON "public"."user_cycles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_cycles_update_own" ON "public"."user_cycles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_entities_insert_own" ON "public"."user_entities" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_entities_select_own" ON "public"."user_entities" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_entities_update_own" ON "public"."user_entities" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_habit_week_occurrences_delete_own" ON "public"."user_habit_week_occurrences" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_habit_week_occurrences_insert_own" ON "public"."user_habit_week_occurrences" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_habit_week_occurrences_select_own" ON "public"."user_habit_week_occurrences" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_habit_week_occurrences_update_own" ON "public"."user_habit_week_occurrences" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_habit_week_plans_delete_own" ON "public"."user_habit_week_plans" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_habit_week_plans_insert_own" ON "public"."user_habit_week_plans" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_habit_week_plans_select_own" ON "public"."user_habit_week_plans" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_habit_week_plans_update_own" ON "public"."user_habit_week_plans" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_habit_week_reschedule_events_delete_own" ON "public"."user_habit_week_reschedule_events" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_habit_week_reschedule_events_insert_own" ON "public"."user_habit_week_reschedule_events" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_habit_week_reschedule_events_select_own" ON "public"."user_habit_week_reschedule_events" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_habit_week_reschedule_events_update_own" ON "public"."user_habit_week_reschedule_events" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_metrics_delete_own" ON "public"."user_metrics" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_metrics_insert_own" ON "public"."user_metrics" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_metrics_select_own" ON "public"."user_metrics" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_metrics_update_own" ON "public"."user_metrics" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_module_state_entries_delete_own" ON "public"."user_module_state_entries" FOR DELETE USING ((("auth"."uid"() = "user_id") AND "public"."has_app_write_access"("auth"."uid"())));



CREATE POLICY "rls_user_module_state_entries_insert_own" ON "public"."user_module_state_entries" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."has_app_write_access"("auth"."uid"())));



CREATE POLICY "rls_user_module_state_entries_select_own" ON "public"."user_module_state_entries" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_module_state_entries_update_own" ON "public"."user_module_state_entries" FOR UPDATE USING ((("auth"."uid"() = "user_id") AND "public"."has_app_write_access"("auth"."uid"()))) WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."has_app_write_access"("auth"."uid"())));



CREATE POLICY "rls_user_plan_item_entries_delete_own" ON "public"."user_plan_item_entries" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_plan_item_entries_insert_own" ON "public"."user_plan_item_entries" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_plan_item_entries_select_own" ON "public"."user_plan_item_entries" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_plan_item_entries_update_own" ON "public"."user_plan_item_entries" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_plan_items_delete_own" ON "public"."user_plan_items" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_plan_items_insert_own" ON "public"."user_plan_items" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_plan_items_select_own" ON "public"."user_plan_items" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_plan_items_update_own" ON "public"."user_plan_items" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_plans_v2_delete_own" ON "public"."user_plans_v2" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_plans_v2_insert_own" ON "public"."user_plans_v2" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_plans_v2_select_own" ON "public"."user_plans_v2" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_plans_v2_update_own" ON "public"."user_plans_v2" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_profile_facts_delete_self" ON "public"."user_profile_facts" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_profile_facts_insert_self" ON "public"."user_profile_facts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_profile_facts_select_self" ON "public"."user_profile_facts" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_profile_facts_update_self" ON "public"."user_profile_facts" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_recurring_reminders_insert_own" ON "public"."user_recurring_reminders" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_recurring_reminders_select_own" ON "public"."user_recurring_reminders" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_recurring_reminders_update_own" ON "public"."user_recurring_reminders" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_relation_preferences_delete_own" ON "public"."user_relation_preferences" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_relation_preferences_insert_own" ON "public"."user_relation_preferences" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_relation_preferences_select_own" ON "public"."user_relation_preferences" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_relation_preferences_update_own" ON "public"."user_relation_preferences" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_rendez_vous_delete_own" ON "public"."user_rendez_vous" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_rendez_vous_insert_own" ON "public"."user_rendez_vous" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_rendez_vous_select_own" ON "public"."user_rendez_vous" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_rendez_vous_update_own" ON "public"."user_rendez_vous" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_transformation_aspects_delete_own" ON "public"."user_transformation_aspects" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_cycles" "c"
  WHERE (("c"."id" = "user_transformation_aspects"."cycle_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "rls_user_transformation_aspects_insert_own" ON "public"."user_transformation_aspects" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_cycles" "c"
  WHERE (("c"."id" = "user_transformation_aspects"."cycle_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "rls_user_transformation_aspects_select_own" ON "public"."user_transformation_aspects" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_cycles" "c"
  WHERE (("c"."id" = "user_transformation_aspects"."cycle_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "rls_user_transformation_aspects_update_own" ON "public"."user_transformation_aspects" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_cycles" "c"
  WHERE (("c"."id" = "user_transformation_aspects"."cycle_id") AND ("c"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_cycles" "c"
  WHERE (("c"."id" = "user_transformation_aspects"."cycle_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "rls_user_transformations_delete_own" ON "public"."user_transformations" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_cycles" "c"
  WHERE (("c"."id" = "user_transformations"."cycle_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "rls_user_transformations_insert_own" ON "public"."user_transformations" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_cycles" "c"
  WHERE (("c"."id" = "user_transformations"."cycle_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "rls_user_transformations_select_own" ON "public"."user_transformations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_cycles" "c"
  WHERE (("c"."id" = "user_transformations"."cycle_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "rls_user_transformations_update_own" ON "public"."user_transformations" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_cycles" "c"
  WHERE (("c"."id" = "user_transformations"."cycle_id") AND ("c"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_cycles" "c"
  WHERE (("c"."id" = "user_transformations"."cycle_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "rls_user_victory_ledger_delete_own" ON "public"."user_victory_ledger" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_victory_ledger_insert_own" ON "public"."user_victory_ledger" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_victory_ledger_select_own" ON "public"."user_victory_ledger" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_victory_ledger_update_own" ON "public"."user_victory_ledger" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_week_states_delete_own" ON "public"."user_week_states" FOR DELETE USING ((("auth"."uid"() = "user_id") AND "public"."has_app_write_access"("auth"."uid"())));



CREATE POLICY "rls_user_week_states_insert_own" ON "public"."user_week_states" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."has_app_write_access"("auth"."uid"())));



CREATE POLICY "rls_user_week_states_select_own" ON "public"."user_week_states" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_user_week_states_update_own" ON "public"."user_week_states" FOR UPDATE USING ((("auth"."uid"() = "user_id") AND "public"."has_app_write_access"("auth"."uid"()))) WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."has_app_write_access"("auth"."uid"())));



CREATE POLICY "rls_weekly_bilan_suggestion_events_delete_own" ON "public"."weekly_bilan_suggestion_events" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_weekly_bilan_suggestion_events_insert_own" ON "public"."weekly_bilan_suggestion_events" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_weekly_bilan_suggestion_events_select_own" ON "public"."weekly_bilan_suggestion_events" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_weekly_bilan_suggestion_events_update_own" ON "public"."weekly_bilan_suggestion_events" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_whatsapp_inbound_dedup_select_own" ON "public"."whatsapp_inbound_dedup" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_whatsapp_optin_recovery_select_own" ON "public"."whatsapp_optin_recovery" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_whatsapp_outbound_messages_select_own" ON "public"."whatsapp_outbound_messages" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."scheduled_checkins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service role manages confirmation token consumption" ON "public"."confirmation_tokens_consumed" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service role manages conversation traces" ON "public"."conversation_turn_traces" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."stripe_webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_error_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "system_error_logs_internal_admin_read" ON "public"."system_error_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."internal_admins" "ia"
  WHERE ("ia"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."system_runtime_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."turn_summary_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "turn_summary_logs_internal_admin_all" ON "public"."turn_summary_logs" USING ((EXISTS ( SELECT 1
   FROM "public"."internal_admins" "ia"
  WHERE ("ia"."user_id" = "auth"."uid"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."internal_admins" "ia"
  WHERE ("ia"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."user_architect_quotes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_architect_reflections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_architect_stories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_architect_wishes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_attack_cards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_chat_states" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_core_identity" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_core_identity_archive" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_cycle_drafts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_cycles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_defense_cards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_defense_wins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_entities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_habit_week_occurrences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_habit_week_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_habit_week_reschedule_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_inspiration_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_level_tool_recommendation_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_level_tool_recommendation_events_insert_own" ON "public"."user_level_tool_recommendation_events" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user_level_tool_recommendation_events_select_own" ON "public"."user_level_tool_recommendation_events" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_level_tool_recommendations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_level_tool_recommendations_insert_own" ON "public"."user_level_tool_recommendations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user_level_tool_recommendations_select_own" ON "public"."user_level_tool_recommendations" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_level_tool_recommendations_update_own" ON "public"."user_level_tool_recommendations" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_metrics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_module_archives" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_module_state_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_plan_item_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_plan_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_plan_level_generation_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_plan_level_generation_events_insert_own" ON "public"."user_plan_level_generation_events" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user_plan_level_generation_events_select_own" ON "public"."user_plan_level_generation_events" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_plan_level_reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_plan_level_reviews_insert_own" ON "public"."user_plan_level_reviews" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user_plan_level_reviews_select_own" ON "public"."user_plan_level_reviews" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_plan_review_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_plan_review_requests_insert_own" ON "public"."user_plan_review_requests" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."user_transformations" "t"
  WHERE (("t"."id" = "user_plan_review_requests"."transformation_id") AND (EXISTS ( SELECT 1
           FROM "public"."user_cycles" "c"
          WHERE (("c"."id" = "t"."cycle_id") AND ("c"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "user_plan_review_requests_select_own" ON "public"."user_plan_review_requests" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_plan_review_requests_update_own" ON "public"."user_plan_review_requests" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_plans_v2" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_potion_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_professional_support_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_professional_support_events_insert_own" ON "public"."user_professional_support_events" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user_professional_support_events_select_own" ON "public"."user_professional_support_events" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_professional_support_recommendations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_professional_support_recommendations_insert_own" ON "public"."user_professional_support_recommendations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user_professional_support_recommendations_select_own" ON "public"."user_professional_support_recommendations" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_professional_support_recommendations_update_own" ON "public"."user_professional_support_recommendations" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_profile_facts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_recurring_reminders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_relation_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_rendez_vous" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_support_cards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_topic_keywords" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_topic_memories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_transformation_aspects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_transformation_closure_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_transformations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_victory_ledger" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_week_states" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."weekly_bilan_suggestion_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_cost_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "whatsapp_cost_events_internal_admin_all" ON "public"."whatsapp_cost_events" USING ((EXISTS ( SELECT 1
   FROM "public"."internal_admins" "ia"
  WHERE ("ia"."user_id" = "auth"."uid"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."internal_admins" "ia"
  WHERE ("ia"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."whatsapp_inbound_dedup" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_link_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_link_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_monthly_quotas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_optin_recovery" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_outbound_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_outbound_status_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_pending_actions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_unlinked_inbound_messages" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";








GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "service_role";




















































































































































































GRANT ALL ON FUNCTION "public"."_app_config_get"("_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_app_config_get"("_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_app_config_get"("_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_expected_edge_base_url"() TO "anon";
GRANT ALL ON FUNCTION "public"."_expected_edge_base_url"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_expected_edge_base_url"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_trg_recompute_profile_access_tier_from_profiles"() TO "anon";
GRANT ALL ON FUNCTION "public"."_trg_recompute_profile_access_tier_from_profiles"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_trg_recompute_profile_access_tier_from_profiles"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_trg_recompute_profile_access_tier_from_subscriptions"() TO "anon";
GRANT ALL ON FUNCTION "public"."_trg_recompute_profile_access_tier_from_subscriptions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_trg_recompute_profile_access_tier_from_subscriptions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_validate_app_config_edge_base_url"() TO "anon";
GRANT ALL ON FUNCTION "public"."_validate_app_config_edge_base_url"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_validate_app_config_edge_base_url"() TO "service_role";



GRANT ALL ON FUNCTION "public"."architect_quote_tags_are_valid"("input_tags" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."architect_quote_tags_are_valid"("input_tags" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."architect_quote_tags_are_valid"("input_tags" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."architect_reflection_tags_are_valid"("input_tags" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."architect_reflection_tags_are_valid"("input_tags" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."architect_reflection_tags_are_valid"("input_tags" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."architect_story_bullet_points_are_valid"("input_points" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."architect_story_bullet_points_are_valid"("input_points" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."architect_story_bullet_points_are_valid"("input_points" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."architect_story_tags_are_valid"("input_tags" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."architect_story_tags_are_valid"("input_tags" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."architect_story_tags_are_valid"("input_tags" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."backfill_whatsapp_template_cost_events"("p_from" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."backfill_whatsapp_template_cost_events"("p_from" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."backfill_whatsapp_template_cost_events"("p_from" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "service_role";



GRANT ALL ON TABLE "public"."conversation_eval_judge_jobs" TO "anon";
GRANT ALL ON TABLE "public"."conversation_eval_judge_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_eval_judge_jobs" TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_conversation_eval_judge_jobs"("p_limit" integer, "p_worker_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."claim_conversation_eval_judge_jobs"("p_limit" integer, "p_worker_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_conversation_eval_judge_jobs"("p_limit" integer, "p_worker_id" "text") TO "service_role";



GRANT ALL ON TABLE "public"."llm_retry_jobs" TO "anon";
GRANT ALL ON TABLE "public"."llm_retry_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."llm_retry_jobs" TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_llm_retry_jobs"("p_limit" integer, "p_worker_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."claim_llm_retry_jobs"("p_limit" integer, "p_worker_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_llm_retry_jobs"("p_limit" integer, "p_worker_id" "text") TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_outbound_messages" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_outbound_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_outbound_messages" TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_whatsapp_outbound_retries"("p_limit" integer, "p_worker_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."claim_whatsapp_outbound_retries"("p_limit" integer, "p_worker_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_whatsapp_outbound_retries"("p_limit" integer, "p_worker_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_architect_draft_scopes"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_architect_draft_scopes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_architect_draft_scopes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_whatsapp_scheduling_for_user"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_whatsapp_scheduling_for_user"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_whatsapp_scheduling_for_user"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_whatsapp_monthly_quota"("p_user_id" "uuid", "p_quota_key" "text", "p_month_key" "text", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_whatsapp_monthly_quota"("p_user_id" "uuid", "p_quota_key" "text", "p_month_key" "text", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."consume_whatsapp_monthly_quota"("p_user_id" "uuid", "p_quota_key" "text", "p_month_key" "text", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."consume_whatsapp_monthly_quota"("p_user_id" "uuid", "p_quota_key" "text", "p_month_key" "text", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."cost_bucket"("ts" timestamp with time zone, "bucket" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."cost_bucket"("ts" timestamp with time zone, "bucket" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cost_bucket"("ts" timestamp with time zone, "bucket" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_single_master_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_single_master_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_single_master_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enqueue_conversation_eval_judge_job"("p_eval_run_id" "uuid", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."enqueue_conversation_eval_judge_job"("p_eval_run_id" "uuid", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."enqueue_conversation_eval_judge_job"("p_eval_run_id" "uuid", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."enqueue_llm_retry_job"("p_user_id" "uuid", "p_scope" "text", "p_channel" "text", "p_message" "text", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."enqueue_llm_retry_job"("p_user_id" "uuid", "p_scope" "text", "p_channel" "text", "p_message" "text", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."enqueue_llm_retry_job"("p_user_id" "uuid", "p_scope" "text", "p_channel" "text", "p_message" "text", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_cost_by_operation"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_cost_by_operation"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_cost_by_operation"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_cost_by_user"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_cost_by_user"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_cost_by_user"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_cost_compare_previous"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_cost_compare_previous"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_cost_compare_previous"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_cost_data_quality"("p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_cost_data_quality"("p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_cost_data_quality"("p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_cost_overview"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_cost_overview"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_cost_overview"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_daily_cost_synthesis"("p_target_day" "date", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_daily_cost_synthesis"("p_target_day" "date", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_daily_cost_synthesis"("p_target_day" "date", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_user_operation_breakdown"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_user_id" "uuid", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_user_operation_breakdown"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_user_id" "uuid", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_user_operation_breakdown"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_user_id" "uuid", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_user_stats"("period_start" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_user_stats"("period_start" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_user_stats"("period_start" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_global_ai_cost"("period_start" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_global_ai_cost"("period_start" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_global_ai_cost"("period_start" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_production_log"("p_since" timestamp with time zone, "p_limit" integer, "p_only_errors" boolean, "p_source" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_production_log"("p_since" timestamp with time zone, "p_limit" integer, "p_only_errors" boolean, "p_source" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_production_log"("p_since" timestamp with time zone, "p_limit" integer, "p_only_errors" boolean, "p_source" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_production_log"("p_since" timestamp with time zone, "p_limit" integer, "p_only_errors" boolean, "p_source" "text", "p_include_chat" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."get_production_log"("p_since" timestamp with time zone, "p_limit" integer, "p_only_errors" boolean, "p_source" "text", "p_include_chat" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_production_log"("p_since" timestamp with time zone, "p_limit" integer, "p_only_errors" boolean, "p_source" "text", "p_include_chat" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_usage_by_model"("period_start" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_usage_by_model"("period_start" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_usage_by_model"("period_start" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_usage_by_source"("period_start" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_usage_by_source"("period_start" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_usage_by_source"("period_start" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_unlocked_principles_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_unlocked_principles_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_unlocked_principles_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_v2_plan_item_activation"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_v2_plan_item_activation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_v2_plan_item_activation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "postgres";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "anon";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "authenticated";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_conversation_scope_memory_message_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_conversation_scope_memory_message_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_conversation_scope_memory_message_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_core_identity_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_core_identity_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_core_identity_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_forge_level_progression"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_forge_level_progression"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_forge_level_progression"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_module_activity_unlock"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_module_activity_unlock"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_module_activity_unlock"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_module_entry_archive"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_module_entry_archive"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_module_entry_archive"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_module_memory_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_module_memory_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_module_memory_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_profile_welcome_email"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_profile_welcome_email"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_profile_welcome_email"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_user_architect_quotes_write"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_user_architect_quotes_write"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_user_architect_quotes_write"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_user_architect_reflections_write"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_user_architect_reflections_write"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_user_architect_reflections_write"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_user_architect_stories_write"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_user_architect_stories_write"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_user_architect_stories_write"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_user_chat_state_synthesizer_threshold"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_user_chat_state_synthesizer_threshold"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_user_chat_state_synthesizer_threshold"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_user_email_confirmed_onboarding"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_user_email_confirmed_onboarding"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_user_email_confirmed_onboarding"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_user_email_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_user_email_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_user_email_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_v2_principle_unlock_from_entry"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_v2_principle_unlock_from_entry"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_v2_principle_unlock_from_entry"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_v2_principle_unlock_from_item_transition"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_v2_principle_unlock_from_item_transition"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_v2_principle_unlock_from_item_transition"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_week12_manual_unlock"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_week12_manual_unlock"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_week12_manual_unlock"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_whatsapp_scheduling_access_tier_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_whatsapp_scheduling_access_tier_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_whatsapp_scheduling_access_tier_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_app_write_access"("uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_app_write_access"("uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_app_write_access"("uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."initialize_user_modules"() TO "anon";
GRANT ALL ON FUNCTION "public"."initialize_user_modules"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."initialize_user_modules"() TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_verified_phone_in_use"("p_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_verified_phone_in_use"("p_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_verified_phone_in_use"("p_phone" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "postgres";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "anon";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "authenticated";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_conversation_event"("p_eval_run_id" "uuid", "p_request_id" "text", "p_source" "text", "p_event" "text", "p_level" "text", "p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_conversation_event"("p_eval_run_id" "uuid", "p_request_id" "text", "p_source" "text", "p_event" "text", "p_level" "text", "p_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_conversation_event"("p_eval_run_id" "uuid", "p_request_id" "text", "p_source" "text", "p_event" "text", "p_level" "text", "p_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_conversation_event"("p_eval_run_id" "uuid", "p_request_id" "text", "p_source" "text", "p_event" "text", "p_level" "text", "p_payload" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_turn_summary_log"("p_request_id" "text", "p_user_id" "uuid", "p_channel" "text", "p_scope" "text", "p_payload" "jsonb", "p_latency_total_ms" integer, "p_latency_dispatcher_ms" integer, "p_latency_context_ms" integer, "p_latency_agent_ms" integer, "p_dispatcher_model" "text", "p_dispatcher_safety" "text", "p_dispatcher_intent" "text", "p_dispatcher_intent_conf" real, "p_dispatcher_interrupt" "text", "p_dispatcher_topic_depth" "text", "p_dispatcher_flow_resolution" "text", "p_context_profile" "text", "p_context_elements" "text"[], "p_context_tokens" integer, "p_target_dispatcher" "text", "p_target_initial" "text", "p_target_final" "text", "p_risk_score" integer, "p_agent_model" "text", "p_agent_outcome" "text", "p_agent_tool" "text", "p_checkup_active" boolean, "p_toolflow_active" boolean, "p_supervisor_stack_top" "text", "p_aborted" boolean, "p_abort_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_turn_summary_log"("p_request_id" "text", "p_user_id" "uuid", "p_channel" "text", "p_scope" "text", "p_payload" "jsonb", "p_latency_total_ms" integer, "p_latency_dispatcher_ms" integer, "p_latency_context_ms" integer, "p_latency_agent_ms" integer, "p_dispatcher_model" "text", "p_dispatcher_safety" "text", "p_dispatcher_intent" "text", "p_dispatcher_intent_conf" real, "p_dispatcher_interrupt" "text", "p_dispatcher_topic_depth" "text", "p_dispatcher_flow_resolution" "text", "p_context_profile" "text", "p_context_elements" "text"[], "p_context_tokens" integer, "p_target_dispatcher" "text", "p_target_initial" "text", "p_target_final" "text", "p_risk_score" integer, "p_agent_model" "text", "p_agent_outcome" "text", "p_agent_tool" "text", "p_checkup_active" boolean, "p_toolflow_active" boolean, "p_supervisor_stack_top" "text", "p_aborted" boolean, "p_abort_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."log_turn_summary_log"("p_request_id" "text", "p_user_id" "uuid", "p_channel" "text", "p_scope" "text", "p_payload" "jsonb", "p_latency_total_ms" integer, "p_latency_dispatcher_ms" integer, "p_latency_context_ms" integer, "p_latency_agent_ms" integer, "p_dispatcher_model" "text", "p_dispatcher_safety" "text", "p_dispatcher_intent" "text", "p_dispatcher_intent_conf" real, "p_dispatcher_interrupt" "text", "p_dispatcher_topic_depth" "text", "p_dispatcher_flow_resolution" "text", "p_context_profile" "text", "p_context_elements" "text"[], "p_context_tokens" integer, "p_target_dispatcher" "text", "p_target_initial" "text", "p_target_final" "text", "p_risk_score" integer, "p_agent_model" "text", "p_agent_outcome" "text", "p_agent_tool" "text", "p_checkup_active" boolean, "p_toolflow_active" boolean, "p_supervisor_stack_top" "text", "p_aborted" boolean, "p_abort_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_turn_summary_log"("p_request_id" "text", "p_user_id" "uuid", "p_channel" "text", "p_scope" "text", "p_payload" "jsonb", "p_latency_total_ms" integer, "p_latency_dispatcher_ms" integer, "p_latency_context_ms" integer, "p_latency_agent_ms" integer, "p_dispatcher_model" "text", "p_dispatcher_safety" "text", "p_dispatcher_intent" "text", "p_dispatcher_intent_conf" real, "p_dispatcher_interrupt" "text", "p_dispatcher_topic_depth" "text", "p_dispatcher_flow_resolution" "text", "p_context_profile" "text", "p_context_elements" "text"[], "p_context_tokens" integer, "p_target_dispatcher" "text", "p_target_initial" "text", "p_target_final" "text", "p_risk_score" integer, "p_agent_model" "text", "p_agent_outcome" "text", "p_agent_tool" "text", "p_checkup_active" boolean, "p_toolflow_active" boolean, "p_supervisor_stack_top" "text", "p_aborted" boolean, "p_abort_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_proactive_job_sent"("p_job" "text", "p_user_id" "uuid", "p_local_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_proactive_job_sent"("p_job" "text", "p_user_id" "uuid", "p_local_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_proactive_job_sent"("p_job" "text", "p_user_id" "uuid", "p_local_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_proactive_job_sent_batch"("p_job" "text", "p_user_ids" "uuid"[], "p_local_dates" "date"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."mark_proactive_job_sent_batch"("p_job" "text", "p_user_ids" "uuid"[], "p_local_dates" "date"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_proactive_job_sent_batch"("p_job" "text", "p_user_ids" "uuid"[], "p_local_dates" "date"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."match_core_identity_by_embedding"("target_user_id" "uuid", "query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_core_identity_by_embedding"("target_user_id" "uuid", "query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."match_core_identity_by_embedding"("target_user_id" "uuid", "query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_core_identity_by_embedding"("target_user_id" "uuid", "query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."maybe_add_master_admin_from_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."maybe_add_master_admin_from_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."maybe_add_master_admin_from_profile"() TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_architect_quote_tags"("input_tags" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_architect_quote_tags"("input_tags" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_architect_quote_tags"("input_tags" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_architect_reflection_tags"("input_tags" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_architect_reflection_tags"("input_tags" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_architect_reflection_tags"("input_tags" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_architect_story_bullet_points"("input_points" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_architect_story_bullet_points"("input_points" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_architect_story_bullet_points"("input_points" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_architect_story_tags"("input_tags" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_architect_story_tags"("input_tags" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_architect_story_tags"("input_tags" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_cost_operation_family"("p_operation_family" "text", "p_source" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_cost_operation_family"("p_operation_family" "text", "p_source" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_cost_operation_family"("p_operation_family" "text", "p_source" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_cost_operation_name"("p_operation_name" "text", "p_source" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_cost_operation_name"("p_operation_name" "text", "p_source" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_cost_operation_name"("p_operation_name" "text", "p_source" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."on_profile_created_seed_default_coach_preferences"() TO "anon";
GRANT ALL ON FUNCTION "public"."on_profile_created_seed_default_coach_preferences"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."on_profile_created_seed_default_coach_preferences"() TO "service_role";



GRANT ALL ON FUNCTION "public"."queue_whatsapp_access_ended_notification"("p_user_id" "uuid", "p_previous_access_tier" "text", "p_new_access_tier" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."queue_whatsapp_access_ended_notification"("p_user_id" "uuid", "p_previous_access_tier" "text", "p_new_access_tier" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."queue_whatsapp_access_ended_notification"("p_user_id" "uuid", "p_previous_access_tier" "text", "p_new_access_tier" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_my_access_tier"() TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_my_access_tier"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_my_access_tier"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_profile_access_tier"("uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_profile_access_tier"("uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_profile_access_tier"("uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_time_based_access_tiers"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_time_based_access_tiers"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_time_based_access_tiers"("p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."release_whatsapp_monthly_quota"("p_user_id" "uuid", "p_quota_key" "text", "p_month_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."release_whatsapp_monthly_quota"("p_user_id" "uuid", "p_quota_key" "text", "p_month_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."release_whatsapp_monthly_quota"("p_user_id" "uuid", "p_quota_key" "text", "p_month_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."release_whatsapp_monthly_quota"("p_user_id" "uuid", "p_quota_key" "text", "p_month_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."request_morning_active_action_checkins_refresh"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."request_morning_active_action_checkins_refresh"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_morning_active_action_checkins_refresh"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."request_recurring_reminder_checkins_refresh"("p_user_id" "uuid", "p_full_reset" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."request_recurring_reminder_checkins_refresh"("p_user_id" "uuid", "p_full_reset" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_recurring_reminder_checkins_refresh"("p_user_id" "uuid", "p_full_reset" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."request_trigger_synthesizer_for_state"("p_user_id" "uuid", "p_scope" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."request_trigger_synthesizer_for_state"("p_user_id" "uuid", "p_scope" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_trigger_synthesizer_for_state"("p_user_id" "uuid", "p_scope" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."scheduled_checkins_enforce_min_gap_1h"() TO "anon";
GRANT ALL ON FUNCTION "public"."scheduled_checkins_enforce_min_gap_1h"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."scheduled_checkins_enforce_min_gap_1h"() TO "service_role";



GRANT ALL ON FUNCTION "public"."seed_default_coach_preferences"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."seed_default_coach_preferences"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."seed_default_coach_preferences"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_phone_verified_on_whatsapp_optin"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_phone_verified_on_whatsapp_optin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_phone_verified_on_whatsapp_optin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_memory_items_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_memory_items_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_memory_items_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."transfer_verified_phone_to_user"("p_user_id" "uuid", "p_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."transfer_verified_phone_to_user"("p_user_id" "uuid", "p_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transfer_verified_phone_to_user"("p_user_id" "uuid", "p_phone" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."unlock_transformation_principle"("p_user_id" "uuid", "p_transformation_id" "uuid", "p_principle" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_modified_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_modified_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_modified_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."whatsapp_scheduling_access_eligible"("p_access_tier" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."whatsapp_scheduling_access_eligible"("p_access_tier" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."whatsapp_scheduling_access_eligible"("p_access_tier" "text") TO "service_role";












GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "service_role";















GRANT ALL ON TABLE "public"."app_config" TO "anon";
GRANT ALL ON TABLE "public"."app_config" TO "authenticated";
GRANT ALL ON TABLE "public"."app_config" TO "service_role";



GRANT ALL ON TABLE "public"."chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."communication_logs" TO "anon";
GRANT ALL ON TABLE "public"."communication_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."communication_logs" TO "service_role";



GRANT ALL ON TABLE "public"."confirmation_tokens_consumed" TO "anon";
GRANT ALL ON TABLE "public"."confirmation_tokens_consumed" TO "authenticated";
GRANT ALL ON TABLE "public"."confirmation_tokens_consumed" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_eval_events" TO "anon";
GRANT ALL ON TABLE "public"."conversation_eval_events" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_eval_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."conversation_eval_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."conversation_eval_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."conversation_eval_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_eval_runs" TO "anon";
GRANT ALL ON TABLE "public"."conversation_eval_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_eval_runs" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_scope_memories" TO "anon";
GRANT ALL ON TABLE "public"."conversation_scope_memories" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_scope_memories" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_turn_traces" TO "anon";
GRANT ALL ON TABLE "public"."conversation_turn_traces" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_turn_traces" TO "service_role";



GRANT ALL ON TABLE "public"."llm_usage_events" TO "anon";
GRANT ALL ON TABLE "public"."llm_usage_events" TO "authenticated";
GRANT ALL ON TABLE "public"."llm_usage_events" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_cost_events" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_cost_events" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_cost_events" TO "service_role";



GRANT ALL ON TABLE "public"."cost_fact_events" TO "service_role";



GRANT ALL ON TABLE "public"."internal_admins" TO "anon";
GRANT ALL ON TABLE "public"."internal_admins" TO "authenticated";
GRANT ALL ON TABLE "public"."internal_admins" TO "service_role";



GRANT ALL ON TABLE "public"."llm_pricing" TO "anon";
GRANT ALL ON TABLE "public"."llm_pricing" TO "authenticated";
GRANT ALL ON TABLE "public"."llm_pricing" TO "service_role";



GRANT ALL ON TABLE "public"."memory_change_log" TO "anon";
GRANT ALL ON TABLE "public"."memory_change_log" TO "authenticated";
GRANT ALL ON TABLE "public"."memory_change_log" TO "service_role";



GRANT ALL ON TABLE "public"."memory_eval_annotations" TO "anon";
GRANT ALL ON TABLE "public"."memory_eval_annotations" TO "authenticated";
GRANT ALL ON TABLE "public"."memory_eval_annotations" TO "service_role";



GRANT ALL ON TABLE "public"."memory_extraction_runs" TO "anon";
GRANT ALL ON TABLE "public"."memory_extraction_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."memory_extraction_runs" TO "service_role";



GRANT ALL ON TABLE "public"."memory_item_action_occurrences" TO "anon";
GRANT ALL ON TABLE "public"."memory_item_action_occurrences" TO "authenticated";
GRANT ALL ON TABLE "public"."memory_item_action_occurrences" TO "service_role";



GRANT ALL ON TABLE "public"."memory_item_actions" TO "anon";
GRANT ALL ON TABLE "public"."memory_item_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."memory_item_actions" TO "service_role";



GRANT ALL ON TABLE "public"."memory_item_entities" TO "anon";
GRANT ALL ON TABLE "public"."memory_item_entities" TO "authenticated";
GRANT ALL ON TABLE "public"."memory_item_entities" TO "service_role";



GRANT ALL ON TABLE "public"."memory_item_sources" TO "anon";
GRANT ALL ON TABLE "public"."memory_item_sources" TO "authenticated";
GRANT ALL ON TABLE "public"."memory_item_sources" TO "service_role";



GRANT ALL ON TABLE "public"."memory_item_topics" TO "anon";
GRANT ALL ON TABLE "public"."memory_item_topics" TO "authenticated";
GRANT ALL ON TABLE "public"."memory_item_topics" TO "service_role";



GRANT ALL ON TABLE "public"."memory_items" TO "anon";
GRANT ALL ON TABLE "public"."memory_items" TO "authenticated";
GRANT ALL ON TABLE "public"."memory_items" TO "service_role";



GRANT ALL ON TABLE "public"."memory_message_processing" TO "anon";
GRANT ALL ON TABLE "public"."memory_message_processing" TO "authenticated";
GRANT ALL ON TABLE "public"."memory_message_processing" TO "service_role";



GRANT ALL ON TABLE "public"."memory_observability_events" TO "anon";
GRANT ALL ON TABLE "public"."memory_observability_events" TO "authenticated";
GRANT ALL ON TABLE "public"."memory_observability_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."memory_observability_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."memory_observability_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."memory_observability_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."memory_weekly_review_runs" TO "anon";
GRANT ALL ON TABLE "public"."memory_weekly_review_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."memory_weekly_review_runs" TO "service_role";



GRANT ALL ON TABLE "public"."proactive_job_state" TO "anon";
GRANT ALL ON TABLE "public"."proactive_job_state" TO "authenticated";
GRANT ALL ON TABLE "public"."proactive_job_state" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."scheduled_checkins" TO "anon";
GRANT ALL ON TABLE "public"."scheduled_checkins" TO "authenticated";
GRANT ALL ON TABLE "public"."scheduled_checkins" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."stripe_webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."system_error_logs" TO "anon";
GRANT ALL ON TABLE "public"."system_error_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."system_error_logs" TO "service_role";



GRANT ALL ON TABLE "public"."system_runtime_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."system_runtime_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."system_runtime_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."turn_summary_logs" TO "anon";
GRANT ALL ON TABLE "public"."turn_summary_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."turn_summary_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."turn_summary_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."turn_summary_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."turn_summary_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_architect_quotes" TO "anon";
GRANT ALL ON TABLE "public"."user_architect_quotes" TO "authenticated";
GRANT ALL ON TABLE "public"."user_architect_quotes" TO "service_role";



GRANT ALL ON TABLE "public"."user_architect_reflections" TO "anon";
GRANT ALL ON TABLE "public"."user_architect_reflections" TO "authenticated";
GRANT ALL ON TABLE "public"."user_architect_reflections" TO "service_role";



GRANT ALL ON TABLE "public"."user_architect_stories" TO "anon";
GRANT ALL ON TABLE "public"."user_architect_stories" TO "authenticated";
GRANT ALL ON TABLE "public"."user_architect_stories" TO "service_role";



GRANT ALL ON TABLE "public"."user_architect_wishes" TO "anon";
GRANT ALL ON TABLE "public"."user_architect_wishes" TO "authenticated";
GRANT ALL ON TABLE "public"."user_architect_wishes" TO "service_role";



GRANT ALL ON TABLE "public"."user_attack_cards" TO "anon";
GRANT ALL ON TABLE "public"."user_attack_cards" TO "authenticated";
GRANT ALL ON TABLE "public"."user_attack_cards" TO "service_role";



GRANT ALL ON TABLE "public"."user_chat_states" TO "anon";
GRANT ALL ON TABLE "public"."user_chat_states" TO "authenticated";
GRANT ALL ON TABLE "public"."user_chat_states" TO "service_role";



GRANT ALL ON TABLE "public"."user_core_identity" TO "anon";
GRANT ALL ON TABLE "public"."user_core_identity" TO "authenticated";
GRANT ALL ON TABLE "public"."user_core_identity" TO "service_role";



GRANT ALL ON TABLE "public"."user_core_identity_archive" TO "anon";
GRANT ALL ON TABLE "public"."user_core_identity_archive" TO "authenticated";
GRANT ALL ON TABLE "public"."user_core_identity_archive" TO "service_role";



GRANT ALL ON TABLE "public"."user_cycle_drafts" TO "anon";
GRANT ALL ON TABLE "public"."user_cycle_drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."user_cycle_drafts" TO "service_role";



GRANT ALL ON TABLE "public"."user_cycles" TO "anon";
GRANT ALL ON TABLE "public"."user_cycles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_cycles" TO "service_role";



GRANT ALL ON TABLE "public"."user_defense_cards" TO "anon";
GRANT ALL ON TABLE "public"."user_defense_cards" TO "authenticated";
GRANT ALL ON TABLE "public"."user_defense_cards" TO "service_role";



GRANT ALL ON TABLE "public"."user_defense_wins" TO "anon";
GRANT ALL ON TABLE "public"."user_defense_wins" TO "authenticated";
GRANT ALL ON TABLE "public"."user_defense_wins" TO "service_role";



GRANT ALL ON TABLE "public"."user_entities" TO "anon";
GRANT ALL ON TABLE "public"."user_entities" TO "authenticated";
GRANT ALL ON TABLE "public"."user_entities" TO "service_role";



GRANT ALL ON TABLE "public"."user_habit_week_occurrences" TO "anon";
GRANT ALL ON TABLE "public"."user_habit_week_occurrences" TO "authenticated";
GRANT ALL ON TABLE "public"."user_habit_week_occurrences" TO "service_role";



GRANT ALL ON TABLE "public"."user_habit_week_plans" TO "anon";
GRANT ALL ON TABLE "public"."user_habit_week_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."user_habit_week_plans" TO "service_role";



GRANT ALL ON TABLE "public"."user_habit_week_reschedule_events" TO "anon";
GRANT ALL ON TABLE "public"."user_habit_week_reschedule_events" TO "authenticated";
GRANT ALL ON TABLE "public"."user_habit_week_reschedule_events" TO "service_role";



GRANT ALL ON TABLE "public"."user_inspiration_items" TO "anon";
GRANT ALL ON TABLE "public"."user_inspiration_items" TO "authenticated";
GRANT ALL ON TABLE "public"."user_inspiration_items" TO "service_role";



GRANT ALL ON TABLE "public"."user_level_tool_recommendation_events" TO "anon";
GRANT ALL ON TABLE "public"."user_level_tool_recommendation_events" TO "authenticated";
GRANT ALL ON TABLE "public"."user_level_tool_recommendation_events" TO "service_role";



GRANT ALL ON TABLE "public"."user_level_tool_recommendations" TO "anon";
GRANT ALL ON TABLE "public"."user_level_tool_recommendations" TO "authenticated";
GRANT ALL ON TABLE "public"."user_level_tool_recommendations" TO "service_role";



GRANT ALL ON TABLE "public"."user_metrics" TO "anon";
GRANT ALL ON TABLE "public"."user_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."user_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."user_module_archives" TO "anon";
GRANT ALL ON TABLE "public"."user_module_archives" TO "authenticated";
GRANT ALL ON TABLE "public"."user_module_archives" TO "service_role";



GRANT ALL ON TABLE "public"."user_module_state_entries" TO "anon";
GRANT ALL ON TABLE "public"."user_module_state_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."user_module_state_entries" TO "service_role";



GRANT ALL ON TABLE "public"."user_plan_item_entries" TO "anon";
GRANT ALL ON TABLE "public"."user_plan_item_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."user_plan_item_entries" TO "service_role";



GRANT ALL ON TABLE "public"."user_plan_items" TO "anon";
GRANT ALL ON TABLE "public"."user_plan_items" TO "authenticated";
GRANT ALL ON TABLE "public"."user_plan_items" TO "service_role";



GRANT ALL ON TABLE "public"."user_plan_level_generation_events" TO "anon";
GRANT ALL ON TABLE "public"."user_plan_level_generation_events" TO "authenticated";
GRANT ALL ON TABLE "public"."user_plan_level_generation_events" TO "service_role";



GRANT ALL ON TABLE "public"."user_plan_level_reviews" TO "anon";
GRANT ALL ON TABLE "public"."user_plan_level_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."user_plan_level_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."user_plan_review_requests" TO "anon";
GRANT ALL ON TABLE "public"."user_plan_review_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."user_plan_review_requests" TO "service_role";



GRANT ALL ON TABLE "public"."user_plans_v2" TO "anon";
GRANT ALL ON TABLE "public"."user_plans_v2" TO "authenticated";
GRANT ALL ON TABLE "public"."user_plans_v2" TO "service_role";



GRANT ALL ON TABLE "public"."user_potion_sessions" TO "anon";
GRANT ALL ON TABLE "public"."user_potion_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_potion_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."user_professional_support_events" TO "anon";
GRANT ALL ON TABLE "public"."user_professional_support_events" TO "authenticated";
GRANT ALL ON TABLE "public"."user_professional_support_events" TO "service_role";



GRANT ALL ON TABLE "public"."user_professional_support_recommendations" TO "anon";
GRANT ALL ON TABLE "public"."user_professional_support_recommendations" TO "authenticated";
GRANT ALL ON TABLE "public"."user_professional_support_recommendations" TO "service_role";



GRANT ALL ON TABLE "public"."user_profile_facts" TO "anon";
GRANT ALL ON TABLE "public"."user_profile_facts" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profile_facts" TO "service_role";



GRANT ALL ON TABLE "public"."user_recurring_reminders" TO "anon";
GRANT ALL ON TABLE "public"."user_recurring_reminders" TO "authenticated";
GRANT ALL ON TABLE "public"."user_recurring_reminders" TO "service_role";



GRANT ALL ON TABLE "public"."user_relation_preferences" TO "anon";
GRANT ALL ON TABLE "public"."user_relation_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."user_relation_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."user_rendez_vous" TO "anon";
GRANT ALL ON TABLE "public"."user_rendez_vous" TO "authenticated";
GRANT ALL ON TABLE "public"."user_rendez_vous" TO "service_role";



GRANT ALL ON TABLE "public"."user_support_cards" TO "anon";
GRANT ALL ON TABLE "public"."user_support_cards" TO "authenticated";
GRANT ALL ON TABLE "public"."user_support_cards" TO "service_role";



GRANT ALL ON TABLE "public"."user_topic_keywords" TO "anon";
GRANT ALL ON TABLE "public"."user_topic_keywords" TO "authenticated";
GRANT ALL ON TABLE "public"."user_topic_keywords" TO "service_role";



GRANT ALL ON TABLE "public"."user_topic_memories" TO "anon";
GRANT ALL ON TABLE "public"."user_topic_memories" TO "authenticated";
GRANT ALL ON TABLE "public"."user_topic_memories" TO "service_role";



GRANT ALL ON TABLE "public"."user_transformation_aspects" TO "anon";
GRANT ALL ON TABLE "public"."user_transformation_aspects" TO "authenticated";
GRANT ALL ON TABLE "public"."user_transformation_aspects" TO "service_role";



GRANT ALL ON TABLE "public"."user_transformation_closure_feedback" TO "anon";
GRANT ALL ON TABLE "public"."user_transformation_closure_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."user_transformation_closure_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."user_transformations" TO "anon";
GRANT ALL ON TABLE "public"."user_transformations" TO "authenticated";
GRANT ALL ON TABLE "public"."user_transformations" TO "service_role";



GRANT ALL ON TABLE "public"."user_victory_ledger" TO "anon";
GRANT ALL ON TABLE "public"."user_victory_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."user_victory_ledger" TO "service_role";



GRANT ALL ON TABLE "public"."user_week_states" TO "anon";
GRANT ALL ON TABLE "public"."user_week_states" TO "authenticated";
GRANT ALL ON TABLE "public"."user_week_states" TO "service_role";



GRANT ALL ON TABLE "public"."weekly_bilan_suggestion_events" TO "anon";
GRANT ALL ON TABLE "public"."weekly_bilan_suggestion_events" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_bilan_suggestion_events" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_inbound_dedup" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_inbound_dedup" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_inbound_dedup" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_link_requests" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_link_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_link_requests" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_link_tokens" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_link_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_link_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_monthly_quotas" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_optin_recovery" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_optin_recovery" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_optin_recovery" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_outbound_status_events" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_outbound_status_events" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_outbound_status_events" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_pending_actions" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_pending_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_pending_actions" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_unlinked_inbound_messages" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_unlinked_inbound_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_unlinked_inbound_messages" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






























