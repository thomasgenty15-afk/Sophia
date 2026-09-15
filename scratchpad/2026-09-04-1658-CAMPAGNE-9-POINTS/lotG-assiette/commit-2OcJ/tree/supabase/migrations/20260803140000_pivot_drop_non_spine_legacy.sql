-- PIVOT NUTRITION — suppression des groupes legacy SANS FK vers la colonne
-- vertébrale B2C.
--
-- Autorité: PLAN-NUIT §6.3 — « Les groupes SANS FK spine
-- (modules/architect/referral/core_identity) sont supprimables immédiatement
-- — ⚠️ sauf referral : réécrire `handle_new_user()` d'abord. »
--
-- ── CE QUI N'EST PAS ICI, ET POURQUOI ────────────────────────────────────
-- Les 14 tables de la COLONNE VERTÉBRALE (`user_cycles`,
-- `user_transformations`, `user_plans_v2`, `user_plan_items`…) ne sont PAS
-- droppées. Le plan est explicite: « Elle se fait APRÈS validation réelle du
-- produit — pas cette nuit », et `docs/keel/BUILD_PLAN.md` arbitrage n°1 dit
-- que les tables legacy restent « vivantes pour la branche FR ». Les dropper
-- serait décider que la branche FR n'a plus d'utilisateurs — un arbitrage
-- produit, pas un nettoyage.
--
-- ── L'ORDRE, ET IL EST OBLIGATOIRE ───────────────────────────────────────
-- 1. `handle_new_user()` réécrite AVANT tout DROP. Elle appelle
--    `apply_referral_attribution()`; dropper la fonction ou ses tables sans
--    la réécrire ferait lever un warning à CHAQUE inscription — invisible, et
--    pour toujours. C'est l'avertissement nommé du plan.
-- 2. Triggers, puis fonctions, puis tables. Une fonction droppée alors qu'un
--    trigger la référence encore fait échouer le DROP.
--
-- ── VÉRIFICATIONS FAITES AVANT D'ÉCRIRE CE FICHIER ───────────────────────
-- (doctrine `verify-before-delete`: vérification indépendante avant toute
-- suppression legacy)
--   * FK entrantes depuis une table GARDÉE vers ces 13 tables : **aucune**.
--   * Consommateurs applicatifs : les 5 trouvés ont été retirés dans le même
--     commit (`architect_memory.ts` + `identity-manager.ts` supprimés — paire
--     morte, 0 importeur ; surface `quotes` de `context/loader.ts` neutralisée ;
--     `getCoreIdentity()` de `state-manager.ts` rend "" sans I/O ;
--     `referral-reward.ts` supprimée et ses 2 blocs retirés de `stripe-webhook`).
--   * Les lectures restantes dégradaient déjà proprement (`if (error) return`),
--     donc aucune de ces suppressions ne peut faire tomber un tour.

-- ===========================================================================
-- 1. `handle_new_user()` SANS parrainage — AVANT tout DROP
-- ===========================================================================
-- Repart de la version `20260727200000` (la 3e réécriture, celle qui porte
-- l'acceptation d'invitation coach), moins le bloc referral. Rien d'autre ne
-- change: garde d'unicité du téléphone, upsert du profil, invitation coach.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_phone text;
  v_existing_profile_id uuid;
  v_timezone text;
  v_locale text;
  v_tz_follow_device boolean;
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

  -- PIVOT: le bloc `referral_code` -> `apply_referral_attribution()` est
  -- supprimé ici. Un `referral_code` encore présent dans les metadata d'un
  -- signup est désormais ignoré en silence, ce qui est le comportement voulu:
  -- le programme n'existe plus, et lever un warning à chaque inscription pour
  -- une fonctionnalité retirée est du bruit permanent.

  -- KEEL W6.5 — coach invitation carried through signup metadata. Best-effort,
  -- never fatal: a broken invitation must never break a signup.
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
$function$;

-- ===========================================================================
-- 2. Triggers portés par les tables à dropper
-- ===========================================================================
-- Ils partiraient avec les tables (DROP TABLE emporte ses triggers), mais on
-- les nomme pour que la migration soit lisible comme un inventaire.

drop trigger if exists normalize_user_architect_quotes on public.user_architect_quotes;
drop trigger if exists normalize_user_architect_reflections on public.user_architect_reflections;
drop trigger if exists normalize_user_architect_stories on public.user_architect_stories;
drop trigger if exists update_user_architect_quotes_modtime on public.user_architect_quotes;
drop trigger if exists update_user_architect_reflections_modtime on public.user_architect_reflections;
drop trigger if exists update_user_architect_stories_modtime on public.user_architect_stories;

-- ===========================================================================
-- 3. Fonctions orphelines
-- ===========================================================================
-- Vérifiées comme ne référençant QUE des tables de ce lot
-- (`select proname from pg_proc where prosrc ~ '<tables>'`).

drop function if exists public.apply_referral_attribution(uuid, text);
drop function if exists public.claim_referral_reward(uuid, text);
drop function if exists public.get_or_create_referral_code(uuid);
drop function if exists public.initialize_user_modules() cascade;
drop function if exists public.handle_module_activity_unlock() cascade;
drop function if exists public.handle_module_entry_archive() cascade;
drop function if exists public.handle_week12_manual_unlock() cascade;
drop function if exists public.handle_forge_level_progression() cascade;
-- `match_core_identity_by_embedding` n'a plus d'appelant: `getCoreIdentity()`
-- rend "" sans I/O depuis ce commit.
drop function if exists public.match_core_identity_by_embedding(uuid, vector, double precision, integer);

-- Normalisation/validation de l'Architecte (8 fonctions, plan §B.6).
drop function if exists public.handle_user_architect_quotes() cascade;
drop function if exists public.handle_user_architect_reflections() cascade;
drop function if exists public.handle_user_architect_stories() cascade;
drop function if exists public.normalize_architect_quotes() cascade;
drop function if exists public.normalize_architect_reflections() cascade;
drop function if exists public.normalize_architect_stories() cascade;
drop function if exists public.normalize_architect_wishes() cascade;

-- ===========================================================================
-- 4. Les tables — 13, aucune FK entrante depuis une table gardée
-- ===========================================================================

-- Architecte (4)
drop table if exists public.user_architect_quotes cascade;
drop table if exists public.user_architect_reflections cascade;
drop table if exists public.user_architect_stories cascade;
drop table if exists public.user_architect_wishes cascade;

-- Modules / semaines identitaires (3) — leurs triggers étaient déjà droppés
-- par `20260727150000`, ce qui les avait rendues inertes.
drop table if exists public.user_module_archives cascade;
drop table if exists public.user_module_state_entries cascade;
drop table if exists public.user_week_states cascade;

-- Identité profonde (2)
drop table if exists public.user_core_identity_archive cascade;
drop table if exists public.user_core_identity cascade;

-- Bilan hebdo B2C (1)
drop table if exists public.weekly_bilan_suggestion_events cascade;

-- Parrainage (3) — après la réécriture de `handle_new_user()` en §1.
drop table if exists public.referral_rewards cascade;
drop table if exists public.referrals cascade;
drop table if exists public.referral_codes cascade;

-- ===========================================================================
-- 5. Fail loud (R7)
-- ===========================================================================
-- « Ça s'est bien passé » n'est pas une vérification. On assert que les 13
-- tables sont parties ET que la colonne vertébrale est INTACTE — une migration
-- de suppression qui emporterait plus que prévu doit échouer ici, pas être
-- découverte en production.

do $$
declare
  remaining int;
  spine int;
begin
  select count(*) into remaining
  from information_schema.tables
  where table_schema = 'public'
    and table_name in (
      'user_architect_quotes','user_architect_reflections','user_architect_stories',
      'user_architect_wishes','user_module_archives','user_module_state_entries',
      'user_week_states','user_core_identity','user_core_identity_archive',
      'weekly_bilan_suggestion_events','referral_rewards','referrals','referral_codes'
    );
  if remaining <> 0 then
    raise exception 'pivot: % table(s) legacy non supprimée(s)', remaining;
  end if;

  select count(*) into spine
  from information_schema.tables
  where table_schema = 'public'
    and table_name in (
      'user_cycles','user_transformations','user_plans_v2','user_plan_items',
      'user_plan_item_entries','user_metrics','user_victory_ledger'
    );
  if spine <> 7 then
    raise exception 'pivot: la colonne vertébrale a été touchée (% / 7 restantes)', spine;
  end if;

  raise notice 'pivot: 13 tables legacy droppées, colonne vertébrale intacte (7/7)';
end $$;
