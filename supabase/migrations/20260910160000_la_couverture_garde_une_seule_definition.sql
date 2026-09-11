-- ===========================================================================
-- FF-063 — `free_until` NE SORT PAS DE SQL. UNE SEULE DÉFINITION DE LA
-- COUVERTURE, ET C'EST UN GARDE DU DÉPÔT QUI L'A DIT.
--
-- Amont: 20260910150000 (la version qui rendait `free_until` en brut).
--
-- ── CE QUI S'EST PASSÉ ──────────────────────────────────────────────────
-- La version précédente rendait trois faits bruts — `in_household`,
-- `household_free_until`, `profile_trial_end` — pour que « laquelle des deux
-- horloges lire » se décide en TypeScript, où ça se teste sans base. C'était un
-- bon raisonnement, et il était FAUX ici.
--
-- `_shared/keel/household_freeze_test.ts:334` — « personne ne relit
-- `free_until` hors de la facturation » — a mordu au premier run de la suite.
-- Son motif, écrit dans le test: « ce foyer est-il couvert » a UNE définition,
-- en SQL (`keel_household_is_covered`); la réécrire en TypeScript est
-- exactement le défaut que le chantier du foyer existe pour retirer. Un second
-- lecteur diverge au premier ajustement, et plus personne ne sait lequel ment.
--
-- ── LA LIGNE, ET ELLE EST NETTE ────────────────────────────────────────
--   · « CE FOYER EST-IL COUVERT ? » est une DÉCISION → elle reste en SQL, et
--     on rend son verdict (`household_covered`), jamais sa matière première.
--   · « QUEL JOUR L'ESSAI SE TERMINE-T-IL ? » est un FAIT → on le résout une
--     fois, ici, et on rend une date.
--   · « FAUT-IL ÉCRIRE À J−1, J+1 OU J+4 ? » est un SEUIL → il reste en
--     TypeScript (`_shared/keel/lifecycle_trial.ts`), testable sans base.
--
-- ── POURQUOI `p_timezone` ENTRE DANS LA SIGNATURE ──────────────────────
-- `profiles.trial_end` est un INSTANT, pas un jour. Le ramener au calendrier de
-- la personne est ce qui empêche un essai finissant à 23 h à Paris de se lire
-- comme fini la veille à Los Angeles. Le fuseau est passé par l'appelant parce
-- qu'il l'a déjà lu — et parce qu'un `coalesce(profiles.timezone, 'UTC')` ici
-- serait un troisième endroit qui décide de ce qu'est le fuseau de quelqu'un.
--
-- `drop` puis `create`: le type de retour change.
-- ===========================================================================

drop function if exists public.keel_lifecycle_facts(uuid, date);

create function public.keel_lifecycle_facts(
  p_user uuid,
  p_today date,
  p_timezone text default 'UTC'
)
returns table (
  confirmed_at timestamptz,
  has_goals boolean,
  live_plan_count integer,
  last_covered_day date,
  has_future_plan boolean,
  has_any_trace boolean,
  -- Le VERDICT de couverture, jamais sa matière. `null` = pas de foyer.
  household_covered boolean,
  -- Le dernier jour d'essai, déjà résolu dans le calendrier de la personne.
  -- `null` = rien à annoncer (aucun essai posé, ou foyer couvert sans limite).
  trial_last_day date,
  has_paid_subscription boolean
)
language sql
stable
security definer
set search_path = public
as $function$
  with h as (
    select public.keel_household_of(p_user) as household_id
  )
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
    -- LA définition unique du gel. On rend son verdict; `free_until` ne
    -- traverse jamais la frontière.
    (select case when h.household_id is null then null
                 else public.keel_household_is_covered(h.household_id) end
       from h),
    -- Le jour à annoncer. Pour un foyer c'est `free_until` — DÉJÀ un jour
    -- calendaire, donc aucune conversion de fuseau (le zoner le décalerait).
    -- Pour un compte seul, `trial_end` est un instant: on le ramène au jour de
    -- la personne.
    (select case
      when h.household_id is not null
        then (select hh.free_until from public.households hh where hh.id = h.household_id)
      else (select (p.trial_end at time zone coalesce(nullif(btrim(p_timezone), ''), 'UTC'))::date
              from public.profiles p where p.id = p_user)
    end from h),
    exists (
      select 1 from public.subscriptions s
      where s.user_id = p_user
        and lower(coalesce(s.status, '')) in ('active', 'trialing')
        and (s.current_period_end is null or now() < s.current_period_end)
    );
$function$;

comment on function public.keel_lifecycle_facts(uuid, date, text) is
  'FF-063 — les faits que lisent les e-mails de cycle de vie, en UN aller-retour. '
  'Passe-plat obligatoire pour `auth.users.email_confirmed_at` (profiles n''a pas '
  'de created_at, PostgREST n''expose pas le schéma auth). '
  '⛔ `free_until` NE SORT PAS D''ICI: on rend le VERDICT de '
  'keel_household_is_covered, jamais sa matière — « ce foyer est-il couvert » a '
  'une seule définition, et household_freeze_test.ts:334 la défend. Les SEUILS '
  '(J−1, J+1, J+4) restent en TypeScript. `has_any_trace` compte les ÉCRITURES; '
  'lire son plan n''en laisse aucune, donc false ne veut pas dire « n''est pas venu ».';

revoke all on function public.keel_lifecycle_facts(uuid, date, text)
  from public, anon, authenticated;
grant execute on function public.keel_lifecycle_facts(uuid, date, text) to service_role;

-- ---------------------------------------------------------------------------
-- LA PREUVE — fail loud (R7)
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  probe uuid := '00000000-0000-4000-8000-0000ff063fac';
begin
  if not has_function_privilege(
    'service_role', 'public.keel_lifecycle_facts(uuid,date,text)', 'execute'
  ) then
    raise exception 'ff063: service_role ne peut pas exécuter keel_lifecycle_facts';
  end if;
  if has_function_privilege(
    'authenticated', 'public.keel_lifecycle_facts(uuid,date,text)', 'execute'
  ) or has_function_privilege(
    'anon', 'public.keel_lifecycle_facts(uuid,date,text)', 'execute'
  ) then
    raise exception 'ff063: un rôle client peut exécuter keel_lifecycle_facts';
  end if;

  -- ⚠️ L'ANCIENNE SIGNATURE NE DOIT PLUS EXISTER. Deux surcharges rendraient
  -- l'appel ambigu côté PostgREST, et la version qui gagne serait celle qui
  -- laisse fuir `free_until`.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'keel_lifecycle_facts'
      and pg_get_function_identity_arguments(p.oid) = 'uuid, date'
  ) then
    raise exception 'ff063: l''ancienne signature (uuid, date) survit';
  end if;

  select * into r from public.keel_lifecycle_facts(probe, current_date, 'Europe/Paris');
  if r is null then
    raise exception 'ff063: aucune ligne pour un compte inconnu';
  end if;
  -- Pas de foyer ⇒ `household_covered` est NULL, et pas `false`: « pas de
  -- foyer » et « foyer gelé » ne sont pas la même chose, et les confondre
  -- ferait taire l'un ou parler l'autre.
  if r.household_covered is not null or r.trial_last_day is not null
     or r.has_paid_subscription then
    raise exception 'ff063: un compte inconnu rend autre chose que du vide (%)', r;
  end if;

  raise notice 'ff063: la couverture garde UNE définition, free_until reste en SQL';
end $$;
