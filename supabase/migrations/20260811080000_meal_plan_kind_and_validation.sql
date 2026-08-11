-- ============================================================================
-- LOT 3 — LA NATURE D'UN PLAN, ET SA VALIDATION
-- (docs/keel/CHANTIER-PLANS-INDIVIDUELS-ET-FUSION.md)
--
-- LE BLOCAGE QU'ON LÈVE, ET IL EST STRUCTUREL
--   Le chantier veut que CHAQUE titulaire — maître compris — ait son plan, puis
--   que le maître déclenche une fusion qui produit le plan commun. Or les deux
--   plans du maître tombent sur la même semaine, et `write_student_meal_plan`
--   refuse tout chevauchement `where user_id = p_user_id` sans regarder autre
--   chose: la seconde écriture rendait `plan_overlaps_existing`. La fusion était
--   donc impossible à stocker, avant même d'être écrite.
--
-- POURQUOI PAS SIMPLEMENT SCOPER PAR `household_id`
--   Parce que le plan INDIVIDUEL d'un membre doit lui aussi porter
--   `household_id` — sans quoi la fusion ne le retrouve pas. Les deux plans du
--   maître auraient donc le même `household_id`, et se heurteraient encore.
--   Il faut dire la NATURE, pas la portée.
--
--   personal  : le plan d'une personne, pour elle. Il peut porter un
--               `household_id` (il est candidat à la fusion) sans cesser d'être
--               personnel.
--   household : le plan COMMUN, celui que la personne qui cuisine exécute.
--
--   La fenêtre est désormais unique par (user_id, plan_kind). À l'intérieur
--   d'une nature, la troncature et le refus d'avant sont inchangés.
-- ============================================================================

-- ── 1. LA NATURE ────────────────────────────────────────────────────────────
alter table public.student_generated_meals
  add column if not exists plan_kind text not null default 'personal';

-- Le backfill dit la vérité de l'ancien monde: tout ce qui portait un foyer
-- était le plan commun, le reste était personnel. Il n'y a pas d'autre cas —
-- la nature n'existait pas, donc personne n'a pu en écrire une troisième.
update public.student_generated_meals
   set plan_kind = case when household_id is null then 'personal' else 'household' end
 where plan_kind = 'personal' and household_id is not null;

alter table public.student_generated_meals
  drop constraint if exists student_generated_meals_plan_kind_check;
alter table public.student_generated_meals
  add constraint student_generated_meals_plan_kind_check
  check (plan_kind in ('personal', 'household'));

-- ── 1b. LES DEUX VERROUS PHYSIQUES ──────────────────────────────────────────
-- Scoper la FONCTION ne suffisait pas. « Un seul plan vivant par personne et
-- par fenêtre » était tenu par TROIS couches, pas une:
--   1. la boucle de chevauchement de `write_student_meal_plan` (§3 ci-dessous);
--   2. un index unique sur (user_id, starts_on);
--   3. une contrainte d'EXCLUSION sur (user_id, daterange).
--
-- C'est de la défense en profondeur, et elle est bien vue: les deux couches
-- physiques refusaient la seconde ligne AVANT que la fonction ait son mot à
-- dire, donc l'appelant recevait une violation de contrainte au lieu d'un refus
-- nommé. Les trois doivent bouger ENSEMBLE — n'en oublier une transforme le
-- refus lisible en erreur Postgres.
--
-- Les deux ont été trouvées en exécutant le test, l'une après l'autre. Aucune
-- relecture du code de la fonction ne les aurait montrées.
--
-- Ce qu'elles garantissent est INCHANGÉ à l'intérieur d'une nature.
drop index if exists public.student_generated_meals_one_live_start_idx;
create unique index if not exists student_generated_meals_one_live_start_idx
  on public.student_generated_meals (user_id, plan_kind, starts_on)
  where retired_at is null;

-- `plan_kind` est du texte, et l'égalité gist sur du texte vient de btree_gist,
-- déjà installé (la contrainte d'origine en dépendait déjà pour `user_id`).
alter table public.student_generated_meals
  drop constraint if exists student_generated_meals_live_windows_dont_overlap;
alter table public.student_generated_meals
  add constraint student_generated_meals_live_windows_dont_overlap
  exclude using gist (
    user_id with =,
    plan_kind with =,
    daterange(starts_on, (starts_on + duration_days::integer)) with &&
  ) where (retired_at is null);

-- ── 2. LA VALIDATION ────────────────────────────────────────────────────────
-- D8: la fusion consomme les plans VALIDÉS. « Généré » ne suffit pas — sinon un
-- brouillon qu'on n'a pas relu entrerait dans le dîner de toute la maison.
alter table public.student_generated_meals
  add column if not exists validated_at timestamptz;

comment on column public.student_generated_meals.plan_kind is
  'personal = le plan d''une personne (candidat à la fusion s''il porte un '
  'household_id) · household = le plan COMMUN. La fenêtre est unique par '
  '(user_id, plan_kind): sans ça le maître ne peut pas tenir les deux.';
comment on column public.student_generated_meals.validated_at is
  'Posé par le propriétaire du plan (keel_validate_meal_plan). La fusion ne '
  'consomme que des plans validés; pour les autres elle compose depuis le '
  'profil (D7). NULL = généré mais pas relu.';

-- Le chemin de la fusion: retrouver les plans personnels validés d'un foyer sur
-- une fenêtre. Sans index, c'est un scan de toute la table à chaque fusion.
create index if not exists student_generated_meals_household_personal_idx
  on public.student_generated_meals (household_id, plan_kind, starts_on)
  where retired_at is null;

-- ── 3. LA FENÊTRE, SCOPÉE PAR NATURE ────────────────────────────────────────
create or replace function public.write_student_meal_plan(
  p_user_id uuid,
  p_intent text,
  p_starts_on date,
  p_duration_days smallint,
  p_payload jsonb,
  p_replaces uuid default null
)
returns table (
  meal_id uuid,
  retired_plan_id uuid,
  truncated_plan_id uuid,
  truncated_from smallint,
  truncated_to smallint
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_new_id uuid;
  v_retired uuid;
  v_trunc_id uuid;
  v_trunc_from smallint;
  v_trunc_to smallint;
  v_clash record;
  v_kind text;
  v_household uuid;
begin
  if p_user_id is null then
    raise exception 'user_required';
  end if;
  -- R6: pas de branche par défaut. Une intention inconnue s'arrête ici plutôt
  -- que de retomber sur le comportement d'une autre.
  if p_intent not in ('replace_current', 'prepare_next') then
    raise exception 'unknown_intent: %', p_intent;
  end if;
  if p_duration_days is null or p_duration_days not between 1 and 7 then
    raise exception 'bad_duration: %', p_duration_days;
  end if;
  if p_starts_on is null then
    raise exception 'starts_on_required';
  end if;

  v_household := nullif(p_payload ->> 'household_id', '')::uuid;
  v_kind := nullif(p_payload ->> 'plan_kind', '');

  -- LA NATURE EST EXIGÉE DÈS QU'IL Y A UN FOYER, et c'est le point de tout ce
  -- fichier. Un plan sans foyer ne peut être que personnel, donc le défaut y
  -- est sûr. Mais dès qu'un foyer est en jeu, les deux natures sont possibles
  -- et le défaut choisirait en silence — un plan commun rangé comme personnel
  -- écraserait la fenêtre du maître au lieu de vivre à côté.
  if v_household is not null and v_kind is null then
    raise exception 'plan_kind_required';
  end if;
  v_kind := coalesce(v_kind, 'personal');
  if v_kind not in ('personal', 'household') then
    raise exception 'unknown_plan_kind: %', v_kind;
  end if;

  -- Sérialise les écritures d'un même élève. Deux onglets qui génèrent en même
  -- temps se disputent la même fenêtre, et l'un des deux doit voir l'état que
  -- l'autre a laissé — pas l'état d'avant. Volontairement PAR ÉLÈVE et non par
  -- (élève, nature): plus strict que nécessaire ne coûte qu'une attente, alors
  -- qu'un verrou trop fin laisserait passer deux écritures concurrentes.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  -- ── LA LIGNE EXPLICITEMENT REMPLACÉE ──────────────────────────────────
  if p_intent = 'replace_current' then
    if p_replaces is null then
      raise exception 'replaces_required';
    end if;
    update public.student_generated_meals
       set retired_at = now()
     where id = p_replaces
       and user_id = p_user_id
       -- La nature aussi: remplacer son plan perso ne doit pas pouvoir viser
       -- le plan commun, ni l'inverse.
       and plan_kind = v_kind
       -- Le prédicat EST la garde de concurrence: deux remplacements qui
       -- courent sur la même ligne, un seul la déplace.
       and retired_at is null
    returning id into v_retired;
    if v_retired is null then
      raise exception 'plan_not_replaceable: %', p_replaces;
    end if;
  end if;

  -- ── CE QUI RESTE ET QUI CHEVAUCHE ─────────────────────────────────────
  -- Un plan vivant qui commence AVANT la nouvelle fenêtre est raccourci: c'est
  -- la vérité littérale, l'élève vient de dire que ces jours-là appartiennent
  -- au nouveau plan.
  --
  -- Un plan vivant qui commence LE MÊME JOUR ou APRÈS ne peut pas être
  -- raccourci vers une fenêtre positive. Le tronquer à zéro le ferait
  -- disparaître en silence — on refuse, en le nommant, pour que l'appelant le
  -- retire explicitement.
  for v_clash in
    select id, starts_on, duration_days
      from public.student_generated_meals
     where user_id = p_user_id
       -- LA NATURE SÉPARE LES FENÊTRES. C'est ce qui permet au maître de tenir
       -- son plan perso ET le plan commun sur la même semaine.
       and plan_kind = v_kind
       and retired_at is null
       -- Non qualifie: daterange vit dans pg_catalog, qui reste implicitement
       -- dans le chemin meme avec un search_path vide. Le prefixer public. le
       -- rend introuvable.
       and daterange(starts_on, (starts_on + duration_days))
           && daterange(p_starts_on, (p_starts_on + p_duration_days))
     order by starts_on
  loop
    if v_clash.starts_on >= p_starts_on then
      raise exception 'plan_overlaps_existing: %', v_clash.id;
    end if;

    v_trunc_id := v_clash.id;
    v_trunc_from := v_clash.duration_days;
    v_trunc_to := (p_starts_on - v_clash.starts_on)::smallint;

    update public.student_generated_meals
       set duration_days = v_trunc_to,
           -- Tracé sur la ligne, comme `generated_from.issues`: lisible en SQL,
           -- trois jours plus tard, par quelqu'un qui n'a pas fait l'appel.
           generated_from = coalesce(generated_from, '{}'::jsonb)
             || jsonb_build_object('truncated_by', jsonb_build_object(
                  'from_duration_days', v_trunc_from,
                  'to_duration_days', v_trunc_to,
                  'at', now()
                ))
     where id = v_clash.id;
  end loop;

  -- ── LE PLAN NEUF ──────────────────────────────────────────────────────
  -- `scope` est DÉRIVÉ ici et n'est plus une entrée: une ligne `scope='day'`
  -- portant une fenêtre de sept jours était possible, et ne l'est plus.
  insert into public.student_generated_meals (
    user_id, starts_on, duration_days, scope, mode, meal_slot, servings,
    context, preferences, pantry, dishes, preparations, cooking_sessions,
    shopping_list, generated_from, content_locale,
    household_id, member_portions, plan_kind
  )
  values (
    p_user_id,
    p_starts_on,
    p_duration_days,
    case when p_duration_days = 1 then 'day' else 'several_days' end,
    p_payload ->> 'mode',
    nullif(p_payload ->> 'meal_slot', ''),
    coalesce((p_payload ->> 'servings')::int, 1),
    nullif(p_payload ->> 'context', ''),
    nullif(p_payload ->> 'preferences', ''),
    coalesce(p_payload -> 'pantry', '[]'::jsonb),
    coalesce(p_payload -> 'dishes', '[]'::jsonb),
    coalesce(p_payload -> 'preparations', '[]'::jsonb),
    coalesce(p_payload -> 'cooking_sessions', '[]'::jsonb),
    coalesce(p_payload -> 'shopping_list', '[]'::jsonb),
    coalesce(p_payload -> 'generated_from', '{}'::jsonb)
      || case when v_trunc_id is null then '{}'::jsonb
              else jsonb_build_object('truncates', jsonb_build_object(
                     'plan_id', v_trunc_id, 'days_taken', v_trunc_from - v_trunc_to))
         end,
    coalesce(p_payload ->> 'content_locale', 'en'),
    v_household,
    coalesce(p_payload -> 'member_portions', '[]'::jsonb),
    v_kind
  )
  returning id into v_new_id;

  return query select v_new_id, v_retired, v_trunc_id, v_trunc_from, v_trunc_to;
end;
$function$;

-- Service_role uniquement: la fenêtre est résolue avec le fuseau de l'élève,
-- côté serveur, et une fenêtre choisie par le client serait une fenêtre non
-- vérifiée.
revoke all on function public.write_student_meal_plan(uuid, text, date, smallint, jsonb, uuid) from public;
revoke all on function public.write_student_meal_plan(uuid, text, date, smallint, jsonb, uuid) from anon, authenticated;

-- ── 4. VALIDER SON PROPRE PLAN ──────────────────────────────────────────────
-- Une RPC et pas une policy d'`update`: une policy ne sait pas restreindre les
-- COLONNES, et un élève autorisé à écrire sa ligne pourrait alors se réécrire
-- des plats. La porte est étroite — une colonne, sur sa propre ligne.
create or replace function public.keel_validate_meal_plan(p_plan uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_row record;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select id, plan_kind, retired_at, validated_at
    into v_row
    from public.student_generated_meals
   where id = p_plan and user_id = v_user;

  if v_row.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_your_plan');
  end if;
  if v_row.retired_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'plan_retired');
  end if;
  -- On ne valide QUE son plan personnel. Le plan commun n'est pas soumis à
  -- validation: il est le résultat d'une fusion, pas une proposition.
  if v_row.plan_kind <> 'personal' then
    return jsonb_build_object('ok', false, 'reason', 'not_a_personal_plan');
  end if;

  -- Idempotent: revalider ne redate pas. La date de validation est ce que la
  -- fusion compare pour détecter « validé APRÈS la fusion » (D8); la bouger
  -- sans raison ferait apparaître un faux conflit.
  --
  -- ⚠️ LE PRÉDICAT EST LA GARDE, comme dans `write_student_meal_plan` plus haut.
  -- La première version testait `v_row.validated_at is null` — une valeur LUE
  -- par le SELECT non verrouillant ci-dessus. Ce n'était pas une garde: mesuré
  -- le 2026-08-11, quatre appels HTTP simultanés sur le même plan répondaient
  -- TOUS `already:false` et redataient la ligne, sur 6 plans testés sur 6. Un
  -- double-clic sur un bouton « Valider » suffisait. En READ COMMITTED, le
  -- `and validated_at is null` porté par l'UPDATE fait attendre la seconde
  -- transaction puis réévalue la qualification: elle touche zéro ligne.
  update public.student_generated_meals
     set validated_at = now()
   where id = p_plan
     and validated_at is null;

  -- `already` se DÉDUIT de l'écriture, jamais d'une lecture antérieure: c'est
  -- la même valeur qui doit décider d'écrire et de ce qu'on répond.
  return jsonb_build_object('ok', true, 'already', not found);
end;
$function$;

revoke all on function public.keel_validate_meal_plan(uuid) from public, anon;
grant execute on function public.keel_validate_meal_plan(uuid) to authenticated;

comment on function public.keel_validate_meal_plan(uuid) is
  'Le propriétaire déclare son plan PERSONNEL bon pour la fusion (D8). '
  'Idempotent: revalider ne redate pas, parce que la fusion compare cette date '
  'pour détecter une validation postérieure à elle.';
