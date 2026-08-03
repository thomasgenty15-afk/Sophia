-- ============================================================================
-- KEEL W4.2 — day provisioning, end-of-day sweep, republication re-seed.
--
-- Authority: docs/keel/CONTRACT.md (R1, R5, R6, R7 + "Execution truth"),
--            docs/keel/SCHEMA.md, docs/keel/BUILD_PLAN.md W4.2.
--
-- WHY RPCs AND NOT PLAIN PostgREST WRITES
--   1. The idempotence key of `commitment_evaluations` is a FUNCTIONAL unique
--      index -- `(user_id, commitment_id, local_date, coalesce(slot_key,
--      'no_slot'))`. PostgREST's `on_conflict` takes column names only, so an
--      `upsert()` from the edge function cannot target it: day/week-grain rows
--      (slot_key NULL) would duplicate on every replay. The seeding RPC below
--      names the expression explicitly.
--   2. The sweep and the re-seed both branch on columns of `plan_commitments`
--      (`slot_kind`, `polarity`, `auto_source`, `flex_eligible`) while writing
--      `commitment_evaluations`. That is a join on the write path, which
--      PostgREST cannot express at all.
--   3. Execution truth (CONTRACT): the caller does not get to assert what is
--      seedable. `keel_seed_evaluations` re-validates every row against the
--      live prescription (active commitment, nominal slot_kind, published
--      version, matching student) and RETURNS the rejected count. A caller
--      holding a stale plan cannot write a phantom evaluation.
--
-- WHAT IS DELIBERATELY NOT HERE
--   `unknown` is never overwritten to `met` by silence (CONTRACT). The sweep
--   only touches rows that are still `unknown` AND `resolved_at is null`, and
--   it NEVER resolves a line fed by a silent device (`auto_source not null`,
--   R6) -- an unsynced Whoop is not a student who did not comply.
-- ============================================================================


-- ============================================================================
-- 1. keel_seed_evaluations(p_rows jsonb)
--    Pre-seed the day's `nominal` evaluations in `unknown`. Idempotent.
-- ============================================================================
--
-- R6 `slot_kind='nominal'`: pre-seeded `unknown` at day open, unresolved at day
-- close => `missed`. `opportunistic` lines are NOT seeded here and must not be:
-- their evaluation is born when a fact arrives, and a pre-seeded row would turn
-- "did not log" into a false `missed` at sweep time.
--
-- Input shape (R1: ASCII snake_case keys, values are tokens or ids):
--   [{ "user_id", "commitment_id", "plan_version_id", "local_date",
--      "slot_key" | null, "grain", "expected": {} }, ...]
--
-- Returns: {"requested","validated","inserted","conflicted","rejected"}
--   `conflicted` = the row already existed (replay, DST double tick, manual
--   re-run). That is the idempotence path, not an error.
--   `rejected`   = the row did not survive re-validation against the live
--   prescription. Non-zero means the caller is holding a stale plan: it is
--   reported, never swallowed.
create or replace function public.keel_seed_evaluations(p_rows jsonb)
returns jsonb
language sql
volatile
set search_path = public
as $$
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

comment on function public.keel_seed_evaluations(jsonb) is
  'KEEL W4.2: idempotent pre-seed of the day''s nominal commitment_evaluations in status unknown. Re-validates every row against the live published prescription and reports the rejected count.';

revoke all on function public.keel_seed_evaluations(jsonb) from public;
revoke all on function public.keel_seed_evaluations(jsonb) from anon;
revoke all on function public.keel_seed_evaluations(jsonb) from authenticated;
grant execute on function public.keel_seed_evaluations(jsonb) to service_role;


-- ============================================================================
-- 2. keel_sweep_day_evaluations(user, plan_version, local_date)
--    End-of-day close: the unresolved `nominal` lines get their verdict.
-- ============================================================================
--
-- The four named branches are transcribed FROM the evaluator
-- (_shared/keel/evaluator.ts::deriveStatus), in its order, so that a swept row
-- and an evaluator-computed row can never disagree:
--
--   1. planned_deviations (declared IN ADVANCE)
--        consumed_flex AND flex_eligible -> flex_used  (scores 1, STAYS in the
--                                                       denominator)
--        otherwise                       -> not_applicable (leaves it)
--      A deviation with a slot_key covers only that occasion; a deviation with
--      slot_key NULL covers the whole day. Without this branch the sweep would
--      hand a `missed` to a student who declared their restaurant dinner three
--      days in advance -- the exact "unjust missed" the contract forbids.
--   2. auto_source not null (R6) -> NOT TOUCHED, stays `unknown`.
--      A device that did not sync is not a student who did not comply.
--   3. polarity='avoid' (R6, inverted default) -> no contrary fact means `met`.
--   4. everything else -> `missed`, timing `unknown`.
--
-- Only `slot_kind='nominal'` rows are swept. `opportunistic` lines are never
-- pre-seeded and never swept: their absence is a coverage deficit, not a grade.
--
-- Returns: {"missed","met","not_applicable","flex_used","held_device_unknown"}
create or replace function public.keel_sweep_day_evaluations(
  p_user_id uuid,
  p_plan_version_id uuid,
  p_local_date date
)
returns jsonb
language sql
volatile
set search_path = public
as $$
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

comment on function public.keel_sweep_day_evaluations(uuid, uuid, date) is
  'KEEL W4.2: end-of-day close. Unresolved nominal evaluations get the evaluator''s named branches (deviation / avoid / missed). Device-fed lines stay unknown (R6).';

revoke all on function public.keel_sweep_day_evaluations(uuid, uuid, date) from public;
revoke all on function public.keel_sweep_day_evaluations(uuid, uuid, date) from anon;
revoke all on function public.keel_sweep_day_evaluations(uuid, uuid, date) from authenticated;
grant execute on function public.keel_sweep_day_evaluations(uuid, uuid, date) to service_role;


-- ============================================================================
-- 3. keel_invalidate_inflight_evaluations(...)
--    Republication: kill the evaluations of the RETIRED prescription.
-- ============================================================================
--
-- THE BUG CLASS THIS EXISTS FOR (paid for in legacy P0, "phantom-commit"):
-- the coach retires a prescription on Wednesday and publishes a new version.
-- Thursday morning the student receives a reminder -- and, at Thursday's close,
-- a `missed` -- for a line that no longer exists in their contract. The
-- evaluation row survived its own prescription.
--
-- Scope, deliberately narrow:
--   * only rows of a plan version OTHER than the freshly published one;
--   * only `local_date >= p_from_local_date` (the publication's local day):
--     yesterday's `missed` is history, derived from real facts, and
--     `weekly_reviews.plan_version_changed_midweek` is what segments the week;
--   * only rows still IN FLIGHT (`status='unknown'` and `resolved_at is null`).
--     A row already resolved was derived from a fact that really happened; it
--     stays, attached to the version it was graded under.
--
-- DELETE, not a status flip: `commitment_evaluations` is the DERIVED layer,
-- recomputable from facts by definition (CONTRACT, "zero incremental
-- counters"). An `unknown` row carries no fact, so deleting it destroys
-- nothing -- and leaving it as `not_applicable` would keep a retired
-- prescription visible on the student's day.
create or replace function public.keel_invalidate_inflight_evaluations(
  p_student_id uuid,
  p_keep_plan_version_id uuid,
  p_from_local_date date
)
returns integer
language sql
volatile
set search_path = public
as $$
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

comment on function public.keel_invalidate_inflight_evaluations(uuid, uuid, date) is
  'KEEL W4.2 republication: drop the in-flight (unknown, unresolved) evaluations of the superseded plan versions from the publication day onward. Resolved rows are history and are kept.';

revoke all on function public.keel_invalidate_inflight_evaluations(uuid, uuid, date) from public;
revoke all on function public.keel_invalidate_inflight_evaluations(uuid, uuid, date) from anon;
revoke all on function public.keel_invalidate_inflight_evaluations(uuid, uuid, date) from authenticated;
grant execute on function public.keel_invalidate_inflight_evaluations(uuid, uuid, date) to service_role;


-- ============================================================================
-- 4. keel_cancel_inflight_checkins(user, from)
--    Republication: the second half of the phantom-commit fix.
-- ============================================================================
--
-- The reminders derived from the retired prescription (W4.6 seeds them with an
-- event_context prefixed `keel_`) must not fire either. A reminder quoting a
-- withdrawn line is the visible face of the same bug.
--
-- UPDATE to 'cancelled', never DELETE: `scheduled_checkins` carries an AFTER
-- DELETE audit trigger (20260712230000) precisely because reminders were
-- vanishing without a trace. A status transition is legible, auditable, and
-- keeps the row available to the trace. It also leaves the BEFORE UPDATE
-- min-gap trigger inert (it returns early for any status outside
-- pending/awaiting_user/sent).
--
-- The `keel\_%` prefix is the seam with W4.6: only KEEL-derived reminders are
-- cancelled. A student's own recurring reminder ("remind me to call mum") is
-- not a prescription and is never touched by a republication.
create or replace function public.keel_cancel_inflight_checkins(
  p_user_id uuid,
  p_from timestamptz
)
returns integer
language sql
volatile
set search_path = public
as $$
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

comment on function public.keel_cancel_inflight_checkins(uuid, timestamptz) is
  'KEEL W4.2 republication: cancel (never delete) the in-flight KEEL-derived scheduled_checkins of a student, so no reminder quotes a withdrawn prescription.';

revoke all on function public.keel_cancel_inflight_checkins(uuid, timestamptz) from public;
revoke all on function public.keel_cancel_inflight_checkins(uuid, timestamptz) from anon;
revoke all on function public.keel_cancel_inflight_checkins(uuid, timestamptz) from authenticated;
grant execute on function public.keel_cancel_inflight_checkins(uuid, timestamptz) to service_role;


-- ============================================================================
-- 5. Indexes for the two hourly passes
-- ============================================================================

-- The sweep reads (user_id, plan_version_id, local_date) and filters on the
-- unresolved rows only. Partial index: the resolved rows accumulate forever,
-- the unresolved set of one day is tiny.
create index if not exists commitment_evaluations_unresolved_sweep_idx
  on public.commitment_evaluations (user_id, plan_version_id, local_date)
  where status = 'unknown' and resolved_at is null;

-- The provisioning pass loads the nominal, active commitments of a version.
create index if not exists plan_commitments_nominal_active_idx
  on public.plan_commitments (plan_version_id)
  where status = 'active' and slot_kind = 'nominal';

-- The republication cancel walks the KEEL reminders of one student.
create index if not exists scheduled_checkins_keel_inflight_idx
  on public.scheduled_checkins (user_id, scheduled_for)
  where status in ('pending', 'retrying') and event_context like 'keel\_%';


-- ============================================================================
-- 6. pg_cron — the two hourly passes
-- ============================================================================
--
-- Both jobs tick EVERY HOUR and gate themselves per timezone inside
-- provision-day-v1, reusing schedule-whatsapp-v2-checkins/timezone_gate.ts
-- (W1.3 bug 3). A single daily UTC tick cannot work: at 00:05 UTC it is still
-- 20:05 of the previous local day in New York.
--
--   provision  local hour in [00, 01)  -> cron minute :00
--   sweep      local hour in [23, 24)  -> cron minute :55
--
-- Minute :55 rather than :59 leaves the pass a margin before the local day
-- rolls over, and the HOUR is what the gate reads -- which is why half-hour
-- offsets (Asia/Kolkata +5:30, Asia/Kathmandu +5:45, Pacific/Chatham +12:45)
-- are covered too: they simply see local 23:25 or 23:10 on their own tick.
-- Gating on a local MINUTE would have skipped every one of them, forever.
--
-- Idempotence on a double tick (DST, cron retry, manual replay) is carried by
-- the seeding RPC (ON CONFLICT DO NOTHING) and by the sweep predicate
-- (`status='unknown' and resolved_at is null` matches nothing on a second run).
--
-- Job command pattern: app_config + vault, copied from
-- 20260615133000_recreate_active_pg_cron_jobs.sql / 20260727140000. The post is
-- skipped entirely when the base url, the anon key or the internal secret is
-- missing.

create extension if not exists "pg_net" with schema "extensions";
create extension if not exists "pg_cron" with schema "extensions";

do $$
declare
  job record;
begin
  for job in
    select jobid
    from cron.job
    where jobname in ('keel-provision-day', 'keel-sweep-day')
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end $$;

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

select pg_temp.schedule_internal_edge_job(
  'keel-provision-day',
  '0 * * * *',
  'provision-day-v1',
  '{"mode":"provision"}'::jsonb
);

select pg_temp.schedule_internal_edge_job(
  'keel-sweep-day',
  '55 * * * *',
  'provision-day-v1',
  '{"mode":"sweep"}'::jsonb
);

-- Fail loud (R7): a silently unscheduled job means a fleet whose days never
-- open and never close.
do $$
declare
  provision_schedule text;
  sweep_schedule text;
begin
  select schedule into provision_schedule
  from cron.job where jobname = 'keel-provision-day';
  select schedule into sweep_schedule
  from cron.job where jobname = 'keel-sweep-day';

  if provision_schedule is distinct from '0 * * * *' then
    raise exception
      'W4.2: keel-provision-day must tick hourly at minute 0, got %',
      coalesce(provision_schedule, '<not scheduled>');
  end if;

  if sweep_schedule is distinct from '55 * * * *' then
    raise exception
      'W4.2: keel-sweep-day must tick hourly at minute 55, got %',
      coalesce(sweep_schedule, '<not scheduled>');
  end if;
end $$;
