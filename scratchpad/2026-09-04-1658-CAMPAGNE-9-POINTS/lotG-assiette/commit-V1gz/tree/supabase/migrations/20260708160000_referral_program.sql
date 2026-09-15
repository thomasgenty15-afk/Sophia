-- Referral program (parrainage).
--
-- Reward structure (product decision, non-negotiable):
--   * Referred user (filleul): trial extended to 30 days (instead of the
--     14-day column default) when they sign up with a referral code.
--   * Referrer (parrain): 1 free month, credited ONLY on the referred user's
--     first PAID invoice (amount_paid > 0) — never at signup, never on a 0€
--     invoice. Applied as a Stripe customer balance credit; if the referrer is
--     not a paying customer yet, the reward is banked in the ledger and applied
--     when they subscribe.
--   * Fuse cap: 12 months earned per rolling 12-month window per referrer.
--     Beyond that, conversions are still tracked but no longer credit.
--
-- Idempotency mirrors 20260707120000_subscription_notifications_idempotency:
-- the reward ledger has a UNIQUE key (referred_id) claimed atomically with
-- ON CONFLICT DO NOTHING, so Stripe webhook replays are no-ops.

-- ---------------------------------------------------------------------------
-- 1. referral_codes: one shareable code per user, generated lazily.
-- ---------------------------------------------------------------------------

create table if not exists public.referral_codes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  -- Short, dictation-friendly code: no 0/O, no 1/I/L.
  code text not null unique
    check (code ~ '^SOPHIA-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$'),
  created_at timestamptz not null default now()
);

alter table public.referral_codes owner to postgres;
alter table public.referral_codes enable row level security;

create policy referral_codes_select_own on public.referral_codes
  for select to authenticated
  using (auth.uid() = user_id);

-- Reads for the owner only; all writes go through get_or_create_referral_code()
-- (SECURITY DEFINER) or the service role.
revoke all on table public.referral_codes from public, anon, authenticated;
grant select on table public.referral_codes to authenticated;
grant all on table public.referral_codes to service_role;

-- ---------------------------------------------------------------------------
-- 2. referrals: one row per referred account.
--    status: pending -> trial_started -> converted -> rewarded
--    ("converted" is terminal when the cap swallowed the reward).
-- ---------------------------------------------------------------------------

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  -- UNIQUE: a referred account can only ever be attributed once.
  referred_id uuid not null unique references public.profiles(id) on delete cascade,
  code text not null,
  status text not null default 'pending'
    check (status in ('pending', 'trial_started', 'converted', 'rewarded')),
  created_at timestamptz not null default now(),
  trial_started_at timestamptz,
  converted_at timestamptz,
  rewarded_at timestamptz,
  constraint referrals_no_self_referral check (referrer_id <> referred_id)
);

alter table public.referrals owner to postgres;

create index if not exists referrals_referrer_id_idx
  on public.referrals using btree (referrer_id);

alter table public.referrals enable row level security;

create policy referrals_select_as_referrer on public.referrals
  for select to authenticated
  using (auth.uid() = referrer_id);

-- Column-level grant: the referrer sees statuses/dates for their stats but not
-- the referred user's id (clients must select explicit columns, not "*").
revoke all on table public.referrals from public, anon, authenticated;
grant select (id, referrer_id, code, status, created_at, trial_started_at, converted_at, rewarded_at)
  on public.referrals to authenticated;
grant all on table public.referrals to service_role;

-- ---------------------------------------------------------------------------
-- 3. referral_rewards: the reward ledger.
--    UNIQUE (referred_id) makes the webhook credit idempotent: one reward
--    decision per referred user, ever. No FK on referred_id on purpose: the
--    row must survive the referred account's deletion (cap accounting +
--    replayed-webhook idempotency).
--    status: banked   -> earned, waiting to be applied as a Stripe credit
--            credited -> applied to the referrer's Stripe customer balance
--            capped   -> conversion tracked, no credit (12-month fuse blown)
-- ---------------------------------------------------------------------------

create table if not exists public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referred_id uuid not null unique,
  referral_id uuid references public.referrals(id) on delete set null,
  stripe_invoice_id text,
  months integer not null default 1 check (months >= 0),
  status text not null default 'banked'
    check (status in ('banked', 'credited', 'capped')),
  amount_cents integer,
  currency text,
  stripe_balance_transaction_id text,
  created_at timestamptz not null default now(),
  credited_at timestamptz
);

alter table public.referral_rewards owner to postgres;

create index if not exists referral_rewards_referrer_created_idx
  on public.referral_rewards using btree (referrer_id, created_at);

alter table public.referral_rewards enable row level security;

create policy referral_rewards_select_own on public.referral_rewards
  for select to authenticated
  using (auth.uid() = referrer_id);

-- The referrer sees their earned/banked months; Stripe internals stay hidden.
revoke all on table public.referral_rewards from public, anon, authenticated;
grant select (id, referrer_id, months, status, created_at, credited_at)
  on public.referral_rewards to authenticated;
grant all on table public.referral_rewards to service_role;

-- ---------------------------------------------------------------------------
-- 4. get_or_create_referral_code(): lazy per-user code generation.
-- ---------------------------------------------------------------------------

create or replace function public.get_or_create_referral_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
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

alter function public.get_or_create_referral_code() owner to postgres;
revoke all on function public.get_or_create_referral_code() from public, anon;
grant execute on function public.get_or_create_referral_code() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. apply_referral_attribution(): attach a referral code to a NEW account
--    and extend its trial to 30 days. Called from handle_new_user() at signup
--    (SECURITY DEFINER as postgres, so the profiles billing-column guard and
--    the trial_end recompute trigger behave as for any server-side write).
-- ---------------------------------------------------------------------------

create or replace function public.apply_referral_attribution(
  p_referred_id uuid,
  p_raw_code text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_referrer_id uuid;
  v_referred_phone text;
  v_referrer_phone text;
  v_user_created timestamptz;
  v_referral_id uuid;
begin
  -- Normalize: trim, uppercase, tolerate a missing "SOPHIA-" prefix (the code
  -- is meant to be dictated out loud).
  v_code := upper(regexp_replace(coalesce(p_raw_code, ''), '\s', '', 'g'));
  if v_code ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$' then
    v_code := 'SOPHIA-' || v_code;
  end if;
  if v_code !~ '^SOPHIA-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$' then
    return jsonb_build_object('applied', false, 'reason', 'invalid_code_format');
  end if;

  select rc.user_id into v_referrer_id
  from public.referral_codes rc
  where rc.code = v_code;
  if v_referrer_id is null then
    return jsonb_build_object('applied', false, 'reason', 'unknown_code');
  end if;

  -- Anti-abuse: no self-referral (same account).
  if v_referrer_id = p_referred_id then
    return jsonb_build_object('applied', false, 'reason', 'self_referral');
  end if;

  -- Anti-abuse: no self-referral through a second account on the same phone.
  select p.phone_number into v_referred_phone
  from public.profiles p where p.id = p_referred_id;
  select p.phone_number into v_referrer_phone
  from public.profiles p where p.id = v_referrer_id;
  if v_referred_phone is not null and v_referred_phone = v_referrer_phone then
    return jsonb_build_object('applied', false, 'reason', 'same_phone');
  end if;

  -- Anti-abuse: the referred account must be genuinely new. Attribution only
  -- ever happens at signup; a stale account cannot pick up a code later.
  -- (Reusing an already-verified phone is blocked upstream by handle_new_user.)
  select u.created_at into v_user_created from auth.users u where u.id = p_referred_id;
  if v_user_created is null or v_user_created < now() - interval '48 hours' then
    return jsonb_build_object('applied', false, 'reason', 'not_a_new_account');
  end if;

  insert into public.referrals (referrer_id, referred_id, code, status)
  values (v_referrer_id, p_referred_id, v_code, 'pending')
  on conflict (referred_id) do nothing
  returning id into v_referral_id;
  if v_referral_id is null then
    return jsonb_build_object('applied', false, 'reason', 'already_attributed');
  end if;

  -- Referred reward: 30-day trial instead of the 14-day default. GREATEST so a
  -- replay or a manually granted longer trial is never shortened. The
  -- on_profiles_trial_change_recompute_access trigger keeps access_tier in sync.
  update public.profiles
  set trial_end = greatest(
        coalesce(trial_end, now()),
        coalesce(trial_start, now()) + interval '30 days'
      )
  where id = p_referred_id;

  update public.referrals
  set status = 'trial_started', trial_started_at = now()
  where id = v_referral_id;

  return jsonb_build_object(
    'applied', true,
    'referral_id', v_referral_id,
    'referrer_id', v_referrer_id
  );
end;
$$;

alter function public.apply_referral_attribution(uuid, text) owner to postgres;
revoke all on function public.apply_referral_attribution(uuid, text) from public, anon, authenticated;
grant execute on function public.apply_referral_attribution(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 6. claim_referral_reward(): atomic, idempotent reward claim on the referred
--    user's first PAID invoice. Called by the Stripe webhook (service role).
--    The advisory lock serializes claims per referrer so the rolling 12-month
--    cap cannot be raced past by concurrent invoices.
-- ---------------------------------------------------------------------------

create or replace function public.claim_referral_reward(
  p_referred_id uuid,
  p_stripe_invoice_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referral_id uuid;
  v_referrer_id uuid;
  v_reward_id uuid;
  v_months_last_12m integer;
  v_capped boolean;
begin
  select r.id, r.referrer_id into v_referral_id, v_referrer_id
  from public.referrals r
  where r.referred_id = p_referred_id;
  if v_referral_id is null then
    return jsonb_build_object('claimed', false, 'reason', 'no_referral');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('referral_reward:' || v_referrer_id::text, 0)
  );

  -- Atomic idempotency claim: only the first paid invoice ever inserts here;
  -- Stripe replays and later invoices are no-ops.
  insert into public.referral_rewards
    (referrer_id, referred_id, referral_id, stripe_invoice_id, months, status)
  values
    (v_referrer_id, p_referred_id, v_referral_id, p_stripe_invoice_id, 1, 'banked')
  on conflict (referred_id) do nothing
  returning id into v_reward_id;
  if v_reward_id is null then
    return jsonb_build_object('claimed', false, 'reason', 'already_claimed');
  end if;

  -- Fuse cap: months earned over the rolling 12-month window (this claim excluded).
  select coalesce(sum(rr.months), 0)::int into v_months_last_12m
  from public.referral_rewards rr
  where rr.referrer_id = v_referrer_id
    and rr.id <> v_reward_id
    and rr.status in ('banked', 'credited')
    and rr.created_at >= now() - interval '12 months';

  v_capped := v_months_last_12m >= 12;

  if v_capped then
    update public.referral_rewards
    set status = 'capped', months = 0
    where id = v_reward_id;

    update public.referrals
    set status = 'converted', converted_at = coalesce(converted_at, now())
    where id = v_referral_id;
  else
    update public.referrals
    set status = 'rewarded',
        converted_at = coalesce(converted_at, now()),
        rewarded_at = now()
    where id = v_referral_id;
  end if;

  return jsonb_build_object(
    'claimed', true,
    'capped', v_capped,
    'reward_id', v_reward_id,
    'referrer_id', v_referrer_id,
    'months_last_12m', v_months_last_12m
  );
end;
$$;

alter function public.claim_referral_reward(uuid, text) owner to postgres;
revoke all on function public.claim_referral_reward(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_referral_reward(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 7. handle_new_user(): unchanged signup logic + referral attribution from
--    raw_user_meta_data->>'referral_code' (best-effort: a referral bug must
--    never break signup).
-- ---------------------------------------------------------------------------

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

  return new;
end;
$$;
