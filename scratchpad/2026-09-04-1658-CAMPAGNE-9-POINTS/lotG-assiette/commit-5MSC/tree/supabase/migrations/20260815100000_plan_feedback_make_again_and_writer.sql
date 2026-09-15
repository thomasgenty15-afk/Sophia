-- LOT D — L'ÉCRAN DE FIN DE PLAN: L'INVERSE DU REFUS, ET L'ÉCRIVAIN.
--
-- ── CE QUE CETTE MIGRATION AJOUTE, ET CE QU'ELLE N'AJOUTE PAS ─────────────
-- `meal_plan_feedback` existe depuis le 2026-08-11 avec ses colonnes et ses
-- lecteurs nommés. Elle n'a JAMAIS eu d'écrivain: `revoke all … from
-- authenticated` est juste (TRUNCATE échappe à RLS), et aucun chemin
-- `service_role` ne posait de ligne. Le questionnaire était donc un module
-- complet sans surface et sans porte d'écriture.
--
-- Deux choses ici, et rien d'autre:
--
--   1. `make_again` — L'INVERSE DE `never_again`, demandé explicitement. Un
--      questionnaire qui ne demande QUE ce qui a raté apprend au produit à
--      ÉVITER, jamais à VISER: une génération qui n'a que des bornes compose au
--      hasard à l'intérieur. C'est le signal qui réoriente la suivante.
--   2. `keel_plan_feedback_submit` / `keel_plan_feedback_dismiss` — la porte
--      d'écriture, `security definer`, qui VÉRIFIE la propriété du plan.
--
-- ⛔ AUCUNE COLONNE D'ENVIE ICI, ET C'EST UNE DÉCISION. « Les envies apparues
-- en cours de plan » ont déjà leur maison — `household_envy_submissions`,
-- écrite par `keel_household_submit_envy`, lue par `buildEnvyBlock` et servie
-- au modèle à chaque composition. Une colonne `new_envy` aurait été un SECOND
-- canal pour la même intention: deux écrivains dont un seul reçoit la
-- modification, et c'est celui qu'on regarde le moins qui décide. La question
-- écrit donc dans le canal existant, et elle n'est posée qu'au compte qui peut
-- l'y écrire — le maître d'un foyer. Une question sans lecteur ne se pose pas.
--
-- ── ON ÉVALUE LE PLAN, JAMAIS LA PERSONNE ────────────────────────────────
-- `make_again` porte des TITRES DE PLATS, comme sa jumelle. Aucune colonne de
-- cette table ne porte ce qui a été mangé, ni un score, ni une adhérence.
--
-- ── RÉ-APPLICABLE ────────────────────────────────────────────────────────
-- `db reset` est interdit sur ce dépôt: tout ici doit repasser sur une base qui
-- a déjà vécu. D'où `add column if not exists` et `create or replace`.

begin;

alter table public.meal_plan_feedback
  add column if not exists make_again jsonb not null default '[]'::jsonb;

comment on column public.meal_plan_feedback.make_again is
  'LECTEUR: practical_constraints.food_preferences — LE MÊME canal que '
  'never_again, polarité inverse. C''est le bloc que le prompt sert à chaque '
  'composition (foodPreferencesForPrompt), donc il réoriente la génération '
  'suivante sans qu''aucun lecteur neuf n''ait à exister. Tableau de titres de '
  'plats. Le jeton « none » n''y entre JAMAIS: il créerait un aliment VOULU '
  'fantôme que le générateur chercherait à vie — le symétrique exact du refus '
  'fantôme que never_again empêche.';

-- ===========================================================================
-- L'ÉCRIVAIN — et il vérifie la propriété du plan
-- ===========================================================================
--
-- ⚠️ `security definer` PARCE QUE LA TABLE EST RÉVOQUÉE À `authenticated`, et
-- elle doit le rester: les défauts Supabase donnent TOUT sur une table neuve,
-- TRUNCATE compris, et TRUNCATE n'est pas soumis à RLS.
--
-- ⚠️ ET LA PROPRIÉTÉ EST VÉRIFIÉE ICI, PAS DEVINÉE. `p_meal_id` vient du
-- client: sans le `where user_id = auth.uid()` sur `student_generated_meals`,
-- n'importe quel compte connecté poserait un retour sur le plan d'un autre.
-- Ce dépôt a déjà rendu la ligne d'un élève à son coach faute d'un `.eq()`.
--
-- ⚠️ `on conflict (meal_id) do nothing` ET PAS `do update`. La contrainte
-- d'unicité de la table dit « une seule fois par fenêtre », et c'est une règle
-- produit, pas un détail: un second envoi ne doit pas écraser le premier, et un
-- refus (`dismissed_at`) ne doit pas pouvoir être effacé par une réouverture.
-- La RPC rend alors `already_answered`, qui est un fait, pas une panne.

create or replace function public.keel_plan_feedback_submit(
  p_meal_id uuid,
  p_cooked text,
  p_portions text,
  p_never_again jsonb,
  p_make_again jsonb,
  p_axis_question text,
  p_axis_answer text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_locale text;
  v_written int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if p_meal_id is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_meal');
  end if;

  -- LE PLAN EST-IL LE SIEN ? La langue du plan sert aussi de `content_locale`
  -- du retour: le questionnaire a été lu dans la langue du plan, et l'archiver
  -- dans une autre rendrait la relecture fausse.
  select m.content_locale into v_locale
    from public.student_generated_meals m
   where m.id = p_meal_id and m.user_id = v_user;

  if v_locale is null then
    -- « Pas à toi » et « n'existe pas » rendent le MÊME motif, exprès: un motif
    -- distinct dirait à quelqu'un qu'un plan existe et ne lui appartient pas.
    return jsonb_build_object('ok', false, 'reason', 'plan_not_found');
  end if;

  insert into public.meal_plan_feedback
    (user_id, meal_id, cooked, portions, never_again, make_again,
     axis_question, axis_answer, content_locale)
  values
    (v_user, p_meal_id,
     nullif(btrim(coalesce(p_cooked, '')), ''),
     nullif(btrim(coalesce(p_portions, '')), ''),
     coalesce(p_never_again, '[]'::jsonb),
     coalesce(p_make_again, '[]'::jsonb),
     nullif(btrim(coalesce(p_axis_question, '')), ''),
     nullif(btrim(coalesce(p_axis_answer, '')), ''),
     v_locale)
  on conflict (meal_id) do nothing;

  get diagnostics v_written = row_count;
  if v_written = 0 then
    return jsonb_build_object('ok', false, 'reason', 'already_answered');
  end if;
  return jsonb_build_object('ok', true);
end;
$function$;

-- UN REFUS EST UNE RÉPONSE, ET IL SE STOCKE.
-- Sans cette porte, l'élève qui ferme le questionnaire se le voit reproposer à
-- chaque ouverture de l'app: on transformerait un « non merci » en harcèlement.
-- C'est la fonction la moins spectaculaire de cette migration et celle dont
-- l'absence se paierait le plus vite.
create or replace function public.keel_plan_feedback_dismiss(p_meal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_locale text;
  v_written int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select m.content_locale into v_locale
    from public.student_generated_meals m
   where m.id = p_meal_id and m.user_id = v_user;
  if v_locale is null then
    return jsonb_build_object('ok', false, 'reason', 'plan_not_found');
  end if;

  insert into public.meal_plan_feedback
    (user_id, meal_id, dismissed_at, content_locale)
  values (v_user, p_meal_id, now(), v_locale)
  on conflict (meal_id) do nothing;

  get diagnostics v_written = row_count;
  -- Un refus sur un plan DÉJÀ répondu n'est pas une panne: il n'y a rien à
  -- faire, et l'écran doit se fermer dans les deux cas.
  return jsonb_build_object('ok', true, 'stored', v_written > 0);
end;
$function$;

-- ===========================================================================
-- LES DROITS — on révoque d'abord, on accorde ensuite
-- ===========================================================================
-- `revoke from public` ne retire pas `anon`: leçon déjà payée par ce dépôt.

revoke all on function public.keel_plan_feedback_submit(
  uuid, text, text, jsonb, jsonb, text, text) from public, anon;
revoke all on function public.keel_plan_feedback_dismiss(uuid) from public, anon;

grant execute on function public.keel_plan_feedback_submit(
  uuid, text, text, jsonb, jsonb, text, text) to authenticated;
grant execute on function public.keel_plan_feedback_dismiss(uuid) to authenticated;

-- ===========================================================================
-- LA PREUVE
-- ===========================================================================

do $$
declare
  probe uuid := gen_random_uuid();
  other uuid := gen_random_uuid();
  probe_meal uuid;
  row_count_after int;
begin
  insert into auth.users (id, instance_id, aud, role, email)
  values (probe, '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'probe-' || probe::text || '@keel.invalid'),
         (other, '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'probe-' || other::text || '@keel.invalid');

  insert into public.student_generated_meals
    (user_id, scope, mode, servings, dishes, shopping_list, generated_from,
     content_locale, starts_on, duration_days)
  values (probe, 'day', 'to_shop', 1, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb,
          'fr-FR', current_date - 10, 7)
  returning id into probe_meal;

  -- LA COLONNE EXISTE, ET SON DÉFAUT EST UN TABLEAU VIDE — jamais NULL: un
  -- lecteur qui ferait `jsonb_array_elements` sur NULL rendrait zéro ligne en
  -- silence, ce qui est indiscernable de « elle n'a rien voulu revoir ».
  insert into public.meal_plan_feedback
    (user_id, meal_id, cooked, content_locale)
  values (probe, probe_meal, 'yes', 'fr-FR');

  select count(*) into row_count_after
    from public.meal_plan_feedback
   where meal_id = probe_meal and make_again = '[]'::jsonb;
  if row_count_after <> 1 then
    raise exception 'make_again ne vaut pas [] par défaut';
  end if;

  delete from public.meal_plan_feedback where meal_id = probe_meal;

  -- ⛔ LA GARDE QUI COMPTE LE PLUS: `authenticated` n'écrit toujours PAS en
  -- direct. La porte est la RPC, et elle vérifie la propriété.
  if has_table_privilege('authenticated', 'public.meal_plan_feedback', 'INSERT') then
    raise exception 'authenticated peut écrire en direct — le revoke a sauté';
  end if;
  if has_table_privilege('anon', 'public.meal_plan_feedback', 'SELECT') then
    raise exception 'anon peut lire — le revoke a sauté';
  end if;
  -- Et `anon` ne peut pas appeler la porte.
  if has_function_privilege('anon',
       'public.keel_plan_feedback_submit(uuid, text, text, jsonb, jsonb, text, text)',
       'EXECUTE') then
    raise exception 'anon peut poser un retour';
  end if;
  if has_function_privilege('anon',
       'public.keel_plan_feedback_dismiss(uuid)', 'EXECUTE') then
    raise exception 'anon peut refuser un retour';
  end if;

  delete from auth.users where id in (probe, other);
end;
$$;

commit;
