-- ===========================================================================
-- FF-063 LOT 5 — UN LECTEUR DE FAITS POUR LES E-MAILS DE CYCLE DE VIE.
--
-- Amont: 20260910120000 (l'interrupteur) · 20260910130000 (le cron).
--
-- ── POURQUOI UNE FONCTION, ET PAS CINQ REQUÊTES DANS LE JOB ──────────────
-- Deux raisons, et la première seule suffirait.
--
-- 1. `profiles` N'A PAS DE `created_at`. Vérifié le 2026-09-09: la colonne
--    n'existe pas. L'instant d'inscription vit dans `auth.users`
--    (`created_at`, `email_confirmed_at`), et PostgREST n'expose pas le schéma
--    `auth`. Sans ce passe-plat, « inscrit il y a 24 h » n'est pas lisible
--    depuis une fonction edge — quelle que soit la clé qu'elle porte.
--
-- 2. Le job appelle ceci UNE fois par personne examinée, contre cinq
--    requêtes. Le balayage est horaire sur toute la flotte; la différence
--    n'est pas cosmétique.
--
-- ── CE QUE CETTE FONCTION NE FAIT PAS, ET C'EST LA RÈGLE ────────────────
-- ⛔ ELLE NE DÉCIDE RIEN. Pas de seuil, pas de « est-ce qu'on envoie », pas de
-- nom de segment. Elle rend des FAITS; les segments et la cadence vivent dans
-- `_shared/keel/lifecycle_*.ts`, où ils se testent sans base. Le jour où un
-- `case when ... then 'funnel_unfinished_h24'` apparaît ici, la moitié de la
-- décision cesse d'être joignable par un test et l'autre moitié ment.
--
-- ── LA TRACE D'USAGE, ET POURQUOI CES TROIS TABLES ─────────────────────
-- `has_any_trace` répond à « cette personne a-t-elle fait QUELQUE CHOSE de son
-- plan ». Les trois tables lues sont les seules où un geste humain laisse une
-- ligne après la composition:
--   · `cooking_session_states`  — la case « j'ai cuisiné / pas cuisiné »
--   · `grocery_wave_states`     — la case « courses faites »
--   · `meal_plan_feedback`      — le retour sur le plan
-- ⚠️ LIRE SON PLAN N'EN FAIT PARTIE D'AUCUNE, et c'est le fait central de tout
-- ce chantier: le geste le plus fréquent du produit ne laisse AUCUNE trace.
-- `has_any_trace = false` veut donc dire « aucune écriture », jamais « n'est
-- pas venu ». Un e-mail qui affirmerait le second serait faux.
-- ===========================================================================

create or replace function public.keel_lifecycle_facts(
  p_user uuid,
  p_today date
)
returns table (
  confirmed_at timestamptz,
  has_goals boolean,
  live_plan_count integer,
  last_covered_day date,
  has_future_plan boolean,
  has_any_trace boolean
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
    );
$function$;

comment on function public.keel_lifecycle_facts(uuid, date) is
  'FF-063 — les faits que lisent les e-mails de cycle de vie, en UN aller-retour. '
  'Passe-plat obligatoire pour `auth.users.email_confirmed_at`: profiles n''a pas '
  'de created_at et PostgREST n''expose pas le schéma auth. NE DÉCIDE RIEN — les '
  'seuils et les segments vivent dans _shared/keel/lifecycle_*.ts, où ils se '
  'testent sans base. `has_any_trace` compte les ÉCRITURES (cuisson, courses, '
  'retour); lire son plan n''en laisse aucune, donc false ne veut PAS dire '
  '« n''est pas venu ».';

-- Les privilèges par défaut de ce projet accordent `execute` à `anon`,
-- `authenticated` et `service_role` DIRECTEMENT: `revoke ... from public` seul
-- ne retirerait rien. On nomme les rôles.
--
-- Seul `service_role` exécute: la fonction traverse RLS (elle est SECURITY
-- DEFINER et lit `auth.users`), donc un appelant authentifié pourrait lire la
-- date de confirmation de n'importe qui.
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
    raise exception 'ff063 lot5: service_role ne peut pas exécuter keel_lifecycle_facts';
  end if;

  -- ⚠️ LES DEUX RÔLES CLIENTS DOIVENT ÊTRE DEHORS. La fonction lit
  -- `auth.users` en SECURITY DEFINER: laissée ouverte, elle rendrait la date
  -- de confirmation de n'importe quel compte à n'importe qui.
  if has_function_privilege(
    'authenticated', 'public.keel_lifecycle_facts(uuid,date)', 'execute'
  ) then
    raise exception 'ff063 lot5: authenticated peut exécuter keel_lifecycle_facts';
  end if;
  if has_function_privilege(
    'anon', 'public.keel_lifecycle_facts(uuid,date)', 'execute'
  ) then
    raise exception 'ff063 lot5: anon peut exécuter keel_lifecycle_facts';
  end if;

  -- Un compte INEXISTANT rend une ligne de « rien », jamais zéro ligne: le job
  -- lit `.maybeSingle()`, et une absence de ligne y deviendrait un `null` qu'il
  -- faudrait distinguer d'une panne.
  select * into r from public.keel_lifecycle_facts(probe, current_date);
  if r is null then
    raise exception 'ff063 lot5: la fonction ne rend aucune ligne pour un compte inconnu';
  end if;
  if r.confirmed_at is not null or r.has_goals or r.live_plan_count <> 0
     or r.last_covered_day is not null or r.has_future_plan or r.has_any_trace then
    raise exception 'ff063 lot5: un compte inconnu rend autre chose que du vide (%)', r;
  end if;

  raise notice 'ff063 lot5: keel_lifecycle_facts en place, service_role seul';
end $$;
