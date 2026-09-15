-- ============================================================================
-- KEEL — W10 · BILLING PER-ACTIVE-STUDENT + INHERITED ENTITLEMENT
--
-- STATUS: NOT APPLIED TO ANY REMOTE — HUMAN REVIEW REQUIRED.
-- Applied and verified on the LOCAL database only (npx supabase db reset).
--
-- ---------------------------------------------------------------------------
-- WHY THIS MIGRATION EXISTS (MEGA_REVIEW B6, verified)
-- ---------------------------------------------------------------------------
-- In KEEL the COACH pays the seat. The student never subscribes. But
-- `profiles.access_tier` defaults to 'none' and `recompute_profile_access_tier`
-- only ever looked at the student's OWN `subscriptions` row + their OWN trial.
-- Consequence, reproduced on the local DB: a student invited by a paying coach
-- lands on access_tier='none' at day 15 and is ejected from the proactive loop
-- (slot reminders, Sunday digest, and — the one that matters — the proactive
-- restriction floor, the only path that both cuts the nudges and writes the
-- coach escalation). The product made protocol execution depend on the
-- subscription of the product we just deleted.
--
-- This migration adds the INHERITED entitlement: a user whose `coach_clients`
-- link is 'active' under a SOLVENT coach gets access_tier='student', with no
-- subscription of their own and no trial.
--
-- ---------------------------------------------------------------------------
-- THE FOUR HARD-CODED TIER SITES MOVE TOGETHER
-- ---------------------------------------------------------------------------
--   1. profiles_access_tier_check          (here, section 1)
--   2. subscriptions_tier_check            (here, section 1)
--   3. supabase/functions/_shared/billing-tier.ts
--   4. frontend/src/lib/entitlements.ts
-- Two new tokens (R1: ASCII snake_case, no accent, no space):
--   'coach'    — a coach with a solvent KEEL platform subscription (or inside
--                their 14-day trial). Set from their own `subscriptions` row.
--   'student'  — INHERITED. Never sold, never bought, never on an invoice line
--                of its own: it is a projection of the coach's solvency onto
--                the student. It cannot be self-assigned, because
--                recompute_profile_access_tier is the only writer of
--                access_tier and it derives 'student' from coach_clients.
-- The three legacy B2C tiers ('system','alliance','architecte') are KEPT in the
-- CHECKs: dropping them would orphan every existing row and the legacy
-- subscriptions still in flight. They are not issued by KEEL any more.
--
-- ---------------------------------------------------------------------------
-- WHAT "ACTIVE STUDENT" MEANS — THE CONTRACTUAL DEFINITION
-- ---------------------------------------------------------------------------
-- Billed seat = `coach_clients.status='active'` AND >= 3 interactions inside
-- the calendar month, counted on `protocol_events` + `chat_messages`.
-- The threshold lives in ONE place, `public.keel_active_student_threshold()`,
-- so the invoice, the billing page and the reconciliation job cannot drift.
-- A link can be 'active' and unbilled (trial, comped) — that is `seat_state`,
-- deliberately kept out of `status` by W1.1 — and an unbilled seat still grants
-- the inherited entitlement. We never sell access we then withhold.
--
-- ---------------------------------------------------------------------------
-- NON-GOALS, STATED SO THEY ARE NOT READ INTO THE CODE
-- ---------------------------------------------------------------------------
--   * No Stripe product/price is created here or by any code in this wave.
--     Product creation is a HUMAN action (BUILD_PLAN W10.1). This migration
--     only stores what a human-created subscription reports back.
--   * No permanent free tier (BUILD_PLAN, "ce qu'on refuse de construire").
--     The coach trial is 14 days / 3 students and then it stops.
-- ============================================================================


-- ============================================================================
-- 1. THE TIER VOCABULARY (2 of the 4 hard-coded sites)
-- ============================================================================

alter table public.profiles
  drop constraint if exists profiles_access_tier_check;

alter table public.profiles
  add constraint profiles_access_tier_check
  check (access_tier = any (array[
    'none'::text,
    'trial'::text,
    -- KEEL
    'coach'::text,
    'student'::text,
    -- legacy B2C, no longer issued, kept so existing rows stay valid
    'system'::text,
    'alliance'::text,
    'architecte'::text
  ]));

alter table public.subscriptions
  drop constraint if exists subscriptions_tier_check;

-- 'student' is deliberately ABSENT here: an inherited entitlement has no
-- subscription row by construction. If a 'student' tier ever appears on a
-- subscription, something bought a seat it cannot own — fail at the write (R7).
alter table public.subscriptions
  add constraint subscriptions_tier_check
  check (tier is null or tier = any (array[
    'coach'::text,
    'system'::text,
    'alliance'::text,
    'architecte'::text
  ]));


-- ============================================================================
-- 2. THE COACH TRIAL (14 days / 3 students)
-- ============================================================================

alter table public.coaches
  add column if not exists trial_started_at timestamptz not null default now();

alter table public.coaches
  add column if not exists trial_ends_at timestamptz;

alter table public.coaches
  add column if not exists trial_seat_limit integer not null default 3;

alter table public.coaches
  drop constraint if exists coaches_trial_seat_limit_positive;

alter table public.coaches
  add constraint coaches_trial_seat_limit_positive
  check (trial_seat_limit >= 0);

-- Backfill + default for rows created before this migration: 14 days from the
-- trial start. Written as a value, not as a generated column, so a human can
-- extend one coach's trial without a schema change.
update public.coaches
   set trial_ends_at = trial_started_at + interval '14 days'
 where trial_ends_at is null;

create or replace function public._trg_coaches_default_trial_end()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.trial_ends_at is null then
    new.trial_ends_at := coalesce(new.trial_started_at, now()) + interval '14 days';
  end if;
  return new;
end;
$$;

drop trigger if exists on_coaches_default_trial_end on public.coaches;
create trigger on_coaches_default_trial_end
  before insert on public.coaches
  for each row execute function public._trg_coaches_default_trial_end();

-- `trial_ends_at`, `trial_seat_limit` and `trial_started_at` are NOT client
-- writable. `coaches_self_update` (W1.1) is a row policy and a row policy
-- cannot restrict columns, so the restriction is a column-level grant — the
-- same mechanism W1.1 used for `status` and `credential_type`.
revoke update on public.coaches from authenticated;
grant update (display_name) on public.coaches to authenticated;


-- ============================================================================
-- 3. THE ACTIVITY RULE — ONE definition, three readers
-- ============================================================================

-- The contractual threshold. A function, not a literal, because the invoice,
-- the coach's billing page and the monthly reconciliation must read the SAME
-- number or the coach is billed for a count they were never shown.
create or replace function public.keel_active_student_threshold()
returns integer
language sql
immutable
set search_path = ''
as $$ select 3 $$;

revoke all on function public.keel_active_student_threshold() from public;
revoke all on function public.keel_active_student_threshold() from anon;
grant execute on function public.keel_active_student_threshold() to authenticated;
grant execute on function public.keel_active_student_threshold() to service_role;


-- Interactions inside [p_from, p_to). Half-open on purpose: month boundaries
-- must not double-count a midnight event into two invoices.
--
-- What counts: a protocol_event (the student logged a fact) or a chat_message
-- the student themselves wrote (`role='user'`). Assistant messages are excluded
-- BY DESIGN — otherwise our own proactive nudges would manufacture billable
-- activity for a silent student. That is the one way this counter could become
-- self-dealing, so it is closed in the definition, not in a comment.
create or replace function public.keel_student_interaction_count(
  p_student uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
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

revoke all on function public.keel_student_interaction_count(uuid, timestamptz, timestamptz) from public;
revoke all on function public.keel_student_interaction_count(uuid, timestamptz, timestamptz) from anon;
grant execute on function public.keel_student_interaction_count(uuid, timestamptz, timestamptz) to service_role;


create index if not exists protocol_events_user_occurred_idx
  on public.protocol_events (user_id, occurred_at);

create index if not exists chat_messages_user_created_role_idx
  on public.chat_messages (user_id, created_at) where role = 'user';


-- ============================================================================
-- 4. COACH SOLVENCY — the predicate the inherited entitlement hangs from
-- ============================================================================

-- A coach is solvent when EITHER their own subscription is live (status
-- active/trialing, period not elapsed) OR they are inside their 14-day trial.
-- `coaches.status` must be 'active': a suspended coach's students lose the
-- inherited entitlement, which is the point of suspending a coach.
--
-- Deliberately NOT keyed on `subscriptions.tier='coach'`: a coach who came in
-- on a legacy tier, or whose price id has not been mapped yet, is still paying
-- us. Solvency is "money is arriving", not "the label is right" — mapping a
-- price id must never be able to cut a paying coach's whole roster.
create or replace function public.keel_coach_is_solvent(p_coach_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.coaches c
    left join public.subscriptions s on s.user_id = c.user_id
    where c.id = p_coach_id
      and c.status = 'active'
      and (
        (
          lower(coalesce(s.status, '')) in ('active','trialing')
          and (s.current_period_end is null or now() < s.current_period_end)
        )
        or (c.trial_ends_at is not null and now() < c.trial_ends_at)
      )
  );
$$;

revoke all on function public.keel_coach_is_solvent(uuid) from public;
revoke all on function public.keel_coach_is_solvent(uuid) from anon;
grant execute on function public.keel_coach_is_solvent(uuid) to authenticated;
grant execute on function public.keel_coach_is_solvent(uuid) to service_role;


-- ============================================================================
-- 5. recompute_profile_access_tier — EXTENDED (the B6 fix)
-- ============================================================================

-- Precedence, from strongest to weakest:
--   1. own live subscription        -> its tier ('coach' for a KEEL coach)
--   2. INHERITED seat               -> 'student'
--   3. own trial still running      -> 'trial'
--   4. otherwise                    -> 'none'
--
-- (2) sits ABOVE (3) on purpose. A student who signed up on their own two weeks
-- before their coach invited them would otherwise be downgraded from 'trial' to
-- 'none' the day their personal trial elapsed, while their coach is paying for
-- their seat. The stronger, non-expiring grant wins.
--
-- The body is otherwise byte-identical to the version in the 20260522 squash:
-- the diff is the `elsif inherited` branch and the seat lookup. Keeping the
-- rest untouched matters — this function is called from a trigger on every
-- subscription write in the product.
create or replace function public.recompute_profile_access_tier(uid uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
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


-- Recompute an entire roster. Called when the COACH's own solvency changes:
-- one subscription event moves every one of their students at once.
create or replace function public.recompute_coached_students_access_tier(p_coach_id uuid)
returns integer
language plpgsql
security definer
set search_path = 'public'
as $$
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

revoke all on function public.recompute_coached_students_access_tier(uuid) from public;
revoke all on function public.recompute_coached_students_access_tier(uuid) from anon;
revoke all on function public.recompute_coached_students_access_tier(uuid) from authenticated;
grant execute on function public.recompute_coached_students_access_tier(uuid) to service_role;


-- ============================================================================
-- 6. THE TRIGGERS THAT KEEP THE INHERITANCE HONEST
-- ============================================================================

-- (a) The link changes -> the student moves.
create or replace function public._trg_recompute_access_tier_from_coach_clients()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
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

drop trigger if exists on_coach_clients_change_recompute_access on public.coach_clients;
create trigger on_coach_clients_change_recompute_access
  after insert or update or delete on public.coach_clients
  for each row execute function public._trg_recompute_access_tier_from_coach_clients();


-- (b) The coach's solvency changes -> the whole roster moves.
--     Fired from the coach's own `subscriptions` row and from `coaches.status`.
create or replace function public._trg_recompute_roster_from_subscriptions()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
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

drop trigger if exists on_subscriptions_change_recompute_roster on public.subscriptions;
create trigger on_subscriptions_change_recompute_roster
  after insert or update or delete on public.subscriptions
  for each row execute function public._trg_recompute_roster_from_subscriptions();

create or replace function public._trg_recompute_roster_from_coaches()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  perform public.recompute_coached_students_access_tier(new.id);
  return null;
end;
$$;

drop trigger if exists on_coaches_change_recompute_roster on public.coaches;
create trigger on_coaches_change_recompute_roster
  after update of status, trial_ends_at on public.coaches
  for each row execute function public._trg_recompute_roster_from_coaches();


-- (c) TIME. A trial that elapses fires no trigger — nothing writes at midnight.
--     `recompute_time_based_access_tiers` (squash) only walks profiles whose
--     access_tier <> 'none', which is right for a lapse and WRONG for the
--     inherited grant: a student sitting at 'none' whose coach just re-subscribed
--     is invisible to it. This adds the missing direction.
create or replace function public.keel_recompute_seat_access_tiers(p_limit integer default 5000)
returns integer
language plpgsql
security definer
set search_path = 'public'
as $$
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

revoke all on function public.keel_recompute_seat_access_tiers(integer) from public;
revoke all on function public.keel_recompute_seat_access_tiers(integer) from anon;
revoke all on function public.keel_recompute_seat_access_tiers(integer) from authenticated;
grant execute on function public.keel_recompute_seat_access_tiers(integer) to service_role;


-- ============================================================================
-- 7. THE TRIAL SEAT CAP — enforced at the WRITE, not in the UI
-- ============================================================================

-- 14 days / 3 students. A CHECK cannot count sibling rows, so this is a
-- BEFORE trigger. It fires only for a coach with NO live subscription: the
-- moment they pay, the cap disappears without a schema change.
--
-- R7: this raises. It does not silently downgrade the link to 'invited' or
-- clamp the roster — a coach who thinks they invited a 4th student and did not
-- would discover it through their student's silence.
create or replace function public._trg_coach_clients_enforce_trial_cap()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_limit integer;
  v_live integer;
  v_paying boolean;
begin
  if new.status not in ('invited','active') then
    return new;
  end if;
  -- Nothing new is being occupied by this write.
  if tg_op = 'UPDATE' and old.status in ('invited','active') then
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

drop trigger if exists on_coach_clients_enforce_trial_cap on public.coach_clients;
create trigger on_coach_clients_enforce_trial_cap
  before insert or update of status on public.coach_clients
  for each row execute function public._trg_coach_clients_enforce_trial_cap();


-- ============================================================================
-- 8. THE INVOICE LINE — what the reconciliation job reads and writes
-- ============================================================================

-- One row per (coach, calendar month). Written by the monthly reconciliation
-- job (`stripe-reconcile-seats`), read by the coach's billing page.
--
-- DERIVED, NEVER INCREMENTED — same doctrine as the rest of KEEL. The job
-- recomputes `active_seat_count` from scratch every run and upserts; there is
-- no `+1` anywhere. A re-run is therefore idempotent and a missed run is
-- recoverable, which is the only reason a monthly billing job is safe to own.
create table if not exists public.coach_billing_periods (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(id) on delete cascade,
  -- First day of the calendar month, in the coach's billing timezone (UTC for
  -- the pilot — stated here so nobody later assumes local midnight).
  period_month date not null,
  -- The two numbers, NEVER merged (CONTRACT: two numbers are never fused).
  active_seat_count integer not null default 0,
  linked_seat_count integer not null default 0,
  -- The threshold in force WHEN THE PERIOD WAS COMPUTED. Snapshotted so a later
  -- change of the contractual definition cannot silently rewrite past invoices.
  threshold_at_computation integer not null,
  stripe_subscription_id text,
  stripe_seat_item_id text,
  -- What we actually pushed to Stripe, which is not necessarily what we
  -- computed (a push can fail). Keeping both is what makes the discrepancy
  -- visible instead of assumed away.
  pushed_quantity integer,
  pushed_at timestamptz,
  push_error text,
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_billing_periods_month_is_first_of_month
    check (period_month = date_trunc('month', period_month)::date),
  constraint coach_billing_periods_counts_nonneg
    check (active_seat_count >= 0 and linked_seat_count >= 0),
  -- An active seat is a subset of the linked seats. If this ever fails, the
  -- job counted two different populations.
  constraint coach_billing_periods_active_within_linked
    check (active_seat_count <= linked_seat_count)
);

create unique index if not exists coach_billing_periods_coach_month_idx
  on public.coach_billing_periods (coach_id, period_month);

alter table public.coach_billing_periods enable row level security;

-- The coach reads their own invoice history. Nobody writes from a client: the
-- reconciliation job is service_role. No INSERT/UPDATE/DELETE policy exists,
-- and that absence is the write protection.
create policy coach_billing_periods_coach_select on public.coach_billing_periods
  for select to authenticated
  using (
    coach_id in (
      select c.id from public.coaches c where c.user_id = (select auth.uid())
    )
  );

revoke insert, update, delete on public.coach_billing_periods from authenticated;
revoke all on public.coach_billing_periods from anon;


-- ============================================================================
-- 9. THE SEAT LEDGER — one function, read by the job AND by the billing page
-- ============================================================================

-- Returns one row per LIVE link of the coach, with the interaction count for
-- the month and whether it crosses the threshold. The billing page shows this
-- list; the job sums its `is_active_seat`. One query, two readers: the coach
-- cannot be invoiced for a count they were not shown.
create or replace function public.keel_coach_seat_ledger(
  p_coach_id uuid,
  p_month date default null
)
returns table (
  coach_client_id uuid,
  student_user_id uuid,
  seat_state text,
  link_status text,
  interaction_count integer,
  is_active_seat boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with bounds as (
    select
      date_trunc('month', coalesce(p_month, (now() at time zone 'utc')::date))::timestamptz as m_from,
      (date_trunc('month', coalesce(p_month, (now() at time zone 'utc')::date)) + interval '1 month')::timestamptz as m_to
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
      cc.status = 'active'
      and cc.student_user_id is not null
      and coalesce(
            public.keel_student_interaction_count(cc.student_user_id, b.m_from, b.m_to),
            0
          ) >= public.keel_active_student_threshold()
    )
  from public.coach_clients cc
  cross join bounds b
  where cc.coach_id = p_coach_id
    and cc.status in ('invited','active','paused');
$$;

revoke all on function public.keel_coach_seat_ledger(uuid, date) from public;
revoke all on function public.keel_coach_seat_ledger(uuid, date) from anon;
grant execute on function public.keel_coach_seat_ledger(uuid, date) to service_role;


-- The coach-facing wrapper. Takes NO coach_id: it resolves the caller's own
-- coaches row. A parameter would be an authorization decision handed to the
-- client — this way there is nothing to tamper with.
create or replace function public.keel_my_seat_ledger(p_month date default null)
returns table (
  coach_client_id uuid,
  student_user_id uuid,
  seat_state text,
  link_status text,
  interaction_count integer,
  is_active_seat boolean
)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
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

revoke all on function public.keel_my_seat_ledger(date) from public;
revoke all on function public.keel_my_seat_ledger(date) from anon;
grant execute on function public.keel_my_seat_ledger(date) to authenticated;
grant execute on function public.keel_my_seat_ledger(date) to service_role;


-- The coach's own billing header: trial state, solvency, subscription mirror.
-- `subscriptions` is not readable by the coach through a plain select in this
-- shape, and `coaches.trial_ends_at` is now a non-writable column; this is the
-- one read that assembles them.
create or replace function public.keel_my_billing_summary()
returns table (
  coach_id uuid,
  coach_status text,
  trial_ends_at timestamptz,
  trial_seat_limit integer,
  is_solvent boolean,
  subscription_status text,
  subscription_tier text,
  current_period_end timestamptz,
  cancel_at_period_end boolean
)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
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

revoke all on function public.keel_my_billing_summary() from public;
revoke all on function public.keel_my_billing_summary() from anon;
grant execute on function public.keel_my_billing_summary() to authenticated;
grant execute on function public.keel_my_billing_summary() to service_role;


-- ============================================================================
-- 10. THE TWO CRONS
-- ============================================================================

create extension if not exists "pg_net" with schema "extensions";
create extension if not exists "pg_cron" with schema "extensions";

do $$
declare job record;
begin
  for job in
    select jobid from cron.job
    where jobname in ('keel-reconcile-seats-monthly', 'keel-seat-entitlement-sweep')
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end $$;

-- Same app_config + vault pattern as 20260727160000: nothing is POSTed if any
-- of the three configuration values is missing (a cron that fires at a 404
-- every month is worse than a cron that does not fire).
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

-- (a) The invoice. 1st of the month, 03:20 UTC — after the month has closed,
--     and deliberately NOT at midnight: the count must be taken when no local
--     timezone anywhere is still writing into the period being billed.
select pg_temp.schedule_internal_edge_job(
  'keel-reconcile-seats-monthly',
  '20 3 1 * *',
  'stripe-reconcile-seats'
);

-- (b) The entitlement sweep. TIME is the one input that fires no trigger: a
--     coach trial elapsing at 02:00 writes nothing, so every student of that
--     coach would keep executing a protocol nobody pays for until the next
--     unrelated write touched their row. Daily, in SQL, no edge function.
do $$
begin
  perform cron.schedule(
    'keel-seat-entitlement-sweep',
    '35 2 * * *',
    $cmd$ select public.keel_recompute_seat_access_tiers(50000); $cmd$
  );
end $$;


-- ============================================================================
-- 11. BACKFILL — the students who are already stuck at 'none'
-- ============================================================================

-- Runs once, at apply time. Without it the fix only helps links created AFTER
-- the migration, and B6 is precisely a report about links that already exist.
select public.keel_recompute_seat_access_tiers(50000);
