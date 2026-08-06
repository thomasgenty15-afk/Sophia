


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



CREATE EXTENSION IF NOT EXISTS "btree_gist" WITH SCHEMA "public";






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


CREATE OR REPLACE FUNCTION "public"."_trg_coach_clients_enforce_trial_cap"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_limit integer;
  v_live integer;
  v_paying boolean;
  v_kind text;
begin
  if new.status not in ('invited','active') then
    return new;
  end if;
  -- Nothing new is being occupied by this write.
  if tg_op = 'UPDATE' and old.status in ('invited','active') then
    return new;
  end if;

  -- LE COACH MAISON N'EST PAS EN ESSAI, il est gratuit.
  --
  -- Le plafond existe pour empêcher un coach d'exploiter un essai gratuit à
  -- 40 élèves. Appliqué à la maison, il refuse le 4ᵉ INSCRIT LIBRE avec
  -- `keel_trial_seat_limit_reached` — une erreur d'écriture, au moment de
  -- l'inscription, sur le seul chemin que ce lot existe pour ouvrir.
  --
  -- CONDITION DE DÉSARMEMENT: uniquement `coach_kind = 'house'`. Le plafond
  -- reste armé à l'identique pour tout coach humain (tests 17 et 18 de
  -- billing_seats_test.sql).
  select c.coach_kind into v_kind
  from public.coaches c where c.id = new.coach_id;
  if v_kind = 'house' then
    return new;
  end if;

  select exists (
    select 1
    from public.coaches c
    join public.subscriptions s on s.user_id = c.user_id
    where c.id = new.coach_id
      and lower(coalesce(s.status,'')) in ('active','trialing')
      and (s.current_period_end is null or now() < s.current_period_end)
  ) into v_paying;

  if v_paying then
    return new;
  end if;

  select c.trial_seat_limit into v_limit
  from public.coaches c where c.id = new.coach_id;
  if v_limit is null then
    return new;
  end if;

  select count(*) into v_live
  from public.coach_clients cc
  where cc.coach_id = new.coach_id
    and cc.status in ('invited','active')
    and cc.id <> new.id;

  if v_live >= v_limit then
    raise exception
      'keel_trial_seat_limit_reached: coach % is on trial and already has % live seats (limit %)',
      new.coach_id, v_live, v_limit
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."_trg_coach_clients_enforce_trial_cap"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_trg_coaches_default_trial_end"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if new.trial_ends_at is null then
    new.trial_ends_at := coalesce(new.trial_started_at, now()) + interval '14 days';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."_trg_coaches_default_trial_end"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_trg_recompute_access_tier_from_coach_clients"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- On UPDATE the student can be re-pointed; recompute BOTH sides so a moved
  -- link never leaves the previous student holding an entitlement nobody pays.
  if tg_op <> 'INSERT' and old.student_user_id is not null then
    perform public.recompute_profile_access_tier(old.student_user_id);
  end if;
  if tg_op <> 'DELETE' and new.student_user_id is not null then
    perform public.recompute_profile_access_tier(new.student_user_id);
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."_trg_recompute_access_tier_from_coach_clients"() OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."_trg_recompute_roster_from_coaches"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.recompute_coached_students_access_tier(new.id);
  return null;
end;
$$;


ALTER FUNCTION "public"."_trg_recompute_roster_from_coaches"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_trg_recompute_roster_from_subscriptions"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user uuid := coalesce(new.user_id, old.user_id);
  v_coach uuid;
begin
  select c.id into v_coach from public.coaches c where c.user_id = v_user;
  if v_coach is not null then
    perform public.recompute_coached_students_access_tier(v_coach);
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."_trg_recompute_roster_from_subscriptions"() OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."accept_coach_invitation"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'accept_coach_invitation: no authenticated user'
      using errcode = '42501';
  end if;
  return public.accept_coach_invitation_for_user(v_user, p_token);
end;
$$;


ALTER FUNCTION "public"."accept_coach_invitation"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_coach_invitation_for_user"("p_user_id" "uuid", "p_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  v_hash text;
  v_invitation_id uuid;
  v_coach_id uuid;
  v_coach_user_id uuid;
  v_coach_status text;
  v_coach_name text;
  v_coach_country text;
  v_status text;
  v_expires_at timestamptz;
  v_email text;
  v_outcome text;
begin
  if p_user_id is null then
    raise exception 'accept_coach_invitation: no user' using errcode = '42501';
  end if;
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{20,200}$' then
    return jsonb_build_object('accepted', false, 'reason', 'invalid_token');
  end if;

  v_hash := public.coach_invite_token_hash(p_token);

  -- FOR UPDATE: la ligne d'invitation est le mutex de toute l'opération. Deux
  -- onglets qui cliquent « Accepter » se sérialisent ici.
  select i.id, i.coach_id, i.status, i.expires_at, lower(i.email),
         c.user_id, c.status,
         coalesce(nullif(btrim(c.display_name), ''), nullif(btrim(p.full_name), '')),
         p.country
    into v_invitation_id, v_coach_id, v_status, v_expires_at, v_email,
         v_coach_user_id, v_coach_status, v_coach_name,
         v_coach_country
    from public.coach_invitations i
    join public.coaches c on c.id = i.coach_id
    left join public.profiles p on p.id = c.user_id
   where i.invite_token_hash = v_hash
     for update of i;

  if not found then
    return jsonb_build_object('accepted', false, 'reason', 'invalid_token');
  end if;
  if v_status = 'revoked' then
    return jsonb_build_object('accepted', false, 'reason', 'revoked');
  end if;
  if v_status = 'accepted' then
    return jsonb_build_object('accepted', false, 'reason', 'already_accepted');
  end if;
  if v_status = 'expired' or v_expires_at <= now() then
    -- Brûlée pendant qu'on tient le verrou: une invitation expirée cesse d'être
    -- 'pending' la première fois que quelqu'un la regarde, donc l'écran du
    -- coach dit la vérité sans job de balayage.
    update public.coach_invitations set status = 'expired' where id = v_invitation_id;
    return jsonb_build_object('accepted', false, 'reason', 'expired');
  end if;
  if v_coach_status <> 'active' then
    return jsonb_build_object('accepted', false, 'reason', 'coach_unavailable');
  end if;
  if v_coach_user_id = p_user_id then
    return jsonb_build_object('accepted', false, 'reason', 'self_invitation');
  end if;

  -- L'EFFET, délégué. Le pays passé est celui DÉCLARÉ par le coach (sélecteur à
  -- son inscription, en sachant qu'il sert aux ressources de crise): un défaut
  -- hérité d'une déclaration vaut mieux qu'un pays dérivé d'une langue que
  -- personne n'a choisie. Il reste écrasable par la déclaration de l'élève.
  v_outcome := public.keel_attach_student_to_coach(
    p_user_id, v_coach_id, v_email, v_coach_country
  );
  if v_outcome <> 'attached' then
    return jsonb_build_object('accepted', false, 'reason', v_outcome);
  end if;

  update public.coach_invitations
     set status = 'accepted', accepted_at = now()
   where id = v_invitation_id;

  return jsonb_build_object(
    'accepted', true,
    'coach_first_name', nullif(split_part(coalesce(v_coach_name, ''), ' ', 1), '')
  );
end;
$_$;


ALTER FUNCTION "public"."accept_coach_invitation_for_user"("p_user_id" "uuid", "p_token" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."accept_coach_invitation_for_user"("p_user_id" "uuid", "p_token" "text") IS 'Accepte une invitation coach: valide le jeton (expiration, révocation, coach actif, auto-invitation) puis délègue TOUT l''effet à keel_attach_student_to_coach() — un seul endroit écrit le lien, keel_role, la langue et le pays, pour les deux portes d''entrée du produit.';



CREATE OR REPLACE FUNCTION "public"."admin_cost_run_type_matches"("p_event_run_type" "text", "p_filter" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case
    when coalesce(trim(p_filter), '') = '' or lower(trim(p_filter)) = 'all' then true
    when lower(trim(p_filter)) = 'non_prod' then lower(coalesce(p_event_run_type, 'prod')) <> 'prod'
    else lower(coalesce(p_event_run_type, 'prod')) = lower(trim(p_filter))
  end
$$;


ALTER FUNCTION "public"."admin_cost_run_type_matches"("p_event_run_type" "text", "p_filter" "text") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."archive_pending_week_plans_when_parent_plan_archived"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.status = 'archived'
    and old.status is distinct from 'archived'
  then
    update public.user_habit_week_plans
    set
      status = 'archived',
      updated_at = coalesce(new.archived_at, new.updated_at, now())
    where plan_id = new.id
      and status = 'pending_confirmation';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."archive_pending_week_plans_when_parent_plan_archived"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_scheduled_checkins_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.scheduled_checkins_delete_audit (
    deleted_row_id,
    user_id,
    event_context,
    status,
    scheduled_for,
    origin,
    message_payload,
    deleting_query
  ) values (
    old.id,
    old.user_id,
    old.event_context,
    old.status::text,
    old.scheduled_for,
    old.origin,
    old.message_payload,
    left(current_query(), 4000)
  );
  return old;
end;
$$;


ALTER FUNCTION "public"."audit_scheduled_checkins_delete"() OWNER TO "postgres";

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


CREATE OR REPLACE FUNCTION "public"."claim_in_app_outbound"("p_user_id" "uuid", "p_request_id" "text", "p_message_type" "text", "p_content_preview" "text", "p_status" "text", "p_metadata" "jsonb", "p_last_error_code" "text", "p_enforce_cap" boolean, "p_cap" integer, "p_local_date" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id uuid;
  v_count integer;
begin
  if p_enforce_cap then
    -- Le verrou est pris DANS la transaction qui insère. C'est toute la
    -- différence avec l'ancien compte : ici, le comptage et l'écriture ne
    -- peuvent pas être séparés par une autre livraison.
    perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

    select count(*) into v_count
      from public.outbound_messages
     where user_id = p_user_id
       and delivery_channel = 'in_app'
       and status = 'sent'
       and metadata->>'counts_as_unsolicited' = 'true'
       and metadata->>'local_date' = p_local_date;

    if v_count >= p_cap then
      -- Refus. L'appelant écrira sa propre ligne `skipped` avec le motif: une
      -- ligne de refus n'a pas besoin du verrou et ne doit pas le retenir.
      return null;
    end if;
  end if;

  insert into public.outbound_messages (
    request_id, user_id, to_e164, delivery_channel, message_type,
    content_preview, graph_payload, status, last_error_code,
    last_error_message, metadata, updated_at
  ) values (
    p_request_id, p_user_id, null, 'in_app', p_message_type,
    left(coalesce(p_content_preview, ''), 500), '{}'::jsonb, p_status,
    p_last_error_code, p_last_error_code, coalesce(p_metadata, '{}'::jsonb), now()
  ) returning id into v_id;

  return v_id;
end $$;


ALTER FUNCTION "public"."claim_in_app_outbound"("p_user_id" "uuid", "p_request_id" "text", "p_message_type" "text", "p_content_preview" "text", "p_status" "text", "p_metadata" "jsonb", "p_last_error_code" "text", "p_enforce_cap" boolean, "p_cap" integer, "p_local_date" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."claim_in_app_outbound"("p_user_id" "uuid", "p_request_id" "text", "p_message_type" "text", "p_content_preview" "text", "p_status" "text", "p_metadata" "jsonb", "p_last_error_code" "text", "p_enforce_cap" boolean, "p_cap" integer, "p_local_date" "text") IS 'Réserve ET écrit une livraison in-app en une transaction, sous verrou par élève. Ne décide rien: la politique vit dans delivery_policy.ts.';



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


CREATE OR REPLACE FUNCTION "public"."cleanup_scheduling_for_user"("p_user_id" "uuid") RETURNS "void"
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

  update public.pending_actions
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


ALTER FUNCTION "public"."cleanup_scheduling_for_user"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."coach_invite_token_hash"("p_token" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE STRICT
    SET "search_path" TO ''
    AS $$
  select encode(sha256(convert_to(p_token, 'utf8')), 'hex');
$$;


ALTER FUNCTION "public"."coach_invite_token_hash"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."coach_rule_matches_protocol"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  owner uuid;
begin
  select p.coach_id into owner
  from public.coach_protocols p
  where p.id = new.protocol_id;

  if owner is null then
    raise exception 'protocol % introuvable', new.protocol_id;
  end if;

  if owner <> new.coach_id then
    raise exception
      'coach_id % ne correspond pas au coach % du protocole %',
      new.coach_id, owner, new.protocol_id;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."coach_rule_matches_protocol"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."coach_student_history_floor"("p_student" "uuid") RETURNS timestamp with time zone
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  -- `-infinity` quand il n'y a pas de plancher connaissable, et c'est le bon
  -- défaut: les liens créés avant W10 peuvent porter `started_at` NULL, et un
  -- plancher inventé (now(), par exemple) CACHERAIT à un coach en exercice
  -- l'historique de ses propres élèves. Une donnée manquante ne doit jamais
  -- retirer un accès légitime — elle ne doit pas non plus en créer un, et c'est
  -- pourquoi `coached_student_ids()` reste la garde d'appartenance: ce plancher
  -- ne borne que la FENÊTRE, il n'autorise personne.
  select coalesce(min(cc.started_at), '-infinity'::timestamptz)
  from public.coach_clients cc
  join public.coaches c on c.id = cc.coach_id
  where c.user_id = (select auth.uid())
    and c.status = 'active'
    and cc.status = 'active'
    and cc.student_user_id = p_student;
$$;


ALTER FUNCTION "public"."coach_student_history_floor"("p_student" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."coach_student_history_floor"("p_student" "uuid") IS 'Depuis quand le coach appelant a-t-il le droit de lire l''activité de cet élève ? = started_at du lien vivant. Borne les vues d''activité PASSÉE (repas, contact, taps) pour qu''un coach qui reprend un élève — d''un autre coach ou du coach maison — ne lise pas des semaines qu''il n''a pas encadrées. Ne borne PAS la sécurité, l''objectif, ni le plan en vigueur.';



CREATE OR REPLACE FUNCTION "public"."coached_student_ids"() RETURNS "uuid"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce(array_agg(cc.student_user_id), '{}'::uuid[])
  from public.coach_clients cc
  join public.coaches c on c.id = cc.coach_id
  where c.user_id = (select auth.uid())
    and c.status = 'active'
    and cc.status = 'active'
    and cc.student_user_id is not null;
$$;


ALTER FUNCTION "public"."coached_student_ids"() OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."cost_metadata_environment"("p_metadata" "jsonb") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case
    when lower(trim(coalesce(p_metadata->>'environment', p_metadata->>'env', ''))) <> ''
      then lower(trim(coalesce(p_metadata->>'environment', p_metadata->>'env')))
    when lower(trim(coalesce(p_metadata->>'is_local', p_metadata->>'local', ''))) in ('true','1','yes')
      then 'local'
    else 'prod'
  end
$$;


ALTER FUNCTION "public"."cost_metadata_environment"("p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cost_metadata_run_type"("p_metadata" "jsonb") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case
    when lower(trim(coalesce(p_metadata->>'run_type', p_metadata->>'runType', ''))) <> ''
      then lower(trim(coalesce(p_metadata->>'run_type', p_metadata->>'runType')))
    when coalesce(p_metadata->>'eval_run_id', p_metadata->>'evalRunId', '') <> ''
      then 'eval'
    when coalesce(p_metadata->>'qa_run_id', p_metadata->>'qaRunId', '') <> ''
      then 'qa'
    when coalesce(p_metadata->>'smoke_run_id', p_metadata->>'smokeRunId', '') <> ''
      then 'smoke'
    when lower(coalesce(p_metadata->>'source', '')) like '%eval%'
      then 'eval'
    when lower(coalesce(p_metadata->>'source', '')) like '%qa%'
      then 'qa'
    else 'prod'
  end
$$;


ALTER FUNCTION "public"."cost_metadata_run_type"("p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_rate_limit"("p_key" "text", "p_window_seconds" integer, "p_limit" integer) RETURNS TABLE("allowed" boolean, "current_count" integer, "retry_after_seconds" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."enforce_rate_limit"("p_key" "text", "p_window_seconds" integer, "p_limit" integer) OWNER TO "postgres";


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
    AS $_$
declare
  v_id uuid;
  v_scope text;
  v_channel text;
  v_message text;
  v_hash text;
  v_delay_seconds integer;
  v_delay interval;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if auth.uid() is null then
      raise exception 'Unauthorized';
    end if;
    if auth.uid() <> p_user_id then
      raise exception 'Forbidden';
    end if;
  end if;

  v_scope := coalesce(nullif(trim(p_scope), ''), 'web');
  v_channel := coalesce(nullif(trim(p_channel), ''), 'web');
  v_message := coalesce(nullif(trim(p_message), ''), '');
  if v_message = '' then
    raise exception 'Message is empty';
  end if;

  v_delay_seconds := case
    when coalesce(p_metadata->>'delay_seconds', '') ~ '^[0-9]+$'
      then greatest(0, least((p_metadata->>'delay_seconds')::integer, 3600))
    else 120
  end;
  v_delay := make_interval(secs => v_delay_seconds);
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
    now() + v_delay + ((random() * 40.0 - 20.0) * interval '1 second'),
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (user_id, scope, message_hash)
    where status = any (array['pending'::text, 'processing'::text])
  do update
    set
      updated_at = now(),
      next_attempt_at = greatest(
        public.llm_retry_jobs.next_attempt_at,
        now() + v_delay + ((random() * 40.0 - 20.0) * interval '1 second')
      ),
      metadata = public.llm_retry_jobs.metadata || excluded.metadata
  returning id into v_id;

  return v_id;
end;
$_$;


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


CREATE OR REPLACE FUNCTION "public"."get_admin_cost_by_operation"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text" DEFAULT 'day'::"text", "p_whatsapp_eur_to_usd" numeric DEFAULT 1.08, "p_provider" "text" DEFAULT NULL::"text", "p_model" "text" DEFAULT NULL::"text", "p_family" "text" DEFAULT NULL::"text", "p_operation" "text" DEFAULT NULL::"text", "p_run_type" "text" DEFAULT 'all'::"text") RETURNS TABLE("bucket_start" timestamp with time zone, "operation_family" "text", "operation_name" "text", "source" "text", "provider" "text", "model" "text", "cost_domain" "text", "ai_cost_usd" numeric, "whatsapp_cost_eur" numeric, "total_cost_usd" numeric, "total_calls" bigint, "total_tokens" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with admin_guard as (
    select 1 as ok
    where exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid())
  ),
  base as (
    select *
    from public.cost_fact_events_enriched c, admin_guard
    where c.created_at >= p_start
      and c.created_at < p_end
      and public.admin_cost_run_type_matches(c.run_type, p_run_type)
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
    coalesce(sum(b.cost_usd), 0)::numeric as ai_cost_usd,
    coalesce(sum(b.cost_eur), 0)::numeric as whatsapp_cost_eur,
    coalesce(sum(b.cost_usd + b.cost_eur * p_whatsapp_eur_to_usd), 0)::numeric as total_cost_usd,
    count(*)::bigint as total_calls,
    coalesce(sum(b.total_tokens), 0)::bigint as total_tokens
  from base b
  group by 1,2,3,4,5,6,7
  order by 1 desc, total_cost_usd desc;
$$;


ALTER FUNCTION "public"."get_admin_cost_by_operation"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text", "p_run_type" "text") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."get_admin_cost_by_user"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text" DEFAULT 'day'::"text", "p_whatsapp_eur_to_usd" numeric DEFAULT 1.08, "p_provider" "text" DEFAULT NULL::"text", "p_model" "text" DEFAULT NULL::"text", "p_family" "text" DEFAULT NULL::"text", "p_operation" "text" DEFAULT NULL::"text", "p_run_type" "text" DEFAULT 'all'::"text") RETURNS TABLE("bucket_start" timestamp with time zone, "user_id" "uuid", "full_name" "text", "email" "text", "ai_cost_usd" numeric, "whatsapp_cost_eur" numeric, "total_cost_usd" numeric, "total_calls" bigint, "total_tokens" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with admin_guard as (
    select 1 as ok
    where exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid())
  ),
  base as (
    select *
    from public.cost_fact_events_enriched c, admin_guard
    where c.created_at >= p_start
      and c.created_at < p_end
      and c.user_id is not null
      and public.admin_cost_run_type_matches(c.run_type, p_run_type)
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
    coalesce(sum(b.cost_usd), 0)::numeric as ai_cost_usd,
    coalesce(sum(b.cost_eur), 0)::numeric as whatsapp_cost_eur,
    coalesce(sum(b.cost_usd + b.cost_eur * p_whatsapp_eur_to_usd), 0)::numeric as total_cost_usd,
    count(*)::bigint as total_calls,
    coalesce(sum(b.total_tokens), 0)::bigint as total_tokens
  from base b
  left join public.profiles p on p.id = b.user_id
  group by 1, 2, 3, 4
  order by 1 desc, total_cost_usd desc;
$$;


ALTER FUNCTION "public"."get_admin_cost_by_user"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text", "p_run_type" "text") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."get_admin_cost_compare_previous"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_whatsapp_eur_to_usd" numeric DEFAULT 1.08, "p_provider" "text" DEFAULT NULL::"text", "p_model" "text" DEFAULT NULL::"text", "p_family" "text" DEFAULT NULL::"text", "p_operation" "text" DEFAULT NULL::"text", "p_run_type" "text" DEFAULT 'all'::"text") RETURNS TABLE("current_total_cost_usd" numeric, "previous_total_cost_usd" numeric, "delta_cost_usd" numeric, "delta_pct" numeric, "current_calls" bigint, "previous_calls" bigint)
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
      coalesce(sum(c.cost_usd + c.cost_eur * p_whatsapp_eur_to_usd), 0)::numeric as total_cost,
      count(*)::bigint as calls
    from public.cost_fact_events_enriched c, admin_guard
    where c.created_at >= p_start
      and c.created_at < p_end
      and public.admin_cost_run_type_matches(c.run_type, p_run_type)
      and (coalesce(p_provider, '') = '' or lower(coalesce(c.provider, '')) = lower(p_provider))
      and (coalesce(p_model, '') = '' or lower(coalesce(c.model, '')) = lower(p_model))
      and (coalesce(p_family, '') = '' or public.normalize_cost_operation_family(c.operation_family, c.source) = lower(p_family))
      and (coalesce(p_operation, '') = '' or public.normalize_cost_operation_name(c.operation_name, c.source) = lower(p_operation))
  ),
  prev as (
    select
      coalesce(sum(c.cost_usd + c.cost_eur * p_whatsapp_eur_to_usd), 0)::numeric as total_cost,
      count(*)::bigint as calls
    from public.cost_fact_events_enriched c, dur d, admin_guard
    where c.created_at >= (p_start - make_interval(secs => d.seconds))
      and c.created_at < p_start
      and public.admin_cost_run_type_matches(c.run_type, p_run_type)
      and (coalesce(p_provider, '') = '' or lower(coalesce(c.provider, '')) = lower(p_provider))
      and (coalesce(p_model, '') = '' or lower(coalesce(c.model, '')) = lower(p_model))
      and (coalesce(p_family, '') = '' or public.normalize_cost_operation_family(c.operation_family, c.source) = lower(p_family))
      and (coalesce(p_operation, '') = '' or public.normalize_cost_operation_name(c.operation_name, c.source) = lower(p_operation))
  )
  select
    cur.total_cost as current_total_cost_usd,
    prev.total_cost as previous_total_cost_usd,
    (cur.total_cost - prev.total_cost)::numeric as delta_cost_usd,
    case when prev.total_cost = 0 then null else (((cur.total_cost - prev.total_cost) / prev.total_cost) * 100)::numeric end as delta_pct,
    cur.calls as current_calls,
    prev.calls as previous_calls
  from cur, prev;
$$;


ALTER FUNCTION "public"."get_admin_cost_compare_previous"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text", "p_run_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_cost_coverage_gaps"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_run_type" "text" DEFAULT 'all'::"text") RETURNS TABLE("gap_type" "text", "provider" "text", "model" "text", "source" "text", "operation_family" "text", "event_count" bigint, "total_cost_usd" numeric)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with admin_guard as (
    select 1 as ok
    where exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid())
  ),
  base as (
    select
      provider,
      model,
      source,
      public.normalize_cost_operation_family(operation_family, source) as operation_family,
      user_id,
      coalesce(cost_unpriced, false) as cost_unpriced,
      coalesce(cost_usd, 0::numeric) as cost_usd,
      metadata
    from public.llm_usage_events, admin_guard
    where created_at >= p_start
      and created_at < p_end
      and public.admin_cost_run_type_matches(public.cost_metadata_run_type(metadata), p_run_type)
  ),
  gaps as (
    select 'unpriced_model'::text as gap_type, provider, model, source, operation_family, count(*)::bigint as event_count, sum(cost_usd)::numeric as total_cost_usd
    from base
    where cost_unpriced = true
    group by provider, model, source, operation_family
    union all
    select 'unattributed_user'::text as gap_type, provider, model, source, operation_family, count(*)::bigint as event_count, sum(cost_usd)::numeric as total_cost_usd
    from base
    where user_id is null
    group by provider, model, source, operation_family
    union all
    select 'unclassified_operation'::text as gap_type, provider, model, source, operation_family, count(*)::bigint as event_count, sum(cost_usd)::numeric as total_cost_usd
    from base
    where operation_family = 'other'
    group by provider, model, source, operation_family
  )
  select *
  from gaps
  order by event_count desc, gap_type, provider, model, source;
$$;


ALTER FUNCTION "public"."get_admin_cost_coverage_gaps"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_run_type" "text") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."get_admin_cost_data_quality_v2"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_whatsapp_eur_to_usd" numeric DEFAULT 1.08, "p_run_type" "text" DEFAULT 'all'::"text", "p_provider" "text" DEFAULT NULL::"text", "p_model" "text" DEFAULT NULL::"text", "p_family" "text" DEFAULT NULL::"text", "p_operation" "text" DEFAULT NULL::"text") RETURNS TABLE("total_events" bigint, "attributed_events" bigint, "unattributed_events" bigint, "unpriced_events" bigint, "missing_operation_events" bigint, "missing_source_events" bigint, "total_cost_usd" numeric, "attributed_cost_usd" numeric, "unattributed_cost_usd" numeric, "attribution_rate" numeric, "pricing_coverage_rate" numeric)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with admin_guard as (
    select 1 as ok
    where exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid())
  ),
  base as (
    select c.*
    from public.cost_fact_events_enriched c, admin_guard
    where c.created_at >= p_start
      and c.created_at < p_end
      and public.admin_cost_run_type_matches(c.run_type, p_run_type)
      and (coalesce(p_provider, '') = '' or lower(coalesce(c.provider, '')) = lower(p_provider))
      and (coalesce(p_model, '') = '' or lower(coalesce(c.model, '')) = lower(p_model))
      and (coalesce(p_family, '') = '' or public.normalize_cost_operation_family(c.operation_family, c.source) = lower(p_family))
      and (coalesce(p_operation, '') = '' or public.normalize_cost_operation_name(c.operation_name, c.source) = lower(p_operation))
  ),
  agg as (
    select
      count(*)::bigint as total_events,
      count(*) filter (where user_id is not null)::bigint as attributed_events,
      count(*) filter (where user_id is null)::bigint as unattributed_events,
      count(*) filter (where coalesce(cost_unpriced, false) = true)::bigint as unpriced_events,
      count(*) filter (where coalesce(operation_family, '') = '' or coalesce(operation_name, '') = '')::bigint as missing_operation_events,
      count(*) filter (where coalesce(source, '') = '')::bigint as missing_source_events,
      coalesce(sum(cost_usd + cost_eur * p_whatsapp_eur_to_usd), 0)::numeric as total_cost_usd,
      coalesce(sum(cost_usd + cost_eur * p_whatsapp_eur_to_usd) filter (where user_id is not null), 0)::numeric as attributed_cost_usd,
      coalesce(sum(cost_usd + cost_eur * p_whatsapp_eur_to_usd) filter (where user_id is null), 0)::numeric as unattributed_cost_usd
    from base
  )
  select
    total_events,
    attributed_events,
    unattributed_events,
    unpriced_events,
    missing_operation_events,
    missing_source_events,
    total_cost_usd,
    attributed_cost_usd,
    unattributed_cost_usd,
    case when total_events = 0 then 1 else attributed_events::numeric / total_events::numeric end as attribution_rate,
    case when total_events = 0 then 1 else (total_events - unpriced_events)::numeric / total_events::numeric end as pricing_coverage_rate
  from agg;
$$;


ALTER FUNCTION "public"."get_admin_cost_data_quality_v2"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_whatsapp_eur_to_usd" numeric, "p_run_type" "text", "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."get_admin_cost_overview"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text" DEFAULT 'day'::"text", "p_whatsapp_eur_to_usd" numeric DEFAULT 1.08, "p_provider" "text" DEFAULT NULL::"text", "p_model" "text" DEFAULT NULL::"text", "p_family" "text" DEFAULT NULL::"text", "p_operation" "text" DEFAULT NULL::"text", "p_run_type" "text" DEFAULT 'all'::"text") RETURNS TABLE("bucket_start" timestamp with time zone, "total_cost_usd" numeric, "ai_cost_usd" numeric, "whatsapp_cost_eur" numeric, "whatsapp_cost_usd" numeric, "total_calls" bigint, "total_tokens" bigint, "unique_users" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with admin_guard as (
    select 1 as ok
    where exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid())
  ),
  base as (
    select *
    from public.cost_fact_events_enriched c, admin_guard
    where c.created_at >= p_start
      and c.created_at < p_end
      and public.admin_cost_run_type_matches(c.run_type, p_run_type)
      and (coalesce(p_provider, '') = '' or lower(coalesce(c.provider, '')) = lower(p_provider))
      and (coalesce(p_model, '') = '' or lower(coalesce(c.model, '')) = lower(p_model))
      and (coalesce(p_family, '') = '' or public.normalize_cost_operation_family(c.operation_family, c.source) = lower(p_family))
      and (coalesce(p_operation, '') = '' or public.normalize_cost_operation_name(c.operation_name, c.source) = lower(p_operation))
  )
  select
    public.cost_bucket(b.created_at, p_bucket) as bucket_start,
    coalesce(sum(b.cost_usd + b.cost_eur * p_whatsapp_eur_to_usd), 0)::numeric as total_cost_usd,
    coalesce(sum(b.cost_usd), 0)::numeric as ai_cost_usd,
    coalesce(sum(b.cost_eur), 0)::numeric as whatsapp_cost_eur,
    coalesce(sum(b.cost_eur) * p_whatsapp_eur_to_usd, 0)::numeric as whatsapp_cost_usd,
    count(*)::bigint as total_calls,
    coalesce(sum(b.total_tokens), 0)::bigint as total_tokens,
    count(distinct b.user_id)::bigint as unique_users
  from base b
  group by 1
  order by 1 desc;
$$;


ALTER FUNCTION "public"."get_admin_cost_overview"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text", "p_run_type" "text") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."get_admin_daily_cost_synthesis"("p_target_day" "date", "p_whatsapp_eur_to_usd" numeric DEFAULT 1.08, "p_provider" "text" DEFAULT NULL::"text", "p_model" "text" DEFAULT NULL::"text", "p_family" "text" DEFAULT NULL::"text", "p_operation" "text" DEFAULT NULL::"text", "p_run_type" "text" DEFAULT 'all'::"text") RETURNS TABLE("target_day" "date", "ai_cost_usd" numeric, "whatsapp_cost_eur" numeric, "total_cost_usd" numeric, "total_calls" bigint, "total_tokens" bigint, "unique_users" bigint, "unpriced_event_count" bigint, "top_operation_family" "text", "top_model" "text")
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
    from public.cost_fact_events_enriched c, day_range d, admin_guard
    where c.created_at >= d.s
      and c.created_at < d.e
      and public.admin_cost_run_type_matches(c.run_type, p_run_type)
      and (coalesce(p_provider, '') = '' or lower(coalesce(c.provider, '')) = lower(p_provider))
      and (coalesce(p_model, '') = '' or lower(coalesce(c.model, '')) = lower(p_model))
      and (coalesce(p_family, '') = '' or public.normalize_cost_operation_family(c.operation_family, c.source) = lower(p_family))
      and (coalesce(p_operation, '') = '' or public.normalize_cost_operation_name(c.operation_name, c.source) = lower(p_operation))
  ),
  top_family as (
    select operation_family
    from facts
    group by 1
    order by sum(cost_usd + cost_eur * p_whatsapp_eur_to_usd) desc
    limit 1
  ),
  top_model as (
    select model
    from facts
    group by 1
    order by sum(cost_usd + cost_eur * p_whatsapp_eur_to_usd) desc
    limit 1
  )
  select
    p_target_day as target_day,
    coalesce(sum(f.cost_usd), 0)::numeric as ai_cost_usd,
    coalesce(sum(f.cost_eur), 0)::numeric as whatsapp_cost_eur,
    coalesce(sum(f.cost_usd + f.cost_eur * p_whatsapp_eur_to_usd), 0)::numeric as total_cost_usd,
    count(*)::bigint as total_calls,
    coalesce(sum(f.total_tokens), 0)::bigint as total_tokens,
    count(distinct f.user_id)::bigint as unique_users,
    count(*) filter (where coalesce(f.cost_unpriced, false) = true)::bigint as unpriced_event_count,
    (select operation_family from top_family) as top_operation_family,
    (select model from top_model) as top_model
  from facts f;
$$;


ALTER FUNCTION "public"."get_admin_daily_cost_synthesis"("p_target_day" "date", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text", "p_run_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_user_daily_costs"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_whatsapp_eur_to_usd" numeric DEFAULT 1.08, "p_run_type" "text" DEFAULT 'all'::"text", "p_provider" "text" DEFAULT NULL::"text", "p_model" "text" DEFAULT NULL::"text", "p_family" "text" DEFAULT NULL::"text", "p_operation" "text" DEFAULT NULL::"text") RETURNS TABLE("day" "date", "user_id" "uuid", "full_name" "text", "email" "text", "ai_cost_usd" numeric, "whatsapp_cost_eur" numeric, "whatsapp_cost_usd" numeric, "total_cost_usd" numeric, "prompt_tokens" bigint, "output_tokens" bigint, "total_tokens" bigint, "total_calls" bigint, "unpriced_events" bigint, "top_operation_family" "text", "top_model" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with admin_guard as (
    select 1 as ok
    where exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid())
  ),
  base as (
    select c.*
    from public.cost_fact_events_enriched c, admin_guard
    where c.created_at >= p_start
      and c.created_at < p_end
      and c.user_id is not null
      and public.admin_cost_run_type_matches(c.run_type, p_run_type)
      and (coalesce(p_provider, '') = '' or lower(coalesce(c.provider, '')) = lower(p_provider))
      and (coalesce(p_model, '') = '' or lower(coalesce(c.model, '')) = lower(p_model))
      and (coalesce(p_family, '') = '' or public.normalize_cost_operation_family(c.operation_family, c.source) = lower(p_family))
      and (coalesce(p_operation, '') = '' or public.normalize_cost_operation_name(c.operation_name, c.source) = lower(p_operation))
  ),
  grouped as (
    select
      (date_trunc('day', b.created_at))::date as day,
      b.user_id,
      coalesce(p.full_name, 'Unknown') as full_name,
      coalesce(p.email, '') as email,
      coalesce(sum(b.cost_usd), 0)::numeric as ai_cost_usd,
      coalesce(sum(b.cost_eur), 0)::numeric as whatsapp_cost_eur,
      coalesce(sum(b.cost_eur) * p_whatsapp_eur_to_usd, 0)::numeric as whatsapp_cost_usd,
      coalesce(sum(b.cost_usd + b.cost_eur * p_whatsapp_eur_to_usd), 0)::numeric as total_cost_usd,
      coalesce(sum(b.prompt_tokens), 0)::bigint as prompt_tokens,
      coalesce(sum(b.output_tokens), 0)::bigint as output_tokens,
      coalesce(sum(b.total_tokens), 0)::bigint as total_tokens,
      count(*)::bigint as total_calls,
      count(*) filter (where coalesce(b.cost_unpriced, false) = true)::bigint as unpriced_events
    from base b
    left join public.profiles p on p.id = b.user_id
    group by 1, 2, 3, 4
  ),
  ranked_family as (
    select
      (date_trunc('day', b.created_at))::date as day,
      b.user_id,
      public.normalize_cost_operation_family(b.operation_family, b.source) as operation_family,
      row_number() over (
        partition by (date_trunc('day', b.created_at))::date, b.user_id
        order by sum(b.cost_usd + b.cost_eur * p_whatsapp_eur_to_usd) desc, count(*) desc
      ) as rn
    from base b
    group by 1, 2, 3
  ),
  ranked_model as (
    select
      (date_trunc('day', b.created_at))::date as day,
      b.user_id,
      b.model,
      row_number() over (
        partition by (date_trunc('day', b.created_at))::date, b.user_id
        order by sum(b.cost_usd + b.cost_eur * p_whatsapp_eur_to_usd) desc, count(*) desc
      ) as rn
    from base b
    group by 1, 2, 3
  )
  select
    g.day,
    g.user_id,
    g.full_name,
    g.email,
    g.ai_cost_usd,
    g.whatsapp_cost_eur,
    g.whatsapp_cost_usd,
    g.total_cost_usd,
    g.prompt_tokens,
    g.output_tokens,
    g.total_tokens,
    g.total_calls,
    g.unpriced_events,
    rf.operation_family as top_operation_family,
    rm.model as top_model
  from grouped g
  left join ranked_family rf on rf.day = g.day and rf.user_id = g.user_id and rf.rn = 1
  left join ranked_model rm on rm.day = g.day and rm.user_id = g.user_id and rm.rn = 1
  order by g.day desc, g.total_cost_usd desc;
$$;


ALTER FUNCTION "public"."get_admin_user_daily_costs"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_whatsapp_eur_to_usd" numeric, "p_run_type" "text", "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."get_admin_user_operation_breakdown"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_user_id" "uuid", "p_whatsapp_eur_to_usd" numeric DEFAULT 1.08, "p_provider" "text" DEFAULT NULL::"text", "p_model" "text" DEFAULT NULL::"text", "p_family" "text" DEFAULT NULL::"text", "p_operation" "text" DEFAULT NULL::"text", "p_run_type" "text" DEFAULT 'all'::"text") RETURNS TABLE("operation_family" "text", "operation_name" "text", "source" "text", "provider" "text", "model" "text", "cost_domain" "text", "ai_cost_usd" numeric, "whatsapp_cost_eur" numeric, "total_cost_usd" numeric, "total_calls" bigint, "total_tokens" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with admin_guard as (
    select 1 as ok
    where exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid())
  ),
  base as (
    select *
    from public.cost_fact_events_enriched c, admin_guard
    where c.created_at >= p_start
      and c.created_at < p_end
      and c.user_id = p_user_id
      and public.admin_cost_run_type_matches(c.run_type, p_run_type)
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
    coalesce(sum(b.cost_usd), 0)::numeric as ai_cost_usd,
    coalesce(sum(b.cost_eur), 0)::numeric as whatsapp_cost_eur,
    coalesce(sum(b.cost_usd + b.cost_eur * p_whatsapp_eur_to_usd), 0)::numeric as total_cost_usd,
    count(*)::bigint as total_calls,
    coalesce(sum(b.total_tokens), 0)::bigint as total_tokens
  from base b
  group by 1,2,3,4,5,6
  order by total_cost_usd desc, total_calls desc;
$$;


ALTER FUNCTION "public"."get_admin_user_operation_breakdown"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_user_id" "uuid", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text", "p_run_type" "text") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."get_or_create_referral_code"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user uuid := auth.uid();
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_code text;
  v_suffix text;
  v_attempt int;
  i int;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select rc.code into v_code from public.referral_codes rc where rc.user_id = v_user;
  if v_code is not null then
    return v_code;
  end if;

  for v_attempt in 1..20 loop
    v_suffix := '';
    for i in 1..4 loop
      v_suffix := v_suffix ||
        substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    v_code := 'SOPHIA-' || v_suffix;
    begin
      insert into public.referral_codes (user_id, code) values (v_user, v_code);
      return v_code;
    exception when unique_violation then
      -- Either the code collided (retry) or a concurrent call created this
      -- user's code (reuse it).
      select rc.code into v_code from public.referral_codes rc where rc.user_id = v_user;
      if v_code is not null then
        return v_code;
      end if;
    end;
  end loop;

  raise exception 'Could not generate a unique referral code';
end;
$$;


ALTER FUNCTION "public"."get_or_create_referral_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_production_log"("p_since" timestamp with time zone DEFAULT ("now"() - '24:00:00'::interval), "p_limit" integer DEFAULT 200, "p_only_errors" boolean DEFAULT false, "p_source" "text" DEFAULT NULL::"text") RETURNS TABLE("ts" timestamp with time zone, "severity" "text", "source" "text", "event_type" "text", "title" "text", "user_id" "uuid", "details" "jsonb")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  select *
  from public.get_production_log(p_since, p_limit, p_only_errors, p_source, false, null, false);
end;
$$;


ALTER FUNCTION "public"."get_production_log"("p_since" timestamp with time zone, "p_limit" integer, "p_only_errors" boolean, "p_source" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_production_log"("p_since" timestamp with time zone DEFAULT ("now"() - '24:00:00'::interval), "p_limit" integer DEFAULT 200, "p_only_errors" boolean DEFAULT false, "p_source" "text" DEFAULT NULL::"text", "p_include_chat" boolean DEFAULT false) RETURNS TABLE("ts" timestamp with time zone, "severity" "text", "source" "text", "event_type" "text", "title" "text", "user_id" "uuid", "details" "jsonb")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  select *
  from public.get_production_log(p_since, p_limit, p_only_errors, p_source, p_include_chat, null, false);
end;
$$;


ALTER FUNCTION "public"."get_production_log"("p_since" timestamp with time zone, "p_limit" integer, "p_only_errors" boolean, "p_source" "text", "p_include_chat" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_production_log"("p_since" timestamp with time zone DEFAULT ("now"() - '24:00:00'::interval), "p_limit" integer DEFAULT 200, "p_only_errors" boolean DEFAULT false, "p_source" "text" DEFAULT NULL::"text", "p_include_chat" boolean DEFAULT false, "p_query" "text" DEFAULT NULL::"text", "p_include_runtime" boolean DEFAULT false) RETURNS TABLE("ts" timestamp with time zone, "severity" "text", "source" "text", "event_type" "text", "title" "text", "user_id" "uuid", "details" "jsonb")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  q text := nullif(trim(coalesce(p_query, '')), '');
begin
  if not exists (select 1 from public.internal_admins ia where ia.user_id = auth.uid()) then
    raise exception 'forbidden';
  end if;

  return query
  with events as (
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
        case when cm.agent_used is not null then ' · ' || cm.agent_used::text else '' end as title,
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
    select
      coalesce(sc.processed_at, sc.created_at) as ts,
      case
        when sc.status::text = 'failed' then 'error'
        when sc.status::text in ('cancelled','expired','awaiting_user','retrying') then 'warn'
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
    from public.pending_actions wpa
    where wpa.created_at >= p_since
    union all
    select
      coalesce(wom.last_attempt_at, wom.updated_at, wom.created_at) as ts,
      case
        when wom.status = 'failed' then 'error'
        when wom.status in ('queued','cancelled','skipped') then 'warn'
        else 'info'
      end as severity,
      'whatsapp' as source,
      'whatsapp_outbound_message' as event_type,
      'WhatsApp outbound · ' || wom.message_type || ' · ' || wom.status as title,
      wom.user_id,
      jsonb_build_object(
        'id', wom.id,
        'request_id', wom.request_id,
        'provider_message_id', wom.provider_message_id,
        'to_e164', wom.to_e164,
        'reply_to_wamid_in', wom.reply_to_wamid_in,
        'message_type', wom.message_type,
        'content_preview', wom.content_preview,
        'status', wom.status,
        'attempt_count', wom.attempt_count,
        'max_attempts', wom.max_attempts,
        'next_retry_at', wom.next_retry_at,
        'locked_by', wom.locked_by,
        'last_error_code', wom.last_error_code,
        'last_error_message', wom.last_error_message,
        'last_error', wom.last_error,
        'metadata', wom.metadata
      ) as details
    from public.outbound_messages wom
    where coalesce(wom.last_attempt_at, wom.updated_at, wom.created_at) >= p_since
    union all
    select
      wce.created_at as ts,
      case
        when wce.billable and wce.final_cost_eur > 0 then 'info'
        else 'warn'
      end as severity,
      'whatsapp' as source,
      'whatsapp_cost_event' as event_type,
      'WhatsApp cost · ' || coalesce(wce.template_name, wce.purpose, 'message') as title,
      wce.user_id,
      jsonb_build_object(
        'id', wce.id,
        'event_date', wce.event_date,
        'outbound_message_id', wce.outbound_message_id,
        'provider_message_id', wce.provider_message_id,
        'purpose', wce.purpose,
        'template_name', wce.template_name,
        'template_language', wce.template_language,
        'unit_cost_eur', wce.unit_cost_eur,
        'final_cost_eur', wce.final_cost_eur,
        'currency', wce.currency,
        'billable', wce.billable,
        'billing_status', wce.billing_status,
        'billed_at', wce.billed_at,
        'metadata', wce.metadata
      ) as details
    from public.whatsapp_cost_events wce
    where wce.created_at >= p_since
    union all
    select
      ue.created_at as ts,
      case
        when coalesce(ue.status, 'success') not in ('success','ok','completed') then 'error'
        when (ue.metadata ? 'error') or (ue.metadata ? 'exception') or (ue.metadata ? 'failed') then 'error'
        else 'info'
      end as severity,
      'llm' as source,
      'llm_usage' as event_type,
      'LLM ' || ue.kind || ' · ' || ue.model as title,
      ue.user_id,
      jsonb_build_object(
        'provider', ue.provider,
        'model', ue.model,
        'kind', ue.kind,
        'status', ue.status,
        'prompt_tokens', ue.prompt_tokens,
        'output_tokens', ue.output_tokens,
        'total_tokens', ue.total_tokens,
        'cost_usd', ue.cost_usd,
        'request_id', ue.request_id,
        'source', ue.source,
        'operation_family', ue.operation_family,
        'operation_name', ue.operation_name,
        'channel', ue.channel,
        'latency_ms', ue.latency_ms,
        'provider_request_id', ue.provider_request_id,
        'cost_unpriced', ue.cost_unpriced,
        'metadata', ue.metadata
      ) as details
    from public.llm_usage_events ue
    where ue.created_at >= p_since
    union all
    select
      lrj.updated_at as ts,
      case
        when lrj.status = 'failed' then 'error'
        when lrj.status in ('pending','processing') then 'warn'
        else 'info'
      end as severity,
      'llm' as source,
      'llm_retry_job' as event_type,
      'LLM retry · ' || lrj.status || ' · attempt ' || lrj.attempt_count::text || '/' || lrj.max_attempts::text as title,
      lrj.user_id,
      jsonb_build_object(
        'id', lrj.id,
        'scope', lrj.scope,
        'channel', lrj.channel,
        'message_preview', left(lrj.message, 180),
        'message_hash', lrj.message_hash,
        'status', lrj.status,
        'attempt_count', lrj.attempt_count,
        'max_attempts', lrj.max_attempts,
        'next_attempt_at', lrj.next_attempt_at,
        'last_attempt_at', lrj.last_attempt_at,
        'completed_at', lrj.completed_at,
        'locked_by', lrj.locked_by,
        'last_error', lrj.last_error,
        'metadata', lrj.metadata
      ) as details
    from public.llm_retry_jobs lrj
    where lrj.updated_at >= p_since
    union all
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
    select
      sel.created_at as ts,
      sel.severity as severity,
      coalesce(nullif(sel.source, ''), 'edge') as source,
      case when sel.severity = 'error' then 'edge_function_error' else 'edge_function_log' end as event_type,
      coalesce(nullif(sel.title, ''), 'Edge event') || ' · ' || sel.function_name as title,
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
    union all
    select
      cae.created_at as ts,
      cae.level as severity,
      'runtime' as source,
      'runtime_' || cae.stream || '_event' as event_type,
      'Runtime · ' || cae.stream || ' · ' || cae.event as title,
      cae.user_id,
      jsonb_build_object(
        'event_id', cae.event_id,
        'request_id', cae.request_id,
        'turn_id', cae.turn_id,
        'channel', cae.channel,
        'scope', cae.scope,
        'stream', cae.stream,
        'source', cae.source,
        'level', cae.level,
        'event', cae.event,
        'phase', cae.phase,
        'payload', cae.payload
      ) as details
    from public.conversation_runtime_audit_events cae
    where p_include_runtime and cae.created_at >= p_since
    union all
    select
      tsl.created_at as ts,
      case when tsl.aborted then 'warn' else 'info' end as severity,
      'runtime' as source,
      'turn_summary' as event_type,
      'Turn summary · ' || tsl.channel || ' · ' || coalesce(tsl.dispatcher_intent, 'unknown') as title,
      tsl.user_id,
      jsonb_build_object(
        'id', tsl.id,
        'request_id', tsl.request_id,
        'channel', tsl.channel,
        'scope', tsl.scope,
        'latency_total_ms', tsl.latency_total_ms,
        'latency_dispatcher_ms', tsl.latency_dispatcher_ms,
        'latency_context_ms', tsl.latency_context_ms,
        'latency_agent_ms', tsl.latency_agent_ms,
        'dispatcher_model', tsl.dispatcher_model,
        'dispatcher_safety', tsl.dispatcher_safety,
        'dispatcher_intent', tsl.dispatcher_intent,
        'dispatcher_intent_conf', tsl.dispatcher_intent_conf,
        'dispatcher_interrupt', tsl.dispatcher_interrupt,
        'dispatcher_topic_depth', tsl.dispatcher_topic_depth,
        'dispatcher_flow_resolution', tsl.dispatcher_flow_resolution,
        'target_dispatcher', tsl.target_dispatcher,
        'target_initial', tsl.target_initial,
        'target_final', tsl.target_final,
        'risk_score', tsl.risk_score,
        'agent_model', tsl.agent_model,
        'agent_outcome', tsl.agent_outcome,
        'agent_tool', tsl.agent_tool,
        'checkup_active', tsl.checkup_active,
        'toolflow_active', tsl.toolflow_active,
        'supervisor_stack_top', tsl.supervisor_stack_top,
        'aborted', tsl.aborted,
        'abort_reason', tsl.abort_reason,
        'payload', tsl.payload
      ) as details
    from public.turn_summary_logs tsl
    where p_include_runtime and tsl.created_at >= p_since
  )
  select e.ts, e.severity, e.source, e.event_type, e.title, e.user_id, e.details
  from events e
  where
    (not p_only_errors or e.severity = 'error')
    and (p_source is null or e.source = p_source)
    and (p_include_chat or e.event_type <> 'chat_message')
    and (
      q is null
      or e.title ilike ('%' || q || '%')
      or e.event_type ilike ('%' || q || '%')
      or e.source ilike ('%' || q || '%')
      or coalesce(e.user_id::text, '') ilike ('%' || q || '%')
      or coalesce(e.details ->> 'request_id', '') ilike ('%' || q || '%')
      or e.details::text ilike ('%' || q || '%')
    )
  order by e.ts desc
  limit greatest(1, least(p_limit, 1000));
end;
$$;


ALTER FUNCTION "public"."get_production_log"("p_since" timestamp with time zone, "p_limit" integer, "p_only_errors" boolean, "p_source" "text", "p_include_chat" boolean, "p_query" "text", "p_include_runtime" boolean) OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."guard_profiles_privileged_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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
       -- RENOMMÉE par 20260804152000. C'est la ligne qui rendait tout
       -- `update` d'un utilisateur final impossible.
       or new.pre_deletion_proactive_muted is distinct from old.pre_deletion_proactive_muted then
      raise exception
        'profiles deletion state is managed by the account-deletion functions and cannot be modified directly'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."guard_profiles_privileged_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_unlocked_principles_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  -- Cascade legitime: l'ecriture passe par unlock_transformation_principle
  -- (seule fonction a poser ce marqueur, elle-meme whitelistee et ownership-
  -- checked). Tout autre chemin reste bloque.
  if coalesce(current_setting('sophia.allow_principle_unlock', true), '') = '1' then
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
  v_timezone text;
  v_locale text;
  v_tz_follow_device boolean;
  v_coach_invite_token text;
  v_signup_intent text;
  v_country text;
  v_house_coach_id uuid;
begin
  v_phone := nullif(coalesce(new.raw_user_meta_data->>'phone', new.phone, ''), '');
  v_timezone := nullif(coalesce(new.raw_user_meta_data->>'timezone', ''), '');
  v_locale := coalesce(nullif(coalesce(new.raw_user_meta_data->>'locale', ''), ''), 'fr-FR');
  v_tz_follow_device := lower(coalesce(new.raw_user_meta_data->>'tz_follow_device', '')) in
    ('t', 'true', '1', 'yes', 'y', 'on');

  -- ── LA GARDE ANTI-COLLISION, AMPUTÉE DE SA MOITIÉ MORTE ─────────────────
  --
  -- Elle refusait une inscription si le numéro appartenait à un compte avec
  -- `phone_verified_at` non nul OU `whatsapp_opted_in = true`. Depuis le pivot
  -- de-whatsapp, plus AUCUN chemin ne passe `whatsapp_opted_in` à true: la
  -- colonne est gelée à false, donc ce second terme ne pouvait plus jamais être
  -- vrai. Une condition qui ne peut pas mordre se lit comme une protection et
  -- n'en est pas une.
  --
  -- Le premier terme RESTE ARMÉ, et ce n'est pas de la prudence de façade: des
  -- lignes legacy portent de vrais `phone_verified_at`, et cette garde est la
  -- défense en profondeur derrière un formulaire contourné. Le formulaire, lui,
  -- ne demande plus de numéro sur aucun chemin (Auth.tsx, 2026-08-05) — donc
  -- `v_phone` est NULL en pratique et ce bloc ne s'exécute plus. Il est gardé
  -- pour les imports et pour tout appelant qui poserait un numéro demain.
  if v_phone is not null then
    select p.id into v_existing_profile_id
    from public.profiles p
    where p.phone_number = v_phone
      and p.id <> new.id
      and p.phone_verified_at is not null
    limit 1;

    if v_existing_profile_id is not null then
      raise exception 'Ce numéro de téléphone est déjà utilisé par un autre compte.'
        using errcode = 'unique_violation';
    end if;
  end if;

  insert into public.profiles (
    id, full_name, avatar_url, phone_number, email, timezone, locale, tz_follow_device
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', ''),
    v_phone,
    new.email,
    v_timezone,
    v_locale,
    v_tz_follow_device
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    avatar_url = excluded.avatar_url,
    phone_number = excluded.phone_number,
    email = excluded.email,
    timezone = coalesce(public.profiles.timezone, excluded.timezone),
    locale = coalesce(public.profiles.locale, excluded.locale),
    updated_at = now();

  -- PIVOT: le bloc `referral_code` a été supprimé avec le programme de
  -- parrainage. Un `referral_code` encore présent dans les metadata est ignoré
  -- en silence, ce qui est le comportement voulu.

  -- KEEL W6.5 — invitation coach portée par les metadata du signup.
  -- Best-effort, jamais fatal: une invitation cassée ne doit jamais casser une
  -- inscription. Le compte existe dans tous les cas, et l'élève peut encore
  -- accepter depuis /join.
  v_coach_invite_token := nullif(trim(coalesce(new.raw_user_meta_data->>'coach_invite_token', '')), '');
  if v_coach_invite_token is not null then
    begin
      perform public.accept_coach_invitation_for_user(new.id, v_coach_invite_token);
    exception when others then
      raise warning 'coach invitation acceptance failed for user %: %', new.id, sqlerrm;
    end;
  end if;

  -- ── L'INSCRIPTION LIBRE ─────────────────────────────────────────────────
  --
  -- Même forme et même garantie que le bloc d'invitation au-dessus, et pour la
  -- même raison: le rattachement se fait DANS la transaction du signup, donc il
  -- est déjà fait quand l'élève ouvre son mail de confirmation — c'est la
  -- remarque de JoinPage.tsx, le trigger part à l'INSERT de l'utilisateur auth,
  -- pas à l'ouverture de la boîte.
  --
  -- Et il est best-effort, donc RÉPARABLE et pas silencieux: le client rejoue
  -- `keel_join_house_coach()` à la première session authentifiée, qui est
  -- idempotente. C'est l'arbitrage inverse d'un `raise`: un échec de
  -- rattachement coûte une réparation, un `raise` coûterait le compte.
  --
  -- `v_country` vient des metadata et n'est PAS deviné. S'il manque, le moteur
  -- lève et le rattachement échoue: mieux vaut un compte à réparer qu'un élève
  -- dont la hotline de crise est déduite de sa langue.
  v_signup_intent := nullif(trim(coalesce(new.raw_user_meta_data->>'keel_signup_intent', '')), '');
  if v_signup_intent = 'student_free' and v_coach_invite_token is null then
    begin
      v_country := nullif(trim(coalesce(new.raw_user_meta_data->>'country', '')), '');
      if v_country is null then
        -- Même refus que `keel_join_house_coach`, et pour la même raison: pas de
        -- pays déclaré, pas de rattachement. Le compte est créé, la réparation
        -- passe par la porte libre qui redemandera le pays.
        raise exception 'free signup without a declared country';
      end if;
      select c.id into v_house_coach_id
        from public.coaches c
       where c.coach_kind = 'house' and c.status = 'active';
      if v_house_coach_id is null then
        raise exception 'no active house coach';
      end if;
      perform public.keel_attach_student_to_coach(
        new.id, v_house_coach_id, new.email, v_country
      );
    exception when others then
      raise warning 'free signup attachment failed for user %: %', new.id, sqlerrm;
    end;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_scheduling_access_tier_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  was_eligible boolean := false;
  is_eligible boolean := false;
  should_queue_access_ended boolean := false;
begin
  was_eligible := public.scheduling_access_eligible(old.access_tier);
  is_eligible := public.scheduling_access_eligible(new.access_tier);
  should_queue_access_ended :=
    lower(coalesce(new.access_tier, '')) = 'none'
    and lower(coalesce(old.access_tier, '')) in ('trial', 'system', 'alliance', 'architecte');

  if should_queue_access_ended then
    perform public.queue_access_ended_notification(new.id, old.access_tier, new.access_tier);
  end if;

  if was_eligible = is_eligible then
    return new;
  end if;

  if not is_eligible then
    perform public.cleanup_scheduling_for_user(new.id);
    return new;
  end if;

  -- 🔴 LE MÊME DÉFAUT QUE LES TROIS CRONS PROACTIFS, TROUVÉ ICI AU BALAYAGE.
  --
  -- La condition était `coalesce(new.whatsapp_opted_in, false)`. Cette colonne
  -- vaut `false` par défaut et plus personne ne la met à `true` depuis la
  -- suppression de `whatsapp-optin`: un élève qui REDEVIENT éligible (reprise
  -- d'abonnement, fin de pause) ne voyait donc JAMAIS ses rappels reprogrammés.
  -- Il repayait, et le silence continuait.
  --
  -- Le mute produit est `proactive_muted_at`, et son absence veut dire
  -- « il accepte les relances ».
  if new.proactive_muted_at is null then
    perform public.request_morning_active_action_checkins_refresh(new.id);
    perform public.request_recurring_reminder_checkins_refresh(new.id, true);
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_scheduling_access_tier_change"() OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."invoke_internal_edge_function"("p_function_name" "text", "p_body" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  base_url text;
  anon_key text;
  internal_secret text;
begin
  if coalesce(p_function_name, '') = '' then
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
    raise notice '[invoke_internal_edge_function] missing edge config; skipped %', p_function_name;
    return;
  end if;

  perform net.http_post(
    url := rtrim(base_url, '/') || '/functions/v1/' || p_function_name,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'apikey', anon_key,
      'authorization', 'Bearer ' || anon_key,
      'x-internal-secret', internal_secret
    ),
    body := p_body
  );
exception
  when others then
    raise notice '[invoke_internal_edge_function] failed for %: %', p_function_name, sqlerrm;
end;
$$;


ALTER FUNCTION "public"."invoke_internal_edge_function"("p_function_name" "text", "p_body" "jsonb") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."keel_active_student_threshold"() RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$ select 3 $$;


ALTER FUNCTION "public"."keel_active_student_threshold"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."keel_anonymise_purged_student"("p_user_id" "uuid", "p_full_name" "text" DEFAULT NULL::"text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  v_rows integer;
  v_name text := nullif(btrim(coalesce(p_full_name, '')), '');
  v_left bigint;
begin
  if p_user_id is null then
    raise exception 'keel_anonymise_purged_student: p_user_id is null'
      using errcode = '22004';
  end if;

  -- (a) L'uuid dans `flagged_students`. On reconstruit le tableau élément par
  -- élément : l'entrée de l'élève garde sa raison et ses chiffres (le rapport
  -- reste vrai), et perd son identité.
  update public.coach_syntheses s
     set flagged_students = (
       select coalesce(jsonb_agg(
         case
           when elem ->> 'student_user_id' = p_user_id::text
             then (elem - 'student_user_id')
                  || jsonb_build_object('student_user_id', null,
                                        'student_purged', true)
           else elem
         end
       ), '[]'::jsonb)
       from jsonb_array_elements(s.flagged_students) as elem
     )
   where s.flagged_students @> jsonb_build_array(
           jsonb_build_object('student_user_id', p_user_id::text));
  get diagnostics v_rows = row_count;

  -- (b) Le NOM dans la prose. Borné aux lignes qui ont signalé CET élève —
  -- un remplacement global sur toute la table irait réécrire la synthèse d'un
  -- homonyme encore actif chez un autre coach.
  --
  -- `\m…\M` = frontières de mot : sans elles, purger « Ana » mutilerait
  -- « Anaïs » dans la même phrase. `regexp_replace` reçoit le nom échappé par
  -- `quote_regex`-like (les métacaractères d'un nom propre sont rares mais un
  -- « J. R. » suffirait à casser la regex).
  if v_name is not null then
    update public.coach_syntheses s
       set narrative = regexp_replace(
             s.narrative,
             '\m' || regexp_replace(v_name, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '\M',
             'A deleted account',
             'g')
     where s.narrative is not null
       and s.flagged_students @> jsonb_build_array(
             jsonb_build_object('student_purged', true))
       and s.narrative like '%' || v_name || '%';
  end if;

  -- (c) Relecture. Si une trace subsiste, la purge doit ÉCHOUER et réessayer
  -- au prochain passage plutôt que rapporter un succès.
  select count(*) into v_left
  from public.coach_syntheses s
  where s.flagged_students::text like '%' || p_user_id::text || '%'
     or (v_name is not null and s.narrative like '%' || v_name || '%'
         and s.flagged_students @> jsonb_build_array(
               jsonb_build_object('student_purged', true)));
  if v_left > 0 then
    raise exception 'keel_anonymise_purged_student: % ligne(s) portent encore l''eleve %',
      v_left, p_user_id using errcode = 'P0001';
  end if;

  return v_rows;
end;
$_$;


ALTER FUNCTION "public"."keel_anonymise_purged_student"("p_user_id" "uuid", "p_full_name" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."keel_anonymise_purged_student"("p_user_id" "uuid", "p_full_name" "text") IS 'RGPD J+7: la synthese agregee du coach SURVIT, l''identite de l''eleve purge en disparait (uuid + nom rendu). Fail-loud si une trace subsiste.';



CREATE OR REPLACE FUNCTION "public"."keel_apply_scheduled_client_ends"("p_limit" integer DEFAULT 5000) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_count integer;
begin
  with due as (
    select cc.id
    from public.coach_clients cc
    where cc.scheduled_end_at is not null
      and cc.scheduled_end_at <= now()
      and cc.status = 'active'
    order by cc.scheduled_end_at
    limit greatest(1, coalesce(p_limit, 5000))
    for update skip locked
  )
  update public.coach_clients cc
     set status = 'paused',
         scheduled_end_at = null,
         updated_at = now()
    from due
   where cc.id = due.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


ALTER FUNCTION "public"."keel_apply_scheduled_client_ends"("p_limit" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."keel_apply_scheduled_client_ends"("p_limit" integer) IS 'Bascule en ''paused'' les sièges dont la désactivation programmée est échue. Rejouable: efface scheduled_end_at en même temps. Le trigger on_coach_clients_change_recompute_access ferme l''accès de l''élève.';



CREATE OR REPLACE FUNCTION "public"."keel_attach_student_to_coach"("p_user_id" "uuid", "p_coach_id" "uuid", "p_invited_email" "text" DEFAULT NULL::"text", "p_country" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  v_link_id uuid;
  v_link_coach uuid;
  v_target_kind text;
  v_incumbent_kind text;
  v_country text;
begin
  if p_user_id is null or p_coach_id is null then
    raise exception 'keel_attach_student_to_coach: missing user or coach'
      using errcode = '22023';
  end if;

  select c.coach_kind into v_target_kind
    from public.coaches c where c.id = p_coach_id;
  if v_target_kind is null then
    raise exception 'keel_attach_student_to_coach: unknown coach %', p_coach_id
      using errcode = '22023';
  end if;

  -- LE PAYS, VALIDÉ ICI ET PAS TROIS COUCHES PLUS LOIN (R7).
  --
  -- Une valeur non vide et malformée RAISE. Elle ne peut venir que d'un client
  -- contourné — nos deux formulaires n'offrent qu'un sélecteur fermé — et
  -- écrire NULL en silence à sa place, c'est reconstituer exactement l'état
  -- (`country IS NULL`) dont le résolveur de crise déduit un pays depuis la
  -- langue. NULL est acceptable quand rien n'est déclaré; NULL en RÉPARATION
  -- d'une saisie invalide est un mensonge sur ce qu'on sait de la personne.
  v_country := nullif(btrim(coalesce(p_country, '')), '');
  if v_country is not null then
    v_country := upper(v_country);
    if v_country !~ '^[A-Z]{2}$' then
      raise exception 'keel_attach_student_to_coach: malformed country %', p_country
        using errcode = '22023';
    end if;
  end if;

  -- Le lien VIVANT de cet élève, verrouillé: deux onglets qui rejoignent en
  -- même temps se sérialisent ici au lieu de courir sur l'index unique.
  select cc.id, cc.coach_id into v_link_id, v_link_coach
    from public.coach_clients cc
   where cc.student_user_id = p_user_id
     and cc.status in ('invited', 'active')
   limit 1
     for update;

  if v_link_id is not null and v_link_coach <> p_coach_id then
    select c.coach_kind into v_incumbent_kind
      from public.coaches c where c.id = v_link_coach;

    -- ── LE PASSAGE DU COACH MAISON À UN VRAI COACH ──────────────────────
    --
    -- Un testeur ou un curieux finira par être invité par un vrai coach. Sans
    -- ce bloc, il reçoit `already_coached` et se voit dire qu'il « suit déjà le
    -- programme d'un autre coach » — c'est-à-dire nous, avec un programme de
    -- découverte, ce qui est incompréhensible pour lui et bloquant pour le
    -- coach qui l'a invité.
    --
    -- Le lien maison est CLOS, jamais laissé vivant à côté. `.limit(1)` sur les
    -- liens actifs dans `generate-week-plan-v1:123` et dans
    -- `loadPublishedDoctrine` rendrait sinon le choix du coach ARBITRAIRE et
    -- SILENCIEUX: l'élève pourrait recevoir la semaine de son vrai coach et la
    -- doctrine de la maison, ou l'inverse, d'un appel à l'autre.
    --
    -- CONDITION DE DÉSARMEMENT: uniquement maison → humain. Deux coachs humains
    -- restent un refus (`already_coached`): un élève ne change pas de vrai coach
    -- par une invitation, il passe par `revoke_coach_access()`. Et l'inverse —
    -- la maison qui déplacerait un vrai coach — n'est pas atteignable ici, car
    -- la porte libre n'appelle ce moteur que sur un élève sans lien vivant.
    if v_incumbent_kind = 'house' and v_target_kind = 'human' then
      update public.coach_clients
         set status = 'ended',
             ended_at = now(),
             updated_at = now()
       where id = v_link_id;

      -- LE PROTOCOLE DE DÉCOUVERTE SORT AVEC LE LIEN.
      --
      -- Le laisser publié donnerait au nouveau coach la vue d'un protocole
      -- signé d'un coach que l'élève n'a plus (`plan_versions_select_coach` ne
      -- filtre que sur l'appartenance), et ferait classer les photos de l'élève
      -- contre un programme périmé. Superseded et pas supprimé: c'est de
      -- l'historique, et il appartient à l'élève.
      update public.plan_versions
         set status = 'superseded',
             updated_at = now()
       where student_id = p_user_id
         and coach_id = v_link_coach
         and status = 'published';

      v_link_id := null;
    else
      return 'already_coached';
    end if;
  end if;

  begin
    if v_link_id is not null then
      -- Même coach, déjà vivant: ré-acceptation idempotente.
      update public.coach_clients
         set status = 'active',
             consent_granted_at = coalesce(consent_granted_at, now()),
             started_at = coalesce(started_at, now()),
             ended_at = null,
             updated_at = now()
       where id = v_link_id;
    else
      -- Un lien en pause ou terminé avec CE coach est repris plutôt que
      -- dupliqué: l'audit et l'historique de facturation de la période
      -- précédente restent attachés à une seule ligne.
      select cc.id into v_link_id
        from public.coach_clients cc
       where cc.student_user_id = p_user_id
         and cc.coach_id = p_coach_id
         and cc.status in ('paused', 'ended')
       order by cc.updated_at desc
       limit 1
         for update;

      if v_link_id is not null then
        update public.coach_clients
           set status = 'active',
               consent_granted_at = now(),
               -- `started_at` NE BOUGE PAS sur une reprise: c'est le plancher
               -- d'historique que le coach est en droit de lire (voir la
               -- migration 20260805092000). Le remettre à now() effacerait des
               -- semaines qu'il a bel et bien encadrées.
               started_at = coalesce(started_at, now()),
               ended_at = null,
               updated_at = now()
         where id = v_link_id;
      else
        insert into public.coach_clients
          (coach_id, student_user_id, invited_email, status,
           consent_granted_at, started_at, seat_state)
        values
          (p_coach_id, p_user_id, lower(nullif(btrim(coalesce(p_invited_email, '')), '')),
           'active', now(), now(),
           -- Un siège maison est marqué 'free' dès l'écriture. Ce n'est PAS ce
           -- qui l'exclut de la facturation — `keel_coach_seat_ledger` le fait
           -- sur `coach_kind`, donc sans dépendre de cette colonne — mais un
           -- siège gratuit qui s'affiche 'trial' sur un écran est une ligne qui
           -- se lit comme un essai qui va expirer.
           case when v_target_kind = 'house' then 'free' else 'trial' end)
        returning id into v_link_id;
      end if;
    end if;
  exception when unique_violation then
    -- `one_live_coach_per_student` a mordu: un autre coach a gagné la course
    -- entre notre SELECT et cette écriture. Même réponse que le test explicite.
    return 'already_coached';
  end;

  -- Le garde de route de l'app élève lit `profiles.keel_role`. Devenir élève
  -- d'un coach est ce qui fait de quelqu'un un élève, donc le rôle est posé
  -- ici — mais seulement s'il est vide: on ne rétrograde jamais un coach qui
  -- aurait accepté l'invitation d'un pair sur son propre compte.
  --
  -- `locale` part de la MÊME condition, délibérément: on n'écrit la langue du
  -- produit que sur quelqu'un qui DEVIENT élève ici.
  update public.profiles
     set keel_role = 'student',
         locale = 'en-US',
         updated_at = now()
   where id = p_user_id
     and keel_role is null;

  -- LE PAYS. Séparément et sans condition de rôle: un élève déjà lié qui
  -- ré-accepte doit lui aussi sortir d'ici avec un pays. `country is null` est
  -- la seule garde — une déclaration de l'élève ne se fait jamais écraser.
  if v_country is not null then
    update public.profiles
       set country = v_country,
           updated_at = now()
     where id = p_user_id
       and country is null;
  end if;

  -- LE PROTOCOLE PUBLIÉ. Pour la maison seulement, et idempotent: sans lui la
  -- photo — le geste central du produit — est refusée par 409 à tout inscrit
  -- libre. Trouvé par l'épreuve de réel, pas par un test; voir l'en-tête.
  if v_target_kind = 'house' then
    perform public.keel_provision_house_plan_version(p_user_id, p_coach_id);
  end if;

  return 'attached';
end;
$_$;


ALTER FUNCTION "public"."keel_attach_student_to_coach"("p_user_id" "uuid", "p_coach_id" "uuid", "p_invited_email" "text", "p_country" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."keel_attach_student_to_coach"("p_user_id" "uuid", "p_coach_id" "uuid", "p_invited_email" "text", "p_country" "text") IS 'LE moteur de rattachement élève→coach: lien coach_clients, keel_role, locale du produit, pays, et — pour le coach maison — le protocole publié sans lequel la photo de repas est refusée. Les deux portes (invitation, inscription libre) l''appellent: c''est ce qui rend impossible qu''une porte oublie le pays, donc qu''un élève reçoive la hotline d''un autre pays. Clôt le lien au coach maison ET supersède son protocole quand un VRAI coach prend la suite; refuse tout autre changement de coach (already_coached).';



CREATE OR REPLACE FUNCTION "public"."keel_billing_month_boundary"("p_at" timestamp with time zone DEFAULT "now"()) RETURNS timestamp with time zone
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select (
    date_trunc('month', (p_at at time zone 'utc')::date)
      + interval '1 month'
  )::timestamptz;
$$;


ALTER FUNCTION "public"."keel_billing_month_boundary"("p_at" timestamp with time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."keel_billing_month_boundary"("p_at" timestamp with time zone) IS 'Premier instant du mois de facturation SUIVANT. Même borne que celle de keel_coach_seat_ledger: un siège désactivé est facturé pour le mois entier puis sort exactement au changement de fenêtre.';



CREATE OR REPLACE FUNCTION "public"."keel_cancel_inflight_checkins"("p_user_id" "uuid", "p_from" timestamp with time zone) RETURNS integer
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  with cancelled as (
    update public.scheduled_checkins s
    set status = 'cancelled'::checkin_status,
        processed_at = now()
    where s.user_id = p_user_id
      and s.status in ('pending'::checkin_status, 'retrying'::checkin_status)
      and s.scheduled_for >= p_from
      and s.event_context like 'keel\_%'
    returning 1
  )
  select count(*)::int from cancelled;
$$;


ALTER FUNCTION "public"."keel_cancel_inflight_checkins"("p_user_id" "uuid", "p_from" timestamp with time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."keel_cancel_inflight_checkins"("p_user_id" "uuid", "p_from" timestamp with time zone) IS 'KEEL W4.2 republication: cancel (never delete) the in-flight KEEL-derived scheduled_checkins of a student, so no reminder quotes a withdrawn prescription.';



CREATE OR REPLACE FUNCTION "public"."keel_card_body_slots_declared"("p_body" "text", "p_variables" "jsonb") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select
    -- every well-formed slot resolves to a declared variable key
    not exists (
      select 1
      from regexp_matches(coalesce(p_body, ''), '\{\{([a-z][a-z0-9_]*)\}\}', 'g') as m
      where not exists (
        select 1
        from jsonb_array_elements(coalesce(p_variables, '[]'::jsonb)) v
        where v ->> 'key' = m[1]
      )
    )
    -- and there is no stray '{{' that is not a well-formed slot
    and (
      (length(coalesce(p_body, '')) - length(replace(coalesce(p_body, ''), '{{', ''))) / 2
      = (
        select count(*)
        from regexp_matches(coalesce(p_body, ''), '\{\{[a-z][a-z0-9_]*\}\}', 'g')
      )
    );
$$;


ALTER FUNCTION "public"."keel_card_body_slots_declared"("p_body" "text", "p_variables" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."keel_card_body_slots_declared"("p_body" "text", "p_variables" "jsonb") IS 'CHECK helper: every {{slot}} in a card body is a declared variable key, and no stray {{ exists.';



CREATE OR REPLACE FUNCTION "public"."keel_card_variables_valid"("p_variables" "jsonb") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $_$
  select
    jsonb_typeof(p_variables) = 'array'
    and jsonb_array_length(p_variables) between 1 and 8
    and not exists (
      select 1
      from jsonb_array_elements(p_variables) v
      where jsonb_typeof(v) <> 'object'
         or coalesce(v ->> 'key', '') !~ '^[a-z][a-z0-9_]*$'
         or coalesce(btrim(v ->> 'label'), '') = ''
         or coalesce(v ->> 'type', '') not in ('text', 'choice', 'time', 'number')
         or (
              v ->> 'type' = 'choice'
              and (
                jsonb_typeof(v -> 'options') is distinct from 'array'
                or jsonb_array_length(v -> 'options') < 2
                or exists (
                     select 1
                     from jsonb_array_elements(v -> 'options') o
                     where coalesce(o ->> 'value', '') !~ '^[a-z][a-z0-9_]*$'
                        or coalesce(btrim(o ->> 'label'), '') = ''
                   )
              )
            )
         or (v ->> 'type' <> 'choice' and v ? 'options')
    )
    and (
      select count(distinct v ->> 'key') from jsonb_array_elements(p_variables) v
    ) = jsonb_array_length(p_variables);
$_$;


ALTER FUNCTION "public"."keel_card_variables_valid"("p_variables" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."keel_card_variables_valid"("p_variables" "jsonb") IS 'CHECK helper: typed variable descriptors [{key,label,type,options}] with a closed type vocabulary.';



CREATE OR REPLACE FUNCTION "public"."keel_coach_broadcast_state"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_coach_id uuid;
  v_last public.coach_broadcasts%rowtype;
  v_recipients integer;
begin
  select c.id into v_coach_id
  from public.coaches c
  where c.user_id = (select auth.uid())
    and c.status = 'active';

  if v_coach_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_coach');
  end if;

  select count(*) into v_recipients
  from public.coach_clients cc
  where cc.coach_id = v_coach_id
    and cc.status = 'active'
    and cc.student_user_id is not null;

  select * into v_last
  from public.coach_broadcasts b
  where b.coach_id = v_coach_id
  order by b.created_at desc
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'recipients', v_recipients,
    -- `can_send_now` est calculé ICI et pas dans l'écran: l'index de cadence
    -- est la vérité, et une seconde arithmétique de semaine côté client aurait
    -- divergé au premier changement de fuseau.
    'can_send_now', (
      v_last.id is null
      or date_trunc('week', (v_last.created_at at time zone 'utc'))
         < date_trunc('week', (now() at time zone 'utc'))
    ),
    'next_window_opens_at', (
      date_trunc('week', (now() at time zone 'utc')) + interval '1 week'
    ),
    'last', case when v_last.id is null then null else jsonb_build_object(
      'id', v_last.id,
      'body', v_last.body,
      'created_at', v_last.created_at,
      'finished_at', v_last.finished_at,
      'delivered_count', v_last.delivered_count,
      'skipped_count', v_last.skipped_count
    ) end
  );
end;
$$;


ALTER FUNCTION "public"."keel_coach_broadcast_state"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."keel_coach_cancel_client_end"("p_student_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_coach_id uuid;
  v_link_id uuid;
begin
  select c.id into v_coach_id
  from public.coaches c
  where c.user_id = (select auth.uid())
    and c.status = 'active';

  if v_coach_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_coach');
  end if;

  update public.coach_clients
     set scheduled_end_at = null,
         updated_at = now()
   where coach_id = v_coach_id
     and student_user_id = p_student_user_id
     and status = 'active'
     and scheduled_end_at is not null
  returning id into v_link_id;

  if v_link_id is null then
    return jsonb_build_object('ok', false, 'reason', 'nothing_scheduled');
  end if;

  return jsonb_build_object('ok', true, 'reason', 'cancelled');
end;
$$;


ALTER FUNCTION "public"."keel_coach_cancel_client_end"("p_student_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."keel_coach_is_solvent"("p_coach_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.coaches c
    left join public.subscriptions s on s.user_id = c.user_id
    where c.id = p_coach_id
      and c.status = 'active'
      and (
        -- LE COACH MAISON, ET C'EST LA PREMIÈRE CONDITION LUE.
        --
        -- Il n'a pas d'abonnement et n'en aura jamais. Sans cette ligne, il
        -- retombe sur `trial_ends_at`, que `_trg_coaches_default_trial_end`
        -- pose à now() + 14 jours à l'insertion — donc tous ses inscrits
        -- libres perdent leur `access_tier` à J+15, silencieusement, et le
        -- seul symptôme est un paywall sur des comptes gratuits.
        --
        -- CONDITION DE DÉSARMEMENT (P9): cette branche ne s'applique QU'À
        -- coach_kind = 'house'. Un coach humain qui cesse de payer redevient
        -- insolvable exactement comme avant — ce que le test 4 de
        -- billing_seats_test.sql continue de prouver.
        c.coach_kind = 'house'
        or (
          lower(coalesce(s.status, '')) in ('active','trialing')
          and (s.current_period_end is null or now() < s.current_period_end)
        )
        or (c.trial_ends_at is not null and now() < c.trial_ends_at)
      )
  );
$$;


ALTER FUNCTION "public"."keel_coach_is_solvent"("p_coach_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."keel_coach_is_solvent"("p_coach_id" "uuid") IS 'Le coach peut-il porter des sièges ? Abonnement vivant, essai en cours, OU coach maison (qui n''a pas d''abonnement par construction: sans cette branche ses inscrits libres perdent access_tier à J+15).';



CREATE OR REPLACE FUNCTION "public"."keel_coach_reactivate_client"("p_student_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_coach_id uuid;
  v_link_id uuid;
begin
  select c.id into v_coach_id
  from public.coaches c
  where c.user_id = (select auth.uid())
    and c.status = 'active';

  if v_coach_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_coach');
  end if;

  begin
    update public.coach_clients
       set status = 'active',
           scheduled_end_at = null,
           updated_at = now()
     where coach_id = v_coach_id
       and student_user_id = p_student_user_id
       and status = 'paused'
    returning id into v_link_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'already_coached');
  end;

  if v_link_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_paused_link');
  end if;

  return jsonb_build_object('ok', true, 'reason', 'reactivated');
end;
$$;


ALTER FUNCTION "public"."keel_coach_reactivate_client"("p_student_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."keel_coach_schedule_client_end"("p_student_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_coach_id uuid;
  v_link_id uuid;
  v_scheduled timestamptz;
  v_effective timestamptz;
begin
  select c.id into v_coach_id
  from public.coaches c
  where c.user_id = (select auth.uid())
    and c.status = 'active';

  if v_coach_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_coach');
  end if;

  -- FOR UPDATE: la ligne de lien est le mutex de l'opération, exactement comme
  -- l'invitation l'est dans `accept_coach_invitation_for_user`.
  select cc.id, cc.scheduled_end_at into v_link_id, v_scheduled
  from public.coach_clients cc
  where cc.coach_id = v_coach_id
    and cc.student_user_id = p_student_user_id
    and cc.status = 'active'
  for update;

  if v_link_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_active_link');
  end if;

  if v_scheduled is not null then
    return jsonb_build_object(
      'ok', true, 'reason', 'already_scheduled', 'effective_at', v_scheduled
    );
  end if;

  v_effective := public.keel_billing_month_boundary();

  update public.coach_clients
     set scheduled_end_at = v_effective,
         updated_at = now()
   where id = v_link_id;

  return jsonb_build_object('ok', true, 'reason', 'scheduled', 'effective_at', v_effective);
end;
$$;


ALTER FUNCTION "public"."keel_coach_schedule_client_end"("p_student_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."keel_coach_seat_ledger"("p_coach_id" "uuid", "p_month" "date" DEFAULT NULL::"date") RETURNS TABLE("coach_client_id" "uuid", "student_user_id" "uuid", "seat_state" "text", "link_status" "text", "interaction_count" integer, "is_active_seat" boolean, "billing_interval" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  with bounds as (
    select
      date_trunc('month', coalesce(p_month, (now() at time zone 'utc')::date))::timestamptz as m_from,
      (date_trunc('month', coalesce(p_month, (now() at time zone 'utc')::date)) + interval '1 month')::timestamptz as m_to
  ),
  coach as (
    select c.coach_kind from public.coaches c where c.id = p_coach_id
  )
  select
    cc.id,
    cc.student_user_id,
    cc.seat_state,
    cc.status,
    coalesce(
      public.keel_student_interaction_count(cc.student_user_id, b.m_from, b.m_to),
      0
    )::integer,
    (
      (select coach.coach_kind from coach) is distinct from 'house'
      and cc.status = 'active'
      and cc.student_user_id is not null
    ),
    cc.billing_interval
  from public.coach_clients cc
  cross join bounds b
  where cc.coach_id = p_coach_id
    and cc.status in ('invited','active','paused');
$$;


ALTER FUNCTION "public"."keel_coach_seat_ledger"("p_coach_id" "uuid", "p_month" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."keel_coach_seat_ledger"("p_coach_id" "uuid", "p_month" "date") IS 'Registre des sièges d''un coach pour un mois. is_active_seat est la définition UNIQUE de « siège facturable »: le lien ACTIF, sans condition d''activité. billing_interval dit à quel tarif il est compté. Toujours faux pour un coach maison. interaction_count reste renseigné: seule la facturabilité s''en détache.';



CREATE OR REPLACE FUNCTION "public"."keel_coach_send_broadcast"("p_body" "text", "p_content_locale" "text" DEFAULT 'en-US'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_coach_id uuid;
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
  v_recipients integer;
begin
  select c.id into v_coach_id
  from public.coaches c
  where c.user_id = (select auth.uid())
    and c.status = 'active';

  if v_coach_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_coach');
  end if;

  -- La longueur est vérifiée ICI **et** par la CHECK. Ici pour rendre un motif
  -- lisible, là-bas parce que c'est la seule qui tienne quel que soit l'appelant.
  if char_length(v_body) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'empty_body');
  end if;
  if char_length(v_body) > 1000 then
    return jsonb_build_object('ok', false, 'reason', 'body_too_long');
  end if;

  -- RIEN À DIFFUSER N'EST PAS UNE DIFFUSION. Sans ce refus, un coach sans élève
  -- consommerait sa semaine sur un message que personne ne reçoit.
  select count(*) into v_recipients
  from public.coach_clients cc
  where cc.coach_id = v_coach_id
    and cc.status = 'active'
    and cc.student_user_id is not null;

  if v_recipients = 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_recipients');
  end if;

  begin
    insert into public.coach_broadcasts (coach_id, body, content_locale)
    values (v_coach_id, v_body, coalesce(nullif(btrim(p_content_locale), ''), 'en-US'))
    returning id into v_id;
  exception when unique_violation then
    -- L'index de cadence. On rend un motif, pas une 500: le coach a le droit de
    -- savoir qu'il a déjà écrit cette semaine.
    return jsonb_build_object('ok', false, 'reason', 'already_sent_this_week');
  end;

  return jsonb_build_object(
    'ok', true, 'reason', 'queued',
    'broadcast_id', v_id, 'recipients', v_recipients
  );
end;
$$;


ALTER FUNCTION "public"."keel_coach_send_broadcast"("p_body" "text", "p_content_locale" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."keel_coach_set_seat_interval"("p_student_user_id" "uuid", "p_interval" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_coach_id uuid;
  v_link_id uuid;
  v_interval text := lower(btrim(coalesce(p_interval, '')));
begin
  if v_interval not in ('month', 'year') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_interval');
  end if;

  select c.id into v_coach_id
  from public.coaches c
  where c.user_id = (select auth.uid())
    and c.status = 'active';

  if v_coach_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_coach');
  end if;

  update public.coach_clients
     set billing_interval = v_interval,
         updated_at = now()
   where coach_id = v_coach_id
     and student_user_id = p_student_user_id
     and status = 'active'
  returning id into v_link_id;

  if v_link_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_active_link');
  end if;

  return jsonb_build_object('ok', true, 'reason', 'updated', 'billing_interval', v_interval);
end;
$$;


ALTER FUNCTION "public"."keel_coach_set_seat_interval"("p_student_user_id" "uuid", "p_interval" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."keel_doctrine_goal_scope_ok"("entries" "jsonb") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select case
    -- Une valeur qui n'est pas un tableau n'est pas du ressort de CE check:
    -- le parseur applicatif la traite déjà (liste vide), et faire échouer
    -- l'écriture ici transformerait une tolérance en panne.
    when entries is null or jsonb_typeof(entries) <> 'array' then true
    else not exists (
      select 1
      from jsonb_array_elements(entries) as e
      where jsonb_typeof(e) = 'object'
        and e ? 'goal_scope'
        and (
          -- présent mais pas un tableau
          jsonb_typeof(e->'goal_scope') <> 'array'
          -- ou contenant un jeton hors vocabulaire
          or exists (
            select 1
            from jsonb_array_elements_text(e->'goal_scope') as g
            where g not in (
              'fat_loss', 'muscle_gain', 'recomposition', 'performance',
              'health', 'maintenance'
            )
          )
        )
    )
  end;
$$;


ALTER FUNCTION "public"."keel_doctrine_goal_scope_ok"("entries" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."keel_doctrine_goal_scope_ok"("entries" "jsonb") IS 'Lot doctrine-by-goal: chaque entrée de beliefs/arbitrations peut porter un goal_scope, qui doit être un tableau de goals connus. Absent = global. 2026-08-05: vocabulaire élargi à muscle_gain.';



CREATE OR REPLACE FUNCTION "public"."keel_free_signup_available"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.coaches c
    join public.coach_doctrines d on d.coach_id = c.id and d.published_at is not null
    where c.coach_kind = 'house'
      and c.status = 'active'
      -- La doctrine doit être publiée ET non vide: `generate-week-plan-v1`
      -- refuse sur `beliefs` vide, pas sur `published_at`. Une doctrine publiée
      -- à blanc rendrait cette fonction vraie et le produit inutilisable —
      -- exactement le genre de garde qu'on croit sur parole.
      and jsonb_array_length(coalesce(d.beliefs, '[]'::jsonb)) > 0
  );
$$;


ALTER FUNCTION "public"."keel_free_signup_available"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."keel_free_signup_available"() IS 'Le coach maison existe-t-il, actif, avec une doctrine publiée NON VIDE ? Lue par la page d''inscription libre avant d''afficher son formulaire: sans elle on crée des comptes qui rencontrent un 409 coach_has_no_doctrine.';



CREATE OR REPLACE FUNCTION "public"."keel_invalidate_inflight_evaluations"("p_student_id" "uuid", "p_keep_plan_version_id" "uuid", "p_from_local_date" "date") RETURNS integer
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  with removed as (
    delete from public.commitment_evaluations e
    where e.user_id = p_student_id
      and e.plan_version_id is distinct from p_keep_plan_version_id
      and e.local_date >= p_from_local_date
      and e.status = 'unknown'
      and e.resolved_at is null
    returning 1
  )
  select count(*)::int from removed;
$$;


ALTER FUNCTION "public"."keel_invalidate_inflight_evaluations"("p_student_id" "uuid", "p_keep_plan_version_id" "uuid", "p_from_local_date" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."keel_invalidate_inflight_evaluations"("p_student_id" "uuid", "p_keep_plan_version_id" "uuid", "p_from_local_date" "date") IS 'KEEL W4.2 republication: drop the in-flight (unknown, unresolved) evaluations of the superseded plan versions from the publication day onward. Resolved rows are history and are kept.';



CREATE OR REPLACE FUNCTION "public"."keel_join_house_coach"("p_country" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user uuid := (select auth.uid());
  v_coach_id uuid;
  v_email text;
  v_outcome text;
begin
  if v_user is null then
    raise exception 'keel_join_house_coach: no authenticated user'
      using errcode = '42501';
  end if;

  -- LE PAYS EST EXIGÉ ICI, PAS DANS LE MOTEUR, et la distinction est réelle.
  --
  -- Le moteur accepte un pays absent parce que le chemin d'invitation en a
  -- légitimement un: un coach dont `profiles.country` est NULL invite quand même
  -- son élève, et refuser reviendrait à casser l'invitation pour une donnée que
  -- l'élève n'a pas saisie. Là, personne n'a de pays à léguer — le coach maison
  -- n'exerce nulle part — donc l'absence n'est pas un défaut hérité, c'est un
  -- élève sans pays du tout. On refuse à la porte.
  if nullif(btrim(coalesce(p_country, '')), '') is null then
    return jsonb_build_object('joined', false, 'reason', 'country_required');
  end if;

  -- Un COACH ne devient pas son propre élève. Son espace est /coach, et un lien
  -- `coach_clients` sur son propre compte lui donnerait un `access_tier`
  -- 'student' hérité et une place dans son propre registre de sièges.
  if exists (select 1 from public.coaches c where c.user_id = v_user) then
    return jsonb_build_object('joined', false, 'reason', 'caller_is_coach');
  end if;

  select c.id into v_coach_id
    from public.coaches c
   where c.coach_kind = 'house'
     and c.status = 'active';
  if v_coach_id is null then
    return jsonb_build_object('joined', false, 'reason', 'house_coach_unavailable');
  end if;
  if not public.keel_free_signup_available() then
    return jsonb_build_object('joined', false, 'reason', 'house_coach_unavailable');
  end if;

  -- Déjà rattaché à CE coach: on ressort 'joined' sans rien changer. C'est ce
  -- qui rend l'appel de réparation côté client sûr à rejouer.
  select u.email into v_email from auth.users u where u.id = v_user;

  v_outcome := public.keel_attach_student_to_coach(
    v_user, v_coach_id, v_email, p_country
  );
  if v_outcome <> 'attached' then
    return jsonb_build_object('joined', false, 'reason', v_outcome);
  end if;

  return jsonb_build_object('joined', true);
end;
$$;


ALTER FUNCTION "public"."keel_join_house_coach"("p_country" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."keel_join_house_coach"("p_country" "text") IS 'Rattache le caller au coach maison (inscription libre). Idempotent, et sûr à rejouer: c''est aussi le chemin de RÉPARATION quand le rattachement du trigger de signup a échoué. Le pays est OBLIGATOIRE — sans lui tout inscrit libre sortirait avec country NULL et hériterait de la hotline déduite de sa langue. Refuse un compte coach et un élève déjà suivi par un vrai coach.';



CREATE OR REPLACE FUNCTION "public"."keel_mark_synthesis_delivered"("p_synthesis_id" "uuid", "p_channel" "text" DEFAULT 'in_app'::"text") RETURNS timestamp with time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_delivered timestamptz;
begin
  update public.coach_syntheses s
  set
    delivered_at = coalesce(s.delivered_at, now()),
    delivery_channel = coalesce(s.delivery_channel, p_channel)
  where s.id = p_synthesis_id
    -- La clause d'appartenance. Sans elle, la fonction marquerait n'importe
    -- quelle synthèse de n'importe quel coach.
    and s.coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  returning s.delivered_at into v_delivered;

  -- NULL = la ligne n'existe pas OU n'appartient pas à l'appelant. On ne
  -- distingue pas les deux pour l'appelant: le dire révélerait l'existence
  -- d'une synthèse d'un autre coach.
  return v_delivered;
end;
$$;


ALTER FUNCTION "public"."keel_mark_synthesis_delivered"("p_synthesis_id" "uuid", "p_channel" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."keel_meal_idea_food_groups_valid"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  bad text;
begin
  if new.food_group_refs is null then
    new.food_group_refs := '{}'::text[];
  end if;

  -- coalesce, because array_length('{}', 1) is NULL, not 0. Without it the
  -- comparison below is NULL <> 0 = true and EVERY dish with nothing ticked is
  -- rejected as "duplicated" — a dish with no food group is perfectly legal
  -- (it simply cannot cover a nutrition line, which the coverage read says out
  -- loud rather than pretending).
  if coalesce(array_length(new.food_group_refs, 1), 0) is distinct from
     (select count(distinct g)::int from unnest(new.food_group_refs) g) then
    raise exception 'meal_ideas.food_group_refs contains duplicates: %',
      new.food_group_refs;
  end if;

  select g into bad
  from unnest(new.food_group_refs) g
  where not exists (select 1 from public.food_groups f where f.slug = g)
  limit 1;

  if bad is not null then
    raise exception 'meal_ideas.food_group_refs references unknown food group %', bad;
  end if;

  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."keel_meal_idea_food_groups_valid"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."keel_meal_plan_entry_touch"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."keel_meal_plan_entry_touch"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."keel_my_billing_summary"() RETURNS TABLE("coach_id" "uuid", "coach_status" "text", "trial_ends_at" timestamp with time zone, "trial_seat_limit" integer, "is_solvent" boolean, "subscription_status" "text", "subscription_tier" "text", "current_period_end" timestamp with time zone, "cancel_at_period_end" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_coach uuid;
  v_user uuid := (select auth.uid());
begin
  select c.id into v_coach from public.coaches c where c.user_id = v_user;
  if v_coach is null then
    raise exception 'keel_my_billing_summary: caller is not a coach'
      using errcode = '42501';
  end if;

  return query
    select
      c.id,
      c.status,
      c.trial_ends_at,
      c.trial_seat_limit,
      public.keel_coach_is_solvent(c.id),
      s.status,
      s.tier,
      s.current_period_end,
      s.cancel_at_period_end
    from public.coaches c
    left join public.subscriptions s on s.user_id = c.user_id
    where c.id = v_coach;
end;
$$;


ALTER FUNCTION "public"."keel_my_billing_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."keel_my_seat_ledger"("p_month" "date" DEFAULT NULL::"date") RETURNS TABLE("coach_client_id" "uuid", "student_user_id" "uuid", "seat_state" "text", "link_status" "text", "interaction_count" integer, "is_active_seat" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_coach uuid;
begin
  select c.id into v_coach
  from public.coaches c
  where c.user_id = (select auth.uid()) and c.status = 'active';

  if v_coach is null then
    raise exception 'keel_my_seat_ledger: caller is not an active coach'
      using errcode = '42501';
  end if;

  return query select * from public.keel_coach_seat_ledger(v_coach, p_month);
end;
$$;


ALTER FUNCTION "public"."keel_my_seat_ledger"("p_month" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."keel_provision_house_plan_version"("p_user_id" "uuid", "p_coach_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_plan_id uuid;
  v_timezone text;
  v_kind text;
  v_version integer;
begin
  select c.coach_kind into v_kind from public.coaches c where c.id = p_coach_id;
  if v_kind is distinct from 'house' then
    -- CONDITION DE DÉSARMEMENT: cette fonction ne provisionne QUE pour la
    -- maison. Un vrai coach publie son protocole lui-même, par
    -- `plan-publish-v1`, et lui en fabriquer un serait écrire sa méthode à sa
    -- place — la faute que tout ce produit existe pour ne pas commettre.
    return null;
  end if;

  -- Déjà un protocole publié ? On ne touche à rien. C'est ce qui rend le
  -- rattachement rejouable, et ça protège aussi le cas où un vrai coach a
  -- publié: on ne lui volerait pas sa place.
  select pv.id into v_plan_id
    from public.plan_versions pv
   where pv.student_id = p_user_id
     and pv.status = 'published';
  if v_plan_id is not null then
    return v_plan_id;
  end if;

  -- LE FUSEAU. `meal-photo-upload-v1` le lit sur CETTE ligne pour résoudre le
  -- jour local de la photo — c'est même la raison qu'il donne pour exiger un
  -- protocole publié (« no timezone to resolve the day in »). Le prendre sur le
  -- profil, et se rabattre sur UTC plutôt que sur une valeur inventée: un fuseau
  -- faux daterait les repas d'un jour à côté.
  select coalesce(nullif(btrim(p.timezone), ''), 'UTC') into v_timezone
    from public.profiles p where p.id = p_user_id;
  v_timezone := coalesce(v_timezone, 'UTC');

  -- LA VERSION SE SUIT, elle ne se réinvente pas à 1.
  --
  -- Trouvé en relecture à froid, sur un chemin bien atteignable: un inscrit libre
  -- passe à un vrai coach (son protocole de découverte devient `superseded`),
  -- quitte ce coach, puis revient sur la porte libre. Un `version = 1` en dur
  -- écrirait une SECONDE ligne version 1 pour le même élève — rien ne l'interdit
  -- (l'index unique ne porte que sur « un seul publié »), et l'historique de ses
  -- protocoles devient inordonnable.
  select coalesce(max(pv.version), 0) + 1 into v_version
    from public.plan_versions pv where pv.student_id = p_user_id;

  insert into public.plan_versions (
    coach_id, student_id, version, status, title, content_locale, timezone,
    anchor_week_start, duration_weeks, published_at, published_by,
    notes_for_student
  )
  values (
    p_coach_id, p_user_id, v_version, 'published',
    'KEEL discovery program', 'en-US', v_timezone,
    (date_trunc('week', (now() at time zone v_timezone))::date), 12,
    now(),
    -- `published_by` = le compte du coach maison. Il ne s'est pas connecté pour
    -- le faire — il ne peut pas — mais l'attribution reste juste: c'est bien son
    -- programme, et laisser NULL rendrait la ligne anonyme dans l'audit.
    (select c.user_id from public.coaches c where c.id = p_coach_id),
    'The KEEL discovery program. General principles, not a plan written for you: '
    || 'a real coach on KEEL is what that would be.'
  )
  returning id into v_plan_id;

  insert into public.plan_commitments (
    plan_version_id, user_id, coach_id,
    title, content_locale,
    polarity, activity_class, anchor_kind,
    measure, target_op, evidence_kind, evidence_required,
    evaluation_grain, counts_toward_adherence
  )
  values (
    v_plan_id, p_user_id, p_coach_id,
    -- Le libellé que l'élève lit. C'est le geste du programme, pas une cible.
    'Photograph a meal', 'en-US',
    -- « capture »: on demande de CONSTATER, pas d'atteindre une cible. C'est le
    -- seul type d'engagement qu'un programme qui ne connaît pas la personne peut
    -- honnêtement porter.
    'capture', 'nutrition', 'free',
    'presence', 'any', 'photo', false,
    'day',
    -- FAUX, et c'est la ligne la plus importante de cette fonction. Le programme
    -- de découverte ne note personne; un engagement comptant vers un pourcentage
    -- d'adhérence contredirait la seule promesse faite à l'élève.
    false
  );

  return v_plan_id;
end;
$$;


ALTER FUNCTION "public"."keel_provision_house_plan_version"("p_user_id" "uuid", "p_coach_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."keel_provision_house_plan_version"("p_user_id" "uuid", "p_coach_id" "uuid") IS 'Publie le protocole du programme de découverte pour un inscrit libre. Sans lui, meal-photo-upload-v1 rend 409 « No published plan » et la photo — le geste central du produit — est morte pour tout élève du coach maison, parce que seul plan-publish-v1 écrit plan_versions et qu''il exige le JWT d''un coach que la maison n''a pas. Ne fait RIEN pour un coach humain: celui-là publie sa méthode lui-même.';



CREATE OR REPLACE FUNCTION "public"."keel_recompute_seat_access_tiers"("p_limit" integer DEFAULT 5000) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  r record;
  processed integer := 0;
  capped integer := greatest(1, least(coalesce(p_limit, 5000), 50000));
begin
  for r in
    select distinct cc.student_user_id as id
    from public.coach_clients cc
    where cc.student_user_id is not null
    order by 1
    limit capped
  loop
    perform public.recompute_profile_access_tier(r.id);
    processed := processed + 1;
  end loop;
  return processed;
end;
$$;


ALTER FUNCTION "public"."keel_recompute_seat_access_tiers"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."keel_render_card"("p_body_template" "text", "p_variables" "jsonb", "p_values" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  v_out   text := p_body_template;
  v_var   jsonb;
  v_opt   jsonb;
  v_key   text;
  v_type  text;
  v_raw   jsonb;
  v_text  text;
  v_label text;
begin
  if p_body_template is null or btrim(p_body_template) = '' then
    raise exception 'keel_render_card: empty body_template';
  end if;
  if jsonb_typeof(p_values) is distinct from 'object' then
    raise exception 'keel_render_card: variable_values must be a json object, got %',
      coalesce(jsonb_typeof(p_values), 'null');
  end if;

  for v_var in select * from jsonb_array_elements(coalesce(p_variables, '[]'::jsonb)) loop
    v_key  := v_var ->> 'key';
    v_type := v_var ->> 'type';
    v_raw  := p_values -> v_key;

    if v_raw is null or jsonb_typeof(v_raw) = 'null' then
      raise exception 'keel_render_card: missing value for variable "%"', v_key;
    end if;

    if v_type = 'choice' then
      v_label := null;
      for v_opt in select * from jsonb_array_elements(v_var -> 'options') loop
        if (v_opt ->> 'value') = (v_raw #>> '{}') then
          v_label := v_opt ->> 'label';
        end if;
      end loop;
      if v_label is null then
        raise exception 'keel_render_card: value "%" is not an option of variable "%"',
          v_raw #>> '{}', v_key;
      end if;
      v_text := v_label;
    else
      v_text := v_raw #>> '{}';
    end if;

    if v_text is null or btrim(v_text) = '' then
      raise exception 'keel_render_card: empty value for variable "%"', v_key;
    end if;

    -- A value is prose, never a template. Without this line the substitution is
    -- order-dependent: a value of "{{plan_b}}" written into an early variable
    -- would be expanded by a later pass, so the same (template, values) pair
    -- could render differently if the variable order changed. Refused at the
    -- write, loudly (R7), rather than made to work.
    if v_text like '%{{%' or v_text like '%}}%' then
      raise exception 'keel_render_card: value for variable "%" contains template markers', v_key;
    end if;

    v_out := replace(v_out, '{{' || v_key || '}}', v_text);
  end loop;

  if v_out like '%{{%' then
    raise exception 'keel_render_card: unresolved slot after substitution: %', v_out;
  end if;

  return v_out;
end;
$$;


ALTER FUNCTION "public"."keel_render_card"("p_body_template" "text", "p_variables" "jsonb", "p_values" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."keel_render_card"("p_body_template" "text", "p_variables" "jsonb", "p_values" "jsonb") IS 'Deterministic card render. No LLM anywhere on the write path (see defense-card-ui-qa).';



CREATE OR REPLACE FUNCTION "public"."keel_replace_doctrine_compilations"("p_doctrine_id" "uuid", "p_rows" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  inserted integer;
begin
  if p_doctrine_id is null then
    raise exception 'doctrine_id required';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be a json array';
  end if;

  -- Le remplacement est TOTAL. Une variante retirée du jeu disparaît, elle ne
  -- reste pas là à servir un texte que le coach a cessé d'écrire.
  delete from public.coach_doctrine_compilations
  where doctrine_id = p_doctrine_id;

  insert into public.coach_doctrine_compilations
    (doctrine_id, goal, compiled_prompt, compiled_prompt_hash)
  select
    p_doctrine_id,
    r->>'goal',
    r->>'compiled_prompt',
    r->>'compiled_prompt_hash'
  from jsonb_array_elements(p_rows) as r;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;


ALTER FUNCTION "public"."keel_replace_doctrine_compilations"("p_doctrine_id" "uuid", "p_rows" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."keel_replace_doctrine_compilations"("p_doctrine_id" "uuid", "p_rows" "jsonb") IS 'Remplace TOUT le jeu de variantes compilées d''une doctrine, en une transaction. Appelée par coach-doctrine-v1 (service_role) à la publication.';



CREATE OR REPLACE FUNCTION "public"."keel_seed_evaluations"("p_rows" "jsonb") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  with input as (
    select distinct
      (r->>'user_id')::uuid          as user_id,
      (r->>'commitment_id')::uuid    as commitment_id,
      (r->>'plan_version_id')::uuid  as plan_version_id,
      (r->>'local_date')::date       as local_date,
      nullif(r->>'slot_key', '')     as slot_key,
      r->>'grain'                    as grain,
      coalesce(r->'expected', '{}'::jsonb) as expected
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as r
  ),
  -- Execution truth: the database, not the caller, decides what is seedable.
  validated as (
    select i.*
    from input i
    join public.plan_commitments c
      on c.id = i.commitment_id
     and c.plan_version_id = i.plan_version_id
     and c.user_id = i.user_id
     and c.status = 'active'
     and c.slot_kind = 'nominal'
    join public.plan_versions v
      on v.id = i.plan_version_id
     and v.student_id = i.user_id
     and v.status = 'published'
  ),
  ins as (
    insert into public.commitment_evaluations (
      user_id, commitment_id, plan_version_id, local_date, slot_key, grain,
      expected, status, timing_status, evidence
    )
    select
      v.user_id, v.commitment_id, v.plan_version_id, v.local_date, v.slot_key,
      v.grain, v.expected, 'unknown', 'unknown', 'none'
    from validated v
    -- The functional unique index, named by its exact expression.
    on conflict (user_id, commitment_id, local_date, coalesce(slot_key, 'no_slot'))
      do nothing
    returning 1
  )
  select jsonb_build_object(
    'requested',  (select count(*) from input),
    'validated',  (select count(*) from validated),
    'inserted',   (select count(*) from ins),
    'conflicted', (select count(*) from validated) - (select count(*) from ins),
    'rejected',   (select count(*) from input) - (select count(*) from validated)
  );
$$;


ALTER FUNCTION "public"."keel_seed_evaluations"("p_rows" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."keel_seed_evaluations"("p_rows" "jsonb") IS 'KEEL W4.2: idempotent pre-seed of the day''s nominal commitment_evaluations in status unknown. Re-validates every row against the live published prescription and reports the rejected count.';



CREATE OR REPLACE FUNCTION "public"."keel_student_cards_render"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_body text;
  v_vars jsonb;
  v_extra text;
begin
  select body_template, variables into v_body, v_vars
  from public.card_templates
  where id = new.template_id;

  if not found then
    raise exception 'keel_student_cards_render: unknown template %', new.template_id;
  end if;

  select string_agg(k, ', ') into v_extra
  from jsonb_object_keys(new.variable_values) as k
  where not exists (
    select 1 from jsonb_array_elements(v_vars) v where v ->> 'key' = k
  );
  if v_extra is not null then
    raise exception 'keel_student_cards_render: variable_values carries undeclared key(s): %', v_extra;
  end if;

  new.keyword := nullif(btrim(lower(coalesce(new.keyword, ''))), '');
  new.rendered := public.keel_render_card(v_body, v_vars, new.variable_values);
  new.rendered_at := now();
  new.render_engine_version := 1;
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."keel_student_cards_render"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."keel_student_interaction_count"("p_student" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    coalesce((
      select count(*) from public.protocol_events pe
       where pe.user_id = p_student
         and pe.occurred_at >= p_from
         and pe.occurred_at < p_to
    ), 0)
    +
    coalesce((
      select count(*) from public.chat_messages cm
       where cm.user_id = p_student
         and cm.role = 'user'
         and cm.created_at >= p_from
         and cm.created_at < p_to
    ), 0);
$$;


ALTER FUNCTION "public"."keel_student_interaction_count"("p_student" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."keel_sweep_day_evaluations"("p_user_id" "uuid", "p_plan_version_id" "uuid", "p_local_date" "date") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  with target as (
    select
      e.id,
      c.polarity,
      c.flex_eligible,
      c.auto_source,
      (
        select d.consumed_flex
        from public.planned_deviations d
        where d.user_id = e.user_id
          and d.local_date = e.local_date
          -- Mirrors evaluator.ts::deviationCovers: a NULL slot covers the day,
          -- a named slot covers only that occasion.
          and (d.slot_key is null or d.slot_key is not distinct from e.slot_key)
        order by d.declared_at desc
        limit 1
      ) as deviation_consumed_flex,
      exists (
        select 1
        from public.planned_deviations d
        where d.user_id = e.user_id
          and d.local_date = e.local_date
          and (d.slot_key is null or d.slot_key is not distinct from e.slot_key)
      ) as has_deviation
    from public.commitment_evaluations e
    join public.plan_commitments c on c.id = e.commitment_id
    where e.user_id = p_user_id
      and e.plan_version_id = p_plan_version_id
      and e.local_date = p_local_date
      and e.status = 'unknown'
      and e.resolved_at is null
      and c.slot_kind = 'nominal'
  ),
  -- R6 branch 2: named and counted, never silently skipped.
  held as (
    select count(*) as n from target where auto_source is not null
  ),
  swept as (
    update public.commitment_evaluations e
    set status = case
          when t.has_deviation and coalesce(t.deviation_consumed_flex, false)
               and t.flex_eligible then 'flex_used'
          when t.has_deviation then 'not_applicable'
          when t.polarity = 'avoid' then 'met'
          else 'missed'
        end,
        timing_status = case
          when t.has_deviation then 'not_applicable'
          when t.polarity = 'avoid' then 'not_applicable'
          else 'unknown'
        end,
        resolved_at = now(),
        resolved_by = 'system',
        updated_at = now()
    from target t
    where e.id = t.id
      and t.auto_source is null
    returning e.status as new_status
  )
  select jsonb_build_object(
    'missed',              (select count(*) from swept where new_status = 'missed'),
    'met',                 (select count(*) from swept where new_status = 'met'),
    'not_applicable',      (select count(*) from swept where new_status = 'not_applicable'),
    'flex_used',           (select count(*) from swept where new_status = 'flex_used'),
    'held_device_unknown', (select n from held)
  );
$$;


ALTER FUNCTION "public"."keel_sweep_day_evaluations"("p_user_id" "uuid", "p_plan_version_id" "uuid", "p_local_date" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."keel_sweep_day_evaluations"("p_user_id" "uuid", "p_plan_version_id" "uuid", "p_local_date" "date") IS 'KEEL W4.2: end-of-day close. Unresolved nominal evaluations get the evaluator''s named branches (deviation / avoid / missed). Device-fed lines stay unknown (R6).';



CREATE OR REPLACE FUNCTION "public"."log_coach_student_access"("p_student_user_id" "uuid", "p_surface" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_caller uuid := (select auth.uid());
  v_coach_id uuid;
  v_event_id uuid;
begin
  if v_caller is null then
    raise exception 'log_coach_student_access: no authenticated user'
      using errcode = '42501';
  end if;

  if p_surface is null or p_surface not in
    ('student_dashboard', 'student_events', 'weekly_review', 'plan_review') then
    raise exception 'log_coach_student_access: unknown surface token %', p_surface
      using errcode = '22023';
  end if;

  select c.id into v_coach_id
  from public.coaches c
  where c.user_id = v_caller and c.status = 'active';

  if v_coach_id is null then
    raise exception 'log_coach_student_access: caller is not an active coach'
      using errcode = '42501';
  end if;

  -- The audit line can only ever describe a read the caller is actually
  -- allowed to perform: same gate as every Tier A policy.
  if p_student_user_id is null
     or not (p_student_user_id = any((select public.coached_student_ids())::uuid[])) then
    raise exception 'log_coach_student_access: student is not coached by the caller'
      using errcode = '42501';
  end if;

  insert into public.coach_access_events (coach_id, student_user_id, surface)
  values (v_coach_id, p_student_user_id, p_surface)
  returning id into v_event_id;

  return v_event_id;
end;
$$;


ALTER FUNCTION "public"."log_coach_student_access"("p_student_user_id" "uuid", "p_surface" "text") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."my_coach_ids"() RETURNS "uuid"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(array_agg(c.id), '{}'::uuid[])
  from public.coach_clients cc
  join public.coaches c on c.id = cc.coach_id
  where cc.student_user_id = (select auth.uid())
    and c.status = 'active'
    and cc.status = 'active';
$$;


ALTER FUNCTION "public"."my_coach_ids"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."my_coach_ids"() IS 'Les coachs ACTIFS de l''élève courant. Miroir de coached_student_ids() dans l''autre sens — même définition du lien actif, pour que les deux surfaces ne puissent pas diverger.';



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
    when lower(coalesce(p_source, '')) like '%generate-plan%' or lower(coalesce(p_source, '')) like '%plan%' or lower(coalesce(p_source, '')) like '%questionnaire%' or lower(coalesce(p_source, '')) like '%materialization%' or lower(coalesce(p_source, '')) like '%draft-transformation%' or lower(coalesce(p_source, '')) like '%intake-structuring%' then 'plan_generation'
    when lower(coalesce(p_source, '')) like '%dispatcher%' then 'dispatcher'
    when lower(coalesce(p_source, '')) like '%visible%' or lower(coalesce(p_source, '')) like '%direct_effect%' or lower(coalesce(p_source, '')) like '%defense-card%' or lower(coalesce(p_source, '')) like '%defense_card%' or lower(coalesce(p_source, '')) like '%attack-card%' or lower(coalesce(p_source, '')) like '%attack_card%' or lower(coalesce(p_source, '')) like '%inspiration%' or lower(coalesce(p_source, '')) like '%support-card%' or lower(coalesce(p_source, '')) like '%potion%' or lower(coalesce(p_source, '')) like '%bilan_stale%' or lower(coalesce(p_source, '')) like '%router_emergency%' then 'message_generation'
    when lower(coalesce(p_source, '')) like '%conversation_pulse%' or lower(coalesce(p_source, '')) like '%weekly_conversation_digest%' or lower(coalesce(p_source, '')) like '%weekly_digest%' or lower(coalesce(p_source, '')) like '%summary%' or lower(coalesce(p_source, '')) like '%identity-manager%' or lower(coalesce(p_source, '')) like '%architect-memory%' then 'summary_generation'
    when lower(coalesce(p_source, '')) like '%ethical%' then 'ethics_check'
    when lower(coalesce(p_source, '')) like '%companion%' or lower(coalesce(p_source, '')) like '%firefighter%' or lower(coalesce(p_source, '')) like '%sentry%' then 'message_generation'
    when lower(coalesce(p_source, '')) like '%memorizer%' or lower(coalesce(p_source, '')) like '%topic_memory%' or lower(coalesce(p_source, '')) like '%topic_%' or lower(coalesce(p_source, '')) like '%synthesizer%' or lower(coalesce(p_source, '')) like '%memory-v2%' then 'memorizer'
    when lower(coalesce(p_source, '')) like '%watcher%' then 'watcher'
    when lower(coalesce(p_source, '')) like '%schedule%' or lower(coalesce(p_source, '')) like '%checkin%' or lower(coalesce(p_source, '')) like '%reminder%' or lower(coalesce(p_source, '')) like '%future-events%' then 'scheduling'
    when lower(coalesce(p_source, '')) like '%professional-support%' or lower(coalesce(p_source, '')) like '%level-tools%' then 'classification'
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


CREATE OR REPLACE FUNCTION "public"."preview_coach_invitation"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  v_hash text;
  v_email text;
  v_status text;
  v_expires_at timestamptz;
  v_coach_status text;
  v_coach_name text;
begin
  -- Cheap shape guard on an ANON-callable function: it exists so a hostile
  -- caller cannot make us sha256 a megabyte per request. It is deliberately
  -- LOOSE (not pinned to the current 43-char base64url token) — a stricter
  -- check would turn a future change of token length into a silent, uniform
  -- "invalid_token" for every real invitation, which is precisely the quiet
  -- failure R7 forbids. The hash lookup is the authority, not this regex.
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{20,200}$' then
    return jsonb_build_object('valid', false, 'reason', 'invalid_token');
  end if;

  v_hash := public.coach_invite_token_hash(p_token);

  select i.email,
         i.status,
         i.expires_at,
         c.status,
         coalesce(nullif(btrim(c.display_name), ''), nullif(btrim(p.full_name), ''))
    into v_email, v_status, v_expires_at, v_coach_status, v_coach_name
  from public.coach_invitations i
  join public.coaches c on c.id = i.coach_id
  left join public.profiles p on p.id = c.user_id
  where i.invite_token_hash = v_hash;

  if not found then
    return jsonb_build_object('valid', false, 'reason', 'invalid_token');
  end if;

  -- Order matters: a revoked or already-used invitation says so even after it
  -- would also have expired, because the two situations call for different
  -- words on the page ("ask for a new one" vs "you already joined").
  if v_status = 'revoked' then
    return jsonb_build_object('valid', false, 'reason', 'revoked');
  end if;
  if v_status = 'accepted' then
    return jsonb_build_object('valid', false, 'reason', 'already_accepted');
  end if;
  if v_status = 'expired' or v_expires_at <= now() then
    return jsonb_build_object('valid', false, 'reason', 'expired');
  end if;
  if v_coach_status <> 'active' then
    return jsonb_build_object('valid', false, 'reason', 'coach_unavailable');
  end if;

  return jsonb_build_object(
    'valid', true,
    -- First name only. split_part on a null/empty name yields '', normalised
    -- back to NULL so the page renders its generic headline instead of an
    -- invitation from nobody.
    'coach_first_name', nullif(split_part(coalesce(v_coach_name, ''), ' ', 1), ''),
    'email', v_email
  );
end;
$_$;


ALTER FUNCTION "public"."preview_coach_invitation"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protocol_events_quick_tap_untick_only"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  -- Le service role et les lanes internes écrivent d'autres sources; ce trigger
  -- ne parle QUE des coches. `analyze-meal-photo-v1` doit continuer de poser
  -- `disqualified_reason` et `recognized` sur ses lignes photo.
  if old.source is distinct from 'quick_tap' then
    return new;
  end if;

  -- L'identité du fait ne se réécrit jamais.
  if new.user_id is distinct from old.user_id
     or new.source is distinct from old.source
     or new.local_date is distinct from old.local_date
     or new.occurred_at is distinct from old.occurred_at
     or new.slot_key is distinct from old.slot_key
     or new.source_message_id is distinct from old.source_message_id
     or new.food_group_ref is distinct from old.food_group_ref
     or new.substance_ref is distinct from old.substance_ref
     or new.quantity is distinct from old.quantity
     or new.unit is distinct from old.unit
     or new.evidence_weight is distinct from old.evidence_weight
  then
    raise exception
      'protocol_events: a quick_tap fact is ticked or unticked, never rewritten';
  end if;

  -- La seule bascule autorisée.
  if new.disqualified_reason is distinct from old.disqualified_reason
     and coalesce(new.disqualified_reason, 'food_not_eaten') <> 'food_not_eaten'
  then
    raise exception
      'protocol_events: a quick_tap may only toggle disqualified_reason between '
      'NULL and food_not_eaten (got %)', new.disqualified_reason;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."protocol_events_quick_tap_untick_only"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."purge_auth_user"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  delete from auth.users where id = p_user_id;
$$;


ALTER FUNCTION "public"."purge_auth_user"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."purge_expired_rate_limit_counters"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  delete from public.rate_limit_counters where expires_at < clock_timestamp();
$$;


ALTER FUNCTION "public"."purge_expired_rate_limit_counters"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."queue_access_ended_notification"("p_user_id" "uuid", "p_previous_access_tier" "text", "p_new_access_tier" "text" DEFAULT 'none'::"text") RETURNS "void"
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

  update public.pending_actions
  set
    status = 'cancelled',
    processed_at = now()
  where user_id = p_user_id
    and status = 'pending'
    and kind in ('access_ended_notification', 'access_reactivation_offer');

  insert into public.pending_actions (
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


ALTER FUNCTION "public"."queue_access_ended_notification"("p_user_id" "uuid", "p_previous_access_tier" "text", "p_new_access_tier" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recompute_coached_students_access_tier"("p_coach_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  r record;
  n integer := 0;
begin
  if p_coach_id is null then
    return 0;
  end if;
  for r in
    select cc.student_user_id as id
    from public.coach_clients cc
    where cc.coach_id = p_coach_id
      and cc.student_user_id is not null
  loop
    perform public.recompute_profile_access_tier(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;


ALTER FUNCTION "public"."recompute_coached_students_access_tier"("p_coach_id" "uuid") OWNER TO "postgres";


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
  has_inherited_seat boolean;
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

  -- W10 · INHERITED ENTITLEMENT. The seat is 'active' AND the coach is solvent.
  -- `seat_state` is NOT read here: a comped or trial seat grants access exactly
  -- like a billed one. Billing decides what we charge, never what the student
  -- is allowed to execute.
  select exists (
    select 1
    from public.coach_clients cc
    where cc.student_user_id = uid
      and cc.status = 'active'
      and public.keel_coach_is_solvent(cc.coach_id)
  ) into has_inherited_seat;

  if sub_active and sub_tier is not null
     and sub_tier in ('coach','system','alliance','architecte') then
    next_tier := sub_tier;
  elsif has_inherited_seat then
    next_tier := 'student';
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


CREATE OR REPLACE FUNCTION "public"."retract_student_safety_constraint"("p_constraint_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  update public.student_safety_constraints
     set status = 'retracted',
         retracted_at = now(),
         retracted_reason = left(coalesce(p_reason, ''), 500)
   where id = p_constraint_id
     and user_id = (select auth.uid())
     and status = 'active'
  returning id;
$$;


ALTER FUNCTION "public"."retract_student_safety_constraint"("p_constraint_id" "uuid", "p_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."retract_student_safety_constraint"("p_constraint_id" "uuid", "p_reason" "text") IS 'QA agent 4: seule voie d''écriture d''une rétractation. Volontairement plus étroite qu''une policy UPDATE, qui laisserait réécrire severity/allergen_ref (RLS ne restreint pas les colonnes) — donc désarmer une allergie medical.';



CREATE OR REPLACE FUNCTION "public"."retract_student_safety_constraints_for_user"("p_user_id" "uuid", "p_refs" "text"[], "p_reason" "text" DEFAULT NULL::"text") RETURNS SETOF "uuid"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  update public.student_safety_constraints
     set status = 'retracted',
         retracted_at = now(),
         retracted_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         updated_at = now()
   where user_id = p_user_id
     and status = 'active'
     and (
       lower(coalesce(allergen_ref, ''))     = any (select lower(r) from unnest(p_refs) r)
       or lower(coalesce(substance_ref, ''))    = any (select lower(r) from unnest(p_refs) r)
       or lower(coalesce(medication_class, '')) = any (select lower(r) from unnest(p_refs) r)
     )
  returning id;
$$;


ALTER FUNCTION "public"."retract_student_safety_constraints_for_user"("p_user_id" "uuid", "p_refs" "text"[], "p_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."retract_student_safety_constraints_for_user"("p_user_id" "uuid", "p_refs" "text"[], "p_reason" "text") IS 'Retire TOUTES les contraintes actives d''un élève portant l''une des références données. L''identité est un paramètre parce que le moteur de tour écrit en service_role, pour qui auth.uid() est NULL — la variante à auth.uid() ne matchait donc aucune ligne et la rétractation était un accusé fantôme. Réservée au service_role: aucun client ne l''appelle.';



CREATE OR REPLACE FUNCTION "public"."revoke_coach_access"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_student uuid := (select auth.uid());
  v_revoked integer;
begin
  -- R7: fail loudly rather than silently revoking nothing for a null identity.
  if v_student is null then
    raise exception 'revoke_coach_access: no authenticated user'
      using errcode = '42501';
  end if;

  update public.coach_clients
     set status = 'paused',
         consent_granted_at = null,
         updated_at = now()
   where student_user_id = v_student
     and status in ('invited','active');

  get diagnostics v_revoked = row_count;
  return v_revoked;
end;
$$;


ALTER FUNCTION "public"."revoke_coach_access"() OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."scheduling_access_eligible"("p_access_tier" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select lower(coalesce(p_access_tier, '')) in ('trial', 'alliance', 'architecte');
$$;


ALTER FUNCTION "public"."scheduling_access_eligible"("p_access_tier" "text") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."student_safety_constraints_retraction_only"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  -- L'identité de la ligne et de son auteur ne se réécrit jamais.
  if new.user_id is distinct from old.user_id then
    raise exception 'student_safety_constraints: user_id is immutable';
  end if;
  if new.declared_by is distinct from old.declared_by then
    raise exception
      'student_safety_constraints: declared_by is immutable (a declaration '
      'cannot change author)';
  end if;
  if new.kind is distinct from old.kind
     or new.allergen_ref is distinct from old.allergen_ref
     or new.substance_ref is distinct from old.substance_ref
     or new.medication_class is distinct from old.medication_class
  then
    raise exception
      'student_safety_constraints: a declaration is superseded, never rewritten '
      '(declare a new one and retract this one)';
  end if;

  -- Le seul changement d'état autorisé: active -> retracted.
  if new.status is distinct from old.status then
    if not (old.status = 'active' and new.status = 'retracted') then
      raise exception
        'student_safety_constraints: only active -> retracted is allowed (got % -> %)',
        old.status, new.status;
    end if;
    -- La CHECK de la table exige déjà `retracted_at`; on le pose plutôt que de
    -- faire échouer un client qui l'aurait oublié. Une rétractation refusée
    -- pour une raison de plomberie laisserait l'élève enfermé.
    if new.retracted_at is null then
      new.retracted_at := now();
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."student_safety_constraints_retraction_only"() OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."touch_student_coach_notes_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_student_coach_notes_updated_at"() OWNER TO "postgres";


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

  -- Marqueur de cascade: portee transaction (is_local=true), arme uniquement
  -- pendant l'UPDATE ci-dessous puis immediatement retire.
  perform set_config('sophia.allow_principle_unlock', '1', true);

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

  perform set_config('sophia.allow_principle_unlock', '0', true);
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


CREATE OR REPLACE FUNCTION "public"."write_student_meal_plan"("p_user_id" "uuid", "p_intent" "text", "p_starts_on" "date", "p_duration_days" smallint, "p_payload" "jsonb", "p_replaces" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("meal_id" "uuid", "retired_plan_id" "uuid", "truncated_plan_id" "uuid", "truncated_from" smallint, "truncated_to" smallint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_new_id uuid;
  v_retired uuid;
  v_trunc_id uuid;
  v_trunc_from smallint;
  v_trunc_to smallint;
  v_clash record;
begin
  if p_user_id is null then
    raise exception 'user_required';
  end if;
  -- R6: pas de branche par défaut. Une intention inconnue s'arrête ici plutôt
  -- que de retomber sur le comportement d'une autre.
  if p_intent not in ('replace_current', 'prepare_next') then
    raise exception 'unknown_intent: %', p_intent;
  end if;
  if p_duration_days is null or p_duration_days not between 1 and 7 then
    raise exception 'bad_duration: %', p_duration_days;
  end if;
  if p_starts_on is null then
    raise exception 'starts_on_required';
  end if;

  -- Sérialise les écritures d'un même élève. Deux onglets qui génèrent en même
  -- temps se disputent la même fenêtre, et l'un des deux doit voir l'état que
  -- l'autre a laissé — pas l'état d'avant.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  -- ── LA LIGNE EXPLICITEMENT REMPLACÉE ──────────────────────────────────
  if p_intent = 'replace_current' then
    if p_replaces is null then
      raise exception 'replaces_required';
    end if;
    update public.student_generated_meals
       set retired_at = now()
     where id = p_replaces
       and user_id = p_user_id
       -- Le prédicat EST la garde de concurrence: deux remplacements qui
       -- courent sur la même ligne, un seul la déplace.
       and retired_at is null
    returning id into v_retired;
    if v_retired is null then
      raise exception 'plan_not_replaceable: %', p_replaces;
    end if;
  end if;

  -- ── CE QUI RESTE ET QUI CHEVAUCHE ─────────────────────────────────────
  -- Un plan vivant qui commence AVANT la nouvelle fenêtre est raccourci: c'est
  -- la vérité littérale, l'élève vient de dire que ces jours-là appartiennent
  -- au nouveau plan.
  --
  -- Un plan vivant qui commence LE MÊME JOUR ou APRÈS ne peut pas être
  -- raccourci vers une fenêtre positive. Le tronquer à zéro le ferait
  -- disparaître en silence — on refuse, en le nommant, pour que l'appelant le
  -- retire explicitement.
  for v_clash in
    select id, starts_on, duration_days
      from public.student_generated_meals
     where user_id = p_user_id
       and retired_at is null
       -- Non qualifie: daterange vit dans pg_catalog, qui reste implicitement
       -- dans le chemin meme avec un search_path vide. Le prefixer public. le
       -- rend introuvable.
       and daterange(starts_on, (starts_on + duration_days))
           && daterange(p_starts_on, (p_starts_on + p_duration_days))
     order by starts_on
  loop
    if v_clash.starts_on >= p_starts_on then
      raise exception 'plan_overlaps_existing: %', v_clash.id;
    end if;

    v_trunc_id := v_clash.id;
    v_trunc_from := v_clash.duration_days;
    v_trunc_to := (p_starts_on - v_clash.starts_on)::smallint;

    update public.student_generated_meals
       set duration_days = v_trunc_to,
           -- Tracé sur la ligne, comme `generated_from.issues`: lisible en SQL,
           -- trois jours plus tard, par quelqu'un qui n'a pas fait l'appel.
           -- `from_duration_days` achète une vraie branche — si l'élève
           -- remplace ensuite le plan suivant par un qui démarre plus tard, on
           -- sait quelle fenêtre restituer.
           generated_from = coalesce(generated_from, '{}'::jsonb)
             || jsonb_build_object('truncated_by', jsonb_build_object(
                  'from_duration_days', v_trunc_from,
                  'to_duration_days', v_trunc_to,
                  'at', now()
                ))
     where id = v_clash.id;
  end loop;

  -- ── LE PLAN NEUF ──────────────────────────────────────────────────────
  -- `scope` est DÉRIVÉ ici et n'est plus une entrée: une ligne `scope='day'`
  -- portant une fenêtre de sept jours était possible, et ne l'est plus.
  insert into public.student_generated_meals (
    user_id, starts_on, duration_days, scope, mode, meal_slot, servings,
    context, preferences, pantry, dishes, preparations, cooking_sessions,
    shopping_list, generated_from, content_locale
  )
  values (
    p_user_id,
    p_starts_on,
    p_duration_days,
    case when p_duration_days = 1 then 'day' else 'several_days' end,
    p_payload ->> 'mode',
    nullif(p_payload ->> 'meal_slot', ''),
    coalesce((p_payload ->> 'servings')::int, 1),
    nullif(p_payload ->> 'context', ''),
    nullif(p_payload ->> 'preferences', ''),
    coalesce(p_payload -> 'pantry', '[]'::jsonb),
    coalesce(p_payload -> 'dishes', '[]'::jsonb),
    coalesce(p_payload -> 'preparations', '[]'::jsonb),
    coalesce(p_payload -> 'cooking_sessions', '[]'::jsonb),
    coalesce(p_payload -> 'shopping_list', '[]'::jsonb),
    coalesce(p_payload -> 'generated_from', '{}'::jsonb)
      || case when v_trunc_id is null then '{}'::jsonb
              else jsonb_build_object('truncates', jsonb_build_object(
                     'plan_id', v_trunc_id, 'days_taken', v_trunc_from - v_trunc_to))
         end,
    coalesce(p_payload ->> 'content_locale', 'en')
  )
  returning id into v_new_id;

  return query select v_new_id, v_retired, v_trunc_id, v_trunc_from, v_trunc_to;
end;
$$;


ALTER FUNCTION "public"."write_student_meal_plan"("p_user_id" "uuid", "p_intent" "text", "p_starts_on" "date", "p_duration_days" smallint, "p_payload" "jsonb", "p_replaces" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."account_security_confirmations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "operation_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "consumed_at" timestamp with time zone
);


ALTER TABLE "public"."account_security_confirmations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_config" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."card_armings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "student_card_id" "uuid" NOT NULL,
    "trigger_kind" "text" NOT NULL,
    "trigger_ref_id" "uuid" NOT NULL,
    "local_date" "date" NOT NULL,
    "slot_key" "text",
    "event_at" timestamp with time zone NOT NULL,
    "arm_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "delivered_at" timestamp with time zone,
    "delivery_channel" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "card_armings_before_the_event" CHECK (("arm_at" < "event_at")),
    CONSTRAINT "card_armings_delivery_channel_check" CHECK (("delivery_channel" = ANY (ARRAY['whatsapp'::"text", 'app'::"text", 'chat'::"text"]))),
    CONSTRAINT "card_armings_delivery_complete" CHECK ((("status" <> 'delivered'::"text") OR (("delivered_at" IS NOT NULL) AND ("delivery_channel" IS NOT NULL)))),
    CONSTRAINT "card_armings_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'delivered'::"text", 'skipped'::"text", 'expired'::"text"]))),
    CONSTRAINT "card_armings_trigger_kind_check" CHECK (("trigger_kind" = ANY (ARRAY['planned_deviation'::"text", 'upcoming_context'::"text"])))
);


ALTER TABLE "public"."card_armings" OWNER TO "postgres";


COMMENT ON TABLE "public"."card_armings" IS 'W8: ledger proving a card was armed BEFORE the event. arm_at < event_at is a CHECK, not a convention.';



CREATE TABLE IF NOT EXISTS "public"."card_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_scope" "text" NOT NULL,
    "coach_id" "uuid",
    "template_key" "text" NOT NULL,
    "card_kind" "text" NOT NULL,
    "activity_class" "text" DEFAULT 'nutrition'::"text" NOT NULL,
    "trigger_slot_key" "text",
    "trigger_contexts" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "trigger_time_bucket" "text" DEFAULT 'any'::"text" NOT NULL,
    "arm_lead_minutes" integer DEFAULT 180 NOT NULL,
    "title" "text" NOT NULL,
    "purpose" "text" NOT NULL,
    "produces" "text" NOT NULL,
    "usage" "text" NOT NULL,
    "body_template" "text" NOT NULL,
    "variables" "jsonb" NOT NULL,
    "content_locale" "text" NOT NULL,
    "legacy_technique_key" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "card_templates_arm_lead_minutes_check" CHECK ((("arm_lead_minutes" >= 15) AND ("arm_lead_minutes" <= 1440))),
    CONSTRAINT "card_templates_body_slots_declared" CHECK ("public"."keel_card_body_slots_declared"("body_template", "variables")),
    CONSTRAINT "card_templates_body_template_check" CHECK (("btrim"("body_template") <> ''::"text")),
    CONSTRAINT "card_templates_card_kind_check" CHECK (("card_kind" = ANY (ARRAY['defense'::"text", 'attack'::"text"]))),
    CONSTRAINT "card_templates_owner_scope_check" CHECK (("owner_scope" = ANY (ARRAY['global'::"text", 'coach'::"text"]))),
    CONSTRAINT "card_templates_produces_check" CHECK (("btrim"("produces") <> ''::"text")),
    CONSTRAINT "card_templates_purpose_check" CHECK (("btrim"("purpose") <> ''::"text")),
    CONSTRAINT "card_templates_scope_owner" CHECK (((("owner_scope" = 'global'::"text") AND ("coach_id" IS NULL)) OR (("owner_scope" = 'coach'::"text") AND ("coach_id" IS NOT NULL)))),
    CONSTRAINT "card_templates_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'archived'::"text"]))),
    CONSTRAINT "card_templates_template_key_check" CHECK (("template_key" ~ '^[a-z][a-z0-9_]*$'::"text")),
    CONSTRAINT "card_templates_title_check" CHECK (("btrim"("title") <> ''::"text")),
    CONSTRAINT "card_templates_trigger_contexts_check" CHECK (("trigger_contexts" <@ ARRAY['restaurant'::"text", 'social'::"text", 'travel'::"text", 'family'::"text", 'work'::"text", 'other'::"text"])),
    CONSTRAINT "card_templates_trigger_time_bucket_check" CHECK (("trigger_time_bucket" = ANY (ARRAY['morning'::"text", 'midday'::"text", 'afternoon'::"text", 'evening'::"text", 'night'::"text", 'any'::"text"]))),
    CONSTRAINT "card_templates_usage_check" CHECK (("btrim"("usage") <> ''::"text")),
    CONSTRAINT "card_templates_variables_shape" CHECK ("public"."keel_card_variables_valid"("variables"))
);


ALTER TABLE "public"."card_templates" OWNER TO "postgres";


COMMENT ON TABLE "public"."card_templates" IS 'W8: THE single card catalogue. Replaces three divergent hardcoded copies (generate-attack-card-v1, attackTechniquePreviews.ts, AttackCards.tsx).';



COMMENT ON COLUMN "public"."card_templates"."legacy_technique_key" IS 'Join key back to the retired French-spelled technique keys stored in user_attack_cards.content.';



CREATE TABLE IF NOT EXISTS "public"."card_wins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "student_card_id" "uuid" NOT NULL,
    "arming_id" "uuid",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "local_date" "date" NOT NULL,
    "slot_key" "text",
    "outcome" "text" NOT NULL,
    "source" "text" NOT NULL,
    "source_message_id" "text",
    "note" "text",
    "content_locale" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "card_wins_outcome_check" CHECK (("outcome" = ANY (ARRAY['held'::"text", 'slipped'::"text", 'not_used'::"text"]))),
    CONSTRAINT "card_wins_source_check" CHECK (("source" = ANY (ARRAY['chat'::"text", 'whatsapp'::"text", 'app'::"text", 'keyword'::"text"])))
);


ALTER TABLE "public"."card_wins" OWNER TO "postgres";


COMMENT ON TABLE "public"."card_wins" IS 'W8: append-only card facts. CONTRACT non-input: never read by the adherence evaluator.';



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


CREATE TABLE IF NOT EXISTS "public"."coach_access_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "student_user_id" "uuid" NOT NULL,
    "surface" "text" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."coach_access_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_billing_periods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "period_month" "date" NOT NULL,
    "active_seat_count" integer DEFAULT 0 NOT NULL,
    "linked_seat_count" integer DEFAULT 0 NOT NULL,
    "threshold_at_computation" integer NOT NULL,
    "stripe_subscription_id" "text",
    "stripe_seat_item_id" "text",
    "pushed_quantity" integer,
    "pushed_at" timestamp with time zone,
    "push_error" "text",
    "computed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "coach_billing_periods_active_within_linked" CHECK (("active_seat_count" <= "linked_seat_count")),
    CONSTRAINT "coach_billing_periods_counts_nonneg" CHECK ((("active_seat_count" >= 0) AND ("linked_seat_count" >= 0))),
    CONSTRAINT "coach_billing_periods_month_is_first_of_month" CHECK (("period_month" = ("date_trunc"('month'::"text", ("period_month")::timestamp with time zone))::"date"))
);


ALTER TABLE "public"."coach_billing_periods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_broadcasts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "content_locale" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "started_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    "cursor_user_id" "uuid",
    "delivered_count" integer DEFAULT 0 NOT NULL,
    "skipped_count" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "coach_broadcasts_body_length" CHECK ((("char_length"("btrim"("body")) >= 1) AND ("char_length"("btrim"("body")) <= 1000))),
    CONSTRAINT "coach_broadcasts_finished_needs_start" CHECK ((("finished_at" IS NULL) OR ("started_at" IS NOT NULL)))
);


ALTER TABLE "public"."coach_broadcasts" OWNER TO "postgres";


COMMENT ON TABLE "public"."coach_broadcasts" IS 'Un message du coach à TOUTE sa cohorte. Écrit par keel_coach_send_broadcast, diffusé par keel-coach-broadcast-v1 au curseur. Cadence: 1 par semaine et par coach, tenue par coach_broadcasts_one_per_week_idx.';



CREATE TABLE IF NOT EXISTS "public"."coach_clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "student_user_id" "uuid",
    "invited_email" "text",
    "status" "text" DEFAULT 'invited'::"text" NOT NULL,
    "consent_granted_at" timestamp with time zone,
    "seat_state" "text" DEFAULT 'trial'::"text" NOT NULL,
    "started_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cohort_id" "uuid",
    "scheduled_end_at" timestamp with time zone,
    "billing_interval" "text" DEFAULT 'month'::"text" NOT NULL,
    CONSTRAINT "coach_clients_active_requires_consent" CHECK ((("status" <> 'active'::"text") OR ("consent_granted_at" IS NOT NULL))),
    CONSTRAINT "coach_clients_billing_interval_check" CHECK (("billing_interval" = ANY (ARRAY['month'::"text", 'year'::"text"]))),
    CONSTRAINT "coach_clients_invited_email_check" CHECK (("invited_email" = "lower"("invited_email"))),
    CONSTRAINT "coach_clients_seat_state_check" CHECK (("seat_state" = ANY (ARRAY['billed'::"text", 'trial'::"text", 'free'::"text"]))),
    CONSTRAINT "coach_clients_status_check" CHECK (("status" = ANY (ARRAY['invited'::"text", 'active'::"text", 'paused'::"text", 'ended'::"text"])))
);


ALTER TABLE "public"."coach_clients" OWNER TO "postgres";


COMMENT ON COLUMN "public"."coach_clients"."cohort_id" IS 'PIVOT §1.7: promo de l''élève. NULL = suivi 1:1 hors cohorte.';



COMMENT ON COLUMN "public"."coach_clients"."scheduled_end_at" IS 'Instant à partir duquel ce siège doit passer en ''paused'' (frontière de mois UTC, celle de keel_coach_seat_ledger). NULL = aucune désactivation programmée. Posé par keel_coach_schedule_client_end, effacé par keel_coach_cancel_client_end, consommé par keel_apply_scheduled_client_ends.';



COMMENT ON COLUMN "public"."coach_clients"."billing_interval" IS 'Sur quel article Stripe ce siège est compté: ''month'' (7 €/mois) ou ''year'' (6 €/mois prépayé). N''entre PAS dans is_active_seat — un siège est facturable parce que le lien est actif, cet axe dit seulement à quel tarif. Défaut ''month'': le plus cher et le moins engageant, donc l''oubli est sûr.';



CREATE TABLE IF NOT EXISTS "public"."coach_doctrine_compilations" (
    "doctrine_id" "uuid" NOT NULL,
    "goal" "text" NOT NULL,
    "compiled_prompt" "text" NOT NULL,
    "compiled_prompt_hash" "text" NOT NULL,
    "compiled_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "coach_doctrine_compilations_goal_check" CHECK (("goal" = ANY (ARRAY['default'::"text", 'fat_loss'::"text", 'muscle_gain'::"text", 'recomposition'::"text", 'performance'::"text", 'health'::"text", 'maintenance'::"text"])))
);


ALTER TABLE "public"."coach_doctrine_compilations" OWNER TO "postgres";


COMMENT ON TABLE "public"."coach_doctrine_compilations" IS 'Lot doctrine-by-goal: le bloc compilé d''une doctrine POUR UN OBJECTIF. Produit dérivé de la ligne publiée, jamais une seconde doctrine. Le tour recompile depuis coach_doctrines; cette table est l''artefact stocké et la surface de mesure de la fragmentation du cache.';



CREATE TABLE IF NOT EXISTS "public"."coach_doctrines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "version" integer NOT NULL,
    "beliefs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "forbidden" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "vocabulary" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "arbitrations" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "voice" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "compiled_prompt" "text",
    "compiled_prompt_hash" "text",
    "content_locale" "text" NOT NULL,
    "published_at" timestamp with time zone,
    "published_by" "uuid",
    "created_from_version" integer,
    "change_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "foods" "jsonb" DEFAULT '{"discouraged": [], "recommended": []}'::"jsonb" NOT NULL,
    "qa" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    CONSTRAINT "coach_doctrines_arbitrations_goal_scope_check" CHECK ("public"."keel_doctrine_goal_scope_ok"("arbitrations")),
    CONSTRAINT "coach_doctrines_beliefs_goal_scope_check" CHECK ("public"."keel_doctrine_goal_scope_ok"("beliefs")),
    CONSTRAINT "coach_doctrines_foods_shape_check" CHECK ((("jsonb_typeof"("foods") = 'object'::"text") AND ((NOT ("foods" ? 'recommended'::"text")) OR ("jsonb_typeof"(("foods" -> 'recommended'::"text")) = 'array'::"text")) AND ((NOT ("foods" ? 'discouraged'::"text")) OR ("jsonb_typeof"(("foods" -> 'discouraged'::"text")) = 'array'::"text")))),
    CONSTRAINT "coach_doctrines_qa_shape_check" CHECK (("jsonb_typeof"("qa") = 'array'::"text")),
    CONSTRAINT "coach_doctrines_version_check" CHECK (("version" >= 1))
);


ALTER TABLE "public"."coach_doctrines" OWNER TO "postgres";


COMMENT ON TABLE "public"."coach_doctrines" IS 'PIVOT §3.7: croyances/INTERDITS/vocabulaire/arbitrages/voix, versionnés. Une seule version publiée par coach. forbidden alimente le double verrou §3.3.';



COMMENT ON COLUMN "public"."coach_doctrines"."beliefs" IS 'PIVOT §3.7: [{ "claim", "rationale", "goal_scope": [] }]. goal_scope absent ou vide = la conviction vaut pour TOUS les élèves du coach.';



COMMENT ON COLUMN "public"."coach_doctrines"."forbidden" IS 'LES INTERDITS. [{ "token", "surface_forms", "reason", "instead" }]. GLOBAUX PAR CONSTRUCTION: un interdit qui ne vaudrait que pour certains élèves est une préférence. Le verrou déterministe §3.3 lit cette liste entière quelle que soit la variante servie.';



COMMENT ON COLUMN "public"."coach_doctrines"."arbitrations" IS 'PIVOT §1.4: [{ "situation", "coach_answer", "source", "goal_scope": [] }]. C''est le champ le plus souvent ciblé: « qu''est-ce que je réponds quand on ne perd plus » n''existe que pour la perte de gras.';



COMMENT ON COLUMN "public"."coach_doctrines"."foods" IS 'Les aliments que le coach conseille et déconseille. Forme: {"recommended":[{"term":"...","reason":"..."|null}], "discouraged":[{"term":"...","surface_forms":["..."],"reason":"..."|null}]}. Les `discouraged` alimentent le verrou de sortie au même titre que les interdits: un aliment déconseillé SUGGÉRÉ est une contradiction publique du coach. Les `surface_forms` portent les formulations réelles — sans elles le verrou ne matche rien dans de la prose.';



COMMENT ON COLUMN "public"."coach_doctrines"."qa" IS 'Les questions/réponses du coach, structurées à partir de sa prose. Forme: [{"question":"...","answer":"...","source":"interview"|"coach_edit"|null}]. DISTINCT de `arbitrations`: une arbitration est SITUATIONNELLE (un élève craque un soir, le coach répond) et sert de few-shot de ton; un Q/R est FACTUEL (est-ce que je peux boire du café le matin) et sert de contenu de méthode. Les confondre transforme une réponse de réconfort en règle appliquée à tous les tours.';



CREATE TABLE IF NOT EXISTS "public"."coach_document_chunks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "ordinal" integer NOT NULL,
    "page_number" integer NOT NULL,
    "text" "text" NOT NULL,
    "char_count" integer NOT NULL,
    CONSTRAINT "coach_document_chunks_char_count_check" CHECK (("char_count" > 0)),
    CONSTRAINT "coach_document_chunks_ordinal_check" CHECK (("ordinal" >= 0)),
    CONSTRAINT "coach_document_chunks_page_number_check" CHECK (("page_number" >= 1)),
    CONSTRAINT "coach_document_chunks_text_check" CHECK ((("length"("btrim"("text")) >= 1) AND ("length"("btrim"("text")) <= 4000)))
);


ALTER TABLE "public"."coach_document_chunks" OWNER TO "postgres";


COMMENT ON TABLE "public"."coach_document_chunks" IS 'Le texte du document, découpé, ancré à sa page. Corpus de lecture — aucune clé de conviction, aucun compilateur ne le lit.';



CREATE TABLE IF NOT EXISTS "public"."coach_document_citations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "document_id" "uuid" NOT NULL,
    "chunk_id" "uuid",
    "entry_kind" "text" NOT NULL,
    "entry_key" "text" NOT NULL,
    "quote" "text" NOT NULL,
    "page_number" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "coach_document_citations_entry_key_check" CHECK ((("length"("btrim"("entry_key")) >= 1) AND ("length"("btrim"("entry_key")) <= 200))),
    CONSTRAINT "coach_document_citations_entry_kind_check" CHECK (("entry_kind" = ANY (ARRAY['belief'::"text", 'forbidden'::"text", 'vocabulary'::"text", 'arbitration'::"text", 'qa'::"text", 'food'::"text"]))),
    CONSTRAINT "coach_document_citations_located_knows_page" CHECK ((("chunk_id" IS NULL) OR ("page_number" IS NOT NULL))),
    CONSTRAINT "coach_document_citations_page_number_check" CHECK ((("page_number" IS NULL) OR ("page_number" >= 1))),
    CONSTRAINT "coach_document_citations_quote_check" CHECK ((("length"("btrim"("quote")) >= 1) AND ("length"("btrim"("quote")) <= 400)))
);


ALTER TABLE "public"."coach_document_citations" OWNER TO "postgres";


COMMENT ON TABLE "public"."coach_document_citations" IS 'Ce qui relie une entrée extraite à la phrase du document qui la justifie. chunk_id NULL sur un document `extracted` = citation introuvable dans le texte.';



CREATE TABLE IF NOT EXISTS "public"."coach_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "filename" "text",
    "byte_size" integer NOT NULL,
    "page_count" integer NOT NULL,
    "content_locale" "text" NOT NULL,
    "content_sha256" "text" NOT NULL,
    "storage_path" "text",
    "text_status" "text" NOT NULL,
    "text_chars" integer DEFAULT 0 NOT NULL,
    "chunk_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "coach_documents_byte_size_check" CHECK (("byte_size" > 0)),
    CONSTRAINT "coach_documents_chunk_count_check" CHECK (("chunk_count" >= 0)),
    CONSTRAINT "coach_documents_content_locale_check" CHECK ((("length"("btrim"("content_locale")) >= 2) AND ("length"("btrim"("content_locale")) <= 20))),
    CONSTRAINT "coach_documents_content_sha256_check" CHECK (("content_sha256" ~ '^[0-9a-f]{64}$'::"text")),
    CONSTRAINT "coach_documents_filename_check" CHECK ((("filename" IS NULL) OR (("length"("btrim"("filename")) >= 1) AND ("length"("btrim"("filename")) <= 200)))),
    CONSTRAINT "coach_documents_page_count_check" CHECK (("page_count" > 0)),
    CONSTRAINT "coach_documents_storage_path_check" CHECK ((("storage_path" IS NULL) OR (("length"("btrim"("storage_path")) >= 1) AND ("length"("btrim"("storage_path")) <= 400)))),
    CONSTRAINT "coach_documents_text_chars_check" CHECK (("text_chars" >= 0)),
    CONSTRAINT "coach_documents_text_status_check" CHECK (("text_status" = ANY (ARRAY['extracted'::"text", 'no_text_layer'::"text", 'extraction_failed'::"text"]))),
    CONSTRAINT "coach_documents_text_status_matches_content" CHECK (((("text_status" = 'extracted'::"text") AND ("chunk_count" > 0) AND ("text_chars" > 0)) OR (("text_status" <> 'extracted'::"text") AND ("chunk_count" = 0) AND ("text_chars" = 0))))
);


ALTER TABLE "public"."coach_documents" OWNER TO "postgres";


COMMENT ON TABLE "public"."coach_documents" IS 'Le document source d''un coach (ebook, manuel, FAQ), gardé pour que ce que l''extraction a ignoré ne soit pas perdu. Rien ici n''atteint un élève.';



CREATE TABLE IF NOT EXISTS "public"."coach_food_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "protocol_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "food_item_ref" "text",
    "label" "text" NOT NULL,
    "food_group_ref" "text" NOT NULL,
    "stance" "text" NOT NULL,
    "frequency_template" "text",
    "direction" "text",
    "amount" numeric,
    "amount_unit" "text",
    "period" "text",
    "cutoff_local" time without time zone,
    "slot_key" "text",
    "why" "text",
    "why_source" "text" DEFAULT 'coach'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "coach_food_items_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "coach_food_items_amount_unit_check" CHECK (("amount_unit" = ANY (ARRAY['portion'::"text", 'g'::"text", 'ml'::"text", 'unit'::"text"]))),
    CONSTRAINT "coach_food_items_direction_check" CHECK (("direction" = ANY (ARRAY['at_least'::"text", 'at_most'::"text"]))),
    CONSTRAINT "coach_food_items_frequency_template_check" CHECK (("frequency_template" = ANY (ARRAY['amount_per_period'::"text", 'every_meal'::"text", 'not_after'::"text", 'at_slot'::"text"]))),
    CONSTRAINT "coach_food_items_label_check" CHECK ((("length"("btrim"("label")) >= 1) AND ("length"("btrim"("label")) <= 80))),
    CONSTRAINT "coach_food_items_period_check" CHECK (("period" = ANY (ARRAY['day'::"text", 'week'::"text"]))),
    CONSTRAINT "coach_food_items_slots_match_frequency" CHECK (((("frequency_template" IS NULL) AND ("direction" IS NULL) AND ("amount" IS NULL) AND ("amount_unit" IS NULL) AND ("period" IS NULL) AND ("cutoff_local" IS NULL) AND ("slot_key" IS NULL)) OR (("frequency_template" = 'amount_per_period'::"text") AND ("direction" IS NOT NULL) AND ("amount" IS NOT NULL) AND ("amount_unit" IS NOT NULL) AND ("period" IS NOT NULL) AND ("cutoff_local" IS NULL) AND ("slot_key" IS NULL)) OR (("frequency_template" = 'every_meal'::"text") AND ("direction" IS NULL) AND ("amount" IS NULL) AND ("amount_unit" IS NULL) AND ("period" IS NULL) AND ("cutoff_local" IS NULL) AND ("slot_key" IS NULL)) OR (("frequency_template" = 'not_after'::"text") AND ("cutoff_local" IS NOT NULL) AND ("direction" IS NULL) AND ("amount" IS NULL) AND ("amount_unit" IS NULL) AND ("period" IS NULL) AND ("slot_key" IS NULL)) OR (("frequency_template" = 'at_slot'::"text") AND ("slot_key" IS NOT NULL) AND ("direction" IS NULL) AND ("amount" IS NULL) AND ("amount_unit" IS NULL) AND ("period" IS NULL) AND ("cutoff_local" IS NULL)))),
    CONSTRAINT "coach_food_items_stance_check" CHECK (("stance" = ANY (ARRAY['encouraged'::"text", 'discouraged'::"text", 'excluded'::"text"]))),
    CONSTRAINT "coach_food_items_why_source_check" CHECK (("why_source" = ANY (ARRAY['seeded'::"text", 'ai'::"text", 'coach'::"text"])))
);


ALTER TABLE "public"."coach_food_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_food_proposals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "term" "text" NOT NULL,
    "quote" "text" NOT NULL,
    "content_locale" "text" NOT NULL,
    "stance" "text" NOT NULL,
    "food_group_ref" "text" NOT NULL,
    "food_item_ref" "text",
    "source_label" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    CONSTRAINT "coach_food_proposals_content_locale_check" CHECK ((("length"("btrim"("content_locale")) >= 2) AND ("length"("btrim"("content_locale")) <= 20))),
    CONSTRAINT "coach_food_proposals_quote_check" CHECK ((("length"("btrim"("quote")) >= 1) AND ("length"("btrim"("quote")) <= 400))),
    CONSTRAINT "coach_food_proposals_resolved_at_matches_status" CHECK (((("status" = 'pending'::"text") AND ("resolved_at" IS NULL)) OR (("status" <> 'pending'::"text") AND ("resolved_at" IS NOT NULL)))),
    CONSTRAINT "coach_food_proposals_source_label_check" CHECK ((("source_label" IS NULL) OR (("length"("btrim"("source_label")) >= 1) AND ("length"("btrim"("source_label")) <= 200)))),
    CONSTRAINT "coach_food_proposals_stance_check" CHECK (("stance" = ANY (ARRAY['encouraged'::"text", 'discouraged'::"text", 'excluded'::"text"]))),
    CONSTRAINT "coach_food_proposals_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'dismissed'::"text"]))),
    CONSTRAINT "coach_food_proposals_term_check" CHECK ((("length"("btrim"("term")) >= 1) AND ("length"("btrim"("term")) <= 80)))
);


ALTER TABLE "public"."coach_food_proposals" OWNER TO "postgres";


COMMENT ON TABLE "public"."coach_food_proposals" IS 'Sas entre la lecture d''un document du coach et sa méthode. Rien ici n''atteint un élève: le chemin passe par coach_food_items, et il commence par un clic du coach.';



CREATE TABLE IF NOT EXISTS "public"."coach_food_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "protocol_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "food_group_ref" "text" NOT NULL,
    "stance" "text" NOT NULL,
    "goal_scope" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "rationale" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "coach_food_rules_goal_scope_check" CHECK (("goal_scope" <@ ARRAY['fat_loss'::"text", 'muscle_gain'::"text", 'recomposition'::"text", 'performance'::"text", 'health'::"text", 'maintenance'::"text"])),
    CONSTRAINT "coach_food_rules_stance_check" CHECK (("stance" = ANY (ARRAY['encouraged'::"text", 'discouraged'::"text", 'excluded'::"text"])))
);


ALTER TABLE "public"."coach_food_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "invite_token_hash" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "accepted_at" timestamp with time zone,
    CONSTRAINT "coach_invitations_email_check" CHECK (("email" = "lower"("email"))),
    CONSTRAINT "coach_invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'expired'::"text", 'revoked'::"text"])))
);


ALTER TABLE "public"."coach_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_protocols" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "version" integer NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "content_locale" "text" NOT NULL,
    "published_at" timestamp with time zone,
    "published_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "coach_protocols_published_needs_timestamp" CHECK ((("status" <> 'published'::"text") OR ("published_at" IS NOT NULL))),
    CONSTRAINT "coach_protocols_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'superseded'::"text"]))),
    CONSTRAINT "coach_protocols_version_check" CHECK (("version" >= 1))
);


ALTER TABLE "public"."coach_protocols" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."coach_student_contact" WITH ("security_invoker"='off') AS
 SELECT "user_id" AS "student_user_id",
    "max"("created_at") FILTER (WHERE ("role" = 'user'::"public"."chat_role")) AS "last_inbound_at",
    "count"(*) FILTER (WHERE (("role" = 'user'::"public"."chat_role") AND ("created_at" >= ("now"() - '7 days'::interval)))) AS "inbound_count_7d"
   FROM "public"."chat_messages" "m"
  WHERE (("user_id" = ANY (( SELECT "public"."coached_student_ids"() AS "coached_student_ids")::"uuid"[])) AND ("created_at" >= "public"."coach_student_history_floor"("user_id")))
  GROUP BY "user_id";


ALTER VIEW "public"."coach_student_contact" OWNER TO "postgres";


COMMENT ON VIEW "public"."coach_student_contact" IS 'PIVOT §1.4: WHEN a student last spoke, never WHAT they said. Tier B column-allowlist view (PostgREST grants are per-role, so a policy cannot hide chat_messages.content from a coach). No content, no message ids.';



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
    "access_tier" "text" DEFAULT 'none'::"text" NOT NULL,
    "locale" "text" DEFAULT 'fr-FR'::"text" NOT NULL,
    "tz_follow_device" boolean DEFAULT false NOT NULL,
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
    "account_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "purge_at" timestamp with time zone,
    "deletion_requested_at" timestamp with time zone,
    "pre_deletion_proactive_muted" boolean,
    "keel_role" "text",
    "display_unit_system" "text" DEFAULT 'metric'::"text" NOT NULL,
    "country" "text",
    "chat_last_inbound_at" timestamp with time zone,
    "proactive_muted_at" timestamp with time zone,
    "chat_last_outbound_at" timestamp with time zone,
    "chat_last_read_at" timestamp with time zone,
    CONSTRAINT "profiles_access_tier_check" CHECK (("access_tier" = ANY (ARRAY['none'::"text", 'trial'::"text", 'coach'::"text", 'student'::"text", 'system'::"text", 'alliance'::"text", 'architecte'::"text"]))),
    CONSTRAINT "profiles_account_status_check" CHECK (("account_status" = ANY (ARRAY['active'::"text", 'deletion_pending'::"text"]))),
    CONSTRAINT "profiles_country_iso3166_check" CHECK ((("country" IS NULL) OR ("country" ~ '^[A-Z]{2}$'::"text"))),
    CONSTRAINT "profiles_display_unit_system_check" CHECK (("display_unit_system" = ANY (ARRAY['metric'::"text", 'imperial'::"text"]))),
    CONSTRAINT "profiles_gender_check" CHECK (("gender" = ANY (ARRAY['male'::"text", 'female'::"text", 'other'::"text"]))),
    CONSTRAINT "profiles_keel_role_check" CHECK (("keel_role" = ANY (ARRAY['student'::"text", 'coach'::"text"]))),
    CONSTRAINT "profiles_whatsapp_bilan_missed_streak_check" CHECK ((("whatsapp_bilan_missed_streak" >= 0) AND ("whatsapp_bilan_missed_streak" <= 30))),
    CONSTRAINT "profiles_whatsapp_bilan_winback_step_check" CHECK ((("whatsapp_bilan_winback_step" >= 0) AND ("whatsapp_bilan_winback_step" <= 3)))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."phone_number" IS 'GELÉE (2026-08-05, fin du téléphone). Le produit a quitté WhatsApp: le numéro était l''identité du compte, il ne l''est plus. Plus aucun chemin élève ni coach ne l''alimente. Conservée telle quelle car elle porte l''historique B2C. Ne pas droper sans les trois épreuves d''absence (code applicatif, pg_proc.prosrc, vues).';



COMMENT ON COLUMN "public"."profiles"."whatsapp_opted_in" IS 'GELÉE À false (2026-08-05). Aucun chemin ne la passe à true depuis le pivot de-whatsapp. Elle était le second terme de la garde anti-collision de handle_new_user(), qui ne pouvait donc plus jamais être vrai: ce terme mort a été retiré de la garde (migration 20260805091000), le terme vivant (phone_verified_at) y reste armé.';



COMMENT ON COLUMN "public"."profiles"."whatsapp_last_inbound_at" IS 'GELÉE (de-whatsapp). Remplacée par chat_last_inbound_at, qui est la seule source de « une conversation est-elle active ? ».';



COMMENT ON COLUMN "public"."profiles"."whatsapp_last_outbound_at" IS 'GELÉE (de-whatsapp). Remplacée par chat_last_outbound_at. Plus aucun writer.';



COMMENT ON COLUMN "public"."profiles"."whatsapp_opted_out_at" IS 'GELÉE (de-whatsapp). Opt-out META. Repris une fois dans proactive_muted_at par la migration 20260804121000; c''est cette dernière qui fait foi.';



COMMENT ON COLUMN "public"."profiles"."phone_verified_at" IS 'Historique B2C. VIVANTE en lecture: c''est le seul terme encore utile de la garde anti-collision de handle_new_user() et de is_verified_phone_in_use(). Plus aucun chemin ne l''écrit.';



COMMENT ON COLUMN "public"."profiles"."install_app_dismissed_until" IS 'When the install app prompt may be shown again after a user postpones it.';



COMMENT ON COLUMN "public"."profiles"."install_app_marked_installed_at" IS 'When the user explicitly said the app is already installed or accepted install.';



COMMENT ON COLUMN "public"."profiles"."install_app_last_prompted_at" IS 'Last time the install app prompt was shown in the dashboard.';



COMMENT ON COLUMN "public"."profiles"."pre_deletion_proactive_muted" IS 'L''eleve avait-il coupe ses relances AVANT de demander la suppression ? Sert uniquement a le rendre a son etat exact s''il annule. NULL hors fenetre de suppression.';



COMMENT ON COLUMN "public"."profiles"."country" IS 'ISO 3166-1 alpha-2, uppercase. Where the user physically is, distinct from locale (R3/R4 spirit). Read FIRST by the crisis-resource resolver; NULL means unknown and degrades onto the documented international fallback, never onto a guess.';



COMMENT ON COLUMN "public"."profiles"."chat_last_inbound_at" IS 'Dernier message ENTRANT de l''élève, tous canaux. Sert à une seule question: une conversation est-elle active ? (delivery_policy.ts)';



COMMENT ON COLUMN "public"."profiles"."proactive_muted_at" IS 'L''élève a coupé les relances proactives. Ne coupe JAMAIS la réponse à un message qu''il envoie.';



COMMENT ON COLUMN "public"."profiles"."chat_last_outbound_at" IS 'Dernier message SORTANT vers l''eleve, tous canaux. Sert a la fraicheur du salut (dire bonjour vs reprendre). Ecrit par deliverChatMessage.';



COMMENT ON COLUMN "public"."profiles"."chat_last_read_at" IS 'Dernière ouverture de /app/chat par l''élève. Sert au compteur de non-lus (messages assistant plus récents). Écrit par le client, jamais privilégié. NULL = jamais ouvert.';



CREATE OR REPLACE VIEW "public"."coach_student_directory" WITH ("security_invoker"='off') AS
 SELECT "id",
    "full_name",
    "avatar_url",
    "timezone",
    "locale",
        CASE
            WHEN ("birth_date" IS NULL) THEN NULL::integer
            WHEN ("birth_date" > CURRENT_DATE) THEN NULL::integer
            WHEN (EXTRACT(year FROM "age"((CURRENT_DATE)::timestamp with time zone, ("birth_date")::timestamp with time zone)) > (120)::numeric) THEN NULL::integer
            ELSE (EXTRACT(year FROM "age"((CURRENT_DATE)::timestamp with time zone, ("birth_date")::timestamp with time zone)))::integer
        END AS "age_years"
   FROM "public"."profiles" "p"
  WHERE ("id" = ANY (( SELECT "public"."coached_student_ids"() AS "coached_student_ids")::"uuid"[]));


ALTER VIEW "public"."coach_student_directory" OWNER TO "postgres";


COMMENT ON VIEW "public"."coach_student_directory" IS 'Allowlist de colonnes pour la lecture coach. JAMAIS email, telephone, date de naissance, ni colonne de facturation. `age_years` est DERIVE de birth_date, qui ne sort pas d''ici.';



CREATE TABLE IF NOT EXISTS "public"."protocol_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "occurred_at" timestamp with time zone NOT NULL,
    "local_date" "date" NOT NULL,
    "slot_key" "text",
    "source" "text" NOT NULL,
    "media_path" "text",
    "recognized" "jsonb",
    "recognition_confidence" numeric,
    "quantity" numeric,
    "unit" "text",
    "substance_ref" "text",
    "food_group_ref" "text",
    "student_note" "text",
    "content_locale" "text" NOT NULL,
    "evidence_weight" numeric,
    "source_message_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "portion_band" "text",
    "disqualified_reason" "text",
    "media_sha256" "text",
    "analyzed_at" timestamp with time zone,
    CONSTRAINT "protocol_events_disqualified_reason_check" CHECK ((("disqualified_reason" IS NULL) OR ("disqualified_reason" = ANY (ARRAY['not_food'::"text", 'food_not_eaten'::"text", 'unreadable'::"text"])))),
    CONSTRAINT "protocol_events_media_sha256_format_check" CHECK ((("media_sha256" IS NULL) OR ("media_sha256" ~ '^[0-9a-f]{64}$'::"text"))),
    CONSTRAINT "protocol_events_portion_band_check" CHECK ((("portion_band" IS NULL) OR ("portion_band" = ANY (ARRAY['small'::"text", 'moderate'::"text", 'large'::"text", 'unclear'::"text"])))),
    CONSTRAINT "protocol_events_source_check" CHECK (("source" = ANY (ARRAY['photo'::"text", 'text'::"text", 'voice'::"text", 'chat'::"text", 'quick_tap'::"text", 'integration'::"text", 'coach_entry'::"text"])))
);


ALTER TABLE "public"."protocol_events" OWNER TO "postgres";


COMMENT ON COLUMN "public"."protocol_events"."portion_band" IS 'R1 token ordinal de magnitude, écrit par analyze-meal-photo-v1 depuis la lecture vision. small < moderate < large ; unclear = observé, non concluant ; NULL = aucune observation de portion (fait non-photo). CONTRACT NON-INPUT #4 : une photo peut attester presence/composition/portion/serving, jamais energy/macro_*. Ce n''est PAS une quantité : quantity et unit restent NULL sur les faits photo.';



COMMENT ON COLUMN "public"."protocol_events"."disqualified_reason" IS 'NULL = ce fait compte. Sinon: pourquoi il ne compte pas (not_food | food_not_eaten | unreadable). La ligne est CONSERVÉE — on marque, on ne supprime pas. Tout lecteur qui COMPTE des repas doit filtrer sur NULL; les lecteurs de SAFETY (restriction_runtime) ne filtrent PAS: les mots de l''élève restent à lire même sur une photo disqualifiée.';



COMMENT ON COLUMN "public"."protocol_events"."media_sha256" IS 'SHA-256 hexadécimal des octets décodés du média. Renseigné par meal-photo-upload-v1. Sert la déduplication exacte via protocol_events_media_dedup_idx.';



COMMENT ON COLUMN "public"."protocol_events"."analyzed_at" IS 'Quand l''analyse vision a écrit sa lecture sur cette ligne. NULL = jamais analysée (fait non-photo, ou photo dont l''analyse a échoué). Réécrite à chaque rejeu `force`, ce qui rend un changement de prompt auditable.';



CREATE OR REPLACE VIEW "public"."coach_student_events" WITH ("security_invoker"='off') AS
 SELECT "id",
    "user_id",
    "occurred_at",
    "local_date",
    "slot_key",
    "source",
    "recognized",
    "recognition_confidence",
    "quantity",
    "unit",
    "substance_ref",
    "food_group_ref",
    "content_locale",
    "evidence_weight",
    ("media_path" IS NOT NULL) AS "has_media",
    "created_at",
    "portion_band"
   FROM "public"."protocol_events" "e"
  WHERE (("user_id" = ANY (( SELECT "public"."coached_student_ids"() AS "coached_student_ids")::"uuid"[])) AND ("disqualified_reason" IS NULL) AND ("occurred_at" >= "public"."coach_student_history_floor"("user_id")));


ALTER VIEW "public"."coach_student_events" OWNER TO "postgres";


COMMENT ON VIEW "public"."coach_student_events" IS 'Les faits de protocole des élèves de CE coach. Les photos disqualifiées (non_food, food_not_eaten, unreadable) sont exclues: elles ne comptent pas dans la synthèse du lundi, elles ne doivent pas non plus apparaître dans le fil de la fiche élève. La photo elle-même ne traverse jamais (has_media).';



CREATE TABLE IF NOT EXISTS "public"."student_daily_checkins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "local_date" "date" NOT NULL,
    "overall" "text" NOT NULL,
    "axis" "text",
    "source" "text" DEFAULT 'whatsapp_button'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "student_daily_checkins_axis_check" CHECK (("axis" = ANY (ARRAY['energy'::"text", 'hunger'::"text", 'sleep'::"text"]))),
    CONSTRAINT "student_daily_checkins_axis_coherent_check" CHECK (((("overall" = 'good'::"text") AND ("axis" IS NULL)) OR ("overall" <> 'good'::"text"))),
    CONSTRAINT "student_daily_checkins_overall_check" CHECK (("overall" = ANY (ARRAY['good'::"text", 'mixed'::"text", 'hard'::"text"]))),
    CONSTRAINT "student_daily_checkins_source_check" CHECK (("source" = ANY (ARRAY['whatsapp_button'::"text", 'app'::"text", 'chat'::"text"])))
);


ALTER TABLE "public"."student_daily_checkins" OWNER TO "postgres";


COMMENT ON TABLE "public"."student_daily_checkins" IS 'PIVOT: le tap du soir. 3 niveaux (contrainte Meta: 3 boutons max), axe demandé seulement si ça ne va pas. Répond à "ce protocole est-il vivable", ce que la couverture ne dit pas.';



CREATE OR REPLACE VIEW "public"."coach_student_pulse" WITH ("security_invoker"='off') AS
 WITH "scoped" AS (
         SELECT "c"."user_id",
            ("date_trunc"('week'::"text", ("c"."local_date")::timestamp with time zone))::"date" AS "week_start",
            "c"."overall",
            "c"."axis"
           FROM "public"."student_daily_checkins" "c"
          WHERE (("c"."user_id" = ANY (( SELECT "public"."coached_student_ids"() AS "coached_student_ids")::"uuid"[])) AND ("c"."local_date" >= (("public"."coach_student_history_floor"("c"."user_id") AT TIME ZONE 'utc'::"text"))::"date"))
        ), "dominant" AS (
         SELECT DISTINCT ON ("scoped"."user_id", "scoped"."week_start") "scoped"."user_id",
            "scoped"."week_start",
            "scoped"."axis"
           FROM "scoped"
          WHERE ("scoped"."axis" IS NOT NULL)
          GROUP BY "scoped"."user_id", "scoped"."week_start", "scoped"."axis"
          ORDER BY "scoped"."user_id", "scoped"."week_start", ("count"(*)) DESC, "scoped"."axis"
        )
 SELECT "s"."user_id" AS "student_user_id",
    "s"."week_start",
    "count"(*) FILTER (WHERE ("s"."overall" = 'good'::"text")) AS "days_good",
    "count"(*) FILTER (WHERE ("s"."overall" = 'mixed'::"text")) AS "days_mixed",
    "count"(*) FILTER (WHERE ("s"."overall" = 'hard'::"text")) AS "days_hard",
    "d"."axis" AS "dominant_axis"
   FROM ("scoped" "s"
     LEFT JOIN "dominant" "d" ON ((("d"."user_id" = "s"."user_id") AND ("d"."week_start" = "s"."week_start"))))
  GROUP BY "s"."user_id", "s"."week_start", "d"."axis";


ALTER VIEW "public"."coach_student_pulse" OWNER TO "postgres";


COMMENT ON VIEW "public"."coach_student_pulse" IS 'PIVOT §1.5: l''agrégat hebdomadaire du tap, jamais le détail par jour. Le coach voit combien de jours durs et quel axe lâche, pas l''humeur quotidienne de son élève.';



CREATE TABLE IF NOT EXISTS "public"."coach_syntheses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "cohort_id" "uuid",
    "kind" "text" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "metrics" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "flagged_students" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "narrative" "text",
    "content_locale" "text" NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "delivered_at" timestamp with time zone,
    "delivery_channel" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "coach_syntheses_check" CHECK (("period_end" >= "period_start")),
    CONSTRAINT "coach_syntheses_delivery_channel_check" CHECK (("delivery_channel" = ANY (ARRAY['whatsapp'::"text", 'email'::"text", 'in_app'::"text"]))),
    CONSTRAINT "coach_syntheses_kind_check" CHECK (("kind" = ANY (ARRAY['weekly'::"text", 'cohort_completion'::"text"])))
);


ALTER TABLE "public"."coach_syntheses" OWNER TO "postgres";


COMMENT ON TABLE "public"."coach_syntheses" IS 'PIVOT §1.4: synthèse hebdo + rapport de complétion. metrics vient du SQL, jamais du LLM. delivered_at posé après livraison réelle (execution truth).';



CREATE TABLE IF NOT EXISTS "public"."coach_terms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "term" "text" NOT NULL,
    "food_group_ref" "text" NOT NULL,
    "content_locale" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "coach_terms_term_check" CHECK ((("length"("btrim"("term")) >= 1) AND ("length"("btrim"("term")) <= 80)))
);


ALTER TABLE "public"."coach_terms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_timing_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "protocol_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "template" "text" NOT NULL,
    "food_group_ref" "text" NOT NULL,
    "direction" "text",
    "portions" integer,
    "period" "text",
    "cutoff_local" time without time zone,
    "slot_key" "text",
    "goal_scope" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "rationale" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "coach_timing_rules_direction_check" CHECK (("direction" = ANY (ARRAY['at_least'::"text", 'at_most'::"text"]))),
    CONSTRAINT "coach_timing_rules_goal_scope_check" CHECK (("goal_scope" <@ ARRAY['fat_loss'::"text", 'muscle_gain'::"text", 'recomposition'::"text", 'performance'::"text", 'health'::"text", 'maintenance'::"text"])),
    CONSTRAINT "coach_timing_rules_period_check" CHECK (("period" = ANY (ARRAY['day'::"text", 'week'::"text"]))),
    CONSTRAINT "coach_timing_rules_portions_check" CHECK ((("portions" >= 1) AND ("portions" <= 12))),
    CONSTRAINT "coach_timing_rules_slots_match_template" CHECK (((("template" = 'portions_per_period'::"text") AND ("direction" IS NOT NULL) AND ("portions" IS NOT NULL) AND ("period" IS NOT NULL) AND ("cutoff_local" IS NULL) AND ("slot_key" IS NULL)) OR (("template" = 'group_every_meal'::"text") AND ("direction" IS NULL) AND ("portions" IS NULL) AND ("period" IS NULL) AND ("cutoff_local" IS NULL) AND ("slot_key" IS NULL)) OR (("template" = 'no_group_after'::"text") AND ("cutoff_local" IS NOT NULL) AND ("direction" IS NULL) AND ("portions" IS NULL) AND ("period" IS NULL) AND ("slot_key" IS NULL)) OR (("template" = 'group_at_slot'::"text") AND ("slot_key" IS NOT NULL) AND ("direction" IS NULL) AND ("portions" IS NULL) AND ("period" IS NULL) AND ("cutoff_local" IS NULL)))),
    CONSTRAINT "coach_timing_rules_template_check" CHECK (("template" = ANY (ARRAY['portions_per_period'::"text", 'group_every_meal'::"text", 'no_group_after'::"text", 'group_at_slot'::"text"])))
);


ALTER TABLE "public"."coach_timing_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coaches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "display_name" "text",
    "credential_type" "text" DEFAULT 'none'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "trial_started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "trial_ends_at" timestamp with time zone,
    "trial_seat_limit" integer DEFAULT 3 NOT NULL,
    "coach_kind" "text" DEFAULT 'human'::"text" NOT NULL,
    "doctrine_source" "text" DEFAULT 'own'::"text" NOT NULL,
    CONSTRAINT "coaches_coach_kind_check" CHECK (("coach_kind" = ANY (ARRAY['human'::"text", 'house'::"text"]))),
    CONSTRAINT "coaches_credential_type_check" CHECK (("credential_type" = ANY (ARRAY['none'::"text", 'certified_coach'::"text", 'rd'::"text", 'clinician'::"text"]))),
    CONSTRAINT "coaches_doctrine_source_check" CHECK (("doctrine_source" = ANY (ARRAY['own'::"text", 'house'::"text"]))),
    CONSTRAINT "coaches_house_never_delegates_check" CHECK ((("coach_kind" <> 'house'::"text") OR ("doctrine_source" = 'own'::"text"))),
    CONSTRAINT "coaches_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'suspended'::"text"]))),
    CONSTRAINT "coaches_trial_seat_limit_positive" CHECK (("trial_seat_limit" >= 0))
);


ALTER TABLE "public"."coaches" OWNER TO "postgres";


COMMENT ON COLUMN "public"."coaches"."coach_kind" IS 'human = un vrai coach qui paie et prescrit. house = LE coach maison de l''inscription libre: jamais facturé (keel_coach_seat_ledger), solvable par nature (keel_coach_is_solvent), hors plafond d''essai. Index unique partiel: il n''y en a qu''un, sinon « le » coach maison serait ambigu.';



COMMENT ON COLUMN "public"."coaches"."doctrine_source" IS 'own = ce coach sert SA doctrine et l''agent signe de son nom. house = il delegue: ses eleves recoivent la doctrine du coach maison et l''agent signe du nom de la maison, jamais du sien. Reversible dans les deux sens; la doctrine publiee du coach n''est pas touchee pendant la delegation. N''INFLUE PAS SUR LA FACTURATION: le registre de sieges branche sur coach_kind (keel_coach_seat_ledger), jamais sur cette colonne.';



CREATE TABLE IF NOT EXISTS "public"."cohorts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "content_locale" "text" NOT NULL,
    "plan_template_id" "uuid",
    "starts_on" "date",
    "duration_weeks" integer,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cohorts_duration_weeks_check" CHECK ((("duration_weeks" IS NULL) OR (("duration_weeks" >= 1) AND ("duration_weeks" <= 104)))),
    CONSTRAINT "cohorts_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'running'::"text", 'completed'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."cohorts" OWNER TO "postgres";


COMMENT ON TABLE "public"."cohorts" IS 'PIVOT §1.7: la promo d''un coach 1:N. Unité du rapport de complétion.';



CREATE TABLE IF NOT EXISTS "public"."commitment_evaluations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "commitment_id" "uuid" NOT NULL,
    "plan_version_id" "uuid" NOT NULL,
    "local_date" "date" NOT NULL,
    "slot_key" "text",
    "grain" "text" NOT NULL,
    "expected" "jsonb",
    "observed_value" numeric,
    "observed" "jsonb",
    "status" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "timing_status" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "evidence" "text" DEFAULT 'none'::"text" NOT NULL,
    "confidence" numeric,
    "source_event_ids" "uuid"[],
    "resolved_at" timestamp with time zone,
    "resolved_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "commitment_evaluations_evidence_check" CHECK (("evidence" = ANY (ARRAY['none'::"text", 'self_report'::"text", 'photo'::"text", 'text_log'::"text", 'integration'::"text", 'coach_override'::"text", 'inferred'::"text"]))),
    CONSTRAINT "commitment_evaluations_grain_check" CHECK (("grain" = ANY (ARRAY['occasion'::"text", 'day'::"text", 'week'::"text"]))),
    CONSTRAINT "commitment_evaluations_resolved_by_check" CHECK (("resolved_by" = ANY (ARRAY['system'::"text", 'student'::"text", 'coach'::"text"]))),
    CONSTRAINT "commitment_evaluations_status_check" CHECK (("status" = ANY (ARRAY['unknown'::"text", 'met'::"text", 'partial'::"text", 'missed'::"text", 'not_applicable'::"text", 'flex_used'::"text"]))),
    CONSTRAINT "commitment_evaluations_timing_status_check" CHECK (("timing_status" = ANY (ARRAY['on_time'::"text", 'off_window'::"text", 'unknown'::"text", 'not_applicable'::"text"])))
);


ALTER TABLE "public"."commitment_evaluations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."commitment_relations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "commitment_a" "uuid" NOT NULL,
    "commitment_b" "uuid",
    "relation_kind" "text" NOT NULL,
    "param_minutes" integer,
    "cofactor_ref" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "commitment_relations_kind_params_check" CHECK (((("relation_kind" = 'separate_by_minutes'::"text") AND ("param_minutes" IS NOT NULL) AND ("commitment_b" IS NOT NULL)) OR (("relation_kind" = 'requires_cofactor'::"text") AND ("cofactor_ref" IS NOT NULL) AND ("commitment_b" IS NULL)) OR (("relation_kind" = ANY (ARRAY['co_ingest'::"text", 'antagonist'::"text"])) AND ("commitment_b" IS NOT NULL) AND ("param_minutes" IS NULL) AND ("cofactor_ref" IS NULL)))),
    CONSTRAINT "commitment_relations_relation_kind_check" CHECK (("relation_kind" = ANY (ARRAY['co_ingest'::"text", 'separate_by_minutes'::"text", 'requires_cofactor'::"text", 'antagonist'::"text"])))
);


ALTER TABLE "public"."commitment_relations" OWNER TO "postgres";


COMMENT ON TABLE "public"."commitment_relations" IS 'Readers: render + safety ONLY. Never the evaluator. See docs/keel/CONTRACT.md NON-INPUTS.';



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


CREATE TABLE IF NOT EXISTS "public"."contract_change_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_version_id" "uuid",
    "commitment_id" "uuid",
    "raised_by" "text" NOT NULL,
    "reason_code" "text" NOT NULL,
    "student_words" "text",
    "sophia_summary" "text",
    "sophia_evidence" "jsonb",
    "suggested_option" "jsonb",
    "urgency" "text" DEFAULT 'routine'::"text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "coach_decision" "text",
    "content_locale" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    CONSTRAINT "contract_change_requests_raised_by_check" CHECK (("raised_by" = ANY (ARRAY['student'::"text", 'sophia'::"text", 'system'::"text"]))),
    CONSTRAINT "contract_change_requests_reason_code_check" CHECK (("reason_code" = ANY (ARRAY['too_much_food'::"text", 'not_enough_food'::"text", 'schedule_conflict'::"text", 'dislikes_food'::"text", 'travel'::"text", 'budget'::"text", 'symptom'::"text", 'social_event'::"text", 'allergen_violation'::"text", 'restriction_signal'::"text", 'minor_student'::"text", 'other'::"text"]))),
    CONSTRAINT "contract_change_requests_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'resolved'::"text", 'dismissed'::"text"]))),
    CONSTRAINT "contract_change_requests_urgency_check" CHECK (("urgency" = ANY (ARRAY['routine'::"text", 'next_digest'::"text", 'immediate'::"text"])))
);


ALTER TABLE "public"."contract_change_requests" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."conversation_runtime_events" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "request_id" "text" NOT NULL,
    "turn_id" "text",
    "user_id" "uuid" NOT NULL,
    "channel" "text",
    "scope" "text",
    "source" "text" NOT NULL,
    "level" "text" DEFAULT 'info'::"text" NOT NULL,
    "event" "text" NOT NULL,
    "phase" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "conversation_runtime_events_channel_check" CHECK ((("channel" IS NULL) OR ("channel" = ANY (ARRAY['web'::"text", 'whatsapp'::"text"])))),
    CONSTRAINT "conversation_runtime_events_level_check" CHECK (("level" = ANY (ARRAY['debug'::"text", 'info'::"text", 'warn'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."conversation_runtime_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."conversation_runtime_events" IS 'Append-only runtime event stream for real-user Sophia brain/routing traces. Enable brain writes with SOPHIA_BRAIN_TRACE_ENABLED=1.';



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



CREATE OR REPLACE VIEW "public"."conversation_runtime_audit_events" WITH ("security_invoker"='true') AS
 SELECT ("conversation_runtime_events"."id")::"text" AS "event_id",
    "conversation_runtime_events"."created_at",
    "conversation_runtime_events"."request_id",
    "conversation_runtime_events"."turn_id",
    "conversation_runtime_events"."user_id",
    "conversation_runtime_events"."channel",
    "conversation_runtime_events"."scope",
    'brain'::"text" AS "stream",
    "conversation_runtime_events"."source",
    "conversation_runtime_events"."level",
    "conversation_runtime_events"."event",
    "conversation_runtime_events"."phase",
    "conversation_runtime_events"."payload"
   FROM "public"."conversation_runtime_events"
UNION ALL
 SELECT ('memory:'::"text" || ("memory_observability_events"."id")::"text") AS "event_id",
    "memory_observability_events"."created_at",
    "memory_observability_events"."request_id",
    "memory_observability_events"."turn_id",
    "memory_observability_events"."user_id",
    "memory_observability_events"."channel",
    "memory_observability_events"."scope",
    'memory'::"text" AS "stream",
    "memory_observability_events"."source_component" AS "source",
    'info'::"text" AS "level",
    "memory_observability_events"."event_name" AS "event",
    NULL::"text" AS "phase",
    "memory_observability_events"."payload"
   FROM "public"."memory_observability_events";


ALTER VIEW "public"."conversation_runtime_audit_events" OWNER TO "postgres";


COMMENT ON VIEW "public"."conversation_runtime_audit_events" IS 'Unified real-user audit stream. Brain events come from SOPHIA_BRAIN_TRACE_ENABLED=1; memory events come from MEMORY_OBSERVABILITY_ON=1.';



ALTER TABLE "public"."conversation_runtime_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."conversation_runtime_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



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
    "safety_pregate" "jsonb",
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
    "cached_prompt_tokens" integer,
    CONSTRAINT "llm_usage_events_kind_check" CHECK (("kind" = ANY (ARRAY['generate'::"text", 'embed'::"text"])))
);


ALTER TABLE "public"."llm_usage_events" OWNER TO "postgres";


COMMENT ON COLUMN "public"."llm_usage_events"."cached_prompt_tokens" IS 'Part de prompt_tokens servie par le cache du fournisseur (OpenAI: usage.input_tokens_details.cached_tokens). NULL = non renseigné par le fournisseur ou ligne antérieure au câblage; 0 = cache réellement vide.';



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


COMMENT ON TABLE "public"."whatsapp_cost_events" IS 'GELÉE (de-whatsapp, 2026-08-04). Historique des coûts Meta, conservé parce qu''il justifie l''abandon du canal. Plus aucun writer applicatif; la purge RGPD y supprime toujours les lignes d''un compte effacé.';



CREATE OR REPLACE VIEW "public"."cost_fact_events" WITH ("security_invoker"='true') AS
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


CREATE OR REPLACE VIEW "public"."cost_fact_events_enriched" WITH ("security_invoker"='true') AS
 SELECT "ue"."created_at",
    "ue"."user_id",
    COALESCE("ue"."operation_family", 'other'::"text") AS "operation_family",
    COALESCE("ue"."operation_name", "ue"."source", 'unknown'::"text") AS "operation_name",
    "ue"."source",
    "ue"."provider",
    "ue"."model",
    "ue"."kind",
    COALESCE("ue"."prompt_tokens", 0) AS "prompt_tokens",
    COALESCE("ue"."output_tokens", 0) AS "output_tokens",
    COALESCE("ue"."total_tokens", 0) AS "total_tokens",
    COALESCE("ue"."cost_usd", (0)::numeric) AS "cost_usd",
    (0)::numeric AS "cost_eur",
    'ai'::"text" AS "cost_domain",
    COALESCE("ue"."cost_unpriced", false) AS "cost_unpriced",
    "ue"."status",
    "ue"."channel",
    "ue"."request_id",
    "ue"."metadata",
    "public"."cost_metadata_run_type"("ue"."metadata") AS "run_type",
    "public"."cost_metadata_environment"("ue"."metadata") AS "environment"
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
    0 AS "prompt_tokens",
    0 AS "output_tokens",
    0 AS "total_tokens",
    (0)::numeric AS "cost_usd",
    COALESCE("wce"."final_cost_eur", (0)::numeric) AS "cost_eur",
    'whatsapp'::"text" AS "cost_domain",
    false AS "cost_unpriced",
    "wce"."billing_status" AS "status",
    'whatsapp'::"text" AS "channel",
    NULL::"text" AS "request_id",
    "wce"."metadata",
    "public"."cost_metadata_run_type"("wce"."metadata") AS "run_type",
    "public"."cost_metadata_environment"("wce"."metadata") AS "environment"
   FROM "public"."whatsapp_cost_events" "wce"
  WHERE (("wce"."billable" = true) AND ("lower"("wce"."billing_status") = 'sent'::"text"));


ALTER VIEW "public"."cost_fact_events_enriched" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crisis_resources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "country" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "label" "text" NOT NULL,
    "contact" "text" NOT NULL,
    "url" "text",
    "content_locale" "text" NOT NULL,
    "priority" integer DEFAULT 100 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "crisis_resources_country_format" CHECK (("country" ~ '^[A-Z]{2}$'::"text")),
    CONSTRAINT "crisis_resources_kind_check" CHECK (("kind" = ANY (ARRAY['suicide'::"text", 'emergency'::"text", 'eating_disorder'::"text", 'poison'::"text", 'domestic_violence'::"text"])))
);


ALTER TABLE "public"."crisis_resources" OWNER TO "postgres";


COMMENT ON TABLE "public"."crisis_resources" IS 'KEEL W3.3 — crisis/emergency contacts per country. Source of truth for _shared/keel/crisis_resources.ts. Country ZZ = documented international fallback used when the student country is unknown (logged, never silent).';



CREATE TABLE IF NOT EXISTS "public"."deletion_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id_hash" "text" NOT NULL,
    "email_hash" "text",
    "phone_hash" "text",
    "deleted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."deletion_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."food_groups" (
    "slug" "text" NOT NULL,
    "class" "text" NOT NULL,
    "typical_portion" numeric NOT NULL,
    "unit" "text" NOT NULL,
    "label_i18n_key" "text" NOT NULL,
    CONSTRAINT "food_groups_class_check" CHECK (("class" = ANY (ARRAY['protein'::"text", 'legume'::"text", 'dairy'::"text", 'grain'::"text", 'vegetable'::"text", 'fruit'::"text", 'fat'::"text", 'discretionary'::"text", 'beverage'::"text"]))),
    CONSTRAINT "food_groups_unit_check" CHECK (("unit" = ANY (ARRAY['g'::"text", 'ml'::"text"])))
);


ALTER TABLE "public"."food_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."food_items" (
    "slug" "text" NOT NULL,
    "food_group_ref" "text" NOT NULL,
    "label" "text" NOT NULL,
    "content_locale" "text" DEFAULT 'en-GB'::"text" NOT NULL,
    "count_axis" "text" NOT NULL,
    "typical_amount" numeric,
    "typical_unit" "text",
    "default_why" "text",
    "sort_order" integer DEFAULT 100 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "food_items_count_axis_check" CHECK (("count_axis" = ANY (ARRAY['portion'::"text", 'volume'::"text", 'count'::"text"]))),
    CONSTRAINT "food_items_label_check" CHECK ((("length"("btrim"("label")) >= 1) AND ("length"("btrim"("label")) <= 80))),
    CONSTRAINT "food_items_typical_amount_check" CHECK (("typical_amount" > (0)::numeric)),
    CONSTRAINT "food_items_typical_unit_check" CHECK (("typical_unit" = ANY (ARRAY['g'::"text", 'ml'::"text", 'unit'::"text"]))),
    CONSTRAINT "food_items_volume_is_ml" CHECK ((("count_axis" <> 'volume'::"text") OR ("typical_unit" = 'ml'::"text")))
);


ALTER TABLE "public"."food_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inbound_dedup" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "client_message_id" "text" NOT NULL,
    "request_id" "text",
    "status" "text" DEFAULT 'received'::"text" NOT NULL,
    "processed_at" timestamp with time zone,
    "chat_message_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "inbound_dedup_status_check" CHECK (("status" = ANY (ARRAY['received'::"text", 'processed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."inbound_dedup" OWNER TO "postgres";


COMMENT ON TABLE "public"."inbound_dedup" IS 'Idempotence des entrants in-app. Clé (user_id, client_message_id): un id fourni par le client ne peut jamais être unique globalement.';



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


CREATE TABLE IF NOT EXISTS "public"."llm_raw_response_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "request_id" "text",
    "user_id" "uuid",
    "source" "text",
    "provider" "text" NOT NULL,
    "model" "text" NOT NULL,
    "attempt" integer,
    "chain_index" integer,
    "status" "text" NOT NULL,
    "http_status" integer,
    "provider_request_id" "text",
    "json_mode" boolean DEFAULT false NOT NULL,
    "tool_choice" "text",
    "has_tools" boolean DEFAULT false NOT NULL,
    "outcome" "text",
    "output_text" "text",
    "output_tool_name" "text",
    "output_tool_args" "jsonb",
    "raw_response" "jsonb",
    "raw_response_truncated" boolean DEFAULT false NOT NULL,
    "error_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."llm_raw_response_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."llm_raw_response_events" IS 'Raw LLM provider responses captured only when SOPHIA_LLM_RAW_TRACE_ENABLED=1. Intended for QA/debug of dispatcher and visible-agent outputs.';



CREATE TABLE IF NOT EXISTS "public"."meal_ideas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "author_kind" "text" DEFAULT 'coach'::"text" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "slot_key" "text",
    "food_group_refs" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "content_locale" "text" DEFAULT 'en'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "image_path" "text",
    CONSTRAINT "meal_ideas_author_kind_check" CHECK (("author_kind" = ANY (ARRAY['coach'::"text", 'keel_library'::"text"]))),
    CONSTRAINT "meal_ideas_description_check" CHECK ((("description" IS NULL) OR ("length"("description") <= 2000))),
    CONSTRAINT "meal_ideas_image_path_check" CHECK ((("image_path" IS NULL) OR ("image_path" ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+$'::"text"))),
    CONSTRAINT "meal_ideas_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'archived'::"text"]))),
    CONSTRAINT "meal_ideas_title_check" CHECK ((("length"("btrim"("title")) >= 1) AND ("length"("btrim"("title")) <= 120)))
);


ALTER TABLE "public"."meal_ideas" OWNER TO "postgres";


COMMENT ON COLUMN "public"."meal_ideas"."author_kind" IS 'coach | keel_library. There is deliberately no ai value: a model may choose among these rows, it may never author one.';



COMMENT ON COLUMN "public"."meal_ideas"."image_path" IS 'Chemin dans le bucket privé `recipe-images`, ou NULL. JAMAIS une URL: le bucket est privé et la lecture se fait par URL signée à la demande.';



CREATE TABLE IF NOT EXISTS "public"."meal_precision_questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "local_date" "date" NOT NULL,
    "asked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text" NOT NULL,
    "axis" "text" NOT NULL,
    "protocol_event_id" "uuid",
    "question" "text" NOT NULL,
    "asked_for_message_id" "text" NOT NULL,
    CONSTRAINT "meal_precision_questions_axis_check" CHECK (("axis" = ANY (ARRAY['composition'::"text", 'accompaniment'::"text", 'preparation'::"text", 'slot'::"text"]))),
    CONSTRAINT "meal_precision_questions_source_check" CHECK (("source" = ANY (ARRAY['text'::"text", 'photo'::"text"])))
);


ALTER TABLE "public"."meal_precision_questions" OWNER TO "postgres";


COMMENT ON TABLE "public"."meal_precision_questions" IS 'Une ligne par question de précision RÉELLEMENT posée à un élève. Sert deux usages: le plafond du jour (count(*) par user_id + local_date, max 2, photo et texte confondus) et la trace d''audit du texte posé.';



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


CREATE TABLE IF NOT EXISTS "public"."outbound_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "request_id" "text",
    "user_id" "uuid",
    "to_e164" "text",
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
    "delivery_channel" "text" NOT NULL,
    CONSTRAINT "outbound_messages_delivery_channel_check" CHECK (("delivery_channel" = ANY (ARRAY['whatsapp'::"text", 'in_app'::"text", 'email'::"text"]))),
    CONSTRAINT "outbound_messages_message_type_check" CHECK (("message_type" = ANY (ARRAY['text'::"text", 'template'::"text", 'interactive_buttons'::"text"]))),
    CONSTRAINT "outbound_messages_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'sent'::"text", 'delivered'::"text", 'read'::"text", 'failed'::"text", 'cancelled'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."outbound_messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."outbound_messages" IS 'Ledger de livraison multi-canal. `whatsapp` = historique gelé (plus aucun writer depuis le chantier de-whatsapp). `in_app` = la bulle de chat.';



COMMENT ON COLUMN "public"."outbound_messages"."message_type" IS 'text | template | interactive_buttons. `interactive_buttons` est le tap du soir et sa relance d''axe: même table, donc mêmes retries, même cap, même comptage de coût qu''un envoi texte.';



CREATE TABLE IF NOT EXISTS "public"."pending_actions" (
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
    CONSTRAINT "pending_actions_kind_check" CHECK (("kind" = ANY (ARRAY['scheduled_checkin'::"text", 'deferred_send'::"text", 'proactive_template_candidate'::"text", 'access_ended_notification'::"text", 'access_reactivation_offer'::"text", 'rendez_vous'::"text"]))),
    CONSTRAINT "pending_actions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'done'::"text", 'cancelled'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."pending_actions" OWNER TO "postgres";


COMMENT ON TABLE "public"."pending_actions" IS 'État des flows en attente d''une réponse de l''élève. Agnostique au canal depuis le chantier de-whatsapp.';



CREATE TABLE IF NOT EXISTS "public"."plan_commitments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_version_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "template_commitment_key" "text",
    "polarity" "text" NOT NULL,
    "activity_class" "text" DEFAULT 'other'::"text" NOT NULL,
    "anchor_kind" "text" NOT NULL,
    "slot_key" "text",
    "clock_local" time without time zone,
    "tolerance_minutes" integer,
    "window_start_local" time without time zone,
    "window_end_local" time without time zone,
    "measure" "text" NOT NULL,
    "unit" "text",
    "target_op" "text" NOT NULL,
    "target_min" numeric,
    "target_max" numeric,
    "tolerance_pct" numeric DEFAULT 10,
    "substance_ref" "text",
    "food_group_ref" "text",
    "evidence_kind" "text" NOT NULL,
    "evidence_required" boolean DEFAULT false NOT NULL,
    "auto_source" "text",
    "counts_toward_adherence" boolean DEFAULT true NOT NULL,
    "evaluation_grain" "text" NOT NULL,
    "slot_kind" "text",
    "scheduled_days" "text"[],
    "required_days_per_week" integer,
    "expected_occasions_per_day" integer DEFAULT 1,
    "priority" "text" DEFAULT 'core'::"text" NOT NULL,
    "autonomy" "text" DEFAULT 'strict'::"text" NOT NULL,
    "flex_eligible" boolean DEFAULT false NOT NULL,
    "provenance" "text" DEFAULT 'coach_educational'::"text" NOT NULL,
    "requires_clinician_signoff" boolean DEFAULT false NOT NULL,
    "title" "text" NOT NULL,
    "student_instruction" "text",
    "content" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "content_locale" "text" NOT NULL,
    "source_span" "jsonb",
    "phase_id" "text",
    "auto_generated" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "plan_commitments_activity_class_check" CHECK (("activity_class" = ANY (ARRAY['nutrition'::"text", 'supplement'::"text", 'movement'::"text", 'recovery'::"text", 'exposure'::"text", 'sleep'::"text", 'mind'::"text", 'measurement'::"text", 'other'::"text"]))),
    CONSTRAINT "plan_commitments_anchor_check" CHECK (((("anchor_kind" = 'slot'::"text") AND ("slot_key" IS NOT NULL) AND ("clock_local" IS NULL) AND ("tolerance_minutes" IS NULL) AND ((("window_start_local" IS NULL) AND ("window_end_local" IS NULL)) OR (("window_start_local" IS NOT NULL) AND ("window_end_local" IS NOT NULL)))) OR (("anchor_kind" = 'clock'::"text") AND ("clock_local" IS NOT NULL) AND ("slot_key" IS NULL) AND ("window_start_local" IS NULL) AND ("window_end_local" IS NULL)) OR (("anchor_kind" = 'window'::"text") AND ("window_start_local" IS NOT NULL) AND ("window_end_local" IS NOT NULL) AND ("slot_key" IS NULL) AND ("clock_local" IS NULL) AND ("tolerance_minutes" IS NULL)) OR (("anchor_kind" = 'free'::"text") AND ("slot_key" IS NULL) AND ("clock_local" IS NULL) AND ("tolerance_minutes" IS NULL) AND ("window_start_local" IS NULL) AND ("window_end_local" IS NULL)))),
    CONSTRAINT "plan_commitments_anchor_kind_check" CHECK (("anchor_kind" = ANY (ARRAY['slot'::"text", 'clock'::"text", 'window'::"text", 'free'::"text"]))),
    CONSTRAINT "plan_commitments_auto_source_check" CHECK (("auto_source" = ANY (ARRAY['whoop'::"text", 'oura'::"text", 'apple_health'::"text", 'cgm'::"text", 'scale'::"text"]))),
    CONSTRAINT "plan_commitments_autonomy_check" CHECK (("autonomy" = ANY (ARRAY['strict'::"text", 'swap_within_policy'::"text", 'flexible'::"text"]))),
    CONSTRAINT "plan_commitments_avoid_grain_check" CHECK ((("polarity" <> 'avoid'::"text") OR ("evaluation_grain" = ANY (ARRAY['day'::"text", 'week'::"text"])))),
    CONSTRAINT "plan_commitments_evaluation_grain_check" CHECK (("evaluation_grain" = ANY (ARRAY['occasion'::"text", 'day'::"text", 'week'::"text"]))),
    CONSTRAINT "plan_commitments_evidence_kind_check" CHECK (("evidence_kind" = ANY (ARRAY['self_report'::"text", 'numeric_entry'::"text", 'photo'::"text", 'device'::"text", 'none_implicit'::"text"]))),
    CONSTRAINT "plan_commitments_measure_check" CHECK (("measure" = ANY (ARRAY['energy'::"text", 'protein'::"text", 'carb'::"text", 'fat'::"text", 'fiber'::"text", 'sodium'::"text", 'water'::"text", 'micronutrient'::"text", 'portion'::"text", 'serving'::"text", 'exchange'::"text", 'dose'::"text", 'duration'::"text", 'distance'::"text", 'load'::"text", 'reps'::"text", 'count'::"text", 'rpe'::"text", 'scale'::"text", 'clock_time'::"text", 'temperature'::"text", 'boolean'::"text", 'presence'::"text", 'composition'::"text"]))),
    CONSTRAINT "plan_commitments_nominal_slot_check" CHECK ((("slot_kind" IS DISTINCT FROM 'nominal'::"text") OR ("slot_key" IS DISTINCT FROM 'any_meal'::"text"))),
    CONSTRAINT "plan_commitments_occasion_anchor_check" CHECK ((("evaluation_grain" <> 'occasion'::"text") OR ("anchor_kind" <> 'free'::"text"))),
    CONSTRAINT "plan_commitments_polarity_check" CHECK (("polarity" = ANY (ARRAY['do'::"text", 'avoid'::"text", 'capture'::"text"]))),
    CONSTRAINT "plan_commitments_priority_check" CHECK (("priority" = ANY (ARRAY['core'::"text", 'secondary'::"text", 'optional'::"text"]))),
    CONSTRAINT "plan_commitments_provenance_check" CHECK (("provenance" = ANY (ARRAY['coach_educational'::"text", 'clinician_ordered'::"text"]))),
    CONSTRAINT "plan_commitments_required_days_per_week_check" CHECK ((("required_days_per_week" >= 0) AND ("required_days_per_week" <= 7))),
    CONSTRAINT "plan_commitments_scheduled_days_check" CHECK (("scheduled_days" <@ ARRAY['mon'::"text", 'tue'::"text", 'wed'::"text", 'thu'::"text", 'fri'::"text", 'sat'::"text", 'sun'::"text"])),
    CONSTRAINT "plan_commitments_slot_kind_check" CHECK (("slot_kind" = ANY (ARRAY['nominal'::"text", 'opportunistic'::"text"]))),
    CONSTRAINT "plan_commitments_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'paused'::"text", 'archived'::"text"]))),
    CONSTRAINT "plan_commitments_substance_ref_check" CHECK ((("measure" <> ALL (ARRAY['dose'::"text", 'micronutrient'::"text"])) OR ("substance_ref" IS NOT NULL))),
    CONSTRAINT "plan_commitments_target_check" CHECK (((("target_op" = '>='::"text") AND ("target_min" IS NOT NULL) AND ("target_max" IS NULL)) OR (("target_op" = '<='::"text") AND ("target_max" IS NOT NULL) AND ("target_min" IS NULL)) OR (("target_op" = '=='::"text") AND ("target_min" IS NOT NULL) AND ("target_max" IS NULL)) OR (("target_op" = 'between'::"text") AND ("target_min" IS NOT NULL) AND ("target_max" IS NOT NULL) AND ("target_min" <= "target_max")) OR (("target_op" = 'any'::"text") AND ("target_min" IS NULL) AND ("target_max" IS NULL)))),
    CONSTRAINT "plan_commitments_target_op_check" CHECK (("target_op" = ANY (ARRAY['>='::"text", '<='::"text", '=='::"text", 'between'::"text", 'any'::"text"]))),
    CONSTRAINT "plan_commitments_unit_check" CHECK (("unit" = ANY (ARRAY['kcal'::"text", 'g'::"text", 'mg'::"text", 'mcg'::"text", 'IU'::"text", 'ml'::"text", 'l'::"text", 'min'::"text", 'h'::"text", 'km'::"text", 'kg'::"text", 'capsule'::"text", 'tablet'::"text", 'scoop'::"text", 'portion'::"text", 'serving'::"text", 'rep'::"text", 'session'::"text", 'celsius'::"text", 'point'::"text", 'hhmm'::"text", 'none'::"text"])))
);


ALTER TABLE "public"."plan_commitments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plan_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "template_id" "uuid",
    "storage_path" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "original_filename" "text" NOT NULL,
    "page_count" integer,
    "ingestion_path" "text" NOT NULL,
    "ocr_result" "jsonb",
    "layout_probe" "jsonb",
    "status" "text" DEFAULT 'uploaded'::"text" NOT NULL,
    "parse_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "plan_documents_ingestion_path_check" CHECK (("ingestion_path" = ANY (ARRAY['native_text'::"text", 'born_digital_pdf'::"text", 'ocr'::"text"]))),
    CONSTRAINT "plan_documents_status_check" CHECK (("status" = ANY (ARRAY['uploaded'::"text", 'parsing'::"text", 'parsed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."plan_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plan_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "content_locale" "text" NOT NULL,
    "default_swap_policy" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "default_autonomy" "text" DEFAULT 'strict'::"text" NOT NULL,
    "default_flex_allowance" integer DEFAULT 4 NOT NULL,
    "default_adherence_target_pct" integer DEFAULT 80 NOT NULL,
    "commitments" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "plan_templates_default_autonomy_check" CHECK (("default_autonomy" = ANY (ARRAY['strict'::"text", 'swap_within_policy'::"text", 'flexible'::"text"]))),
    CONSTRAINT "plan_templates_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."plan_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plan_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "template_id" "uuid",
    "source_document_id" "uuid",
    "version" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "content_locale" "text" NOT NULL,
    "timezone" "text" NOT NULL,
    "anchor_week_start" "date",
    "duration_weeks" integer,
    "week_starts_on" "text" DEFAULT 'mon'::"text" NOT NULL,
    "phase_plan" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "adherence_target_pct" integer DEFAULT 80 NOT NULL,
    "flex_allowance_per_week" integer DEFAULT 4 NOT NULL,
    "published_at" timestamp with time zone,
    "published_by" "uuid",
    "supersedes_version_id" "uuid",
    "notes_for_student" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "plan_versions_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'in_review'::"text", 'published'::"text", 'superseded'::"text", 'archived'::"text"]))),
    CONSTRAINT "plan_versions_week_starts_on_check" CHECK (("week_starts_on" = ANY (ARRAY['mon'::"text", 'tue'::"text", 'wed'::"text", 'thu'::"text", 'fri'::"text", 'sat'::"text", 'sun'::"text"])))
);


ALTER TABLE "public"."plan_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."planned_deviations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_version_id" "uuid" NOT NULL,
    "local_date" "date" NOT NULL,
    "slot_key" "text",
    "kind" "text" NOT NULL,
    "declared_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "declared_via" "text" NOT NULL,
    "note" "text",
    "content_locale" "text" NOT NULL,
    "consumed_flex" boolean DEFAULT false NOT NULL,
    "coach_visible" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "planned_deviations_declared_via_check" CHECK (("declared_via" = ANY (ARRAY['chat'::"text", 'weekly_review'::"text", 'app'::"text"]))),
    CONSTRAINT "planned_deviations_kind_check" CHECK (("kind" = ANY (ARRAY['restaurant'::"text", 'social'::"text", 'travel'::"text", 'family'::"text", 'work'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."planned_deviations" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."rate_limit_counters" (
    "bucket_key" "text" NOT NULL,
    "window_start" timestamp with time zone NOT NULL,
    "count" integer DEFAULT 0 NOT NULL,
    "expires_at" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."rate_limit_counters" OWNER TO "postgres";


COMMENT ON TABLE "public"."rate_limit_counters" IS 'Fixed-window rate-limit counters. Service-role only (RLS enabled, no policies). Written exclusively via enforce_rate_limit().';



CREATE TABLE IF NOT EXISTS "public"."reengagement_episodes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "opened_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "days_inactive_at_open" integer DEFAULT 0 NOT NULL,
    "last_touch_step" integer DEFAULT 1 NOT NULL,
    "touch1_sent_at" timestamp with time zone,
    "touch2_sent_at" timestamp with time zone,
    "touch3_sent_at" timestamp with time zone,
    "first_reply_at" timestamp with time zone,
    "replied_at_step" integer,
    "entry_kind" "text",
    "solution_offered" "text",
    "redirect_target" "text",
    "exit_status" "text",
    "closed_at" timestamp with time zone,
    "extraction_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reason_category" "text",
    "reason_confidence" "text",
    "reason_user_words" "text",
    "episode_summary" "text",
    "solution_accepted" boolean,
    "outcome_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reactivated_within_7d" boolean,
    "reactivation_signal" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text" DEFAULT 'winback_daily_bilan'::"text" NOT NULL,
    CONSTRAINT "reengagement_episodes_entry_kind_check" CHECK (("entry_kind" = ANY (ARRAY['replied_to_template'::"text", 'spontaneous_return'::"text", 'platform_return'::"text"]))),
    CONSTRAINT "reengagement_episodes_exit_status_check" CHECK (("exit_status" = ANY (ARRAY['reengaged'::"text", 'paused'::"text", 'stopped'::"text", 'no_reply'::"text", 'abandoned_mid_flow'::"text", 'reactivated_via_platform'::"text", 'safety'::"text"]))),
    CONSTRAINT "reengagement_episodes_extraction_status_check" CHECK (("extraction_status" = ANY (ARRAY['pending'::"text", 'done'::"text", 'failed'::"text", 'nothing_to_extract'::"text"]))),
    CONSTRAINT "reengagement_episodes_last_touch_step_check" CHECK ((("last_touch_step" >= 1) AND ("last_touch_step" <= 3))),
    CONSTRAINT "reengagement_episodes_outcome_status_check" CHECK (("outcome_status" = ANY (ARRAY['pending'::"text", 'done'::"text"]))),
    CONSTRAINT "reengagement_episodes_reason_confidence_check" CHECK (("reason_confidence" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"]))),
    CONSTRAINT "reengagement_episodes_replied_at_step_check" CHECK ((("replied_at_step" >= 1) AND ("replied_at_step" <= 3))),
    CONSTRAINT "reengagement_episodes_source_check" CHECK (("source" = ANY (ARRAY['winback_daily_bilan'::"text", 'keel_reengage'::"text"])))
);


ALTER TABLE "public"."reengagement_episodes" OWNER TO "postgres";


COMMENT ON TABLE "public"."reengagement_episodes" IS 'Épisodes de décrochage (chantier réengagement 19/07) : une ligne par période d''inactivité relancée par le winback daily bilan, multi-touches. Écrit par process-checkins et whatsapp-webhook. Service-role uniquement.';



COMMENT ON COLUMN "public"."reengagement_episodes"."source" IS 'Producteur de l''épisode. Chaque producteur ne referme que ses propres épisodes: ''winback_daily_bilan'' (escalade 3 touches, closers content-aware) vs ''keel_reengage'' (touche unique, clos par le premier inbound de l''élève).';



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
    CONSTRAINT "scheduled_checkins_origin_check" CHECK (("origin" = ANY (ARRAY['watcher'::"text", 'rendez_vous'::"text", 'action_morning'::"text", 'action_review'::"text", 'action_followup'::"text", 'weekly_planning'::"text", 'weekly_review'::"text", 'level_review'::"text", 'keel_slot_reminder'::"text", 'keel_sunday_digest'::"text", 'unknown'::"text"])))
);


ALTER TABLE "public"."scheduled_checkins" OWNER TO "postgres";


COMMENT ON CONSTRAINT "scheduled_checkins_origin_check" ON "public"."scheduled_checkins" IS 'Closed vocabulary of checkin producers. KEEL W4.6 added keel_slot_reminder and keel_sunday_digest.';



CREATE TABLE IF NOT EXISTS "public"."scheduled_checkins_delete_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deleted_row_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "event_context" "text",
    "status" "text",
    "scheduled_for" timestamp with time zone,
    "origin" "text",
    "message_payload" "jsonb",
    "deleted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "db_user" "text" DEFAULT CURRENT_USER NOT NULL,
    "application_name" "text" DEFAULT "current_setting"('application_name'::"text", true),
    "deleting_query" "text"
);


ALTER TABLE "public"."scheduled_checkins_delete_audit" OWNER TO "postgres";


COMMENT ON TABLE "public"."scheduled_checkins_delete_audit" IS 'Audit AFTER DELETE de scheduled_checkins (chantier P0 rappels 12/07): qui supprime quoi, avec la requête appelante. Lecture service-role uniquement.';



CREATE TABLE IF NOT EXISTS "public"."slot_vocabulary" (
    "key" "text" NOT NULL,
    "label_i18n_key" "text" NOT NULL,
    "default_local_time" time without time zone,
    "sort_order" integer NOT NULL
);


ALTER TABLE "public"."slot_vocabulary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stripe_webhook_events" (
    "id" "text" NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."stripe_webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "template_id" "uuid" NOT NULL,
    "plan_version_id" "uuid",
    "commitment_id" "uuid",
    "variable_values" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "rendered" "text" DEFAULT ''::"text" NOT NULL,
    "rendered_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "render_engine_version" integer DEFAULT 1 NOT NULL,
    "keyword" "text",
    "coach_approved" boolean DEFAULT false NOT NULL,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "content_locale" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_by" "text" DEFAULT 'student'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "student_cards_approval_complete" CHECK ((("coach_approved" = false) OR (("approved_by" IS NOT NULL) AND ("approved_at" IS NOT NULL)))),
    CONSTRAINT "student_cards_created_by_check" CHECK (("created_by" = ANY (ARRAY['student'::"text", 'coach'::"text", 'system'::"text"]))),
    CONSTRAINT "student_cards_keyword_check" CHECK (("keyword" ~ '^[a-z0-9_]{2,32}$'::"text")),
    CONSTRAINT "student_cards_rendered_check" CHECK (("btrim"("rendered") <> ''::"text")),
    CONSTRAINT "student_cards_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'archived'::"text"]))),
    CONSTRAINT "student_cards_variable_values_check" CHECK (("jsonb_typeof"("variable_values") = 'object'::"text"))
);


ALTER TABLE "public"."student_cards" OWNER TO "postgres";


COMMENT ON TABLE "public"."student_cards" IS 'W8: one filled card. `rendered` is written ONLY by the keel_student_cards_render trigger - zero LLM on the write path.';



CREATE TABLE IF NOT EXISTS "public"."student_coach_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "student_user_id" "uuid" NOT NULL,
    "note" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "student_coach_notes_length_check" CHECK (("char_length"("note") <= 1500))
);


ALTER TABLE "public"."student_coach_notes" OWNER TO "postgres";


COMMENT ON TABLE "public"."student_coach_notes" IS 'Mode 1:1 assumé (2026-08-05): observations libres du coach sur UN élève, injectées après la doctrine dans les prompts. N''ouvre aucune clé de conviction et ne peut donc produire aucune ligne de plan. Voir l''en-tête de la migration 20260805180000 avant de la supprimer comme hors-modèle.';



CREATE TABLE IF NOT EXISTS "public"."student_generated_meals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "scope" "text" DEFAULT 'day'::"text" NOT NULL,
    "mode" "text" NOT NULL,
    "meal_slot" "text",
    "servings" integer DEFAULT 1 NOT NULL,
    "context" "text",
    "pantry" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "dishes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "shopping_list" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "generated_from" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "content_locale" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "preparations" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "cooking_sessions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "preferences" "text",
    "starts_on" "date" NOT NULL,
    "duration_days" smallint NOT NULL,
    "retired_at" timestamp with time zone,
    CONSTRAINT "student_generated_meals_context_check" CHECK ((("context" IS NULL) OR ("length"("context") <= 2000))),
    CONSTRAINT "student_generated_meals_dishes_check" CHECK (("jsonb_typeof"("dishes") = 'array'::"text")),
    CONSTRAINT "student_generated_meals_duration_days_check" CHECK ((("duration_days" >= 1) AND ("duration_days" <= 7))),
    CONSTRAINT "student_generated_meals_list_needs_dishes_check" CHECK ((("jsonb_array_length"("shopping_list") = 0) OR ("jsonb_array_length"("dishes") > 0))),
    CONSTRAINT "student_generated_meals_meal_slot_check" CHECK ((("meal_slot" IS NULL) OR ("meal_slot" = ANY (ARRAY['breakfast'::"text", 'snack_am'::"text", 'lunch'::"text", 'snack_pm'::"text", 'dinner'::"text", 'before_bed'::"text", 'snack'::"text"])))),
    CONSTRAINT "student_generated_meals_mode_check" CHECK (("mode" = ANY (ARRAY['from_pantry'::"text", 'to_shop'::"text"]))),
    CONSTRAINT "student_generated_meals_pantry_check" CHECK (("jsonb_typeof"("pantry") = 'array'::"text")),
    CONSTRAINT "student_generated_meals_preferences_len_check" CHECK ((("preferences" IS NULL) OR ("length"("preferences") <= 2000))),
    CONSTRAINT "student_generated_meals_scope_check" CHECK (("scope" = ANY (ARRAY['day'::"text", 'several_days'::"text"]))),
    CONSTRAINT "student_generated_meals_servings_check" CHECK ((("servings" >= 1) AND ("servings" <= 12))),
    CONSTRAINT "student_generated_meals_shopping_list_check" CHECK (("jsonb_typeof"("shopping_list") = 'array'::"text"))
);


ALTER TABLE "public"."student_generated_meals" OWNER TO "postgres";


COMMENT ON TABLE "public"."student_generated_meals" IS 'Repas composés POUR un élève, à partir de sa situation, de son contexte du moment et de ses placards. JAMAIS dans meal_ideas: cette table-là est la bibliothèque du COACH et son author_kind n''accepte pas de modèle.';



COMMENT ON COLUMN "public"."student_generated_meals"."preparations" IS 'Ce qui se CUISINE: [{id, title, servings_made, ingredients[], method, cook_on}]. Plusieurs plats y puisent via dishes[].uses[].preparation_id — une cuisson, plusieurs repas différents.';



COMMENT ON COLUMN "public"."student_generated_meals"."cooking_sessions" IS 'Quand on cuisine, et dans quel ordre: [{day, preparation_ids[], run_through}]. Le déroulé est le champ qui compte — l''ordre des gestes se joue ENTRE les préparations, donc aucun plat ne peut le porter.';



COMMENT ON COLUMN "public"."student_generated_meals"."preferences" IS 'Ce dont l''élève a envie POUR CETTE composition, en prose libre, tapé au moment de générer (« mezze d''été, plein de carottes »). DATÉ, comme `context`, et à ne pas confondre avec `student_goals.practical_constraints.food_preferences`, qui est ce qu''il a dit de sa bouffe en conversation et qui vaut pour toutes ses semaines. Le modèle le lit; le code ne branche jamais dessus.';



COMMENT ON COLUMN "public"."student_generated_meals"."starts_on" IS 'Premier jour couvert, dans le calendrier LOCAL de l''élève. Avec `duration_days`, c''est ce qui donne une date exacte à un jeton de jour (« tue ») — la table n''en avait aucune avant le 2026-08-07.';



COMMENT ON COLUMN "public"."student_generated_meals"."duration_days" IS 'Nombre de jours couverts, 1 à 7. Le plafond est structurel: au-delà un jeton de jour désignerait deux dates dans la même ligne.';



COMMENT ON COLUMN "public"."student_generated_meals"."retired_at" IS 'Cette ligne a été REMPLACÉE par une autre. Ne répond JAMAIS à « est-elle courante » — ça, ce sont les dates qui le disent, à chaque lecture.';



CREATE TABLE IF NOT EXISTS "public"."student_goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "goal" "text" NOT NULL,
    "situation" "text",
    "practical_constraints" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "content_locale" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "target_weight_kg" numeric,
    "target_waist_cm" numeric,
    "aspiration" "text",
    "focus_axis" "text",
    CONSTRAINT "student_goals_eating_rhythm_shape_check" CHECK (((NOT ("practical_constraints" ? 'eating_rhythm'::"text")) OR ("jsonb_typeof"(("practical_constraints" -> 'eating_rhythm'::"text")) = 'array'::"text"))),
    CONSTRAINT "student_goals_focus_axis_check" CHECK ((("focus_axis" IS NULL) OR ("focus_axis" = ANY (ARRAY['energy'::"text", 'hunger'::"text", 'sleep'::"text", 'digestion'::"text", 'mood'::"text", 'training'::"text"])))),
    CONSTRAINT "student_goals_focus_axis_goal_check" CHECK ((("focus_axis" IS NULL) OR ("goal" = ANY (ARRAY['health'::"text", 'performance'::"text"])))),
    CONSTRAINT "student_goals_goal_check" CHECK (("goal" = ANY (ARRAY['fat_loss'::"text", 'muscle_gain'::"text", 'recomposition'::"text", 'performance'::"text", 'health'::"text", 'maintenance'::"text"]))),
    CONSTRAINT "student_goals_target_waist_goal_check" CHECK ((("target_waist_cm" IS NULL) OR ("goal" = 'recomposition'::"text"))),
    CONSTRAINT "student_goals_target_waist_range_check" CHECK ((("target_waist_cm" IS NULL) OR (("target_waist_cm" >= (30)::numeric) AND ("target_waist_cm" <= (250)::numeric)))),
    CONSTRAINT "student_goals_target_weight_goal_check" CHECK ((("target_weight_kg" IS NULL) OR ("goal" = ANY (ARRAY['fat_loss'::"text", 'muscle_gain'::"text", 'maintenance'::"text"])))),
    CONSTRAINT "student_goals_target_weight_range_check" CHECK ((("target_weight_kg" IS NULL) OR (("target_weight_kg" >= (25)::numeric) AND ("target_weight_kg" <= (400)::numeric))))
);


ALTER TABLE "public"."student_goals" OWNER TO "postgres";


COMMENT ON TABLE "public"."student_goals" IS 'PIVOT: objectif + situation de l''élève. Entrée de la génération de plan. L''élève décide, le coach recommande.';



COMMENT ON COLUMN "public"."student_goals"."practical_constraints" IS 'Contraintes pratiques STRUCTURÉES, sur lesquelles le générateur branche (par opposition à `situation`, qu''il ne fait que lire). Clés connues: cooking_time_min, budget_band, eats_out_per_week, no_cook_days[], et eating_rhythm[] = [{"slot":"breakfast"|"snack_am"|"lunch"|"snack_pm"|"dinner"|"before_bed", "at":"HH:MM"|null}] — les moments où l''élève mange sur une journée normale. L''heure est FACULTATIVE: « je grignote l''après-midi » vaut sans « à 17h », et une heure inventée deviendrait une contrainte que personne n''a exprimée.';



COMMENT ON COLUMN "public"."student_goals"."target_weight_kg" IS 'Cible DÉCLARÉE par l''élève. fat_loss/muscle_gain: à atteindre. maintenance: référence, centre d''une bande. Jamais dérivée, jamais calculée.';



COMMENT ON COLUMN "public"."student_goals"."target_waist_cm" IS 'Cible de tour de taille, DÉCLARÉE. Recomposition uniquement: c''est la mesure qui porte cet objectif, le poids y est constant par définition.';



COMMENT ON COLUMN "public"."student_goals"."aspiration" IS 'Ce que l''élève veut, dans ses mots. Distinct de `situation`, qui dit ce qui l''EMPÊCHE. Lu par le générateur de semaine. Jamais structuré.';



COMMENT ON COLUMN "public"."student_goals"."focus_axis" IS 'L''axe du point du dimanche que l''élève veut voir monter. L''objectif des dynamiques sans cible chiffrée (health, performance).';



CREATE TABLE IF NOT EXISTS "public"."student_meal_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "meal_id" "uuid",
    "kind" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "filename" "text" NOT NULL,
    "delivery_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "delivery_error" "text",
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "student_meal_documents_delivery_status_check" CHECK (("delivery_status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'failed'::"text", 'skipped'::"text"]))),
    CONSTRAINT "student_meal_documents_kind_check" CHECK (("kind" = ANY (ARRAY['shopping_list'::"text", 'meal_card'::"text"]))),
    CONSTRAINT "student_meal_documents_sent_needs_time_check" CHECK ((("delivery_status" <> 'sent'::"text") OR ("sent_at" IS NOT NULL)))
);


ALTER TABLE "public"."student_meal_documents" OWNER TO "postgres";


COMMENT ON TABLE "public"."student_meal_documents" IS 'Un PDF produit pour un élève (liste de courses ou fiche repas) et le sort de son envoi WhatsApp. Séparé du message: le fichier survit à l''échec de l''envoi, et un renvoi ne le régénère pas.';



CREATE TABLE IF NOT EXISTS "public"."student_safety_constraints" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "allergen_ref" "text",
    "substance_ref" "text",
    "medication_class" "text",
    "severity" "text" NOT NULL,
    "declared_by" "text" NOT NULL,
    "notes" "text",
    "content_locale" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "retracted_at" timestamp with time zone,
    "retracted_reason" "text",
    "superseded_by_constraint_id" "uuid",
    "source_message_id" "text",
    "condition_ref" "text",
    CONSTRAINT "student_safety_constraints_declared_by_check" CHECK (("declared_by" = ANY (ARRAY['student'::"text", 'coach'::"text"]))),
    CONSTRAINT "student_safety_constraints_kind_check" CHECK (("kind" = ANY (ARRAY['allergy'::"text", 'intolerance'::"text", 'medical'::"text", 'religious'::"text", 'dislike'::"text"]))),
    CONSTRAINT "student_safety_constraints_ref_check" CHECK ((("allergen_ref" IS NOT NULL) OR ("substance_ref" IS NOT NULL) OR ("medication_class" IS NOT NULL) OR ("condition_ref" IS NOT NULL))),
    CONSTRAINT "student_safety_constraints_retracted_check" CHECK ((("status" <> 'retracted'::"text") OR ("retracted_at" IS NOT NULL))),
    CONSTRAINT "student_safety_constraints_severity_check" CHECK (("severity" = ANY (ARRAY['medical'::"text", 'strict'::"text", 'preference'::"text"]))),
    CONSTRAINT "student_safety_constraints_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'retracted'::"text"])))
);


ALTER TABLE "public"."student_safety_constraints" OWNER TO "postgres";


COMMENT ON COLUMN "public"."student_safety_constraints"."status" IS 'QA agent 4: une rétractation INVALIDE (audit clinique), elle ne supprime pas. Les lecteurs filtrent status=''active''.';



COMMENT ON COLUMN "public"."student_safety_constraints"."condition_ref" IS 'Jeton de MALADIE déclarée (liste fermée de _shared/keel/medical_condition_floor.ts : diabetes, coeliac_disease, hypertension, …). Distinct de substance_ref, qui désigne une substance ingérée. Non nul uniquement quand kind = ''medical''.';



CREATE TABLE IF NOT EXISTS "public"."student_week_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "week_start" "date" NOT NULL,
    "generated_from" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "adopted_at" timestamp with time zone,
    "content_locale" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "student_week_plans_check" CHECK ((("status" <> 'adopted'::"text") OR ("adopted_at" IS NOT NULL))),
    CONSTRAINT "student_week_plans_doctrine_traceable_check" CHECK ((NOT "jsonb_path_exists"("items", '$[*]?(@."kind" == "nutrition" && (!(exists (@."source_belief_key")) || @."source_belief_key" == null))'::"jsonpath"))),
    CONSTRAINT "student_week_plans_kind_closed_check" CHECK ((NOT "jsonb_path_exists"("items", '$[*]?(@."kind" != "nutrition" && @."kind" != "action")'::"jsonpath"))),
    CONSTRAINT "student_week_plans_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'adopted'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."student_week_plans" OWNER TO "postgres";


COMMENT ON TABLE "public"."student_week_plans" IS 'PIVOT: le plan que l''ÉLÈVE se fixe, à partir des recommandations du coach. JAMAIS une prescription: n''entre pas dans plan_commitments, donc jamais évalué, jamais noté. Une ligne nutrition sans source coach est refusée.';



CREATE TABLE IF NOT EXISTS "public"."subscription_notifications" (
    "dedup_key" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "stripe_subscription_id" "text",
    "kind" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."subscription_notifications" OWNER TO "postgres";


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
    CONSTRAINT "subscriptions_tier_check" CHECK ((("tier" IS NULL) OR ("tier" = ANY (ARRAY['coach'::"text", 'system'::"text", 'alliance'::"text", 'architecte'::"text"]))))
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."substance_interactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "substance_ref" "text" NOT NULL,
    "medication_class" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "note" "text" NOT NULL,
    "content_locale" "text" DEFAULT 'en'::"text" NOT NULL,
    CONSTRAINT "substance_interactions_severity_check" CHECK (("severity" = ANY (ARRAY['high'::"text", 'moderate'::"text", 'low'::"text"])))
);


ALTER TABLE "public"."substance_interactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."substance_limits" (
    "substance_ref" "text" NOT NULL,
    "ul_amount" numeric NOT NULL,
    "ul_unit" "text" NOT NULL,
    "per" "text" DEFAULT 'day'::"text" NOT NULL,
    CONSTRAINT "substance_limits_per_check" CHECK (("per" = ANY (ARRAY['day'::"text", 'week'::"text"]))),
    CONSTRAINT "substance_limits_ul_unit_check" CHECK (("ul_unit" = ANY (ARRAY['IU'::"text", 'mg'::"text", 'mcg'::"text", 'g'::"text"])))
);


ALTER TABLE "public"."substance_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."substances" (
    "slug" "text" NOT NULL,
    "kind" "text" DEFAULT 'supplement'::"text" NOT NULL,
    "label_i18n_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "substances_kind_check" CHECK (("kind" = ANY (ARRAY['supplement'::"text", 'nutrient'::"text", 'compound'::"text", 'substance'::"text"])))
);


ALTER TABLE "public"."substances" OWNER TO "postgres";


COMMENT ON TABLE "public"."substances" IS 'KEEL canonical substance vocabulary. Parent of plan_commitments.substance_ref, substance_limits and substance_interactions. Mirror of _shared/keel/tokens.ts SUBSTANCE_REFS — kept aligned by scripts/ci/token-lint.mjs. No ontology: a flat slug list, deliberately (see docs/keel/CONTRACT.md "Refused, on the record").';



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
    CONSTRAINT "system_runtime_snapshots_snapshot_type_check" CHECK (("snapshot_type" = ANY (ARRAY['conversation_pulse'::"text", 'watcher_conversation_pulse_v2'::"text", 'daily_conversation_pulse_v2'::"text", 'weekly_conversation_pulse_v2'::"text", 'momentum_state_v2'::"text", 'active_load'::"text", 'repair_mode'::"text", 'weekly_digest'::"text", 'cycle_created_v2'::"text", 'cycle_structured_v2'::"text", 'cycle_prioritized_v2'::"text", 'cycle_profile_completed_v2'::"text", 'transformation_activated_v2'::"text", 'transformation_completed_v2'::"text", 'transformation_handoff_generated_v2'::"text", 'plan_generated_v2'::"text", 'plan_activated_v2'::"text", 'conversation_pulse_generated_v2'::"text", 'weekly_digest_generated_v2'::"text", 'momentum_state_updated_v2'::"text", 'active_load_recomputed_v2'::"text", 'daily_bilan_decided_v2'::"text", 'daily_bilan_completed_v2'::"text", 'weekly_bilan_decided_v2'::"text", 'weekly_bilan_completed_v2'::"text", 'proactive_window_decided_v2'::"text", 'morning_nudge_generated_v2'::"text", 'rendez_vous_state_changed_v2'::"text", 'repair_mode_entered_v2'::"text", 'repair_mode_exited_v2'::"text", 'plan_item_entry_logged_v2'::"text", 'metric_recorded_v2'::"text", 'memory_retrieval_executed_v2'::"text", 'memory_persisted_v2'::"text", 'memory_handoff_v2'::"text", 'coaching_blocker_detected_v2'::"text", 'coaching_intervention_proposed_v2'::"text", 'coaching_intervention_rendered_v2'::"text", 'coaching_follow_up_captured_v2'::"text", 'coaching_technique_deprioritized_v2'::"text", 'cooldown_entry'::"text"])))
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



CREATE TABLE IF NOT EXISTS "public"."upcoming_contexts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "local_date" "date" NOT NULL,
    "slot_key" "text",
    "kind" "text" NOT NULL,
    "source" "text" NOT NULL,
    "note" "text",
    "content_locale" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "upcoming_contexts_kind_check" CHECK (("kind" = ANY (ARRAY['restaurant'::"text", 'social'::"text", 'travel'::"text", 'family'::"text", 'work'::"text", 'other'::"text"]))),
    CONSTRAINT "upcoming_contexts_source_check" CHECK (("source" = ANY (ARRAY['chat'::"text", 'weekly_review'::"text", 'app'::"text"])))
);


ALTER TABLE "public"."upcoming_contexts" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."user_framework_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_id" "uuid",
    "action_id" "text" NOT NULL,
    "framework_title" "text" NOT NULL,
    "framework_type" "text" NOT NULL,
    "content" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "schema_snapshot" "jsonb",
    "submission_id" "uuid",
    "target_reps" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_framework_entries" OWNER TO "postgres";


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
    CONSTRAINT "user_habit_week_plans_status_check" CHECK (("status" = ANY (ARRAY['pending_confirmation'::"text", 'confirmed'::"text", 'auto_applied'::"text", 'archived'::"text"])))
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
    CONSTRAINT "user_plan_items_scheduled_days_check" CHECK ((("scheduled_days" IS NULL) OR (("cardinality"("scheduled_days") >= 1) AND ("cardinality"("scheduled_days") <= 7) AND ("scheduled_days" <@ ARRAY['mon'::"text", 'tue'::"text", 'wed'::"text", 'thu'::"text", 'fri'::"text", 'sat'::"text", 'sun'::"text"])))),
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


CREATE TABLE IF NOT EXISTS "public"."vocabulary_extension_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "term" "text" NOT NULL,
    "content_locale" "text" NOT NULL,
    "note" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "resolved_slug" "text",
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "vocabulary_extension_requests_resolution_check" CHECK (((("status" = 'open'::"text") AND ("resolved_slug" IS NULL) AND ("resolved_at" IS NULL)) OR (("status" = 'accepted'::"text") AND ("resolved_slug" IS NOT NULL) AND ("resolved_at" IS NOT NULL)) OR (("status" = 'declined'::"text") AND ("resolved_slug" IS NULL) AND ("resolved_at" IS NOT NULL)))),
    CONSTRAINT "vocabulary_extension_requests_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'accepted'::"text", 'declined'::"text"]))),
    CONSTRAINT "vocabulary_extension_requests_term_check" CHECK ((("length"("btrim"("term")) >= 1) AND ("length"("btrim"("term")) <= 80)))
);


ALTER TABLE "public"."vocabulary_extension_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weekly_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_version_id" "uuid",
    "week_start_date" "date" NOT NULL,
    "plan_version_changed_midweek" boolean DEFAULT false NOT NULL,
    "logging_coverage" numeric,
    "core_adherence_pct" numeric,
    "overall_adherence_pct" numeric,
    "evaluable_days" integer,
    "flex_used" integer,
    "flex_allowance" integer,
    "self_rated_adherence" integer,
    "biofeedback" "jsonb",
    "outcomes" "jsonb",
    "outcome_direction" "text",
    "top_failing_commitment_id" "uuid",
    "lapse_context" "text",
    "risk_band" "text",
    "student_narrative" "text",
    "coach_draft_reply" "text",
    "content_locale" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "week_facts" "jsonb",
    "week_facts_computed_at" timestamp with time zone,
    CONSTRAINT "weekly_reviews_risk_band_check" CHECK (("risk_band" = ANY (ARRAY['on_track'::"text", 'watch'::"text", 'at_risk'::"text", 'disengaged'::"text", 'outcome_mismatch'::"text", 'restriction_flag'::"text"])))
);


ALTER TABLE "public"."weekly_reviews" OWNER TO "postgres";


COMMENT ON COLUMN "public"."weekly_reviews"."plan_version_id" IS 'NULL en modèle 1:N (le coach recommande, il ne prescrit pas: aucune plan_version n''existe). Rempli en 1:1, où la règle "jamais deux versions moyennées" s''applique.';



COMMENT ON COLUMN "public"."weekly_reviews"."week_facts" IS 'La lecture de la semaine, GELÉE au moment où le point hebdomadaire part (keel-weekly-flow-v1). Forme: { version, window, coverage, portions, livability, alignment[], branch, question, asked_group }. Artefact de RENDU, jamais une entrée d''évaluateur: aucune ligne d''adhérence n''en dérive, et le modèle ne peut citer que des nombres qui s''y trouvent (_shared/keel/week_review.ts). Recalculer au lieu de relire donnerait trois valeurs pour un même chiffre entre l''envoi, la réponse et la semaine suivante.';



COMMENT ON COLUMN "public"."weekly_reviews"."week_facts_computed_at" IS 'Quand week_facts a été calculé. NULL est un état DISTINCT de « calculé et vide »: la ligne préexiste souvent au calcul (le biofeedback l''a créée). NULL ⇒ aucun bloc injecté, aucun bilan composé.';



ALTER TABLE ONLY "public"."account_security_confirmations"
    ADD CONSTRAINT "account_security_confirmations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_config"
    ADD CONSTRAINT "app_config_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."card_armings"
    ADD CONSTRAINT "card_armings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."card_templates"
    ADD CONSTRAINT "card_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."card_wins"
    ADD CONSTRAINT "card_wins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_access_events"
    ADD CONSTRAINT "coach_access_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_billing_periods"
    ADD CONSTRAINT "coach_billing_periods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_broadcasts"
    ADD CONSTRAINT "coach_broadcasts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_clients"
    ADD CONSTRAINT "coach_clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_doctrine_compilations"
    ADD CONSTRAINT "coach_doctrine_compilations_pkey" PRIMARY KEY ("doctrine_id", "goal");



ALTER TABLE ONLY "public"."coach_doctrines"
    ADD CONSTRAINT "coach_doctrines_coach_id_version_key" UNIQUE ("coach_id", "version");



ALTER TABLE ONLY "public"."coach_doctrines"
    ADD CONSTRAINT "coach_doctrines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_document_chunks"
    ADD CONSTRAINT "coach_document_chunks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_document_chunks"
    ADD CONSTRAINT "coach_document_chunks_unique_ordinal" UNIQUE ("document_id", "ordinal");



ALTER TABLE ONLY "public"."coach_document_citations"
    ADD CONSTRAINT "coach_document_citations_one_per_entry" UNIQUE ("document_id", "entry_kind", "entry_key");



ALTER TABLE ONLY "public"."coach_document_citations"
    ADD CONSTRAINT "coach_document_citations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_documents"
    ADD CONSTRAINT "coach_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_food_items"
    ADD CONSTRAINT "coach_food_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_food_proposals"
    ADD CONSTRAINT "coach_food_proposals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_food_rules"
    ADD CONSTRAINT "coach_food_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_food_rules"
    ADD CONSTRAINT "coach_food_rules_protocol_id_food_group_ref_key" UNIQUE ("protocol_id", "food_group_ref");



ALTER TABLE ONLY "public"."coach_invitations"
    ADD CONSTRAINT "coach_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_protocols"
    ADD CONSTRAINT "coach_protocols_coach_id_version_key" UNIQUE ("coach_id", "version");



ALTER TABLE ONLY "public"."coach_protocols"
    ADD CONSTRAINT "coach_protocols_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_syntheses"
    ADD CONSTRAINT "coach_syntheses_coach_id_kind_period_start_period_end_key" UNIQUE ("coach_id", "kind", "period_start", "period_end");



ALTER TABLE ONLY "public"."coach_syntheses"
    ADD CONSTRAINT "coach_syntheses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_terms"
    ADD CONSTRAINT "coach_terms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_timing_rules"
    ADD CONSTRAINT "coach_timing_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coaches"
    ADD CONSTRAINT "coaches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coaches"
    ADD CONSTRAINT "coaches_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."cohorts"
    ADD CONSTRAINT "cohorts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commitment_evaluations"
    ADD CONSTRAINT "commitment_evaluations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commitment_relations"
    ADD CONSTRAINT "commitment_relations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."communication_logs"
    ADD CONSTRAINT "communication_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."confirmation_tokens_consumed"
    ADD CONSTRAINT "confirmation_tokens_consumed_pkey" PRIMARY KEY ("token_id");



ALTER TABLE ONLY "public"."contract_change_requests"
    ADD CONSTRAINT "contract_change_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_eval_events"
    ADD CONSTRAINT "conversation_eval_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_eval_judge_jobs"
    ADD CONSTRAINT "conversation_eval_judge_jobs_eval_run_id_uniq" UNIQUE ("eval_run_id");



ALTER TABLE ONLY "public"."conversation_eval_judge_jobs"
    ADD CONSTRAINT "conversation_eval_judge_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_eval_runs"
    ADD CONSTRAINT "conversation_eval_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_runtime_events"
    ADD CONSTRAINT "conversation_runtime_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_scope_memories"
    ADD CONSTRAINT "conversation_scope_memories_pkey" PRIMARY KEY ("user_id", "scope");



ALTER TABLE ONLY "public"."conversation_turn_traces"
    ADD CONSTRAINT "conversation_turn_traces_pkey" PRIMARY KEY ("turn_id");



ALTER TABLE ONLY "public"."crisis_resources"
    ADD CONSTRAINT "crisis_resources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crisis_resources"
    ADD CONSTRAINT "crisis_resources_unique_contact" UNIQUE ("country", "kind", "contact");



ALTER TABLE ONLY "public"."deletion_records"
    ADD CONSTRAINT "deletion_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deletion_records"
    ADD CONSTRAINT "deletion_records_user_id_hash_key" UNIQUE ("user_id_hash");



ALTER TABLE ONLY "public"."food_groups"
    ADD CONSTRAINT "food_groups_pkey" PRIMARY KEY ("slug");



ALTER TABLE ONLY "public"."food_items"
    ADD CONSTRAINT "food_items_pkey" PRIMARY KEY ("slug");



ALTER TABLE ONLY "public"."inbound_dedup"
    ADD CONSTRAINT "inbound_dedup_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."internal_admins"
    ADD CONSTRAINT "internal_admins_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."llm_pricing"
    ADD CONSTRAINT "llm_pricing_pkey" PRIMARY KEY ("provider", "model");



ALTER TABLE ONLY "public"."llm_raw_response_events"
    ADD CONSTRAINT "llm_raw_response_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."llm_retry_jobs"
    ADD CONSTRAINT "llm_retry_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."llm_usage_events"
    ADD CONSTRAINT "llm_usage_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_ideas"
    ADD CONSTRAINT "meal_ideas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_precision_questions"
    ADD CONSTRAINT "meal_precision_questions_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."outbound_messages"
    ADD CONSTRAINT "outbound_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pending_actions"
    ADD CONSTRAINT "pending_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plan_commitments"
    ADD CONSTRAINT "plan_commitments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plan_documents"
    ADD CONSTRAINT "plan_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plan_templates"
    ADD CONSTRAINT "plan_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plan_versions"
    ADD CONSTRAINT "plan_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."planned_deviations"
    ADD CONSTRAINT "planned_deviations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."proactive_job_state"
    ADD CONSTRAINT "proactive_job_state_pkey" PRIMARY KEY ("user_id", "job");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."protocol_events"
    ADD CONSTRAINT "protocol_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rate_limit_counters"
    ADD CONSTRAINT "rate_limit_counters_pkey" PRIMARY KEY ("bucket_key", "window_start");



ALTER TABLE ONLY "public"."reengagement_episodes"
    ADD CONSTRAINT "reengagement_episodes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scheduled_checkins_delete_audit"
    ADD CONSTRAINT "scheduled_checkins_delete_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scheduled_checkins"
    ADD CONSTRAINT "scheduled_checkins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."slot_vocabulary"
    ADD CONSTRAINT "slot_vocabulary_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."stripe_webhook_events"
    ADD CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_cards"
    ADD CONSTRAINT "student_cards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_coach_notes"
    ADD CONSTRAINT "student_coach_notes_pair_unique" UNIQUE ("coach_id", "student_user_id");



ALTER TABLE ONLY "public"."student_coach_notes"
    ADD CONSTRAINT "student_coach_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_daily_checkins"
    ADD CONSTRAINT "student_daily_checkins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_daily_checkins"
    ADD CONSTRAINT "student_daily_checkins_user_id_local_date_key" UNIQUE ("user_id", "local_date");



ALTER TABLE ONLY "public"."student_generated_meals"
    ADD CONSTRAINT "student_generated_meals_live_windows_dont_overlap" EXCLUDE USING "gist" ("user_id" WITH =, "daterange"("starts_on", ("starts_on" + ("duration_days")::integer)) WITH &&) WHERE (("retired_at" IS NULL));



ALTER TABLE ONLY "public"."student_generated_meals"
    ADD CONSTRAINT "student_generated_meals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_goals"
    ADD CONSTRAINT "student_goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_goals"
    ADD CONSTRAINT "student_goals_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."student_meal_documents"
    ADD CONSTRAINT "student_meal_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_safety_constraints"
    ADD CONSTRAINT "student_safety_constraints_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_week_plans"
    ADD CONSTRAINT "student_week_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_week_plans"
    ADD CONSTRAINT "student_week_plans_user_id_week_start_key" UNIQUE ("user_id", "week_start");



ALTER TABLE ONLY "public"."subscription_notifications"
    ADD CONSTRAINT "subscription_notifications_pkey" PRIMARY KEY ("dedup_key");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_stripe_subscription_id_key" UNIQUE ("stripe_subscription_id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."substance_interactions"
    ADD CONSTRAINT "substance_interactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."substance_interactions"
    ADD CONSTRAINT "substance_interactions_substance_ref_medication_class_key" UNIQUE ("substance_ref", "medication_class");



ALTER TABLE ONLY "public"."substance_limits"
    ADD CONSTRAINT "substance_limits_pkey" PRIMARY KEY ("substance_ref");



ALTER TABLE ONLY "public"."substances"
    ADD CONSTRAINT "substances_pkey" PRIMARY KEY ("slug");



ALTER TABLE ONLY "public"."system_error_logs"
    ADD CONSTRAINT "system_error_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_runtime_snapshots"
    ADD CONSTRAINT "system_runtime_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."turn_summary_logs"
    ADD CONSTRAINT "turn_summary_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."upcoming_contexts"
    ADD CONSTRAINT "upcoming_contexts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_attack_cards"
    ADD CONSTRAINT "user_attack_cards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_chat_states"
    ADD CONSTRAINT "user_chat_states_pkey" PRIMARY KEY ("user_id", "scope");



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



ALTER TABLE ONLY "public"."user_framework_entries"
    ADD CONSTRAINT "user_framework_entries_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."vocabulary_extension_requests"
    ADD CONSTRAINT "vocabulary_extension_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_reviews"
    ADD CONSTRAINT "weekly_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_reviews"
    ADD CONSTRAINT "weekly_reviews_user_id_plan_version_id_week_start_date_key" UNIQUE ("user_id", "plan_version_id", "week_start_date");



ALTER TABLE ONLY "public"."whatsapp_cost_events"
    ADD CONSTRAINT "whatsapp_cost_events_pkey" PRIMARY KEY ("id");



CREATE INDEX "attack_cards_plan_item_idx" ON "public"."user_attack_cards" USING "btree" ("plan_item_id", "generated_at" DESC) WHERE ("plan_item_id" IS NOT NULL);



CREATE INDEX "attack_cards_user_scope_idx" ON "public"."user_attack_cards" USING "btree" ("user_id", "cycle_id", "scope_kind", "transformation_id");



CREATE INDEX "attack_cards_user_scope_status_generated_idx" ON "public"."user_attack_cards" USING "btree" ("user_id", "cycle_id", "scope_kind", "transformation_id", "status", "generated_at" DESC);



CREATE INDEX "card_armings_due_idx" ON "public"."card_armings" USING "btree" ("arm_at") WHERE ("status" = 'pending'::"text");



CREATE UNIQUE INDEX "card_armings_unique_idx" ON "public"."card_armings" USING "btree" ("student_card_id", "trigger_kind", "trigger_ref_id", "local_date", "slot_key") NULLS NOT DISTINCT;



CREATE INDEX "card_armings_user_date_idx" ON "public"."card_armings" USING "btree" ("user_id", "local_date");



CREATE INDEX "card_templates_arming_idx" ON "public"."card_templates" USING "btree" ("card_kind", "status");



CREATE UNIQUE INDEX "card_templates_coach_key_idx" ON "public"."card_templates" USING "btree" ("coach_id", "template_key") WHERE ("owner_scope" = 'coach'::"text");



CREATE UNIQUE INDEX "card_templates_global_key_idx" ON "public"."card_templates" USING "btree" ("template_key") WHERE ("owner_scope" = 'global'::"text");



CREATE UNIQUE INDEX "card_templates_legacy_key_idx" ON "public"."card_templates" USING "btree" ("legacy_technique_key") WHERE ("legacy_technique_key" IS NOT NULL);



CREATE INDEX "card_wins_card_idx" ON "public"."card_wins" USING "btree" ("student_card_id", "local_date");



CREATE UNIQUE INDEX "card_wins_source_message_idx" ON "public"."card_wins" USING "btree" ("user_id", "source_message_id") WHERE ("source_message_id" IS NOT NULL);



CREATE INDEX "card_wins_user_date_idx" ON "public"."card_wins" USING "btree" ("user_id", "local_date");



CREATE INDEX "chat_messages_user_created_role_idx" ON "public"."chat_messages" USING "btree" ("user_id", "created_at") WHERE ("role" = 'user'::"public"."chat_role");



CREATE INDEX "coach_access_events_coach_idx" ON "public"."coach_access_events" USING "btree" ("coach_id", "occurred_at" DESC);



CREATE INDEX "coach_access_events_student_idx" ON "public"."coach_access_events" USING "btree" ("student_user_id", "occurred_at" DESC);



CREATE UNIQUE INDEX "coach_billing_periods_coach_month_idx" ON "public"."coach_billing_periods" USING "btree" ("coach_id", "period_month");



CREATE UNIQUE INDEX "coach_broadcasts_one_per_week_idx" ON "public"."coach_broadcasts" USING "btree" ("coach_id", "date_trunc"('week'::"text", ("created_at" AT TIME ZONE 'utc'::"text")));



CREATE INDEX "coach_broadcasts_pending_idx" ON "public"."coach_broadcasts" USING "btree" ("created_at") WHERE ("finished_at" IS NULL);



CREATE INDEX "coach_clients_coach_status_idx" ON "public"."coach_clients" USING "btree" ("coach_id", "status");



CREATE INDEX "coach_clients_cohort_idx" ON "public"."coach_clients" USING "btree" ("cohort_id") WHERE ("cohort_id" IS NOT NULL);



CREATE INDEX "coach_clients_scheduled_end_idx" ON "public"."coach_clients" USING "btree" ("scheduled_end_at") WHERE ("scheduled_end_at" IS NOT NULL);



CREATE INDEX "coach_doctrine_compilations_hash_idx" ON "public"."coach_doctrine_compilations" USING "btree" ("compiled_prompt_hash");



CREATE INDEX "coach_doctrines_coach_version_idx" ON "public"."coach_doctrines" USING "btree" ("coach_id", "version" DESC);



CREATE UNIQUE INDEX "coach_doctrines_one_published_idx" ON "public"."coach_doctrines" USING "btree" ("coach_id") WHERE ("published_at" IS NOT NULL);



CREATE INDEX "coach_document_chunks_document_order_idx" ON "public"."coach_document_chunks" USING "btree" ("document_id", "ordinal");



CREATE INDEX "coach_document_citations_lookup_idx" ON "public"."coach_document_citations" USING "btree" ("coach_id", "entry_kind", "entry_key");



CREATE INDEX "coach_documents_coach_recent_idx" ON "public"."coach_documents" USING "btree" ("coach_id", "created_at" DESC);



CREATE UNIQUE INDEX "coach_documents_one_per_content_idx" ON "public"."coach_documents" USING "btree" ("coach_id", "content_sha256");



CREATE INDEX "coach_food_items_protocol_idx" ON "public"."coach_food_items" USING "btree" ("protocol_id");



CREATE UNIQUE INDEX "coach_food_items_unique_per_protocol_idx" ON "public"."coach_food_items" USING "btree" ("protocol_id", COALESCE("food_item_ref", "lower"("btrim"("label"))));



CREATE INDEX "coach_food_proposals_coach_pending_idx" ON "public"."coach_food_proposals" USING "btree" ("coach_id", "created_at") WHERE ("status" = 'pending'::"text");



CREATE UNIQUE INDEX "coach_food_proposals_one_pending_per_term_idx" ON "public"."coach_food_proposals" USING "btree" ("coach_id", "lower"("btrim"("term"))) WHERE ("status" = 'pending'::"text");



CREATE INDEX "coach_food_rules_protocol_idx" ON "public"."coach_food_rules" USING "btree" ("protocol_id");



CREATE UNIQUE INDEX "coach_invitations_token_hash_idx" ON "public"."coach_invitations" USING "btree" ("invite_token_hash");



CREATE UNIQUE INDEX "coach_protocols_one_draft_per_coach_idx" ON "public"."coach_protocols" USING "btree" ("coach_id") WHERE ("status" = 'draft'::"text");



CREATE UNIQUE INDEX "coach_protocols_one_published_per_coach_idx" ON "public"."coach_protocols" USING "btree" ("coach_id") WHERE ("status" = 'published'::"text");



CREATE INDEX "coach_syntheses_coach_idx" ON "public"."coach_syntheses" USING "btree" ("coach_id", "period_start" DESC);



CREATE UNIQUE INDEX "coach_terms_unique_per_coach_idx" ON "public"."coach_terms" USING "btree" ("coach_id", "lower"("btrim"("term")));



CREATE UNIQUE INDEX "coach_timing_rules_no_duplicate_idx" ON "public"."coach_timing_rules" USING "btree" ("protocol_id", "template", "food_group_ref", COALESCE("slot_key", ''::"text"), COALESCE("cutoff_local", '00:00:00'::time without time zone));



CREATE INDEX "coach_timing_rules_protocol_idx" ON "public"."coach_timing_rules" USING "btree" ("protocol_id");



CREATE UNIQUE INDEX "coaches_one_house_coach" ON "public"."coaches" USING "btree" ("coach_kind") WHERE ("coach_kind" = 'house'::"text");



CREATE INDEX "cohorts_coach_idx" ON "public"."cohorts" USING "btree" ("coach_id", "status");



CREATE UNIQUE INDEX "commitment_evaluations_identity_idx" ON "public"."commitment_evaluations" USING "btree" ("user_id", "commitment_id", "local_date", COALESCE("slot_key", 'no_slot'::"text"));



CREATE INDEX "commitment_evaluations_unresolved_sweep_idx" ON "public"."commitment_evaluations" USING "btree" ("user_id", "plan_version_id", "local_date") WHERE (("status" = 'unknown'::"text") AND ("resolved_at" IS NULL));



CREATE INDEX "commitment_evaluations_user_date_idx" ON "public"."commitment_evaluations" USING "btree" ("user_id", "local_date");



CREATE INDEX "communication_logs_type_idx" ON "public"."communication_logs" USING "btree" ("type");



CREATE INDEX "communication_logs_user_id_idx" ON "public"."communication_logs" USING "btree" ("user_id");



CREATE INDEX "contract_change_requests_user_status_idx" ON "public"."contract_change_requests" USING "btree" ("user_id", "status");



CREATE INDEX "conversation_eval_events_request_idx" ON "public"."conversation_eval_events" USING "btree" ("request_id", "created_at" DESC);



CREATE INDEX "conversation_eval_events_run_idx" ON "public"."conversation_eval_events" USING "btree" ("eval_run_id", "created_at" DESC);



CREATE INDEX "conversation_eval_events_turn_summary_ttl_idx" ON "public"."conversation_eval_events" USING "btree" ("created_at" DESC) WHERE (("eval_run_id" IS NULL) AND ("source" = 'turn_summary'::"text"));



CREATE INDEX "conversation_eval_judge_jobs_next_attempt_idx" ON "public"."conversation_eval_judge_jobs" USING "btree" ("next_attempt_at") WHERE ("status" = ANY (ARRAY['pending'::"text", 'processing'::"text"]));



CREATE INDEX "conversation_runtime_events_event_idx" ON "public"."conversation_runtime_events" USING "btree" ("event", "created_at" DESC);



CREATE INDEX "conversation_runtime_events_request_idx" ON "public"."conversation_runtime_events" USING "btree" ("request_id", "created_at" DESC);



CREATE INDEX "conversation_runtime_events_user_idx" ON "public"."conversation_runtime_events" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "conversation_scope_memories_architect_draft_ttl_idx" ON "public"."conversation_scope_memories" USING "btree" ("updated_at") WHERE (("scope" ~~ 'story:draft:%'::"text") OR ("scope" ~~ 'reflection:draft:%'::"text"));



CREATE INDEX "conversation_scope_memories_user_updated_idx" ON "public"."conversation_scope_memories" USING "btree" ("user_id", "updated_at" DESC);



CREATE INDEX "crisis_resources_lookup_idx" ON "public"."crisis_resources" USING "btree" ("country", "kind", "priority");



CREATE INDEX "defense_cards_plan_item_idx" ON "public"."user_defense_cards" USING "btree" ("plan_item_id", "generated_at" DESC) WHERE ("plan_item_id" IS NOT NULL);



CREATE INDEX "defense_cards_user_scope_generated_idx" ON "public"."user_defense_cards" USING "btree" ("user_id", "cycle_id", "scope_kind", "transformation_id", "phase_id", "generated_at" DESC);



CREATE INDEX "defense_cards_user_scope_idx" ON "public"."user_defense_cards" USING "btree" ("user_id", "cycle_id", "scope_kind", "transformation_id");



CREATE INDEX "defense_wins_card_idx" ON "public"."user_defense_wins" USING "btree" ("defense_card_id", "logged_at" DESC);



CREATE INDEX "food_items_group_idx" ON "public"."food_items" USING "btree" ("food_group_ref", "sort_order", "slug");



CREATE INDEX "framework_entries_action_created_idx" ON "public"."user_framework_entries" USING "btree" ("action_id", "created_at" DESC);



CREATE INDEX "framework_entries_plan_action_idx" ON "public"."user_framework_entries" USING "btree" ("plan_id", "action_id");



CREATE INDEX "framework_entries_submission_idx" ON "public"."user_framework_entries" USING "btree" ("submission_id");



CREATE INDEX "framework_entries_user_type_idx" ON "public"."user_framework_entries" USING "btree" ("user_id", "framework_type");



CREATE INDEX "idx_account_security_confirmations_user" ON "public"."account_security_confirmations" USING "btree" ("user_id", "operation_type");



CREATE INDEX "idx_chat_messages_user_created" ON "public"."chat_messages" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_chat_messages_user_scope_created" ON "public"."chat_messages" USING "btree" ("user_id", "scope", "created_at" DESC);



CREATE INDEX "idx_conversation_turn_traces_user_ts" ON "public"."conversation_turn_traces" USING "btree" ("user_id", "ts" DESC);



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



CREATE INDEX "idx_profiles_account_status" ON "public"."profiles" USING "btree" ("account_status") WHERE ("account_status" <> 'active'::"text");



CREATE INDEX "idx_profiles_purge_at" ON "public"."profiles" USING "btree" ("purge_at") WHERE ("purge_at" IS NOT NULL);



CREATE INDEX "idx_topic_keywords_embedding" ON "public"."user_topic_keywords" USING "hnsw" ("keyword_embedding" "public"."vector_cosine_ops");



CREATE INDEX "idx_topic_keywords_keyword" ON "public"."user_topic_keywords" USING "btree" ("user_id", "keyword");



CREATE INDEX "idx_topic_keywords_user_topic" ON "public"."user_topic_keywords" USING "btree" ("user_id", "topic_id");



CREATE INDEX "idx_topic_memories_user_slug" ON "public"."user_topic_memories" USING "btree" ("user_id", "slug");



CREATE INDEX "idx_topic_memories_user_status" ON "public"."user_topic_memories" USING "btree" ("user_id", "status");



CREATE INDEX "idx_user_chat_states_user_scope" ON "public"."user_chat_states" USING "btree" ("user_id", "scope");



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



CREATE UNIQUE INDEX "inbound_dedup_user_client_message_idx" ON "public"."inbound_dedup" USING "btree" ("user_id", "client_message_id");



CREATE INDEX "inbound_dedup_user_created_idx" ON "public"."inbound_dedup" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "inspiration_items_user_scope_idx" ON "public"."user_inspiration_items" USING "btree" ("user_id", "cycle_id", "scope_kind", "status", "generated_at" DESC);



CREATE INDEX "inspiration_items_user_transformation_idx" ON "public"."user_inspiration_items" USING "btree" ("user_id", "transformation_id", "status", "generated_at" DESC);



CREATE INDEX "llm_raw_response_events_created_idx" ON "public"."llm_raw_response_events" USING "btree" ("created_at" DESC);



CREATE INDEX "llm_raw_response_events_request_idx" ON "public"."llm_raw_response_events" USING "btree" ("request_id", "created_at" DESC);



CREATE INDEX "llm_raw_response_events_source_idx" ON "public"."llm_raw_response_events" USING "btree" ("source", "created_at" DESC);



CREATE INDEX "llm_raw_response_events_user_idx" ON "public"."llm_raw_response_events" USING "btree" ("user_id", "created_at" DESC);



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



CREATE INDEX "meal_ideas_coach_idx" ON "public"."meal_ideas" USING "btree" ("coach_id", "status");



CREATE INDEX "meal_precision_questions_day_idx" ON "public"."meal_precision_questions" USING "btree" ("user_id", "local_date");



CREATE UNIQUE INDEX "meal_precision_questions_message_idx" ON "public"."meal_precision_questions" USING "btree" ("user_id", "asked_for_message_id");



CREATE UNIQUE INDEX "memory_eval_annotations_reviewer_target_dimension_idx" ON "public"."memory_eval_annotations" USING "btree" ("reviewer_user_id", "target_key", "dimension");



CREATE INDEX "memory_eval_annotations_user_window_idx" ON "public"."memory_eval_annotations" USING "btree" ("user_id", "window_from" DESC, "window_to" DESC);



CREATE INDEX "memory_observability_events_event_idx" ON "public"."memory_observability_events" USING "btree" ("event_name", "created_at" DESC);



CREATE INDEX "memory_observability_events_request_idx" ON "public"."memory_observability_events" USING "btree" ("request_id");



CREATE INDEX "memory_observability_events_user_idx" ON "public"."memory_observability_events" USING "btree" ("user_id", "created_at" DESC);



CREATE UNIQUE INDEX "one_live_coach_per_student" ON "public"."coach_clients" USING "btree" ("student_user_id") WHERE (("status" = ANY (ARRAY['invited'::"text", 'active'::"text"])) AND ("student_user_id" IS NOT NULL));



CREATE UNIQUE INDEX "one_pending_per_email" ON "public"."coach_invitations" USING "btree" ("coach_id", "email") WHERE ("status" = 'pending'::"text");



CREATE UNIQUE INDEX "outbound_messages_provider_message_id_key" ON "public"."outbound_messages" USING "btree" ("provider_message_id") WHERE ("provider_message_id" IS NOT NULL);



CREATE INDEX "outbound_messages_status_next_retry_idx" ON "public"."outbound_messages" USING "btree" ("status", "next_retry_at");



CREATE INDEX "outbound_messages_unsolicited_day_idx" ON "public"."outbound_messages" USING "btree" ("user_id", (("metadata" ->> 'local_date'::"text")), (("metadata" ->> 'counts_as_unsolicited'::"text"))) WHERE (("delivery_channel" = 'in_app'::"text") AND ("status" = 'sent'::"text"));



CREATE INDEX "outbound_messages_user_channel_created_idx" ON "public"."outbound_messages" USING "btree" ("user_id", "delivery_channel", "created_at" DESC);



CREATE INDEX "outbound_messages_user_id_idx" ON "public"."outbound_messages" USING "btree" ("user_id");



CREATE INDEX "pending_actions_deferred_due_idx" ON "public"."pending_actions" USING "btree" ("status", "not_before", "created_at" DESC) WHERE ("kind" = 'deferred_send'::"text");



CREATE INDEX "pending_actions_lookup_idx" ON "public"."pending_actions" USING "btree" ("user_id", "kind", "status", "created_at" DESC);



CREATE INDEX "pending_actions_proactive_candidate_idx" ON "public"."pending_actions" USING "btree" ("user_id", "status", "not_before", "created_at" DESC) WHERE ("kind" = 'proactive_template_candidate'::"text");



CREATE INDEX "plan_commitments_nominal_active_idx" ON "public"."plan_commitments" USING "btree" ("plan_version_id") WHERE (("status" = 'active'::"text") AND ("slot_kind" = 'nominal'::"text"));



CREATE INDEX "plan_commitments_plan_version_idx" ON "public"."plan_commitments" USING "btree" ("plan_version_id");



CREATE INDEX "plan_commitments_user_status_idx" ON "public"."plan_commitments" USING "btree" ("user_id", "status");



CREATE UNIQUE INDEX "plan_versions_one_published_per_student_idx" ON "public"."plan_versions" USING "btree" ("student_id") WHERE ("status" = 'published'::"text");



CREATE INDEX "plan_versions_student_idx" ON "public"."plan_versions" USING "btree" ("student_id", "created_at" DESC);



CREATE INDEX "planned_deviations_user_date_idx" ON "public"."planned_deviations" USING "btree" ("user_id", "local_date");



CREATE INDEX "potion_sessions_user_scope_idx" ON "public"."user_potion_sessions" USING "btree" ("user_id", "cycle_id", "scope_kind", "transformation_id", "generated_at" DESC);



CREATE INDEX "potion_sessions_user_scope_type_idx" ON "public"."user_potion_sessions" USING "btree" ("user_id", "cycle_id", "scope_kind", "transformation_id", "potion_type", "generated_at" DESC);



CREATE INDEX "profiles_chat_last_inbound_idx" ON "public"."profiles" USING "btree" ("chat_last_inbound_at" DESC) WHERE ("chat_last_inbound_at" IS NOT NULL);



CREATE INDEX "profiles_country_idx" ON "public"."profiles" USING "btree" ("country") WHERE ("country" IS NOT NULL);



CREATE INDEX "profiles_morning_active_action_seed_queue_idx" ON "public"."profiles" USING "btree" ("id") WHERE ("morning_active_action_checkins_seeded_at" IS NULL);



CREATE INDEX "profiles_phone_number_idx" ON "public"."profiles" USING "btree" ("phone_number");



CREATE UNIQUE INDEX "profiles_phone_number_verified_unique" ON "public"."profiles" USING "btree" ("phone_number") WHERE (("phone_verified_at" IS NOT NULL) AND ("phone_number" IS NOT NULL));



CREATE INDEX "profiles_whatsapp_bilan_opted_in_idx" ON "public"."profiles" USING "btree" ("whatsapp_bilan_opted_in");



CREATE INDEX "profiles_whatsapp_bilan_paused_until_idx" ON "public"."profiles" USING "btree" ("whatsapp_bilan_paused_until");



CREATE INDEX "profiles_whatsapp_coaching_paused_until_idx" ON "public"."profiles" USING "btree" ("whatsapp_coaching_paused_until");



CREATE INDEX "profiles_whatsapp_last_inbound_idx" ON "public"."profiles" USING "btree" ("whatsapp_last_inbound_at" DESC);



CREATE INDEX "profiles_whatsapp_opted_in_idx" ON "public"."profiles" USING "btree" ("whatsapp_opted_in");



CREATE INDEX "profiles_whatsapp_opted_out_at_idx" ON "public"."profiles" USING "btree" ("whatsapp_opted_out_at" DESC);



CREATE INDEX "profiles_whatsapp_state_idx" ON "public"."profiles" USING "btree" ("whatsapp_state");



CREATE INDEX "protocol_events_disqualified_idx" ON "public"."protocol_events" USING "btree" ("user_id", "local_date") WHERE ("disqualified_reason" IS NOT NULL);



CREATE UNIQUE INDEX "protocol_events_media_dedup_idx" ON "public"."protocol_events" USING "btree" ("user_id", "local_date", "media_sha256") WHERE ("media_sha256" IS NOT NULL);



COMMENT ON INDEX "public"."protocol_events_media_dedup_idx" IS 'Déduplication EXACTE: même élève, même journée locale, mêmes octets = un seul fait. Atomique par construction: la course entre deux taps sur envoyer est arbitrée par Postgres, pas par un SELECT qui précède un INSERT.';



CREATE INDEX "protocol_events_portion_band_idx" ON "public"."protocol_events" USING "btree" ("user_id", "local_date") WHERE ("portion_band" IS NOT NULL);



CREATE UNIQUE INDEX "protocol_events_source_message_idx" ON "public"."protocol_events" USING "btree" ("user_id", "source_message_id") WHERE ("source_message_id" IS NOT NULL);



CREATE INDEX "protocol_events_user_date_idx" ON "public"."protocol_events" USING "btree" ("user_id", "local_date");



CREATE INDEX "protocol_events_user_occurred_idx" ON "public"."protocol_events" USING "btree" ("user_id", "occurred_at");



CREATE INDEX "rate_limit_counters_expires_at_idx" ON "public"."rate_limit_counters" USING "btree" ("expires_at");



CREATE INDEX "reengagement_episodes_extraction_pending_idx" ON "public"."reengagement_episodes" USING "btree" ("closed_at") WHERE (("extraction_status" = 'pending'::"text") AND ("closed_at" IS NOT NULL));



CREATE UNIQUE INDEX "reengagement_episodes_one_open_per_user" ON "public"."reengagement_episodes" USING "btree" ("user_id") WHERE ("closed_at" IS NULL);



CREATE INDEX "reengagement_episodes_open_by_source_idx" ON "public"."reengagement_episodes" USING "btree" ("user_id", "source") WHERE ("closed_at" IS NULL);



CREATE INDEX "reengagement_episodes_outcome_pending_idx" ON "public"."reengagement_episodes" USING "btree" ("closed_at") WHERE (("outcome_status" = 'pending'::"text") AND ("closed_at" IS NOT NULL));



CREATE INDEX "reengagement_episodes_user_opened_idx" ON "public"."reengagement_episodes" USING "btree" ("user_id", "opened_at" DESC);



CREATE INDEX "scheduled_checkins_keel_inflight_idx" ON "public"."scheduled_checkins" USING "btree" ("user_id", "scheduled_for") WHERE (("status" = ANY (ARRAY['pending'::"public"."checkin_status", 'retrying'::"public"."checkin_status"])) AND ("event_context" ~~ 'keel\_%'::"text"));



CREATE INDEX "scheduled_checkins_recurring_reminder_idx" ON "public"."scheduled_checkins" USING "btree" ("recurring_reminder_id", "status", "scheduled_for" DESC) WHERE ("recurring_reminder_id" IS NOT NULL);



CREATE UNIQUE INDEX "scheduled_checkins_user_event_time_unique" ON "public"."scheduled_checkins" USING "btree" ("user_id", "event_context", "scheduled_for");



CREATE UNIQUE INDEX "student_cards_keyword_idx" ON "public"."student_cards" USING "btree" ("user_id", "keyword") WHERE ("keyword" IS NOT NULL);



CREATE INDEX "student_cards_template_idx" ON "public"."student_cards" USING "btree" ("template_id");



CREATE INDEX "student_cards_user_status_idx" ON "public"."student_cards" USING "btree" ("user_id", "status");



CREATE INDEX "student_coach_notes_student_idx" ON "public"."student_coach_notes" USING "btree" ("student_user_id");



CREATE INDEX "student_daily_checkins_user_date_idx" ON "public"."student_daily_checkins" USING "btree" ("user_id", "local_date" DESC);



CREATE UNIQUE INDEX "student_generated_meals_one_live_start_idx" ON "public"."student_generated_meals" USING "btree" ("user_id", "starts_on") WHERE ("retired_at" IS NULL);



CREATE INDEX "student_generated_meals_user_created_idx" ON "public"."student_generated_meals" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "student_generated_meals_user_window_idx" ON "public"."student_generated_meals" USING "btree" ("user_id", "starts_on") WHERE ("retired_at" IS NULL);



CREATE INDEX "student_meal_documents_user_idx" ON "public"."student_meal_documents" USING "btree" ("user_id", "created_at" DESC);



CREATE UNIQUE INDEX "student_safety_constraints_active_unique_idx" ON "public"."student_safety_constraints" USING "btree" ("user_id", "kind", COALESCE("allergen_ref", ''::"text"), COALESCE("substance_ref", ''::"text"), COALESCE("medication_class", ''::"text"), COALESCE("condition_ref", ''::"text")) WHERE ("status" = 'active'::"text");



CREATE UNIQUE INDEX "student_safety_constraints_source_message_idx" ON "public"."student_safety_constraints" USING "btree" ("user_id", "source_message_id") WHERE ("source_message_id" IS NOT NULL);



CREATE INDEX "student_safety_constraints_user_active_idx" ON "public"."student_safety_constraints" USING "btree" ("user_id") WHERE ("status" = 'active'::"text");



CREATE INDEX "student_safety_constraints_user_idx" ON "public"."student_safety_constraints" USING "btree" ("user_id");



CREATE INDEX "student_week_plans_user_week_idx" ON "public"."student_week_plans" USING "btree" ("user_id", "week_start" DESC);



CREATE INDEX "subscription_notifications_user_id_idx" ON "public"."subscription_notifications" USING "btree" ("user_id");



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



CREATE INDEX "upcoming_contexts_user_date_idx" ON "public"."upcoming_contexts" USING "btree" ("user_id", "local_date");



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



CREATE INDEX "user_metrics_user_idx" ON "public"."user_metrics" USING "btree" ("user_id");



CREATE INDEX "user_plan_item_entries_cycle_idx" ON "public"."user_plan_item_entries" USING "btree" ("cycle_id", "effective_at" DESC, "created_at" DESC);



CREATE INDEX "user_plan_item_entries_plan_idx" ON "public"."user_plan_item_entries" USING "btree" ("plan_id", "effective_at" DESC, "created_at" DESC);



CREATE INDEX "user_plan_item_entries_plan_item_effective_idx" ON "public"."user_plan_item_entries" USING "btree" ("plan_item_id", "effective_at" DESC, "created_at" DESC);



CREATE INDEX "user_plan_item_entries_transformation_idx" ON "public"."user_plan_item_entries" USING "btree" ("transformation_id", "effective_at" DESC, "created_at" DESC);



CREATE INDEX "user_plan_item_entries_user_effective_idx" ON "public"."user_plan_item_entries" USING "btree" ("user_id", "effective_at" DESC);



CREATE INDEX "user_plan_items_cards_status_idx" ON "public"."user_plan_items" USING "btree" ("plan_id", "cards_status", "phase_order", "activation_order");



CREATE INDEX "user_plan_items_cycle_status_idx" ON "public"."user_plan_items" USING "btree" ("cycle_id", "status", "updated_at" DESC);



CREATE INDEX "user_plan_items_dimension_status_idx" ON "public"."user_plan_items" USING "btree" ("dimension", "status", "activation_order");



CREATE INDEX "user_plan_items_phase_idx" ON "public"."user_plan_items" USING "btree" ("plan_id", "phase_order");



CREATE INDEX "user_plan_items_plan_status_idx" ON "public"."user_plan_items" USING "btree" ("plan_id", "status", "activation_order");



CREATE INDEX "user_plan_items_start_after_idx" ON "public"."user_plan_items" USING "btree" ("start_after_item_id") WHERE ("start_after_item_id" IS NOT NULL);



CREATE INDEX "user_plan_items_transformation_status_idx" ON "public"."user_plan_items" USING "btree" ("transformation_id", "status", "updated_at" DESC);



CREATE INDEX "user_plan_items_user_status_idx" ON "public"."user_plan_items" USING "btree" ("user_id", "status");



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



CREATE INDEX "user_victory_ledger_user_created_idx" ON "public"."user_victory_ledger" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "vocabulary_extension_requests_open_idx" ON "public"."vocabulary_extension_requests" USING "btree" ("status", "created_at" DESC) WHERE ("status" = 'open'::"text");



CREATE UNIQUE INDEX "weekly_reviews_user_week_no_plan_uidx" ON "public"."weekly_reviews" USING "btree" ("user_id", "week_start_date") WHERE ("plan_version_id" IS NULL);



CREATE INDEX "weekly_reviews_week_facts_idx" ON "public"."weekly_reviews" USING "btree" ("user_id", "week_start_date" DESC) WHERE ("week_facts_computed_at" IS NOT NULL);



CREATE INDEX "whatsapp_cost_events_event_date_idx" ON "public"."whatsapp_cost_events" USING "btree" ("event_date");



CREATE UNIQUE INDEX "whatsapp_cost_events_provider_message_id_key" ON "public"."whatsapp_cost_events" USING "btree" ("provider_message_id");



CREATE INDEX "whatsapp_cost_events_user_id_idx" ON "public"."whatsapp_cost_events" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "coach_doctrines_set_updated_at" BEFORE UPDATE ON "public"."coach_doctrines" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "coach_food_items_owner_check" BEFORE INSERT OR UPDATE ON "public"."coach_food_items" FOR EACH ROW EXECUTE FUNCTION "public"."coach_rule_matches_protocol"();



CREATE OR REPLACE TRIGGER "coach_food_rules_owner_check" BEFORE INSERT OR UPDATE ON "public"."coach_food_rules" FOR EACH ROW EXECUTE FUNCTION "public"."coach_rule_matches_protocol"();



CREATE OR REPLACE TRIGGER "coach_timing_rules_owner_check" BEFORE INSERT OR UPDATE ON "public"."coach_timing_rules" FOR EACH ROW EXECUTE FUNCTION "public"."coach_rule_matches_protocol"();



CREATE OR REPLACE TRIGGER "cohorts_set_updated_at" BEFORE UPDATE ON "public"."cohorts" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "enforce_single_master_admin_trg" BEFORE INSERT OR UPDATE ON "public"."internal_admins" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_single_master_admin"();



CREATE OR REPLACE TRIGGER "guard_profiles_privileged_columns_biu" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."guard_profiles_privileged_columns"();



CREATE OR REPLACE TRIGGER "guard_unlocked_principles_update" BEFORE UPDATE ON "public"."user_transformations" FOR EACH ROW EXECUTE FUNCTION "public"."guard_unlocked_principles_update"();



CREATE OR REPLACE TRIGGER "guard_v2_plan_item_activation" BEFORE UPDATE ON "public"."user_plan_items" FOR EACH ROW EXECUTE FUNCTION "public"."guard_v2_plan_item_activation"();



CREATE OR REPLACE TRIGGER "meal_ideas_food_groups_valid" BEFORE INSERT OR UPDATE ON "public"."meal_ideas" FOR EACH ROW EXECUTE FUNCTION "public"."keel_meal_idea_food_groups_valid"();



CREATE OR REPLACE TRIGGER "on_coach_clients_change_recompute_access" AFTER INSERT OR DELETE OR UPDATE ON "public"."coach_clients" FOR EACH ROW EXECUTE FUNCTION "public"."_trg_recompute_access_tier_from_coach_clients"();



CREATE OR REPLACE TRIGGER "on_coach_clients_enforce_trial_cap" BEFORE INSERT OR UPDATE OF "status" ON "public"."coach_clients" FOR EACH ROW EXECUTE FUNCTION "public"."_trg_coach_clients_enforce_trial_cap"();



CREATE OR REPLACE TRIGGER "on_coaches_change_recompute_roster" AFTER UPDATE OF "status", "trial_ends_at" ON "public"."coaches" FOR EACH ROW EXECUTE FUNCTION "public"."_trg_recompute_roster_from_coaches"();



CREATE OR REPLACE TRIGGER "on_coaches_default_trial_end" BEFORE INSERT ON "public"."coaches" FOR EACH ROW EXECUTE FUNCTION "public"."_trg_coaches_default_trial_end"();



CREATE OR REPLACE TRIGGER "on_profile_created_master_admin" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."maybe_add_master_admin_from_profile"();



CREATE OR REPLACE TRIGGER "on_profile_created_seed_default_coach_preferences_trigger" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."on_profile_created_seed_default_coach_preferences"();



CREATE OR REPLACE TRIGGER "on_profiles_trial_change_recompute_access" AFTER INSERT OR UPDATE OF "trial_end" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."_trg_recompute_profile_access_tier_from_profiles"();



CREATE OR REPLACE TRIGGER "on_subscriptions_change_recompute_access" AFTER INSERT OR UPDATE OF "status", "current_period_end", "tier" ON "public"."subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."_trg_recompute_profile_access_tier_from_subscriptions"();



CREATE OR REPLACE TRIGGER "on_subscriptions_change_recompute_access_delete" AFTER DELETE ON "public"."subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."_trg_recompute_profile_access_tier_from_subscriptions"();



CREATE OR REPLACE TRIGGER "on_subscriptions_change_recompute_roster" AFTER INSERT OR DELETE OR UPDATE ON "public"."subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."_trg_recompute_roster_from_subscriptions"();



CREATE OR REPLACE TRIGGER "protocol_events_quick_tap_untick_only" BEFORE UPDATE ON "public"."protocol_events" FOR EACH ROW EXECUTE FUNCTION "public"."protocol_events_quick_tap_untick_only"();



CREATE OR REPLACE TRIGGER "student_cards_render" BEFORE INSERT OR UPDATE OF "template_id", "variable_values", "keyword" ON "public"."student_cards" FOR EACH ROW EXECUTE FUNCTION "public"."keel_student_cards_render"();



CREATE OR REPLACE TRIGGER "student_coach_notes_touch_updated_at" BEFORE UPDATE ON "public"."student_coach_notes" FOR EACH ROW EXECUTE FUNCTION "public"."touch_student_coach_notes_updated_at"();



CREATE OR REPLACE TRIGGER "student_generated_meals_set_updated_at" BEFORE UPDATE ON "public"."student_generated_meals" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "student_goals_set_updated_at" BEFORE UPDATE ON "public"."student_goals" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "student_meal_documents_set_updated_at" BEFORE UPDATE ON "public"."student_meal_documents" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "student_safety_constraints_retraction_only" BEFORE UPDATE ON "public"."student_safety_constraints" FOR EACH ROW EXECUTE FUNCTION "public"."student_safety_constraints_retraction_only"();



CREATE OR REPLACE TRIGGER "student_week_plans_set_updated_at" BEFORE UPDATE ON "public"."student_week_plans" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_archive_pending_week_plans_on_plan_archive" AFTER UPDATE OF "status" ON "public"."user_plans_v2" FOR EACH ROW EXECUTE FUNCTION "public"."archive_pending_week_plans_when_parent_plan_archived"();



CREATE OR REPLACE TRIGGER "trg_chat_messages_scope_memory_insert" AFTER INSERT ON "public"."chat_messages" FOR EACH ROW EXECUTE FUNCTION "public"."handle_conversation_scope_memory_message_insert"();



CREATE OR REPLACE TRIGGER "trg_memory_item_actions_updated_at" BEFORE UPDATE ON "public"."memory_item_actions" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_memory_item_entities_updated_at" BEFORE UPDATE ON "public"."memory_item_entities" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_memory_item_topics_updated_at" BEFORE UPDATE ON "public"."memory_item_topics" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_memory_items_set_updated_at" BEFORE UPDATE ON "public"."memory_items" FOR EACH ROW EXECUTE FUNCTION "public"."tg_memory_items_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_memory_weekly_review_runs_updated_at" BEFORE UPDATE ON "public"."memory_weekly_review_runs" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_refresh_scheduling_on_access_tier_change" AFTER UPDATE OF "access_tier" ON "public"."profiles" FOR EACH ROW WHEN (("old"."access_tier" IS DISTINCT FROM "new"."access_tier")) EXECUTE FUNCTION "public"."handle_scheduling_access_tier_change"();



CREATE OR REPLACE TRIGGER "trg_scheduled_checkins_delete_audit" AFTER DELETE ON "public"."scheduled_checkins" FOR EACH ROW EXECUTE FUNCTION "public"."audit_scheduled_checkins_delete"();



CREATE OR REPLACE TRIGGER "trg_scheduled_checkins_enforce_min_gap_1h" BEFORE INSERT OR UPDATE OF "user_id", "scheduled_for", "status" ON "public"."scheduled_checkins" FOR EACH ROW EXECUTE FUNCTION "public"."scheduled_checkins_enforce_min_gap_1h"();



CREATE OR REPLACE TRIGGER "trg_user_chat_states_trigger_synthesizer_threshold" AFTER UPDATE OF "unprocessed_msg_count" ON "public"."user_chat_states" FOR EACH ROW WHEN (("new"."unprocessed_msg_count" IS DISTINCT FROM "old"."unprocessed_msg_count")) EXECUTE FUNCTION "public"."handle_user_chat_state_synthesizer_threshold"();



CREATE OR REPLACE TRIGGER "trg_user_entities_updated_at" BEFORE UPDATE ON "public"."user_entities" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_user_topic_memories_updated_at" BEFORE UPDATE ON "public"."user_topic_memories" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_validate_app_config_edge_base_url" BEFORE INSERT OR UPDATE ON "public"."app_config" FOR EACH ROW EXECUTE FUNCTION "public"."_validate_app_config_edge_base_url"();



CREATE OR REPLACE TRIGGER "unlock_v2_principles_from_entry" AFTER INSERT ON "public"."user_plan_item_entries" FOR EACH ROW EXECUTE FUNCTION "public"."handle_v2_principle_unlock_from_entry"();



CREATE OR REPLACE TRIGGER "unlock_v2_principles_from_item_transition" AFTER UPDATE ON "public"."user_plan_items" FOR EACH ROW EXECUTE FUNCTION "public"."handle_v2_principle_unlock_from_item_transition"();



CREATE OR REPLACE TRIGGER "update_user_chat_states_modtime" BEFORE UPDATE ON "public"."user_chat_states" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_column"();



CREATE OR REPLACE TRIGGER "update_user_cycle_drafts_modtime" BEFORE UPDATE ON "public"."user_cycle_drafts" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_column"();



CREATE OR REPLACE TRIGGER "update_user_cycles_modtime" BEFORE UPDATE ON "public"."user_cycles" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_column"();



CREATE OR REPLACE TRIGGER "update_user_metrics_modtime" BEFORE UPDATE ON "public"."user_metrics" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_column"();



CREATE OR REPLACE TRIGGER "update_user_plan_items_modtime" BEFORE UPDATE ON "public"."user_plan_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_column"();



CREATE OR REPLACE TRIGGER "update_user_plans_v2_modtime" BEFORE UPDATE ON "public"."user_plans_v2" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_column"();



CREATE OR REPLACE TRIGGER "update_user_rendez_vous_modtime" BEFORE UPDATE ON "public"."user_rendez_vous" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_column"();



CREATE OR REPLACE TRIGGER "update_user_transformation_aspects_modtime" BEFORE UPDATE ON "public"."user_transformation_aspects" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_column"();



CREATE OR REPLACE TRIGGER "update_user_transformations_modtime" BEFORE UPDATE ON "public"."user_transformations" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_column"();



ALTER TABLE ONLY "public"."account_security_confirmations"
    ADD CONSTRAINT "account_security_confirmations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."card_armings"
    ADD CONSTRAINT "card_armings_slot_key_fkey" FOREIGN KEY ("slot_key") REFERENCES "public"."slot_vocabulary"("key");



ALTER TABLE ONLY "public"."card_armings"
    ADD CONSTRAINT "card_armings_student_card_id_fkey" FOREIGN KEY ("student_card_id") REFERENCES "public"."student_cards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."card_armings"
    ADD CONSTRAINT "card_armings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."card_templates"
    ADD CONSTRAINT "card_templates_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."card_templates"
    ADD CONSTRAINT "card_templates_trigger_slot_key_fkey" FOREIGN KEY ("trigger_slot_key") REFERENCES "public"."slot_vocabulary"("key");



ALTER TABLE ONLY "public"."card_wins"
    ADD CONSTRAINT "card_wins_arming_id_fkey" FOREIGN KEY ("arming_id") REFERENCES "public"."card_armings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."card_wins"
    ADD CONSTRAINT "card_wins_slot_key_fkey" FOREIGN KEY ("slot_key") REFERENCES "public"."slot_vocabulary"("key");



ALTER TABLE ONLY "public"."card_wins"
    ADD CONSTRAINT "card_wins_student_card_id_fkey" FOREIGN KEY ("student_card_id") REFERENCES "public"."student_cards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."card_wins"
    ADD CONSTRAINT "card_wins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_access_events"
    ADD CONSTRAINT "coach_access_events_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_access_events"
    ADD CONSTRAINT "coach_access_events_student_user_id_fkey" FOREIGN KEY ("student_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_billing_periods"
    ADD CONSTRAINT "coach_billing_periods_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_broadcasts"
    ADD CONSTRAINT "coach_broadcasts_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_clients"
    ADD CONSTRAINT "coach_clients_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_clients"
    ADD CONSTRAINT "coach_clients_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."coach_clients"
    ADD CONSTRAINT "coach_clients_student_user_id_fkey" FOREIGN KEY ("student_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_doctrine_compilations"
    ADD CONSTRAINT "coach_doctrine_compilations_doctrine_id_fkey" FOREIGN KEY ("doctrine_id") REFERENCES "public"."coach_doctrines"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_doctrines"
    ADD CONSTRAINT "coach_doctrines_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_doctrines"
    ADD CONSTRAINT "coach_doctrines_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."coach_document_chunks"
    ADD CONSTRAINT "coach_document_chunks_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_document_chunks"
    ADD CONSTRAINT "coach_document_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."coach_documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_document_citations"
    ADD CONSTRAINT "coach_document_citations_chunk_id_fkey" FOREIGN KEY ("chunk_id") REFERENCES "public"."coach_document_chunks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."coach_document_citations"
    ADD CONSTRAINT "coach_document_citations_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_document_citations"
    ADD CONSTRAINT "coach_document_citations_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."coach_documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_documents"
    ADD CONSTRAINT "coach_documents_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_food_items"
    ADD CONSTRAINT "coach_food_items_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_food_items"
    ADD CONSTRAINT "coach_food_items_food_group_ref_fkey" FOREIGN KEY ("food_group_ref") REFERENCES "public"."food_groups"("slug");



ALTER TABLE ONLY "public"."coach_food_items"
    ADD CONSTRAINT "coach_food_items_food_item_ref_fkey" FOREIGN KEY ("food_item_ref") REFERENCES "public"."food_items"("slug");



ALTER TABLE ONLY "public"."coach_food_items"
    ADD CONSTRAINT "coach_food_items_protocol_id_fkey" FOREIGN KEY ("protocol_id") REFERENCES "public"."coach_protocols"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_food_items"
    ADD CONSTRAINT "coach_food_items_slot_key_fkey" FOREIGN KEY ("slot_key") REFERENCES "public"."slot_vocabulary"("key");



ALTER TABLE ONLY "public"."coach_food_proposals"
    ADD CONSTRAINT "coach_food_proposals_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_food_proposals"
    ADD CONSTRAINT "coach_food_proposals_food_group_ref_fkey" FOREIGN KEY ("food_group_ref") REFERENCES "public"."food_groups"("slug");



ALTER TABLE ONLY "public"."coach_food_proposals"
    ADD CONSTRAINT "coach_food_proposals_food_item_ref_fkey" FOREIGN KEY ("food_item_ref") REFERENCES "public"."food_items"("slug");



ALTER TABLE ONLY "public"."coach_food_rules"
    ADD CONSTRAINT "coach_food_rules_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_food_rules"
    ADD CONSTRAINT "coach_food_rules_food_group_ref_fkey" FOREIGN KEY ("food_group_ref") REFERENCES "public"."food_groups"("slug");



ALTER TABLE ONLY "public"."coach_food_rules"
    ADD CONSTRAINT "coach_food_rules_protocol_id_fkey" FOREIGN KEY ("protocol_id") REFERENCES "public"."coach_protocols"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_invitations"
    ADD CONSTRAINT "coach_invitations_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_protocols"
    ADD CONSTRAINT "coach_protocols_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_protocols"
    ADD CONSTRAINT "coach_protocols_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."coach_syntheses"
    ADD CONSTRAINT "coach_syntheses_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_syntheses"
    ADD CONSTRAINT "coach_syntheses_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."coach_terms"
    ADD CONSTRAINT "coach_terms_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_terms"
    ADD CONSTRAINT "coach_terms_food_group_ref_fkey" FOREIGN KEY ("food_group_ref") REFERENCES "public"."food_groups"("slug");



ALTER TABLE ONLY "public"."coach_timing_rules"
    ADD CONSTRAINT "coach_timing_rules_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_timing_rules"
    ADD CONSTRAINT "coach_timing_rules_food_group_ref_fkey" FOREIGN KEY ("food_group_ref") REFERENCES "public"."food_groups"("slug");



ALTER TABLE ONLY "public"."coach_timing_rules"
    ADD CONSTRAINT "coach_timing_rules_protocol_id_fkey" FOREIGN KEY ("protocol_id") REFERENCES "public"."coach_protocols"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_timing_rules"
    ADD CONSTRAINT "coach_timing_rules_slot_key_fkey" FOREIGN KEY ("slot_key") REFERENCES "public"."slot_vocabulary"("key");



ALTER TABLE ONLY "public"."coaches"
    ADD CONSTRAINT "coaches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cohorts"
    ADD CONSTRAINT "cohorts_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cohorts"
    ADD CONSTRAINT "cohorts_plan_template_id_fkey" FOREIGN KEY ("plan_template_id") REFERENCES "public"."plan_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."commitment_evaluations"
    ADD CONSTRAINT "commitment_evaluations_commitment_id_fkey" FOREIGN KEY ("commitment_id") REFERENCES "public"."plan_commitments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commitment_evaluations"
    ADD CONSTRAINT "commitment_evaluations_plan_version_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "public"."plan_versions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commitment_evaluations"
    ADD CONSTRAINT "commitment_evaluations_slot_key_fkey" FOREIGN KEY ("slot_key") REFERENCES "public"."slot_vocabulary"("key");



ALTER TABLE ONLY "public"."commitment_evaluations"
    ADD CONSTRAINT "commitment_evaluations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commitment_relations"
    ADD CONSTRAINT "commitment_relations_cofactor_ref_fkey" FOREIGN KEY ("cofactor_ref") REFERENCES "public"."food_groups"("slug");



ALTER TABLE ONLY "public"."commitment_relations"
    ADD CONSTRAINT "commitment_relations_commitment_a_fkey" FOREIGN KEY ("commitment_a") REFERENCES "public"."plan_commitments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commitment_relations"
    ADD CONSTRAINT "commitment_relations_commitment_b_fkey" FOREIGN KEY ("commitment_b") REFERENCES "public"."plan_commitments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."communication_logs"
    ADD CONSTRAINT "communication_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_change_requests"
    ADD CONSTRAINT "contract_change_requests_commitment_id_fkey" FOREIGN KEY ("commitment_id") REFERENCES "public"."plan_commitments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contract_change_requests"
    ADD CONSTRAINT "contract_change_requests_plan_version_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "public"."plan_versions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_change_requests"
    ADD CONSTRAINT "contract_change_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_eval_events"
    ADD CONSTRAINT "conversation_eval_events_eval_run_id_fkey" FOREIGN KEY ("eval_run_id") REFERENCES "public"."conversation_eval_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_eval_judge_jobs"
    ADD CONSTRAINT "conversation_eval_judge_jobs_eval_run_id_fkey" FOREIGN KEY ("eval_run_id") REFERENCES "public"."conversation_eval_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_eval_runs"
    ADD CONSTRAINT "conversation_eval_runs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversation_runtime_events"
    ADD CONSTRAINT "conversation_runtime_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



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



ALTER TABLE ONLY "public"."food_items"
    ADD CONSTRAINT "food_items_food_group_ref_fkey" FOREIGN KEY ("food_group_ref") REFERENCES "public"."food_groups"("slug");



ALTER TABLE ONLY "public"."inbound_dedup"
    ADD CONSTRAINT "inbound_dedup_chat_message_id_fkey" FOREIGN KEY ("chat_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inbound_dedup"
    ADD CONSTRAINT "inbound_dedup_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."internal_admins"
    ADD CONSTRAINT "internal_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."llm_raw_response_events"
    ADD CONSTRAINT "llm_raw_response_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."llm_retry_jobs"
    ADD CONSTRAINT "llm_retry_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."llm_usage_events"
    ADD CONSTRAINT "llm_usage_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."meal_ideas"
    ADD CONSTRAINT "meal_ideas_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_ideas"
    ADD CONSTRAINT "meal_ideas_slot_key_fkey" FOREIGN KEY ("slot_key") REFERENCES "public"."slot_vocabulary"("key");



ALTER TABLE ONLY "public"."meal_precision_questions"
    ADD CONSTRAINT "meal_precision_questions_protocol_event_id_fkey" FOREIGN KEY ("protocol_event_id") REFERENCES "public"."protocol_events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."meal_precision_questions"
    ADD CONSTRAINT "meal_precision_questions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



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



ALTER TABLE ONLY "public"."pending_actions"
    ADD CONSTRAINT "pending_actions_scheduled_checkin_id_fkey" FOREIGN KEY ("scheduled_checkin_id") REFERENCES "public"."scheduled_checkins"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pending_actions"
    ADD CONSTRAINT "pending_actions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plan_commitments"
    ADD CONSTRAINT "plan_commitments_food_group_ref_fkey" FOREIGN KEY ("food_group_ref") REFERENCES "public"."food_groups"("slug");



ALTER TABLE ONLY "public"."plan_commitments"
    ADD CONSTRAINT "plan_commitments_plan_version_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "public"."plan_versions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plan_commitments"
    ADD CONSTRAINT "plan_commitments_slot_key_fkey" FOREIGN KEY ("slot_key") REFERENCES "public"."slot_vocabulary"("key");



ALTER TABLE ONLY "public"."plan_commitments"
    ADD CONSTRAINT "plan_commitments_substance_ref_fkey" FOREIGN KEY ("substance_ref") REFERENCES "public"."substances"("slug");



ALTER TABLE ONLY "public"."plan_commitments"
    ADD CONSTRAINT "plan_commitments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plan_documents"
    ADD CONSTRAINT "plan_documents_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."plan_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."plan_versions"
    ADD CONSTRAINT "plan_versions_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "public"."plan_documents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."plan_versions"
    ADD CONSTRAINT "plan_versions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plan_versions"
    ADD CONSTRAINT "plan_versions_supersedes_version_id_fkey" FOREIGN KEY ("supersedes_version_id") REFERENCES "public"."plan_versions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."plan_versions"
    ADD CONSTRAINT "plan_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."plan_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."planned_deviations"
    ADD CONSTRAINT "planned_deviations_plan_version_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "public"."plan_versions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."planned_deviations"
    ADD CONSTRAINT "planned_deviations_slot_key_fkey" FOREIGN KEY ("slot_key") REFERENCES "public"."slot_vocabulary"("key");



ALTER TABLE ONLY "public"."planned_deviations"
    ADD CONSTRAINT "planned_deviations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."proactive_job_state"
    ADD CONSTRAINT "proactive_job_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."protocol_events"
    ADD CONSTRAINT "protocol_events_food_group_ref_fkey" FOREIGN KEY ("food_group_ref") REFERENCES "public"."food_groups"("slug");



ALTER TABLE ONLY "public"."protocol_events"
    ADD CONSTRAINT "protocol_events_slot_key_fkey" FOREIGN KEY ("slot_key") REFERENCES "public"."slot_vocabulary"("key");



ALTER TABLE ONLY "public"."protocol_events"
    ADD CONSTRAINT "protocol_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reengagement_episodes"
    ADD CONSTRAINT "reengagement_episodes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scheduled_checkins"
    ADD CONSTRAINT "scheduled_checkins_recurring_reminder_id_fkey" FOREIGN KEY ("recurring_reminder_id") REFERENCES "public"."user_recurring_reminders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."scheduled_checkins"
    ADD CONSTRAINT "scheduled_checkins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_cards"
    ADD CONSTRAINT "student_cards_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."student_cards"
    ADD CONSTRAINT "student_cards_commitment_id_fkey" FOREIGN KEY ("commitment_id") REFERENCES "public"."plan_commitments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."student_cards"
    ADD CONSTRAINT "student_cards_plan_version_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "public"."plan_versions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."student_cards"
    ADD CONSTRAINT "student_cards_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."card_templates"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."student_cards"
    ADD CONSTRAINT "student_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_coach_notes"
    ADD CONSTRAINT "student_coach_notes_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_coach_notes"
    ADD CONSTRAINT "student_coach_notes_student_user_id_fkey" FOREIGN KEY ("student_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_daily_checkins"
    ADD CONSTRAINT "student_daily_checkins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_generated_meals"
    ADD CONSTRAINT "student_generated_meals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_goals"
    ADD CONSTRAINT "student_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_meal_documents"
    ADD CONSTRAINT "student_meal_documents_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "public"."student_generated_meals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_meal_documents"
    ADD CONSTRAINT "student_meal_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_safety_constraints"
    ADD CONSTRAINT "student_safety_constraints_superseded_by_constraint_id_fkey" FOREIGN KEY ("superseded_by_constraint_id") REFERENCES "public"."student_safety_constraints"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."student_safety_constraints"
    ADD CONSTRAINT "student_safety_constraints_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_week_plans"
    ADD CONSTRAINT "student_week_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscription_notifications"
    ADD CONSTRAINT "subscription_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."substance_interactions"
    ADD CONSTRAINT "substance_interactions_substance_ref_fkey" FOREIGN KEY ("substance_ref") REFERENCES "public"."substances"("slug");



ALTER TABLE ONLY "public"."substance_limits"
    ADD CONSTRAINT "substance_limits_substance_ref_fkey" FOREIGN KEY ("substance_ref") REFERENCES "public"."substances"("slug");



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



ALTER TABLE ONLY "public"."upcoming_contexts"
    ADD CONSTRAINT "upcoming_contexts_slot_key_fkey" FOREIGN KEY ("slot_key") REFERENCES "public"."slot_vocabulary"("key");



ALTER TABLE ONLY "public"."upcoming_contexts"
    ADD CONSTRAINT "upcoming_contexts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



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



ALTER TABLE ONLY "public"."user_framework_entries"
    ADD CONSTRAINT "user_framework_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



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



ALTER TABLE ONLY "public"."vocabulary_extension_requests"
    ADD CONSTRAINT "vocabulary_extension_requests_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vocabulary_extension_requests"
    ADD CONSTRAINT "vocabulary_extension_requests_resolved_slug_fkey" FOREIGN KEY ("resolved_slug") REFERENCES "public"."food_groups"("slug");



ALTER TABLE ONLY "public"."weekly_reviews"
    ADD CONSTRAINT "weekly_reviews_plan_version_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "public"."plan_versions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weekly_reviews"
    ADD CONSTRAINT "weekly_reviews_top_failing_commitment_id_fkey" FOREIGN KEY ("top_failing_commitment_id") REFERENCES "public"."plan_commitments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."weekly_reviews"
    ADD CONSTRAINT "weekly_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_cost_events"
    ADD CONSTRAINT "whatsapp_cost_events_outbound_message_id_fkey" FOREIGN KEY ("outbound_message_id") REFERENCES "public"."outbound_messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_cost_events"
    ADD CONSTRAINT "whatsapp_cost_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."outbound_messages"
    ADD CONSTRAINT "whatsapp_outbound_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



CREATE POLICY "No direct access to pending_actions (select none)" ON "public"."pending_actions" FOR SELECT USING (false);



CREATE POLICY "Users can delete their own framework entries" ON "public"."user_framework_entries" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own messages" ON "public"."chat_messages" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own attack cards" ON "public"."user_attack_cards" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own defense wins" ON "public"."user_defense_wins" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_defense_cards" "card"
  WHERE (("card"."id" = "user_defense_wins"."defense_card_id") AND ("card"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert their own chat state" ON "public"."user_chat_states" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own framework entries" ON "public"."user_framework_entries" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own messages" ON "public"."chat_messages" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own transformation closure feedback" ON "public"."user_transformation_closure_feedback" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



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



CREATE POLICY "Users can update their own framework entries" ON "public"."user_framework_entries" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own scheduled checkins" ON "public"."scheduled_checkins" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own transformation closure feedback" ON "public"."user_transformation_closure_feedback" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own chat state" ON "public"."user_chat_states" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own framework entries" ON "public"."user_framework_entries" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own logs" ON "public"."communication_logs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own messages" ON "public"."chat_messages" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own scheduled checkins" ON "public"."scheduled_checkins" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own transformation closure feedback" ON "public"."user_transformation_closure_feedback" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users own profiles" ON "public"."profiles" USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."account_security_confirmations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."card_armings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "card_armings_coach_select" ON "public"."card_armings" FOR SELECT TO "authenticated" USING (("user_id" = ANY (( SELECT "public"."coached_student_ids"() AS "coached_student_ids")::"uuid"[])));



CREATE POLICY "card_armings_owner_select" ON "public"."card_armings" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."card_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "card_templates_coach_all" ON "public"."card_templates" TO "authenticated" USING ((("owner_scope" = 'coach'::"text") AND ("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text")))))) WITH CHECK ((("owner_scope" = 'coach'::"text") AND ("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text"))))));



CREATE POLICY "card_templates_global_read" ON "public"."card_templates" FOR SELECT TO "authenticated" USING ((("owner_scope" = 'global'::"text") AND ("status" = 'active'::"text")));



CREATE POLICY "card_templates_student_read" ON "public"."card_templates" FOR SELECT TO "authenticated" USING ((("owner_scope" = 'coach'::"text") AND ("status" = 'active'::"text") AND ("coach_id" IN ( SELECT "cc"."coach_id"
   FROM "public"."coach_clients" "cc"
  WHERE (("cc"."student_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("cc"."status" = 'active'::"text"))))));



ALTER TABLE "public"."card_wins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "card_wins_coach_select" ON "public"."card_wins" FOR SELECT TO "authenticated" USING (("user_id" = ANY (( SELECT "public"."coached_student_ids"() AS "coached_student_ids")::"uuid"[])));



CREATE POLICY "card_wins_owner_insert" ON "public"."card_wins" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "card_wins_owner_select" ON "public"."card_wins" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coach_access_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_access_events_coach_select" ON "public"."coach_access_events" FOR SELECT TO "authenticated" USING (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "coach_access_events_student_select" ON "public"."coach_access_events" FOR SELECT TO "authenticated" USING (("student_user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."coach_billing_periods" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_billing_periods_coach_select" ON "public"."coach_billing_periods" FOR SELECT TO "authenticated" USING (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



ALTER TABLE "public"."coach_broadcasts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_broadcasts_coach_select" ON "public"."coach_broadcasts" FOR SELECT TO "authenticated" USING (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



ALTER TABLE "public"."coach_clients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_clients_coach_select" ON "public"."coach_clients" FOR SELECT TO "authenticated" USING (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "coach_clients_student_select" ON "public"."coach_clients" FOR SELECT TO "authenticated" USING (("student_user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."coach_doctrine_compilations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_doctrine_compilations_coach_read" ON "public"."coach_doctrine_compilations" FOR SELECT TO "authenticated" USING (("doctrine_id" IN ( SELECT "d"."id"
   FROM ("public"."coach_doctrines" "d"
     JOIN "public"."coaches" "c" ON (("c"."id" = "d"."coach_id")))
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text")))));



ALTER TABLE "public"."coach_doctrines" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_doctrines_coach_all" ON "public"."coach_doctrines" TO "authenticated" USING (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text"))))) WITH CHECK (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text")))));



ALTER TABLE "public"."coach_document_chunks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_document_chunks_coach_all" ON "public"."coach_document_chunks" TO "authenticated" USING (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text"))))) WITH CHECK (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text")))));



ALTER TABLE "public"."coach_document_citations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_document_citations_coach_all" ON "public"."coach_document_citations" TO "authenticated" USING (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text"))))) WITH CHECK (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text")))));



ALTER TABLE "public"."coach_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_documents_coach_all" ON "public"."coach_documents" TO "authenticated" USING (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text"))))) WITH CHECK (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text")))));



ALTER TABLE "public"."coach_food_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_food_items_coach_all" ON "public"."coach_food_items" TO "authenticated" USING (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text"))))) WITH CHECK (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text")))));



ALTER TABLE "public"."coach_food_proposals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_food_proposals_coach_all" ON "public"."coach_food_proposals" TO "authenticated" USING (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text"))))) WITH CHECK (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text")))));



ALTER TABLE "public"."coach_food_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_food_rules_coach_all" ON "public"."coach_food_rules" TO "authenticated" USING (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text"))))) WITH CHECK (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text")))));



ALTER TABLE "public"."coach_invitations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_invitations_coach_select" ON "public"."coach_invitations" FOR SELECT TO "authenticated" USING (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



ALTER TABLE "public"."coach_protocols" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_protocols_coach_all" ON "public"."coach_protocols" TO "authenticated" USING (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text"))))) WITH CHECK (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text")))));



ALTER TABLE "public"."coach_syntheses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_syntheses_coach_select" ON "public"."coach_syntheses" FOR SELECT TO "authenticated" USING (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text")))));



ALTER TABLE "public"."coach_terms" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_terms_coach_all" ON "public"."coach_terms" TO "authenticated" USING (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text"))))) WITH CHECK (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text")))));



ALTER TABLE "public"."coach_timing_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_timing_rules_coach_all" ON "public"."coach_timing_rules" TO "authenticated" USING (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text"))))) WITH CHECK (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text")))));



ALTER TABLE "public"."coaches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coaches_self_select" ON "public"."coaches" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "coaches_self_update" ON "public"."coaches" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."cohorts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cohorts_coach_all" ON "public"."cohorts" TO "authenticated" USING (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text"))))) WITH CHECK (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text")))));



ALTER TABLE "public"."commitment_evaluations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "commitment_evaluations_owner_read" ON "public"."commitment_evaluations" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "commitment_evaluations_select_coach" ON "public"."commitment_evaluations" FOR SELECT TO "authenticated" USING (("user_id" = ANY (( SELECT "public"."coached_student_ids"() AS "coached_student_ids")::"uuid"[])));



ALTER TABLE "public"."commitment_relations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "commitment_relations_owner_read" ON "public"."commitment_relations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."plan_commitments" "c"
  WHERE (("c"."id" = "commitment_relations"."commitment_a") AND ("c"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."communication_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."confirmation_tokens_consumed" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contract_change_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contract_change_requests_owner_insert" ON "public"."contract_change_requests" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "contract_change_requests_owner_read" ON "public"."contract_change_requests" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "contract_change_requests_select_coach" ON "public"."contract_change_requests" FOR SELECT TO "authenticated" USING (("user_id" = ANY (( SELECT "public"."coached_student_ids"() AS "coached_student_ids")::"uuid"[])));



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



ALTER TABLE "public"."conversation_runtime_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversation_runtime_events_internal_admin_all" ON "public"."conversation_runtime_events" USING ((EXISTS ( SELECT 1
   FROM "public"."internal_admins" "ia"
  WHERE ("ia"."user_id" = "auth"."uid"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."internal_admins" "ia"
  WHERE ("ia"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."conversation_scope_memories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversation_turn_traces" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crisis_resources" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "crisis_resources_read" ON "public"."crisis_resources" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."deletion_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."food_groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "food_groups_read" ON "public"."food_groups" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."food_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "food_items_read" ON "public"."food_items" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."inbound_dedup" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."internal_admins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "internal_admins_read_self" ON "public"."internal_admins" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."llm_pricing" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "llm_pricing_internal_admin_all" ON "public"."llm_pricing" USING ((EXISTS ( SELECT 1
   FROM "public"."internal_admins" "ia"
  WHERE ("ia"."user_id" = "auth"."uid"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."internal_admins" "ia"
  WHERE ("ia"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."llm_raw_response_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "llm_raw_response_events_internal_admin_all" ON "public"."llm_raw_response_events" USING ((EXISTS ( SELECT 1
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



ALTER TABLE "public"."meal_ideas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "meal_ideas_coach_all" ON "public"."meal_ideas" TO "authenticated" USING (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text"))))) WITH CHECK (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text")))));



CREATE POLICY "meal_ideas_student_read" ON "public"."meal_ideas" FOR SELECT TO "authenticated" USING ((("status" = 'active'::"text") AND ("coach_id" = ANY (( SELECT "public"."my_coach_ids"() AS "my_coach_ids")::"uuid"[]))));



COMMENT ON POLICY "meal_ideas_student_read" ON "public"."meal_ideas" IS 'L''élève lit les recettes ACTIVES de son coach. Plus aucun placement requis: en 1:N le coach publie une bibliothèque, il ne compose pas la semaine de chacun. `archived` reste invisible — c''est le seul geste de retrait.';



ALTER TABLE "public"."meal_precision_questions" ENABLE ROW LEVEL SECURITY;


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


ALTER TABLE "public"."outbound_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pending_actions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plan_commitments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plan_commitments_owner_read" ON "public"."plan_commitments" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "plan_commitments_select_coach" ON "public"."plan_commitments" FOR SELECT TO "authenticated" USING (("user_id" = ANY (( SELECT "public"."coached_student_ids"() AS "coached_student_ids")::"uuid"[])));



ALTER TABLE "public"."plan_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plan_documents_coach_all" ON "public"."plan_documents" TO "authenticated" USING (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text"))))) WITH CHECK (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text")))));



ALTER TABLE "public"."plan_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plan_templates_coach_all" ON "public"."plan_templates" TO "authenticated" USING (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text"))))) WITH CHECK (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text")))));



ALTER TABLE "public"."plan_versions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plan_versions_owner_read" ON "public"."plan_versions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "student_id"));



CREATE POLICY "plan_versions_select_coach" ON "public"."plan_versions" FOR SELECT TO "authenticated" USING (("student_id" = ANY (( SELECT "public"."coached_student_ids"() AS "coached_student_ids")::"uuid"[])));



ALTER TABLE "public"."planned_deviations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "planned_deviations_owner_insert" ON "public"."planned_deviations" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "planned_deviations_owner_read" ON "public"."planned_deviations" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "planned_deviations_select_coach" ON "public"."planned_deviations" FOR SELECT TO "authenticated" USING (("coach_visible" AND ("user_id" = ANY (( SELECT "public"."coached_student_ids"() AS "coached_student_ids")::"uuid"[]))));



ALTER TABLE "public"."proactive_job_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."protocol_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "protocol_events_owner_insert" ON "public"."protocol_events" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "protocol_events_owner_read" ON "public"."protocol_events" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "protocol_events_owner_untick" ON "public"."protocol_events" FOR UPDATE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("source" = 'quick_tap'::"text"))) WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("source" = 'quick_tap'::"text")));



COMMENT ON POLICY "protocol_events_owner_untick" ON "public"."protocol_events" IS 'L''élève coche et décoche ses propres repas. Le PÉRIMÈTRE de la modification est tenu par le trigger protocol_events_quick_tap_untick_only, pas ici: une policy porte sur des lignes, pas sur des colonnes.';



ALTER TABLE "public"."rate_limit_counters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reengagement_episodes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rls_chat_messages_delete_own" ON "public"."chat_messages" FOR DELETE USING ((("auth"."uid"() = "user_id") AND "public"."has_app_write_access"("auth"."uid"())));



CREATE POLICY "rls_chat_messages_insert_own" ON "public"."chat_messages" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."has_app_write_access"("auth"."uid"())));



CREATE POLICY "rls_chat_messages_select_own" ON "public"."chat_messages" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_chat_messages_update_own" ON "public"."chat_messages" FOR UPDATE USING ((("auth"."uid"() = "user_id") AND "public"."has_app_write_access"("auth"."uid"()))) WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."has_app_write_access"("auth"."uid"())));



CREATE POLICY "rls_conversation_scope_memories_delete_own" ON "public"."conversation_scope_memories" FOR DELETE USING ((("auth"."uid"() = "user_id") AND "public"."has_app_write_access"("auth"."uid"())));



CREATE POLICY "rls_conversation_scope_memories_insert_own" ON "public"."conversation_scope_memories" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."has_app_write_access"("auth"."uid"())));



CREATE POLICY "rls_conversation_scope_memories_select_own" ON "public"."conversation_scope_memories" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_conversation_scope_memories_update_own" ON "public"."conversation_scope_memories" FOR UPDATE USING ((("auth"."uid"() = "user_id") AND "public"."has_app_write_access"("auth"."uid"()))) WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."has_app_write_access"("auth"."uid"())));



CREATE POLICY "rls_inbound_dedup_select_own" ON "public"."inbound_dedup" FOR SELECT USING (("auth"."uid"() = "user_id"));



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



CREATE POLICY "rls_outbound_messages_select_own" ON "public"."outbound_messages" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rls_profiles_insert_self" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "rls_profiles_select_self" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "rls_profiles_update_self" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "rls_protocol_events_delete_own_quick_tap" ON "public"."protocol_events" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND ("source" = 'quick_tap'::"text") AND ("occurred_at" > ("now"() - '36:00:00'::interval))));



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



ALTER TABLE "public"."scheduled_checkins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scheduled_checkins_delete_audit" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service role manages confirmation token consumption" ON "public"."confirmation_tokens_consumed" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service role manages conversation runtime events" ON "public"."conversation_runtime_events" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service role manages conversation traces" ON "public"."conversation_turn_traces" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service role manages llm raw response events" ON "public"."llm_raw_response_events" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."slot_vocabulary" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "slot_vocabulary_read" ON "public"."slot_vocabulary" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."stripe_webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_cards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "student_cards_coach_select" ON "public"."student_cards" FOR SELECT TO "authenticated" USING (("user_id" = ANY (( SELECT "public"."coached_student_ids"() AS "coached_student_ids")::"uuid"[])));



CREATE POLICY "student_cards_owner_delete" ON "public"."student_cards" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "student_cards_owner_insert" ON "public"."student_cards" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "student_cards_owner_select" ON "public"."student_cards" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "student_cards_owner_update" ON "public"."student_cards" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."student_coach_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "student_coach_notes_coach_all" ON "public"."student_coach_notes" TO "authenticated" USING ((("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text")))) AND ("student_user_id" = ANY (( SELECT "public"."coached_student_ids"() AS "coached_student_ids")::"uuid"[])))) WITH CHECK ((("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text")))) AND ("student_user_id" = ANY (( SELECT "public"."coached_student_ids"() AS "coached_student_ids")::"uuid"[]))));



ALTER TABLE "public"."student_daily_checkins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "student_daily_checkins_owner_all" ON "public"."student_daily_checkins" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."student_generated_meals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "student_generated_meals_owner_read" ON "public"."student_generated_meals" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."student_goals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "student_goals_owner_all" ON "public"."student_goals" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "student_goals_select_coach" ON "public"."student_goals" FOR SELECT TO "authenticated" USING (("user_id" = ANY (( SELECT "public"."coached_student_ids"() AS "coached_student_ids")::"uuid"[])));



ALTER TABLE "public"."student_meal_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "student_meal_documents_owner_read" ON "public"."student_meal_documents" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."student_safety_constraints" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "student_safety_constraints_owner_insert" ON "public"."student_safety_constraints" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "student_safety_constraints_owner_read" ON "public"."student_safety_constraints" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "student_safety_constraints_owner_retract" ON "public"."student_safety_constraints" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



COMMENT ON POLICY "student_safety_constraints_owner_retract" ON "public"."student_safety_constraints" IS 'L''élève retire ses propres contraintes. Le PÉRIMÈTRE de la modification est tenu par le trigger student_safety_constraints_retraction_only, pas ici: une policy porte sur des lignes, pas sur des colonnes.';



CREATE POLICY "student_safety_constraints_select_coach" ON "public"."student_safety_constraints" FOR SELECT TO "authenticated" USING (("user_id" = ANY (( SELECT "public"."coached_student_ids"() AS "coached_student_ids")::"uuid"[])));



ALTER TABLE "public"."student_week_plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "student_week_plans_owner_all" ON "public"."student_week_plans" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."subscription_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."substance_interactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "substance_interactions_read" ON "public"."substance_interactions" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."substance_limits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "substance_limits_read" ON "public"."substance_limits" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."substances" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "substances_read" ON "public"."substances" FOR SELECT TO "authenticated" USING (true);



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



ALTER TABLE "public"."upcoming_contexts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "upcoming_contexts_owner_insert" ON "public"."upcoming_contexts" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "upcoming_contexts_owner_read" ON "public"."upcoming_contexts" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "upcoming_contexts_select_coach" ON "public"."upcoming_contexts" FOR SELECT TO "authenticated" USING (("user_id" = ANY (( SELECT "public"."coached_student_ids"() AS "coached_student_ids")::"uuid"[])));



ALTER TABLE "public"."user_attack_cards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_chat_states" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_cycle_drafts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_cycles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_defense_cards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_defense_wins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_entities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_framework_entries" ENABLE ROW LEVEL SECURITY;


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


ALTER TABLE "public"."vocabulary_extension_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vocabulary_extension_requests_coach_insert" ON "public"."vocabulary_extension_requests" FOR INSERT TO "authenticated" WITH CHECK ((("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text")))) AND ("status" = 'open'::"text")));



CREATE POLICY "vocabulary_extension_requests_coach_read" ON "public"."vocabulary_extension_requests" FOR SELECT TO "authenticated" USING (("coach_id" IN ( SELECT "c"."id"
   FROM "public"."coaches" "c"
  WHERE (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."status" = 'active'::"text")))));



ALTER TABLE "public"."weekly_reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "weekly_reviews_owner_read" ON "public"."weekly_reviews" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "weekly_reviews_select_coach" ON "public"."weekly_reviews" FOR SELECT TO "authenticated" USING (("user_id" = ANY (( SELECT "public"."coached_student_ids"() AS "coached_student_ids")::"uuid"[])));



ALTER TABLE "public"."whatsapp_cost_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "whatsapp_cost_events_internal_admin_all" ON "public"."whatsapp_cost_events" USING ((EXISTS ( SELECT 1
   FROM "public"."internal_admins" "ia"
  WHERE ("ia"."user_id" = "auth"."uid"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."internal_admins" "ia"
  WHERE ("ia"."user_id" = "auth"."uid"()))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."chat_messages";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "service_role";



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



GRANT ALL ON FUNCTION "public"."_trg_coach_clients_enforce_trial_cap"() TO "anon";
GRANT ALL ON FUNCTION "public"."_trg_coach_clients_enforce_trial_cap"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_trg_coach_clients_enforce_trial_cap"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_trg_coaches_default_trial_end"() TO "anon";
GRANT ALL ON FUNCTION "public"."_trg_coaches_default_trial_end"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_trg_coaches_default_trial_end"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_trg_recompute_access_tier_from_coach_clients"() TO "anon";
GRANT ALL ON FUNCTION "public"."_trg_recompute_access_tier_from_coach_clients"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_trg_recompute_access_tier_from_coach_clients"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_trg_recompute_profile_access_tier_from_profiles"() TO "anon";
GRANT ALL ON FUNCTION "public"."_trg_recompute_profile_access_tier_from_profiles"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_trg_recompute_profile_access_tier_from_profiles"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_trg_recompute_profile_access_tier_from_subscriptions"() TO "anon";
GRANT ALL ON FUNCTION "public"."_trg_recompute_profile_access_tier_from_subscriptions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_trg_recompute_profile_access_tier_from_subscriptions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_trg_recompute_roster_from_coaches"() TO "anon";
GRANT ALL ON FUNCTION "public"."_trg_recompute_roster_from_coaches"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_trg_recompute_roster_from_coaches"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_trg_recompute_roster_from_subscriptions"() TO "anon";
GRANT ALL ON FUNCTION "public"."_trg_recompute_roster_from_subscriptions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_trg_recompute_roster_from_subscriptions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_validate_app_config_edge_base_url"() TO "anon";
GRANT ALL ON FUNCTION "public"."_validate_app_config_edge_base_url"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_validate_app_config_edge_base_url"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."accept_coach_invitation"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_coach_invitation"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_coach_invitation"("p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."accept_coach_invitation_for_user"("p_user_id" "uuid", "p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_coach_invitation_for_user"("p_user_id" "uuid", "p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_cost_run_type_matches"("p_event_run_type" "text", "p_filter" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_cost_run_type_matches"("p_event_run_type" "text", "p_filter" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_cost_run_type_matches"("p_event_run_type" "text", "p_filter" "text") TO "service_role";



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



GRANT ALL ON FUNCTION "public"."archive_pending_week_plans_when_parent_plan_archived"() TO "anon";
GRANT ALL ON FUNCTION "public"."archive_pending_week_plans_when_parent_plan_archived"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."archive_pending_week_plans_when_parent_plan_archived"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_scheduled_checkins_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_scheduled_checkins_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_scheduled_checkins_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "postgres";
GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "anon";
GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "service_role";



GRANT ALL ON TABLE "public"."conversation_eval_judge_jobs" TO "anon";
GRANT ALL ON TABLE "public"."conversation_eval_judge_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_eval_judge_jobs" TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_conversation_eval_judge_jobs"("p_limit" integer, "p_worker_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."claim_conversation_eval_judge_jobs"("p_limit" integer, "p_worker_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_conversation_eval_judge_jobs"("p_limit" integer, "p_worker_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_in_app_outbound"("p_user_id" "uuid", "p_request_id" "text", "p_message_type" "text", "p_content_preview" "text", "p_status" "text", "p_metadata" "jsonb", "p_last_error_code" "text", "p_enforce_cap" boolean, "p_cap" integer, "p_local_date" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_in_app_outbound"("p_user_id" "uuid", "p_request_id" "text", "p_message_type" "text", "p_content_preview" "text", "p_status" "text", "p_metadata" "jsonb", "p_last_error_code" "text", "p_enforce_cap" boolean, "p_cap" integer, "p_local_date" "text") TO "service_role";



GRANT ALL ON TABLE "public"."llm_retry_jobs" TO "anon";
GRANT ALL ON TABLE "public"."llm_retry_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."llm_retry_jobs" TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_llm_retry_jobs"("p_limit" integer, "p_worker_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."claim_llm_retry_jobs"("p_limit" integer, "p_worker_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_llm_retry_jobs"("p_limit" integer, "p_worker_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_architect_draft_scopes"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_architect_draft_scopes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_architect_draft_scopes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_scheduling_for_user"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_scheduling_for_user"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_scheduling_for_user"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."coach_invite_token_hash"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."coach_invite_token_hash"("p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."coach_rule_matches_protocol"() TO "anon";
GRANT ALL ON FUNCTION "public"."coach_rule_matches_protocol"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."coach_rule_matches_protocol"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."coach_student_history_floor"("p_student" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."coach_student_history_floor"("p_student" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."coach_student_history_floor"("p_student" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."coached_student_ids"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."coached_student_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."coached_student_ids"() TO "service_role";



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



GRANT ALL ON FUNCTION "public"."cost_metadata_environment"("p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."cost_metadata_environment"("p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cost_metadata_environment"("p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."cost_metadata_run_type"("p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."cost_metadata_run_type"("p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cost_metadata_run_type"("p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "postgres";
GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "anon";
GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_rate_limit"("p_key" "text", "p_window_seconds" integer, "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_rate_limit"("p_key" "text", "p_window_seconds" integer, "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_single_master_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_single_master_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_single_master_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enqueue_conversation_eval_judge_job"("p_eval_run_id" "uuid", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."enqueue_conversation_eval_judge_job"("p_eval_run_id" "uuid", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."enqueue_conversation_eval_judge_job"("p_eval_run_id" "uuid", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."enqueue_llm_retry_job"("p_user_id" "uuid", "p_scope" "text", "p_channel" "text", "p_message" "text", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."enqueue_llm_retry_job"("p_user_id" "uuid", "p_scope" "text", "p_channel" "text", "p_message" "text", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."enqueue_llm_retry_job"("p_user_id" "uuid", "p_scope" "text", "p_channel" "text", "p_message" "text", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "postgres";
GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "anon";
GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "service_role";



GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_cost_by_operation"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_cost_by_operation"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_cost_by_operation"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_cost_by_operation"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text", "p_run_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_cost_by_operation"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text", "p_run_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_cost_by_operation"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text", "p_run_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_cost_by_user"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_cost_by_user"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_cost_by_user"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_cost_by_user"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text", "p_run_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_cost_by_user"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text", "p_run_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_cost_by_user"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text", "p_run_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_cost_compare_previous"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_cost_compare_previous"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_cost_compare_previous"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_cost_compare_previous"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text", "p_run_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_cost_compare_previous"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text", "p_run_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_cost_compare_previous"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text", "p_run_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_cost_coverage_gaps"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_run_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_cost_coverage_gaps"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_run_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_cost_coverage_gaps"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_run_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_cost_data_quality"("p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_cost_data_quality"("p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_cost_data_quality"("p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_cost_data_quality_v2"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_whatsapp_eur_to_usd" numeric, "p_run_type" "text", "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_cost_data_quality_v2"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_whatsapp_eur_to_usd" numeric, "p_run_type" "text", "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_cost_data_quality_v2"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_whatsapp_eur_to_usd" numeric, "p_run_type" "text", "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_cost_overview"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_cost_overview"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_cost_overview"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_cost_overview"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text", "p_run_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_cost_overview"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text", "p_run_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_cost_overview"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_bucket" "text", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text", "p_run_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_daily_cost_synthesis"("p_target_day" "date", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_daily_cost_synthesis"("p_target_day" "date", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_daily_cost_synthesis"("p_target_day" "date", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_daily_cost_synthesis"("p_target_day" "date", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text", "p_run_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_daily_cost_synthesis"("p_target_day" "date", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text", "p_run_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_daily_cost_synthesis"("p_target_day" "date", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text", "p_run_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_user_daily_costs"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_whatsapp_eur_to_usd" numeric, "p_run_type" "text", "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_user_daily_costs"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_whatsapp_eur_to_usd" numeric, "p_run_type" "text", "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_user_daily_costs"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_whatsapp_eur_to_usd" numeric, "p_run_type" "text", "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_user_operation_breakdown"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_user_id" "uuid", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_user_operation_breakdown"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_user_id" "uuid", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_user_operation_breakdown"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_user_id" "uuid", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_user_operation_breakdown"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_user_id" "uuid", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text", "p_run_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_user_operation_breakdown"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_user_id" "uuid", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text", "p_run_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_user_operation_breakdown"("p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_user_id" "uuid", "p_whatsapp_eur_to_usd" numeric, "p_provider" "text", "p_model" "text", "p_family" "text", "p_operation" "text", "p_run_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_user_stats"("period_start" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_user_stats"("period_start" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_user_stats"("period_start" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_global_ai_cost"("period_start" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_global_ai_cost"("period_start" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_global_ai_cost"("period_start" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_or_create_referral_code"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_or_create_referral_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_or_create_referral_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_production_log"("p_since" timestamp with time zone, "p_limit" integer, "p_only_errors" boolean, "p_source" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_production_log"("p_since" timestamp with time zone, "p_limit" integer, "p_only_errors" boolean, "p_source" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_production_log"("p_since" timestamp with time zone, "p_limit" integer, "p_only_errors" boolean, "p_source" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_production_log"("p_since" timestamp with time zone, "p_limit" integer, "p_only_errors" boolean, "p_source" "text", "p_include_chat" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."get_production_log"("p_since" timestamp with time zone, "p_limit" integer, "p_only_errors" boolean, "p_source" "text", "p_include_chat" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_production_log"("p_since" timestamp with time zone, "p_limit" integer, "p_only_errors" boolean, "p_source" "text", "p_include_chat" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_production_log"("p_since" timestamp with time zone, "p_limit" integer, "p_only_errors" boolean, "p_source" "text", "p_include_chat" boolean, "p_query" "text", "p_include_runtime" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."get_production_log"("p_since" timestamp with time zone, "p_limit" integer, "p_only_errors" boolean, "p_source" "text", "p_include_chat" boolean, "p_query" "text", "p_include_runtime" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_production_log"("p_since" timestamp with time zone, "p_limit" integer, "p_only_errors" boolean, "p_source" "text", "p_include_chat" boolean, "p_query" "text", "p_include_runtime" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_usage_by_model"("period_start" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_usage_by_model"("period_start" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_usage_by_model"("period_start" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_usage_by_source"("period_start" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_usage_by_source"("period_start" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_usage_by_source"("period_start" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_profiles_privileged_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_profiles_privileged_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_profiles_privileged_columns"() TO "service_role";



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



GRANT ALL ON FUNCTION "public"."handle_module_memory_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_module_memory_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_module_memory_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_profile_welcome_email"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_profile_welcome_email"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_profile_welcome_email"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_scheduling_access_tier_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_scheduling_access_tier_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_scheduling_access_tier_change"() TO "service_role";



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



GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "postgres";
GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "anon";
GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "service_role";



GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "postgres";
GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "postgres";
GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "anon";
GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "authenticated";
GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "service_role";



REVOKE ALL ON FUNCTION "public"."invoke_internal_edge_function"("p_function_name" "text", "p_body" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."invoke_internal_edge_function"("p_function_name" "text", "p_body" "jsonb") TO "service_role";



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



REVOKE ALL ON FUNCTION "public"."keel_active_student_threshold"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."keel_active_student_threshold"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."keel_active_student_threshold"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."keel_anonymise_purged_student"("p_user_id" "uuid", "p_full_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."keel_anonymise_purged_student"("p_user_id" "uuid", "p_full_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."keel_apply_scheduled_client_ends"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."keel_apply_scheduled_client_ends"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."keel_apply_scheduled_client_ends"("p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."keel_attach_student_to_coach"("p_user_id" "uuid", "p_coach_id" "uuid", "p_invited_email" "text", "p_country" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."keel_attach_student_to_coach"("p_user_id" "uuid", "p_coach_id" "uuid", "p_invited_email" "text", "p_country" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."keel_billing_month_boundary"("p_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."keel_billing_month_boundary"("p_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."keel_billing_month_boundary"("p_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."keel_cancel_inflight_checkins"("p_user_id" "uuid", "p_from" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."keel_cancel_inflight_checkins"("p_user_id" "uuid", "p_from" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."keel_card_body_slots_declared"("p_body" "text", "p_variables" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."keel_card_body_slots_declared"("p_body" "text", "p_variables" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."keel_card_body_slots_declared"("p_body" "text", "p_variables" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."keel_card_variables_valid"("p_variables" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."keel_card_variables_valid"("p_variables" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."keel_card_variables_valid"("p_variables" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."keel_coach_broadcast_state"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."keel_coach_broadcast_state"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."keel_coach_broadcast_state"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."keel_coach_cancel_client_end"("p_student_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."keel_coach_cancel_client_end"("p_student_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."keel_coach_cancel_client_end"("p_student_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."keel_coach_is_solvent"("p_coach_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."keel_coach_is_solvent"("p_coach_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."keel_coach_is_solvent"("p_coach_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."keel_coach_reactivate_client"("p_student_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."keel_coach_reactivate_client"("p_student_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."keel_coach_reactivate_client"("p_student_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."keel_coach_schedule_client_end"("p_student_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."keel_coach_schedule_client_end"("p_student_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."keel_coach_schedule_client_end"("p_student_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."keel_coach_seat_ledger"("p_coach_id" "uuid", "p_month" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."keel_coach_seat_ledger"("p_coach_id" "uuid", "p_month" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."keel_coach_seat_ledger"("p_coach_id" "uuid", "p_month" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."keel_coach_send_broadcast"("p_body" "text", "p_content_locale" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."keel_coach_send_broadcast"("p_body" "text", "p_content_locale" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."keel_coach_send_broadcast"("p_body" "text", "p_content_locale" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."keel_coach_set_seat_interval"("p_student_user_id" "uuid", "p_interval" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."keel_coach_set_seat_interval"("p_student_user_id" "uuid", "p_interval" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."keel_coach_set_seat_interval"("p_student_user_id" "uuid", "p_interval" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."keel_doctrine_goal_scope_ok"("entries" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."keel_doctrine_goal_scope_ok"("entries" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."keel_doctrine_goal_scope_ok"("entries" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."keel_free_signup_available"() TO "anon";
GRANT ALL ON FUNCTION "public"."keel_free_signup_available"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."keel_free_signup_available"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."keel_invalidate_inflight_evaluations"("p_student_id" "uuid", "p_keep_plan_version_id" "uuid", "p_from_local_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."keel_invalidate_inflight_evaluations"("p_student_id" "uuid", "p_keep_plan_version_id" "uuid", "p_from_local_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."keel_join_house_coach"("p_country" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."keel_join_house_coach"("p_country" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."keel_join_house_coach"("p_country" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."keel_mark_synthesis_delivered"("p_synthesis_id" "uuid", "p_channel" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."keel_mark_synthesis_delivered"("p_synthesis_id" "uuid", "p_channel" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."keel_mark_synthesis_delivered"("p_synthesis_id" "uuid", "p_channel" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."keel_meal_idea_food_groups_valid"() TO "anon";
GRANT ALL ON FUNCTION "public"."keel_meal_idea_food_groups_valid"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."keel_meal_idea_food_groups_valid"() TO "service_role";



GRANT ALL ON FUNCTION "public"."keel_meal_plan_entry_touch"() TO "anon";
GRANT ALL ON FUNCTION "public"."keel_meal_plan_entry_touch"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."keel_meal_plan_entry_touch"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."keel_my_billing_summary"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."keel_my_billing_summary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."keel_my_billing_summary"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."keel_my_seat_ledger"("p_month" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."keel_my_seat_ledger"("p_month" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."keel_my_seat_ledger"("p_month" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."keel_provision_house_plan_version"("p_user_id" "uuid", "p_coach_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."keel_provision_house_plan_version"("p_user_id" "uuid", "p_coach_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."keel_recompute_seat_access_tiers"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."keel_recompute_seat_access_tiers"("p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."keel_render_card"("p_body_template" "text", "p_variables" "jsonb", "p_values" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."keel_render_card"("p_body_template" "text", "p_variables" "jsonb", "p_values" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."keel_render_card"("p_body_template" "text", "p_variables" "jsonb", "p_values" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."keel_replace_doctrine_compilations"("p_doctrine_id" "uuid", "p_rows" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."keel_replace_doctrine_compilations"("p_doctrine_id" "uuid", "p_rows" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."keel_seed_evaluations"("p_rows" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."keel_seed_evaluations"("p_rows" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."keel_student_cards_render"() TO "anon";
GRANT ALL ON FUNCTION "public"."keel_student_cards_render"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."keel_student_cards_render"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."keel_student_interaction_count"("p_student" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."keel_student_interaction_count"("p_student" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."keel_student_interaction_count"("p_student" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."keel_sweep_day_evaluations"("p_user_id" "uuid", "p_plan_version_id" "uuid", "p_local_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."keel_sweep_day_evaluations"("p_user_id" "uuid", "p_plan_version_id" "uuid", "p_local_date" "date") TO "service_role";



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



REVOKE ALL ON FUNCTION "public"."log_coach_student_access"("p_student_user_id" "uuid", "p_surface" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_coach_student_access"("p_student_user_id" "uuid", "p_surface" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_coach_student_access"("p_student_user_id" "uuid", "p_surface" "text") TO "service_role";



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



GRANT ALL ON FUNCTION "public"."maybe_add_master_admin_from_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."maybe_add_master_admin_from_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."maybe_add_master_admin_from_profile"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."my_coach_ids"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_coach_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."my_coach_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_coach_ids"() TO "service_role";



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



GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "postgres";
GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "anon";
GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "service_role";



GRANT ALL ON FUNCTION "public"."on_profile_created_seed_default_coach_preferences"() TO "anon";
GRANT ALL ON FUNCTION "public"."on_profile_created_seed_default_coach_preferences"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."on_profile_created_seed_default_coach_preferences"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."preview_coach_invitation"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."preview_coach_invitation"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."preview_coach_invitation"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."preview_coach_invitation"("p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."protocol_events_quick_tap_untick_only"() TO "anon";
GRANT ALL ON FUNCTION "public"."protocol_events_quick_tap_untick_only"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protocol_events_quick_tap_untick_only"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."purge_auth_user"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purge_auth_user"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."purge_expired_rate_limit_counters"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purge_expired_rate_limit_counters"() TO "anon";
GRANT ALL ON FUNCTION "public"."purge_expired_rate_limit_counters"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."purge_expired_rate_limit_counters"() TO "service_role";



GRANT ALL ON FUNCTION "public"."queue_access_ended_notification"("p_user_id" "uuid", "p_previous_access_tier" "text", "p_new_access_tier" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."queue_access_ended_notification"("p_user_id" "uuid", "p_previous_access_tier" "text", "p_new_access_tier" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."queue_access_ended_notification"("p_user_id" "uuid", "p_previous_access_tier" "text", "p_new_access_tier" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."recompute_coached_students_access_tier"("p_coach_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recompute_coached_students_access_tier"("p_coach_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_my_access_tier"() TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_my_access_tier"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_my_access_tier"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_profile_access_tier"("uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_profile_access_tier"("uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_profile_access_tier"("uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_time_based_access_tiers"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_time_based_access_tiers"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_time_based_access_tiers"("p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."request_morning_active_action_checkins_refresh"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."request_morning_active_action_checkins_refresh"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_morning_active_action_checkins_refresh"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."request_recurring_reminder_checkins_refresh"("p_user_id" "uuid", "p_full_reset" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."request_recurring_reminder_checkins_refresh"("p_user_id" "uuid", "p_full_reset" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_recurring_reminder_checkins_refresh"("p_user_id" "uuid", "p_full_reset" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."request_trigger_synthesizer_for_state"("p_user_id" "uuid", "p_scope" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."request_trigger_synthesizer_for_state"("p_user_id" "uuid", "p_scope" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_trigger_synthesizer_for_state"("p_user_id" "uuid", "p_scope" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."retract_student_safety_constraint"("p_constraint_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."retract_student_safety_constraint"("p_constraint_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."retract_student_safety_constraint"("p_constraint_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."retract_student_safety_constraint"("p_constraint_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."retract_student_safety_constraints_for_user"("p_user_id" "uuid", "p_refs" "text"[], "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."retract_student_safety_constraints_for_user"("p_user_id" "uuid", "p_refs" "text"[], "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."revoke_coach_access"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revoke_coach_access"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_coach_access"() TO "service_role";



GRANT ALL ON FUNCTION "public"."scheduled_checkins_enforce_min_gap_1h"() TO "anon";
GRANT ALL ON FUNCTION "public"."scheduled_checkins_enforce_min_gap_1h"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."scheduled_checkins_enforce_min_gap_1h"() TO "service_role";



GRANT ALL ON FUNCTION "public"."scheduling_access_eligible"("p_access_tier" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."scheduling_access_eligible"("p_access_tier" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."scheduling_access_eligible"("p_access_tier" "text") TO "service_role";



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



GRANT ALL ON FUNCTION "public"."student_safety_constraints_retraction_only"() TO "anon";
GRANT ALL ON FUNCTION "public"."student_safety_constraints_retraction_only"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."student_safety_constraints_retraction_only"() TO "service_role";



GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_memory_items_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_memory_items_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_memory_items_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_student_coach_notes_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_student_coach_notes_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_student_coach_notes_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."transfer_verified_phone_to_user"("p_user_id" "uuid", "p_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."transfer_verified_phone_to_user"("p_user_id" "uuid", "p_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transfer_verified_phone_to_user"("p_user_id" "uuid", "p_phone" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."unlock_transformation_principle"("p_user_id" "uuid", "p_transformation_id" "uuid", "p_principle" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."unlock_transformation_principle"("p_user_id" "uuid", "p_transformation_id" "uuid", "p_principle" "text") TO "authenticated";
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



REVOKE ALL ON FUNCTION "public"."write_student_meal_plan"("p_user_id" "uuid", "p_intent" "text", "p_starts_on" "date", "p_duration_days" smallint, "p_payload" "jsonb", "p_replaces" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."write_student_meal_plan"("p_user_id" "uuid", "p_intent" "text", "p_starts_on" "date", "p_duration_days" smallint, "p_payload" "jsonb", "p_replaces" "uuid") TO "service_role";












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















GRANT ALL ON TABLE "public"."account_security_confirmations" TO "service_role";



GRANT ALL ON TABLE "public"."app_config" TO "anon";
GRANT ALL ON TABLE "public"."app_config" TO "authenticated";
GRANT ALL ON TABLE "public"."app_config" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."card_armings" TO "authenticated";
GRANT ALL ON TABLE "public"."card_armings" TO "service_role";



GRANT ALL ON TABLE "public"."card_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."card_templates" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."card_wins" TO "authenticated";
GRANT ALL ON TABLE "public"."card_wins" TO "service_role";



GRANT ALL ON TABLE "public"."chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."coach_access_events" TO "service_role";
GRANT SELECT ON TABLE "public"."coach_access_events" TO "authenticated";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."coach_billing_periods" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_billing_periods" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."coach_broadcasts" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_broadcasts" TO "service_role";



GRANT ALL ON TABLE "public"."coach_clients" TO "service_role";
GRANT SELECT ON TABLE "public"."coach_clients" TO "authenticated";



GRANT ALL ON TABLE "public"."coach_doctrine_compilations" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_doctrine_compilations" TO "service_role";



GRANT ALL ON TABLE "public"."coach_doctrines" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_doctrines" TO "service_role";



GRANT ALL ON TABLE "public"."coach_document_chunks" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_document_chunks" TO "service_role";



GRANT ALL ON TABLE "public"."coach_document_citations" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_document_citations" TO "service_role";



GRANT ALL ON TABLE "public"."coach_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_documents" TO "service_role";



GRANT ALL ON TABLE "public"."coach_food_items" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_food_items" TO "service_role";



GRANT ALL ON TABLE "public"."coach_food_proposals" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_food_proposals" TO "service_role";



GRANT ALL ON TABLE "public"."coach_food_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_food_rules" TO "service_role";



GRANT ALL ON TABLE "public"."coach_invitations" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."coach_invitations" TO "authenticated";



GRANT SELECT("coach_id") ON TABLE "public"."coach_invitations" TO "authenticated";



GRANT SELECT("email") ON TABLE "public"."coach_invitations" TO "authenticated";



GRANT SELECT("expires_at") ON TABLE "public"."coach_invitations" TO "authenticated";



GRANT SELECT("status") ON TABLE "public"."coach_invitations" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."coach_invitations" TO "authenticated";



GRANT SELECT("accepted_at") ON TABLE "public"."coach_invitations" TO "authenticated";



GRANT ALL ON TABLE "public"."coach_protocols" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_protocols" TO "service_role";



GRANT ALL ON TABLE "public"."coach_student_contact" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_student_contact" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."coach_student_directory" TO "service_role";
GRANT SELECT ON TABLE "public"."coach_student_directory" TO "authenticated";



GRANT ALL ON TABLE "public"."protocol_events" TO "authenticated";
GRANT ALL ON TABLE "public"."protocol_events" TO "service_role";



GRANT ALL ON TABLE "public"."coach_student_events" TO "service_role";
GRANT SELECT ON TABLE "public"."coach_student_events" TO "authenticated";



GRANT ALL ON TABLE "public"."student_daily_checkins" TO "authenticated";
GRANT ALL ON TABLE "public"."student_daily_checkins" TO "service_role";



GRANT ALL ON TABLE "public"."coach_student_pulse" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_student_pulse" TO "service_role";



GRANT ALL ON TABLE "public"."coach_syntheses" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_syntheses" TO "service_role";



GRANT ALL ON TABLE "public"."coach_terms" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_terms" TO "service_role";



GRANT ALL ON TABLE "public"."coach_timing_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_timing_rules" TO "service_role";



GRANT ALL ON TABLE "public"."coaches" TO "service_role";
GRANT SELECT ON TABLE "public"."coaches" TO "authenticated";



GRANT UPDATE("display_name") ON TABLE "public"."coaches" TO "authenticated";



GRANT ALL ON TABLE "public"."cohorts" TO "anon";
GRANT ALL ON TABLE "public"."cohorts" TO "authenticated";
GRANT ALL ON TABLE "public"."cohorts" TO "service_role";



GRANT ALL ON TABLE "public"."commitment_evaluations" TO "anon";
GRANT ALL ON TABLE "public"."commitment_evaluations" TO "authenticated";
GRANT ALL ON TABLE "public"."commitment_evaluations" TO "service_role";



GRANT ALL ON TABLE "public"."commitment_relations" TO "anon";
GRANT ALL ON TABLE "public"."commitment_relations" TO "authenticated";
GRANT ALL ON TABLE "public"."commitment_relations" TO "service_role";



GRANT ALL ON TABLE "public"."communication_logs" TO "anon";
GRANT ALL ON TABLE "public"."communication_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."communication_logs" TO "service_role";



GRANT ALL ON TABLE "public"."confirmation_tokens_consumed" TO "anon";
GRANT ALL ON TABLE "public"."confirmation_tokens_consumed" TO "authenticated";
GRANT ALL ON TABLE "public"."confirmation_tokens_consumed" TO "service_role";



GRANT ALL ON TABLE "public"."contract_change_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."contract_change_requests" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_eval_events" TO "anon";
GRANT ALL ON TABLE "public"."conversation_eval_events" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_eval_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."conversation_eval_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."conversation_eval_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."conversation_eval_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_eval_runs" TO "anon";
GRANT ALL ON TABLE "public"."conversation_eval_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_eval_runs" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_runtime_events" TO "anon";
GRANT ALL ON TABLE "public"."conversation_runtime_events" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_runtime_events" TO "service_role";



GRANT ALL ON TABLE "public"."memory_observability_events" TO "anon";
GRANT ALL ON TABLE "public"."memory_observability_events" TO "authenticated";
GRANT ALL ON TABLE "public"."memory_observability_events" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_runtime_audit_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."conversation_runtime_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."conversation_runtime_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."conversation_runtime_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_scope_memories" TO "anon";
GRANT ALL ON TABLE "public"."conversation_scope_memories" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_scope_memories" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_turn_traces" TO "anon";
GRANT ALL ON TABLE "public"."conversation_turn_traces" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_turn_traces" TO "service_role";



GRANT ALL ON TABLE "public"."llm_usage_events" TO "anon";
GRANT ALL ON TABLE "public"."llm_usage_events" TO "authenticated";
GRANT ALL ON TABLE "public"."llm_usage_events" TO "service_role";



GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."whatsapp_cost_events" TO "anon";
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."whatsapp_cost_events" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_cost_events" TO "service_role";



GRANT ALL ON TABLE "public"."cost_fact_events" TO "service_role";



GRANT ALL ON TABLE "public"."cost_fact_events_enriched" TO "service_role";



GRANT ALL ON TABLE "public"."crisis_resources" TO "service_role";
GRANT SELECT ON TABLE "public"."crisis_resources" TO "authenticated";



GRANT ALL ON TABLE "public"."deletion_records" TO "service_role";



GRANT ALL ON TABLE "public"."food_groups" TO "anon";
GRANT ALL ON TABLE "public"."food_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."food_groups" TO "service_role";



GRANT ALL ON TABLE "public"."food_items" TO "authenticated";
GRANT ALL ON TABLE "public"."food_items" TO "service_role";



GRANT ALL ON TABLE "public"."inbound_dedup" TO "authenticated";
GRANT ALL ON TABLE "public"."inbound_dedup" TO "service_role";



GRANT ALL ON TABLE "public"."internal_admins" TO "anon";
GRANT ALL ON TABLE "public"."internal_admins" TO "authenticated";
GRANT ALL ON TABLE "public"."internal_admins" TO "service_role";



GRANT ALL ON TABLE "public"."llm_pricing" TO "anon";
GRANT ALL ON TABLE "public"."llm_pricing" TO "authenticated";
GRANT ALL ON TABLE "public"."llm_pricing" TO "service_role";



GRANT ALL ON TABLE "public"."llm_raw_response_events" TO "anon";
GRANT ALL ON TABLE "public"."llm_raw_response_events" TO "authenticated";
GRANT ALL ON TABLE "public"."llm_raw_response_events" TO "service_role";



GRANT ALL ON TABLE "public"."meal_ideas" TO "anon";
GRANT ALL ON TABLE "public"."meal_ideas" TO "authenticated";
GRANT ALL ON TABLE "public"."meal_ideas" TO "service_role";



GRANT ALL ON TABLE "public"."meal_precision_questions" TO "service_role";



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



GRANT ALL ON SEQUENCE "public"."memory_observability_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."memory_observability_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."memory_observability_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."memory_weekly_review_runs" TO "anon";
GRANT ALL ON TABLE "public"."memory_weekly_review_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."memory_weekly_review_runs" TO "service_role";



GRANT ALL ON TABLE "public"."outbound_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."outbound_messages" TO "service_role";



GRANT ALL ON TABLE "public"."pending_actions" TO "anon";
GRANT ALL ON TABLE "public"."pending_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."pending_actions" TO "service_role";



GRANT ALL ON TABLE "public"."plan_commitments" TO "authenticated";
GRANT ALL ON TABLE "public"."plan_commitments" TO "service_role";



GRANT ALL ON TABLE "public"."plan_documents" TO "anon";
GRANT ALL ON TABLE "public"."plan_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."plan_documents" TO "service_role";



GRANT ALL ON TABLE "public"."plan_templates" TO "anon";
GRANT ALL ON TABLE "public"."plan_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."plan_templates" TO "service_role";



GRANT ALL ON TABLE "public"."plan_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."plan_versions" TO "service_role";



GRANT ALL ON TABLE "public"."planned_deviations" TO "authenticated";
GRANT ALL ON TABLE "public"."planned_deviations" TO "service_role";



GRANT ALL ON TABLE "public"."proactive_job_state" TO "anon";
GRANT ALL ON TABLE "public"."proactive_job_state" TO "authenticated";
GRANT ALL ON TABLE "public"."proactive_job_state" TO "service_role";



GRANT ALL ON TABLE "public"."rate_limit_counters" TO "anon";
GRANT ALL ON TABLE "public"."rate_limit_counters" TO "authenticated";
GRANT ALL ON TABLE "public"."rate_limit_counters" TO "service_role";



GRANT ALL ON TABLE "public"."reengagement_episodes" TO "authenticated";
GRANT ALL ON TABLE "public"."reengagement_episodes" TO "service_role";



GRANT ALL ON TABLE "public"."scheduled_checkins" TO "anon";
GRANT ALL ON TABLE "public"."scheduled_checkins" TO "authenticated";
GRANT ALL ON TABLE "public"."scheduled_checkins" TO "service_role";



GRANT ALL ON TABLE "public"."scheduled_checkins_delete_audit" TO "anon";
GRANT ALL ON TABLE "public"."scheduled_checkins_delete_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."scheduled_checkins_delete_audit" TO "service_role";



GRANT ALL ON TABLE "public"."slot_vocabulary" TO "anon";
GRANT ALL ON TABLE "public"."slot_vocabulary" TO "authenticated";
GRANT ALL ON TABLE "public"."slot_vocabulary" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."stripe_webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."student_cards" TO "authenticated";
GRANT ALL ON TABLE "public"."student_cards" TO "service_role";



GRANT ALL ON TABLE "public"."student_coach_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."student_coach_notes" TO "service_role";



GRANT ALL ON TABLE "public"."student_generated_meals" TO "anon";
GRANT ALL ON TABLE "public"."student_generated_meals" TO "authenticated";
GRANT ALL ON TABLE "public"."student_generated_meals" TO "service_role";



GRANT ALL ON TABLE "public"."student_goals" TO "anon";
GRANT ALL ON TABLE "public"."student_goals" TO "authenticated";
GRANT ALL ON TABLE "public"."student_goals" TO "service_role";



GRANT ALL ON TABLE "public"."student_meal_documents" TO "anon";
GRANT ALL ON TABLE "public"."student_meal_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."student_meal_documents" TO "service_role";



GRANT ALL ON TABLE "public"."student_safety_constraints" TO "authenticated";
GRANT ALL ON TABLE "public"."student_safety_constraints" TO "service_role";



GRANT ALL ON TABLE "public"."student_week_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."student_week_plans" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_notifications" TO "anon";
GRANT ALL ON TABLE "public"."subscription_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."substance_interactions" TO "anon";
GRANT ALL ON TABLE "public"."substance_interactions" TO "authenticated";
GRANT ALL ON TABLE "public"."substance_interactions" TO "service_role";



GRANT ALL ON TABLE "public"."substance_limits" TO "anon";
GRANT ALL ON TABLE "public"."substance_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."substance_limits" TO "service_role";



GRANT ALL ON TABLE "public"."substances" TO "anon";
GRANT ALL ON TABLE "public"."substances" TO "authenticated";
GRANT ALL ON TABLE "public"."substances" TO "service_role";



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



GRANT ALL ON TABLE "public"."upcoming_contexts" TO "anon";
GRANT ALL ON TABLE "public"."upcoming_contexts" TO "authenticated";
GRANT ALL ON TABLE "public"."upcoming_contexts" TO "service_role";



GRANT ALL ON TABLE "public"."user_attack_cards" TO "anon";
GRANT ALL ON TABLE "public"."user_attack_cards" TO "authenticated";
GRANT ALL ON TABLE "public"."user_attack_cards" TO "service_role";



GRANT ALL ON TABLE "public"."user_chat_states" TO "anon";
GRANT ALL ON TABLE "public"."user_chat_states" TO "authenticated";
GRANT ALL ON TABLE "public"."user_chat_states" TO "service_role";



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



GRANT ALL ON TABLE "public"."user_framework_entries" TO "anon";
GRANT ALL ON TABLE "public"."user_framework_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."user_framework_entries" TO "service_role";



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



GRANT ALL ON TABLE "public"."vocabulary_extension_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."vocabulary_extension_requests" TO "service_role";



GRANT ALL ON TABLE "public"."weekly_reviews" TO "anon";
GRANT ALL ON TABLE "public"."weekly_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_reviews" TO "service_role";









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































