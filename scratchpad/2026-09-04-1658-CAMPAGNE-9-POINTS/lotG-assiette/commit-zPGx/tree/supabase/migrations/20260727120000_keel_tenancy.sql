-- ============================================================================
-- KEEL — TENANCY (BUILD_PLAN W1.1)
--
-- STATUS: NOT APPLIED TO ANY REMOTE — HUMAN REVIEW REQUIRED.
-- Applied and verified on the LOCAL database only (npx supabase db reset).
--
-- What this migration establishes:
--   1. The coach <-> student link (coaches, coach_clients, coach_invitations)
--      and its audit trail (coach_access_events, server-written only).
--   2. public.coached_student_ids() — the single gate through which a coach
--      reads student data. SECURITY DEFINER STABLE returning uuid[], called as
--      `user_id = any((select public.coached_student_ids())::uuid[])` so Postgres
--      hoists it into an InitPlan: ONE call per query, not one per row.
--   3. Tier A: direct SELECT policies for the coach on structural student
--      tables. Tier B: column-allowlist SECURITY DEFINER views for anything
--      carrying student verbatim (PostgREST grants are per-ROLE, and coach and
--      student are both `authenticated` — a policy cannot restrict columns).
--
-- CONTRACT: "impersonation of a student by a coach" is refused on the record.
-- There is NO coach write policy on any student table. The coach is
-- structurally read-only. Revocation by the student goes through the
-- public.revoke_coach_access() RPC, not through a client-side UPDATE.
--
-- ---------------------------------------------------------------------------
-- TWO DOCUMENTED DIVERGENCES FROM THE W1.1 BULLET LIST (both resolved in
-- favour of docs/keel/SCHEMA.md and docs/keel/CONTRACT.md, per the authority
-- order — flagged here so the reviewer arbitrates explicitly):
--
--   (a) protocol_events gets NO Tier A SELECT policy for the coach.
--       SCHEMA.md marks `student_note` "redacted before coach exposure", and
--       an RLS policy cannot hide a column from a role the student shares.
--       A Tier A policy on protocol_events would hand the coach `student_note`
--       and `media_path` through a plain PostgREST select, defeating the very
--       view W1.1 also asks for. The coach reads facts through
--       `coach_student_events` (Tier B) instead — the view is SECURITY DEFINER
--       so it needs no policy on the base table.
--
--   (b) `coach_student_directory` does not expose `created_at`: public.profiles
--       has no such column (verified in DB). Sourcing it from auth.users would
--       expose the auth schema through a view granted to `authenticated`;
--       refused. W6 can add `client_since` from coach_clients.started_at if the
--       coach UI needs a "student since" date.
--
-- NOTE ON citext: the extension is NOT installed (checked against the squash
-- 20260522143735 and against the live DB). Per the W1.1 fallback, emails are
-- `text` with lower() in the unique indexes, plus a CHECK forcing the stored
-- value to be already lowercased — a case variant fails at the WRITE, loudly,
-- instead of silently creating a second invitation for the same human (R7).
--
-- NOTE ON coach_id FKs: plan_templates / plan_documents / plan_versions /
-- plan_commitments still carry a bare `coach_id uuid` with a "TODO P3: FK ->
-- coaches(id)" comment. Adding those FKs is NOT part of W1.1 and is not done
-- here: supabase/tests/keel/acceptance_fixtures.sql inserts a synthetic
-- coach_id with no matching coaches row, and the acceptance run must keep
-- passing. The FKs land with the fixture rework.
-- ============================================================================


-- ============================================================================
-- 1. TENANCY TABLES
-- ============================================================================

-- coaches — one row per human who prescribes. `user_id` is the auth identity;
-- the coach signs in like anybody else (no separate auth realm, no
-- impersonation surface).
create table if not exists public.coaches (
  id uuid primary key default gen_random_uuid(),
  -- RGPD purge: the coach row dies with the auth user.
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  -- R1: ASCII snake_case tokens. Self-declared; `certified_coach`/`rd`/
  -- `clinician` are verified out of band before they are set by the server.
  credential_type text not null default 'none'
    check (credential_type in ('none','certified_coach','rd','clinician')),
  status text not null default 'active'
    check (status in ('active','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- coach_clients — THE link. `status='active'` is the billable seat (W10) and
-- the only status that grants read access.
create table if not exists public.coach_clients (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(id) on delete cascade,
  -- Null until the invited human accepts and an auth user exists.
  -- RGPD purge: the link dies with the student's auth user.
  student_user_id uuid references auth.users(id) on delete cascade,
  -- citext unavailable: text + lowercase CHECK (see header).
  invited_email text check (invited_email = lower(invited_email)),
  status text not null default 'invited'
    check (status in ('invited','active','paused','ended')),
  consent_granted_at timestamptz,
  -- W10 billing axis, kept out of `status` on purpose: a seat can be active
  -- and unbilled (trial, comped) without touching the access rule.
  seat_state text not null default 'trial'
    check (seat_state in ('billed','trial','free')),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Consent is a precondition of access, enforced by the database, not by the
  -- application layer: an 'active' link without a consent timestamp cannot
  -- exist. coached_student_ids() therefore reads consent implicitly.
  constraint coach_clients_active_requires_consent
    check (status <> 'active' or consent_granted_at is not null)
);

-- One LIVE coach per student. 'invited' and 'active' are the live statuses:
-- one of them is a standing offer, the other is a granted read.
--
-- 'paused' is deliberately OUT of the predicate, together with 'ended'. A
-- paused link is history plus a resume option, not an occupied seat: it is
-- what public.revoke_coach_access() writes when the STUDENT pulls consent.
-- Counting it as live meant a student who revoked could never be picked up by
-- another coach — the unique index rejected the new link — so the revocation
-- silently became a lock-in on the coach they had just fired. Verified in
-- supabase/functions/_shared/keel/tenancy_rls_test.sql (section 10).
--
-- Resuming a paused link server-side while another coach is live now fails
-- loudly on this same index, which is the correct outcome (R7).
create unique index if not exists one_live_coach_per_student
  on public.coach_clients (student_user_id)
  where status in ('invited','active') and student_user_id is not null;

create index if not exists coach_clients_coach_status_idx
  on public.coach_clients (coach_id, status);


-- coach_invitations — sha256 of the token ONLY. The clear token exists in the
-- email and nowhere else; a database dump does not yield a usable invite.
create table if not exists public.coach_invitations (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(id) on delete cascade,
  email text not null check (email = lower(email)),
  invite_token_hash text not null,
  expires_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending','accepted','expired','revoked')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

-- One live invitation per (coach, email): re-inviting replaces, never stacks.
create unique index if not exists one_pending_per_email
  on public.coach_invitations (coach_id, email)
  where status = 'pending';


-- coach_access_events — audit trail of coach reads. SERVER-WRITTEN ONLY:
-- there is deliberately no INSERT policy, so no client role can forge or
-- suppress a line. The student can read every access to their own space.
create table if not exists public.coach_access_events (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(id) on delete cascade,
  student_user_id uuid not null references auth.users(id) on delete cascade,
  -- R1: ASCII snake_case token (e.g. 'student_dashboard', 'weekly_review').
  surface text not null,
  occurred_at timestamptz not null default now()
);

create index if not exists coach_access_events_student_idx
  on public.coach_access_events (student_user_id, occurred_at desc);

create index if not exists coach_access_events_coach_idx
  on public.coach_access_events (coach_id, occurred_at desc);


-- ============================================================================
-- 2. PROFILES — role + display unit system
-- ============================================================================

-- keel_role is NOT an entitlement: declaring oneself a coach grants nothing.
-- Access derives exclusively from a consented coach_clients link, so this
-- column is deliberately left out of guard_profiles_privileged_columns().
alter table public.profiles
  add column if not exists keel_role text
    check (keel_role in ('student','coach'));

-- CONTRACT R4: display units are a separate axis from locale. Storage stays
-- SI; a fr-CA coach may legitimately want pounds.
alter table public.profiles
  add column if not exists display_unit_system text not null default 'metric'
    check (display_unit_system in ('metric','imperial'));


-- ============================================================================
-- 3. coached_student_ids() — the single read gate
-- ============================================================================

-- Returns the students the CURRENT coach may read. Empty array (never null)
-- for a non-coach, a suspended coach, or a coach with no active client.
--
-- Consent is implied by the CHECK on coach_clients: status='active' cannot
-- exist without consent_granted_at.
--
-- Call it as `user_id = any((select public.coached_student_ids())::uuid[])`. The
-- wrapping (select ...) is not cosmetic: it makes the call an InitPlan
-- evaluated once per query. `EXISTS (...)` per row is a sequential scan on
-- every coach screen.
create or replace function public.coached_student_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(cc.student_user_id), '{}'::uuid[])
  from public.coach_clients cc
  join public.coaches c on c.id = cc.coach_id
  where c.user_id = (select auth.uid())
    and c.status = 'active'
    and cc.status = 'active'
    and cc.student_user_id is not null;
$$;

-- EXECUTE is granted to PUBLIC by default on new functions; a SECURITY DEFINER
-- gate must not inherit that.
revoke all on function public.coached_student_ids() from public;
revoke all on function public.coached_student_ids() from anon;
grant execute on function public.coached_student_ids() to authenticated;
grant execute on function public.coached_student_ids() to service_role;


-- ============================================================================
-- 4. revoke_coach_access() — the student pulls the plug
-- ============================================================================

-- The student has no UPDATE policy on coach_clients (a client-side PATCH on a
-- billing-bearing row is not a consent mechanism). Revocation is this RPC:
-- consent is cleared and the link is paused — never deleted, because the audit
-- trail and the billing history must survive the revocation.
-- Returns the number of links revoked (0 is a truthful answer, not a silent
-- fallback: there was nothing to revoke).
create or replace function public.revoke_coach_access()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
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

revoke all on function public.revoke_coach_access() from public;
revoke all on function public.revoke_coach_access() from anon;
grant execute on function public.revoke_coach_access() to authenticated;
grant execute on function public.revoke_coach_access() to service_role;


-- ============================================================================
-- 5. RLS ON THE TENANCY TABLES
-- ============================================================================

alter table public.coaches            enable row level security;
alter table public.coach_clients      enable row level security;
alter table public.coach_invitations  enable row level security;
alter table public.coach_access_events enable row level security;

-- The coach reads their own row and may rename themselves. `credential_type`
-- and `status` are NOT client-writable: they are column-level grants below, so
-- a suspended coach cannot un-suspend themselves through PostgREST.
create policy coaches_self_select on public.coaches
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy coaches_self_update on public.coaches
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- The coach sees their own client list. Creating, activating and ending links
-- is server-side (service_role): no INSERT/UPDATE/DELETE policy here.
create policy coach_clients_coach_select on public.coach_clients
  for select to authenticated
  using (
    coach_id in (
      select c.id from public.coaches c where c.user_id = (select auth.uid())
    )
  );

-- The student sees who has access to their space — including paused and ended
-- links. Transparency is the counterpart of the coach's read access.
create policy coach_clients_student_select on public.coach_clients
  for select to authenticated
  using (student_user_id = (select auth.uid()));

-- Invitations: readable by their author only. Issuing one is server-side (the
-- token hash must be computed where the clear token is generated).
create policy coach_invitations_coach_select on public.coach_invitations
  for select to authenticated
  using (
    coach_id in (
      select c.id from public.coaches c where c.user_id = (select auth.uid())
    )
  );

-- Audit trail: read-only for both sides, write-only for the server.
create policy coach_access_events_student_select on public.coach_access_events
  for select to authenticated
  using (student_user_id = (select auth.uid()));

create policy coach_access_events_coach_select on public.coach_access_events
  for select to authenticated
  using (
    coach_id in (
      select c.id from public.coaches c where c.user_id = (select auth.uid())
    )
  );


-- Grants. Supabase default privileges hand `all` on every new public table to
-- anon and authenticated; that is re-tightened here explicitly.
revoke all on public.coaches             from anon;
revoke all on public.coach_clients       from anon;
revoke all on public.coach_invitations   from anon;
revoke all on public.coach_access_events from anon;

revoke all on public.coaches             from authenticated;
revoke all on public.coach_clients       from authenticated;
revoke all on public.coach_invitations   from authenticated;
revoke all on public.coach_access_events from authenticated;

grant select on public.coaches to authenticated;
-- Column-level: display_name is the ONLY client-writable field on coaches.
grant update (display_name) on public.coaches to authenticated;

grant select on public.coach_clients to authenticated;
grant select on public.coach_access_events to authenticated;

-- coach_invitations: the token hash is never sent to a client, not even to the
-- coach who issued it. Column allowlist instead of a table-wide SELECT (a
-- column-level REVOKE would be a no-op under a table-level GRANT).
grant select (id, coach_id, email, status, expires_at, created_at, accepted_at)
  on public.coach_invitations to authenticated;

grant all on public.coaches             to service_role;
grant all on public.coach_clients       to service_role;
grant all on public.coach_invitations   to service_role;
grant all on public.coach_access_events to service_role;


-- ============================================================================
-- 6. TIER A — coach SELECT policies on structural student tables
--
-- Pattern, identical everywhere:
--   using (<student column> = any((select public.coached_student_ids())::uuid[]))
-- No USING clause references anything else; no coach WRITE policy exists.
-- ============================================================================

-- plan_versions scopes the student as `student_id` (all other KEEL tables use
-- `user_id`) — verified against 20260727090000.
create policy plan_versions_select_coach on public.plan_versions
  for select to authenticated
  using (student_id = any((select public.coached_student_ids())::uuid[]));

create policy plan_commitments_select_coach on public.plan_commitments
  for select to authenticated
  using (user_id = any((select public.coached_student_ids())::uuid[]));

create policy commitment_evaluations_select_coach on public.commitment_evaluations
  for select to authenticated
  using (user_id = any((select public.coached_student_ids())::uuid[]));

-- planned_deviations carries `coach_visible` (default true): the schema's own
-- gate. A deviation the student marked private stays private.
create policy planned_deviations_select_coach on public.planned_deviations
  for select to authenticated
  using (
    coach_visible
    and user_id = any((select public.coached_student_ids())::uuid[])
  );

create policy weekly_reviews_select_coach on public.weekly_reviews
  for select to authenticated
  using (user_id = any((select public.coached_student_ids())::uuid[]));

-- contract_change_requests is addressed TO the coach by design (CONTRACT:
-- "the AI escalates, the coach decides"). Read-only all the same: the decision
-- is written server-side after validation.
create policy contract_change_requests_select_coach on public.contract_change_requests
  for select to authenticated
  using (user_id = any((select public.coached_student_ids())::uuid[]));

create policy student_safety_constraints_select_coach on public.student_safety_constraints
  for select to authenticated
  using (user_id = any((select public.coached_student_ids())::uuid[]));

create policy upcoming_contexts_select_coach on public.upcoming_contexts
  for select to authenticated
  using (user_id = any((select public.coached_student_ids())::uuid[]));

-- protocol_events: NO Tier A policy on purpose — divergence (a) in the header.
-- The coach reads facts through public.coach_student_events.


-- ============================================================================
-- 7. COACH-SCOPED TABLES — replacing the P0 "service_role only" TODO
--
-- These tables hold the COACH's own material (templates, uploaded PDFs), not
-- student data. Full CRUD for the owning coach is correct and does not weaken
-- the read-only rule, which governs student tables.
-- ============================================================================

create policy plan_templates_coach_all on public.plan_templates
  for all to authenticated
  using (
    coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  )
  with check (
    coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  );

create policy plan_documents_coach_all on public.plan_documents
  for all to authenticated
  using (
    coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  )
  with check (
    coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  );


-- ============================================================================
-- 8. TIER B — column-allowlist views (SECURITY DEFINER)
--
-- PostgREST grants are per-role and coach and student share `authenticated`,
-- so a column cannot be hidden by a policy. These views run with the owner's
-- rights (security_invoker = off, set explicitly rather than relied upon as a
-- default) and do their own filtering through coached_student_ids().
-- ============================================================================

-- Identity of the coached students. NEVER email, phone_number, birth_date,
-- gender, access_tier, stripe_customer_id or any billing column.
-- (`created_at` is absent from public.profiles — divergence (b) in the header.)
create or replace view public.coach_student_directory as
  select
    p.id,
    p.full_name,
    p.avatar_url,
    p.timezone,
    p.locale
  from public.profiles p
  where p.id = any((select public.coached_student_ids())::uuid[]);

alter view public.coach_student_directory set (security_invoker = off);


-- Facts, minus everything verbatim. `student_note` (SCHEMA.md: "redacted
-- before coach exposure") and `media_path` never leave the base table; the
-- coach sees only WHETHER a media exists. `source_message_id` is an internal
-- transport id (wamid) and is not exposed either.
create or replace view public.coach_student_events as
  select
    e.id,
    e.user_id,
    e.occurred_at,
    e.local_date,
    e.slot_key,
    e.source,
    e.recognized,
    e.recognition_confidence,
    e.quantity,
    e.unit,
    e.substance_ref,
    e.food_group_ref,
    e.content_locale,
    e.evidence_weight,
    (e.media_path is not null) as has_media,
    e.created_at
  from public.protocol_events e
  where e.user_id = any((select public.coached_student_ids())::uuid[]);

alter view public.coach_student_events set (security_invoker = off);

revoke all on public.coach_student_directory from anon;
revoke all on public.coach_student_events    from anon;
grant select on public.coach_student_directory to authenticated;
grant select on public.coach_student_events    to authenticated;


-- ============================================================================
-- 9. PERFORMANCE — indexes the coach screens need
--
-- Plain CREATE INDEX: migrations run inside a transaction, where CONCURRENTLY
-- is illegal. These tables are small enough today that the lock is a non-event;
-- if that stops being true, the index goes out in a standalone concurrent run.
-- ============================================================================

create index if not exists user_plan_items_user_status_idx
  on public.user_plan_items (user_id, status);

create index if not exists user_plan_item_entries_user_effective_idx
  on public.user_plan_item_entries (user_id, effective_at desc);

create index if not exists user_metrics_user_idx
  on public.user_metrics (user_id);

create index if not exists user_victory_ledger_user_created_idx
  on public.user_victory_ledger (user_id, created_at desc);
