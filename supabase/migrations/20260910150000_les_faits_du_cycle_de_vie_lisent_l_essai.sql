-- ===========================================================================
-- FF-063 LOT 8 — LE LECTEUR DE FAITS APPREND À LIRE L'ESSAI.
--
-- Amont: 20260910140000 (`keel_lifecycle_facts`, quatre faits).
--
-- ── POURQUOI QUATRE COLONNES ET PAS UNE DATE ────────────────────────────
-- « L'essai de cette personne se termine le X » n'a pas UNE source dans ce
-- dépôt, il en a DEUX, et elles ne disent pas la même chose:
--
--   · un membre de foyer est couvert par `households.free_until` (SEPT jours
--     depuis le 2026-09-01, TRENTE pour les foyers nés avant — aucun backfill);
--   · un compte sans foyer, et le MAÎTRE d'un foyer, tombent sur
--     `profiles.trial_end` (sept jours depuis 20260910120000, quatorze avant).
--
-- ⚠️ ET `free_until IS NULL` VEUT DIRE COUVERT, PAS EXPIRÉ. Les foyers créés
-- avant le 2026-08-11 — avant que le défaut existe — sont gratuits sans limite,
-- en attente d'un backfill humain qui n'a jamais eu lieu. Une lecture naïve qui
-- prendrait `null` pour « fini » leur enverrait « ton essai se termine demain »
-- à tous, le même jour.
--
-- D'où quatre faits BRUTS plutôt qu'une date calculée: `in_household` sépare
-- « pas de foyer » de « foyer sans date », et c'est exactement la distinction
-- qu'une seule colonne perdrait. La décision — laquelle des deux horloges lire,
-- et quand se taire — vit dans `_shared/keel/lifecycle_trial.ts`, où elle se
-- teste sans base.
--
-- ── `has_paid_subscription` ─────────────────────────────────────────────
-- Relu à CHAQUE candidat, jamais mis en cache: c'est le patron de
-- `trigger-retention-emails:105-114`, et son motif est qu'un e-mail de fin
-- d'essai envoyé à quelqu'un qui vient de payer est le pire de la séquence.
--
-- ── CE QUE CETTE FONCTION NE FAIT TOUJOURS PAS ──────────────────────────
-- ⛔ Elle ne décide rien. Pas de seuil, pas de nom de segment, pas de « est-ce
-- qu'on envoie ». Le jour où un `case when` de segment apparaît ici, la moitié
-- de la décision cesse d'être joignable par un test.
--
-- `drop` puis `create` et non `create or replace`: le TYPE DE RETOUR change, et
-- PostgreSQL refuse un remplacement qui change la forme d'un `returns table`.
-- ===========================================================================

drop function if exists public.keel_lifecycle_facts(uuid, date);

create function public.keel_lifecycle_facts(
  p_user uuid,
  p_today date
)
returns table (
  confirmed_at timestamptz,
  has_goals boolean,
  live_plan_count integer,
  last_covered_day date,
  has_future_plan boolean,
  has_any_trace boolean,
  in_household boolean,
  household_free_until date,
  profile_trial_end timestamptz,
  has_paid_subscription boolean
)
language sql
stable
security definer
set search_path = public
as $function$
  select
    (select u.email_confirmed_at from auth.users u where u.id = p_user),
    exists (select 1 from public.student_goals g where g.user_id = p_user),
    (select count(*)::integer from public.student_generated_meals m
      where m.user_id = p_user and m.retired_at is null),
    (select max(m.ends_on) from public.student_generated_meals m
      where m.user_id = p_user and m.retired_at is null),
    exists (
      select 1 from public.student_generated_meals m
      where m.user_id = p_user and m.retired_at is null
        and m.starts_on > p_today
    ),
    (
      exists (select 1 from public.cooking_session_states c where c.user_id = p_user)
      or exists (select 1 from public.grocery_wave_states w where w.user_id = p_user)
      or exists (select 1 from public.meal_plan_feedback f where f.user_id = p_user)
    ),
    -- `keel_household_of` est LA fonction canonique du dépôt pour « quel foyer,
    -- s'il y en a un ». La remplacer par un `exists` sur `household_members`
    -- créerait une seconde définition de l'appartenance.
    (public.keel_household_of(p_user) is not null),
    (select h.free_until from public.households h
      where h.id = public.keel_household_of(p_user)),
    (select p.trial_end from public.profiles p where p.id = p_user),
    exists (
      select 1 from public.subscriptions s
      where s.user_id = p_user
        and lower(coalesce(s.status, '')) in ('active', 'trialing')
        and (s.current_period_end is null or now() < s.current_period_end)
    );
$function$;

comment on function public.keel_lifecycle_facts(uuid, date) is
  'FF-063 — les faits que lisent les e-mails de cycle de vie, en UN aller-retour. '
  'Passe-plat obligatoire pour `auth.users.email_confirmed_at` (profiles n''a pas '
  'de created_at, PostgREST n''expose pas le schéma auth). NE DÉCIDE RIEN. '
  'L''essai est rendu en QUATRE faits bruts parce qu''il a deux sources qui '
  'divergent: `in_household` sépare « pas de foyer » de « foyer sans date », et '
  '`household_free_until IS NULL` veut dire COUVERT, jamais expiré. '
  '`has_any_trace` compte les ÉCRITURES; lire son plan n''en laisse aucune.';

revoke all on function public.keel_lifecycle_facts(uuid, date)
  from public, anon, authenticated;
grant execute on function public.keel_lifecycle_facts(uuid, date) to service_role;

-- ---------------------------------------------------------------------------
-- LA PREUVE — fail loud (R7)
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  probe uuid := '00000000-0000-4000-8000-0000ff063fac';
begin
  if not has_function_privilege(
    'service_role', 'public.keel_lifecycle_facts(uuid,date)', 'execute'
  ) then
    raise exception 'ff063 lot8: service_role ne peut pas exécuter keel_lifecycle_facts';
  end if;
  if has_function_privilege(
    'authenticated', 'public.keel_lifecycle_facts(uuid,date)', 'execute'
  ) or has_function_privilege(
    'anon', 'public.keel_lifecycle_facts(uuid,date)', 'execute'
  ) then
    raise exception 'ff063 lot8: un rôle client peut exécuter keel_lifecycle_facts';
  end if;

  -- Les quatre colonnes neuves existent ET un compte inconnu rend du vide.
  select * into r from public.keel_lifecycle_facts(probe, current_date);
  if r is null then
    raise exception 'ff063 lot8: aucune ligne pour un compte inconnu';
  end if;
  if r.in_household or r.household_free_until is not null
     or r.profile_trial_end is not null or r.has_paid_subscription then
    raise exception 'ff063 lot8: un compte inconnu rend autre chose que du vide (%)', r;
  end if;

  raise notice 'ff063 lot8: keel_lifecycle_facts lit l''essai (4 faits bruts, 0 décision)';
end $$;
