-- ============================================================================
-- KEEL — INVITATION RPCs (BUILD_PLAN W6.5 / W6.6)
--
-- STATUS: NOT APPLIED TO ANY REMOTE — HUMAN REVIEW REQUIRED.
-- Applied and verified on the LOCAL database only (npx supabase db reset).
--
-- Companion of 20260727120000_keel_tenancy.sql, which created the tables. This
-- migration adds the four server-side entry points the invitation flow needs
-- and NOTHING else — no new table, no new policy, no widening of an existing
-- one.
--
--   1. preview_coach_invitation(token)        — PUBLIC surface (anon).
--   2. accept_coach_invitation(token)         — an ALREADY authenticated user.
--   3. accept_coach_invitation_for_user(u, t) — the signup path, called from
--                                               handle_new_user() in a
--                                               try/catch (referral pattern).
--   4. log_coach_student_access(student, s)   — the audit line written every
--                                               time a coach opens a student's
--                                               space.
--
-- ---------------------------------------------------------------------------
-- ARBITRATION 1 — NO coach_clients ROW IS CREATED AT INVITE TIME.
--
-- `coach_clients` carries a partial unique index `one_live_coach_per_student`
-- over `status in ('invited','active')`. Materialising the link when the
-- invitation is SENT would therefore make an unaccepted, forgotten invitation
-- occupy the student's only live seat: coach B could never take on a student
-- coach A had merely emailed. That is the same lock-in class as defect D3 of
-- W1 (revocation writing 'paused' while the index counted 'paused' as live),
-- and it is avoided here by not creating the row at all.
--
-- The link is born at ACCEPTANCE, already `status='active'` with
-- `consent_granted_at` set, because accepting the invitation IS the consent
-- act — and the CHECK `coach_clients_active_requires_consent` refuses an
-- active link without that timestamp anyway. One writer, one moment, no
-- reconciliation. A coach's pending invitations are visible to them through
-- `coach_invitations` (column-allowlisted SELECT policy), so nothing is lost
-- on the coach's screen.
--
-- ---------------------------------------------------------------------------
-- ARBITRATION 2 — preview_coach_invitation IS AVARE ON PURPOSE.
--
-- It is the only KEEL function granted to `anon`, and it is reached with a
-- bearer token that anyone holding the email link can replay. It therefore
-- returns exactly two fields, and only on the valid branch:
--   * the coach's FIRST NAME (never the full name, never coaches.id, never the
--     coach's user_id, never their credential or status);
--   * the invited EMAIL, so the signup form can be pre-filled — the holder of
--     the link already knows it, since the link was mailed to that address.
-- Every refusal branch returns a reason token and NOTHING else. There is no
-- code path in which an invalid or expired token yields an email address.
--
-- ---------------------------------------------------------------------------
-- ARBITRATION 3 — WHY log_coach_student_access IS AN RPC AND NOT A POLICY.
--
-- `coach_access_events` has no INSERT policy, deliberately: "server-written
-- only, so no client role can forge or suppress a line" (20260727120000). The
-- coach's screen runs in a browser under `authenticated`, and W6.6 requires an
-- audit line per opening. Granting an INSERT policy would let any authenticated
-- user write arbitrary (coach_id, student_user_id, surface) triples.
--
-- This SECURITY DEFINER RPC keeps the invariant: the caller supplies only the
-- student and a surface token; `coach_id` is DERIVED from auth.uid(), the
-- student must already be inside coached_student_ids(), and the surface must
-- belong to a closed ASCII list (R1) or the call RAISES (R7). A client can
-- still refrain from calling it — but no client can write a line that says
-- something false, and none can delete one.
--
-- ---------------------------------------------------------------------------
-- NOTE ON THE HASH. `coach_invitations.invite_token_hash` stores the sha256 of
-- the clear token, hex-encoded lowercase. sha256() is a Postgres 11+ built-in;
-- no pgcrypto dependency is introduced. The Deno counterpart lives in
-- supabase/functions/coach-invite-student-v1/index.ts (`hashInviteToken`) and
-- MUST stay byte-identical — the acceptance test pins both against the same
-- vector.
-- ============================================================================


-- ============================================================================
-- 0. THE HASH, ONCE
-- ============================================================================

-- Internal helper. Not granted to anon/authenticated: the SECURITY DEFINER
-- functions below run as postgres and are the only callers. Keeping it
-- ungranted is not secrecy (sha256 is public knowledge) — it is surface
-- hygiene: nothing outside this file has a reason to hash an invite token.
--
-- The utf8 encoding of the INPUT is stated HERE and only here, so the three
-- call sites cannot drift from each other or from the Deno implementation.
create or replace function public.coach_invite_token_hash(p_token text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select encode(sha256(convert_to(p_token, 'utf8')), 'hex');
$$;

revoke all on function public.coach_invite_token_hash(text) from public, anon, authenticated;
grant execute on function public.coach_invite_token_hash(text) to service_role;


-- ============================================================================
-- 1. preview_coach_invitation(token) — the public surface
-- ============================================================================

-- Returns jsonb, never a row set: a jsonb refusal cannot accidentally carry an
-- extra column the way `returns table` or `returns setof` can when someone
-- later adds a field to the query.
--
--   valid = true  -> { valid, coach_first_name, email }
--   valid = false -> { valid, reason }   and strictly nothing else
--
-- reason ∈ invalid_token | expired | revoked | already_accepted | coach_unavailable
create or replace function public.preview_coach_invitation(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.preview_coach_invitation(text) from public;
grant execute on function public.preview_coach_invitation(text) to anon, authenticated, service_role;


-- ============================================================================
-- 2. accept_coach_invitation_for_user(user, token) — the engine
-- ============================================================================

-- Both acceptance paths (signup metadata and the "already signed in" button)
-- land here, so the rules live once.
--
--   accepted = true  -> { accepted, coach_first_name }
--   accepted = false -> { accepted, reason }
--
-- reason ∈ invalid_token | expired | revoked | already_accepted
--          | coach_unavailable | self_invitation | already_coached
--
-- `already_coached` is the one that matters: a student who already has a LIVE
-- link with another coach cannot be pulled into a second one. The check is
-- explicit here AND enforced underneath by one_live_coach_per_student, whose
-- unique_violation is caught and mapped to the same reason — two concurrent
-- accepts cannot both win.
create or replace function public.accept_coach_invitation_for_user(
  p_user_id uuid,
  p_token text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_invitation_id uuid;
  v_coach_id uuid;
  v_coach_user_id uuid;
  v_coach_status text;
  v_coach_name text;
  v_status text;
  v_expires_at timestamptz;
  v_link_id uuid;
  v_link_coach uuid;
begin
  if p_user_id is null then
    raise exception 'accept_coach_invitation: no user' using errcode = '42501';
  end if;
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{20,200}$' then
    return jsonb_build_object('accepted', false, 'reason', 'invalid_token');
  end if;

  v_hash := public.coach_invite_token_hash(p_token);

  -- FOR UPDATE: the invitation row is the mutex of this whole operation. Two
  -- tabs clicking "Accept" serialise here instead of racing on coach_clients.
  select i.id, i.coach_id, i.status, i.expires_at,
         c.user_id, c.status,
         coalesce(nullif(btrim(c.display_name), ''), nullif(btrim(p.full_name), ''))
    into v_invitation_id, v_coach_id, v_status, v_expires_at,
         v_coach_user_id, v_coach_status, v_coach_name
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
    -- Burn it while we hold the lock: an expired invitation stops being
    -- 'pending' the first time anyone looks at it, so the coach's screen shows
    -- the truth without a sweeper job.
    update public.coach_invitations set status = 'expired' where id = v_invitation_id;
    return jsonb_build_object('accepted', false, 'reason', 'expired');
  end if;
  if v_coach_status <> 'active' then
    return jsonb_build_object('accepted', false, 'reason', 'coach_unavailable');
  end if;
  if v_coach_user_id = p_user_id then
    return jsonb_build_object('accepted', false, 'reason', 'self_invitation');
  end if;

  -- A LIVE link with somebody else is a refusal, not a silent takeover. The
  -- student leaves a coach through revoke_coach_access(), never through a
  -- second coach's invitation.
  select cc.id, cc.coach_id into v_link_id, v_link_coach
  from public.coach_clients cc
  where cc.student_user_id = p_user_id
    and cc.status in ('invited', 'active')
  limit 1
  for update;

  if v_link_id is not null and v_link_coach <> v_coach_id then
    return jsonb_build_object('accepted', false, 'reason', 'already_coached');
  end if;

  begin
    if v_link_id is not null then
      -- Same coach, already live: idempotent re-acceptance.
      update public.coach_clients
         set status = 'active',
             consent_granted_at = coalesce(consent_granted_at, now()),
             started_at = coalesce(started_at, now()),
             ended_at = null,
             updated_at = now()
       where id = v_link_id;
    else
      -- A paused or ended link with THIS coach is resumed rather than
      -- duplicated: the audit trail and the billing history of the previous
      -- period stay attached to one row.
      select cc.id into v_link_id
      from public.coach_clients cc
      where cc.student_user_id = p_user_id
        and cc.coach_id = v_coach_id
        and cc.status in ('paused', 'ended')
      order by cc.updated_at desc
      limit 1
      for update;

      if v_link_id is not null then
        update public.coach_clients
           set status = 'active',
               consent_granted_at = now(),
               started_at = coalesce(started_at, now()),
               ended_at = null,
               updated_at = now()
         where id = v_link_id;
      else
        insert into public.coach_clients
          (coach_id, student_user_id, invited_email, status,
           consent_granted_at, started_at)
        values
          (v_coach_id, p_user_id,
           (select lower(i.email) from public.coach_invitations i where i.id = v_invitation_id),
           'active', now(), now())
        returning id into v_link_id;
      end if;
    end if;
  exception when unique_violation then
    -- one_live_coach_per_student fired: another coach won the race between our
    -- SELECT and this write. Same answer as the explicit check above.
    return jsonb_build_object('accepted', false, 'reason', 'already_coached');
  end;

  update public.coach_invitations
     set status = 'accepted', accepted_at = now()
   where id = v_invitation_id;

  -- The student app's route guard reads profiles.keel_role. Accepting an
  -- invitation is what makes someone a student, so the role is set here — but
  -- only when it is unset: it never demotes a coach who accepted a peer's
  -- invitation on their own account.
  update public.profiles
     set keel_role = 'student', updated_at = now()
   where id = p_user_id
     and keel_role is null;

  return jsonb_build_object(
    'accepted', true,
    'coach_first_name', nullif(split_part(coalesce(v_coach_name, ''), ' ', 1), '')
  );
end;
$$;

revoke all on function public.accept_coach_invitation_for_user(uuid, text)
  from public, anon, authenticated;
grant execute on function public.accept_coach_invitation_for_user(uuid, text) to service_role;


-- ============================================================================
-- 3. accept_coach_invitation(token) — the signed-in path
-- ============================================================================

create or replace function public.accept_coach_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

revoke all on function public.accept_coach_invitation(text) from public, anon;
grant execute on function public.accept_coach_invitation(text) to authenticated, service_role;


-- ============================================================================
-- 4. handle_new_user() — the signup path
--
-- Unchanged body + ONE new block, built exactly like the referral attribution
-- of 20260708160000: read the token from raw_user_meta_data, call the RPC
-- inside a begin/exception that downgrades ANY failure to a warning. An
-- invitation bug must never break a signup — the account is created either
-- way, and the student can still accept from /join afterwards.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_existing_profile_id uuid;
  v_timezone text;
  v_locale text;
  v_tz_follow_device boolean;
  v_referral_code text;
  v_coach_invite_token text;
begin
  v_phone := nullif(coalesce(new.raw_user_meta_data->>'phone', new.phone, ''), '');
  v_timezone := nullif(coalesce(new.raw_user_meta_data->>'timezone', ''), '');
  v_locale := coalesce(nullif(coalesce(new.raw_user_meta_data->>'locale', ''), ''), 'fr-FR');
  v_tz_follow_device := lower(coalesce(new.raw_user_meta_data->>'tz_follow_device', '')) in
    ('t', 'true', '1', 'yes', 'y', 'on');

  -- Defense in depth: do not let a bypassed frontend signup attach to a phone
  -- already verified or WhatsApp-active on another profile.
  if v_phone is not null then
    select p.id into v_existing_profile_id
    from public.profiles p
    where p.phone_number = v_phone
      and p.id <> new.id
      and (p.phone_verified_at is not null or p.whatsapp_opted_in = true)
    limit 1;

    if v_existing_profile_id is not null then
      raise exception 'Ce numéro de téléphone est déjà utilisé par un autre compte.'
        using errcode = 'unique_violation';
    end if;
  end if;

  insert into public.profiles (
    id,
    full_name,
    avatar_url,
    phone_number,
    email,
    timezone,
    locale,
    tz_follow_device
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

  v_referral_code := nullif(trim(coalesce(new.raw_user_meta_data->>'referral_code', '')), '');
  if v_referral_code is not null then
    begin
      perform public.apply_referral_attribution(new.id, v_referral_code);
    exception when others then
      raise warning 'referral attribution failed for user %: %', new.id, sqlerrm;
    end;
  end if;

  -- KEEL W6.5 — coach invitation carried through signup metadata. Same shape,
  -- same guarantee as the referral block above: best-effort, never fatal.
  v_coach_invite_token := nullif(trim(coalesce(new.raw_user_meta_data->>'coach_invite_token', '')), '');
  if v_coach_invite_token is not null then
    begin
      perform public.accept_coach_invitation_for_user(new.id, v_coach_invite_token);
    exception when others then
      raise warning 'coach invitation acceptance failed for user %: %', new.id, sqlerrm;
    end;
  end if;

  return new;
end;
$$;


-- ============================================================================
-- 5. log_coach_student_access(student, surface) — the audit line
-- ============================================================================

-- Closed token list (R1: ASCII snake_case; R7: an unknown surface RAISES
-- rather than writing an audit line nobody can interpret later).
create or replace function public.log_coach_student_access(
  p_student_user_id uuid,
  p_surface text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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

revoke all on function public.log_coach_student_access(uuid, text) from public, anon;
grant execute on function public.log_coach_student_access(uuid, text) to authenticated, service_role;


-- ============================================================================
-- 6. INDEX — the invitation lookup is by hash, always
-- ============================================================================

-- Every read above starts from invite_token_hash. Without this index the
-- public preview endpoint is a sequential scan an anonymous caller can trigger
-- at will. Unique, because two invitations sharing a hash would mean a token
-- collision — an event that must fail at the WRITE (R7), not resolve to an
-- arbitrary row at read time.
create unique index if not exists coach_invitations_token_hash_idx
  on public.coach_invitations (invite_token_hash);
