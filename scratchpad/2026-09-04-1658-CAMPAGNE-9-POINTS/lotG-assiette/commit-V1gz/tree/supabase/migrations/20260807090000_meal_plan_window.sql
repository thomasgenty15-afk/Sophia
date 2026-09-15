-- ===========================================================================
-- LA FENÊTRE D'UN PLAN DE REPAS DEVIENT UNE DONNÉE
--
-- LE DÉFAUT, ET IL N'EST PAS « il manque un second plan »
-- -------------------------------------------------------
-- `student_generated_meals` est append-only et TOUS ses lecteurs prennent
-- `order by created_at desc limit 1`. Générer, c'est donc toujours écraser. Un
-- élève qui a fait ses courses jusqu'à dimanche et qui prépare la semaine
-- suivante perd le plan qu'il comptait suivre.
--
-- La cause profonde est ailleurs: la FENÊTRE d'un plan est une DÉDUCTION.
-- `daysUntilSunday(today)` côté moteur, `created_at` côté écran et côté
-- conversation. Tant qu'un plan commence toujours aujourd'hui, ça tient. Dès
-- qu'il peut commencer plus tard, les trois déductions deviennent fausses en
-- même temps et « mardi » redevient un jeton sans date.
--
-- Cette migration donne à chaque ligne les deux seules choses qui manquent pour
-- qu'un jeton `tue` ait une date exacte: OÙ la fenêtre commence, et COMBIEN de
-- jours elle couvre.
--
-- CE QU'ELLE N'AJOUTE PAS: aucune colonne « is_current », aucun statut, aucun
-- cron de promotion. « Le suivant devient le courant » n'est pas un événement:
-- ce sont les mêmes lignes avec `today` avancé d'un jour. C'est l'idiome que le
-- dépôt applique déjà à `plan_versions` (`status` dit qui fait autorité,
-- `anchor_week_start + duration_weeks` disent si aujourd'hui est dedans, et la
-- ligne n'est JAMAIS re-statuée quand sa fenêtre expire — voir
-- `provision-day-v1/provisioning.ts::planWeekNumber`).
--
-- Et c'est l'inverse de ce qui a brûlé ce dépôt: chaque panne silencieuse
-- documentée ici est un STATUT STOCKÉ que plus personne n'écrivait
-- (`_shared/keel/following_io.ts`, en-tête: « deux crons qui tournaient
-- proprement en écartant tout le monde »).
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. LES COLONNES
-- ---------------------------------------------------------------------------
-- Ajoutées NULLABLE: le backfill vient après, et les contraintes après lui.
alter table public.student_generated_meals
  add column if not exists starts_on date,
  add column if not exists duration_days smallint,
  -- « CETTE LIGNE A ÉTÉ REMPLACÉE », et jamais « cette ligne n'est pas
  -- courante ». La distinction est tout, parce que la colonne RESSEMBLE au
  -- statut stocké qui brûle ce dépôt.
  --
  -- « Courante » se déduit des dates, à chaque lecture, et ne peut donc pas
  -- cesser d'être vrai. `retired_at` répond à une autre question: est-ce qu'un
  -- humain a explicitement remplacé ce plan. Et s'il cessait d'être écrit,
  -- l'échec serait un 23P01 BRUYANT au prochain insert (voir la contrainte
  -- d'exclusion plus bas), pas une lecture silencieusement fausse. C'est ce qui
  -- le rend acceptable là où `student_week_plans.'archived'` ne l'était pas.
  add column if not exists retired_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. LE BACKFILL — IL PRÉSERVE, IL NE RÉPARE PAS
-- ---------------------------------------------------------------------------
-- Une migration qui en profite pour corriger le passé produit des lignes que
-- personne ne sait plus expliquer. Chaque valeur ci-dessous reproduit ce que le
-- code fait AUJOURD'HUI, à la ligne près.

-- `starts_on`: la date locale de composition. Le fuseau du plan publié d'abord,
-- celui du profil ensuite, UTC en dernier — et ce `'UTC'` final n'est pas une
-- approximation choisie ici: c'est EXACTEMENT ce que `planned_dish_io.ts` fait
-- déjà (`created_at.slice(0, 10)`). Aucune ligne ne bouge.
update public.student_generated_meals m
set starts_on = (
  m.created_at at time zone coalesce(
    (select pv.timezone from public.plan_versions pv
      where pv.student_id = m.user_id and pv.status = 'published' limit 1),
    (select p.timezone from public.profiles p where p.id = m.user_id),
    'UTC'
  )
)::date
where m.starts_on is null;

-- `duration_days`: 7 pour une semaine, 1 pour un jour.
--
-- LE 7 EST DÉLIBÉRÉ ET IL NE FAUT PAS LE « CORRIGER ». Rejouer
-- `daysUntilSunday` ici rétrécirait des fenêtres historiques et cacherait des
-- plats que le modèle a réellement placés. `STRETCH_DAYS = 7` est ce que le
-- code a servi à ces élèves; le backfill le grave, une réparation aurait sa
-- propre branche nommée.
--
-- Le 1 pour `scope='day'` n'est pas une réparation non plus, c'est la fenêtre
-- honnête de ces lignes — et il ferme au passage le corollaire du défaut A3
-- (`docs/keel/QA-CHAT-2026-08-05-RESULTS.md`): des plats `day: null` issus de
-- compositions `scope='day'` restaient éternellement rapprochables.
update public.student_generated_meals
set duration_days = case when scope = 'day' then 1 else 7 end
where duration_days is null;

-- `retired_at`: tout sauf la plus récente par élève.
--
-- C'est PRÉCISÉMENT ce que `order by created_at desc limit 1` affirme depuis le
-- premier jour. Rendre explicite une règle implicite est l'objet même de cette
-- migration — et sans ça la contrainte d'exclusion ne peut pas être posée.
with keep as (
  select distinct on (user_id) id
  from public.student_generated_meals
  order by user_id, created_at desc
)
update public.student_generated_meals m
set retired_at = m.created_at,
    generated_from = coalesce(m.generated_from, '{}'::jsonb)
      || jsonb_build_object(
           'migrated_by', '20260807090000_meal_plan_window',
           'migration_note',
           'Retired by the window migration: it was not the newest row for this '
           || 'student, which is exactly what every reader asserted by taking '
           || '`order by created_at desc limit 1`.'
         )
where m.retired_at is null
  and m.id not in (select id from keep);

alter table public.student_generated_meals
  alter column starts_on set not null,
  alter column duration_days set not null;

-- ---------------------------------------------------------------------------
-- 2bis. LE DERNIER JOUR COUVERT — GÉNÉRÉ, PAS RECALCULÉ PAR CHAQUE LECTEUR
-- ---------------------------------------------------------------------------
-- Cinq prédicats le lisent (`following_io`, `coach_synthesis_io`,
-- `planned_dish_io`, les deux écrans). Cinq recopies de
-- `starts_on + duration_days - 1` divergeraient au premier ajustement, et la
-- divergence se paierait sur « quel plan possède aujourd'hui » — la seule
-- question de tout ce chantier.
--
-- `date + int` est immutable, donc `stored` est légal, donc c'est indexable.
alter table public.student_generated_meals
  add column if not exists ends_on date
    generated always as (starts_on + (duration_days - 1)) stored;

-- ---------------------------------------------------------------------------
-- 3. LES BORNES
-- ---------------------------------------------------------------------------
-- SEPT JOURS N'EST PAS UNE PRÉFÉRENCE PRODUIT, c'est une limite du modèle de
-- données: au-delà, `wed` désigne deux dates dans une même ligne. Or chaque clé
-- de coche (`meal_tick:<id>:<index>`), chaque rapprochement photo et chaque
-- rendu résolvent les jetons de jour sur sept créneaux. Quelqu'un finira par
-- vouloir « assouplir » cette contrainte: la raison est écrite ici pour qu'il
-- comprenne d'abord ce qu'il casse.
alter table public.student_generated_meals
  drop constraint if exists student_generated_meals_duration_days_check;
alter table public.student_generated_meals
  add constraint student_generated_meals_duration_days_check
    check (duration_days between 1 and 7);

-- ---------------------------------------------------------------------------
-- 4. DEUX PLANS VIVANTS NE PARTAGENT JAMAIS UN JOUR
-- ---------------------------------------------------------------------------
-- On a cherché à exprimer « au plus un plan FUTUR par élève ». C'est
-- inexprimable: un index unique partiel exige un prédicat immutable, et
-- `starts_on > today` lit l'horloge.
--
-- On arrête donc d'exprimer « futur » et on exprime l'invariant réel, qui lui
-- est intemporel: DEUX PLANS VIVANTS D'UN MÊME ÉLÈVE NE SE CHEVAUCHENT PAS.
--
-- Ce qui en découle gratuitement:
--   · « au plus deux plans » — au plus une fenêtre vivante contient aujourd'hui
--     (le courant), et le lecteur prend la plus proche des futures (le suivant);
--   · la règle de TRONCATURE devient une garantie de la base et non une
--     politesse applicative: on ne PEUT PAS insérer un plan suivant qui
--     chevauche le courant sans raccourcir le courant dans la même transaction.
create extension if not exists btree_gist;

alter table public.student_generated_meals
  drop constraint if exists student_generated_meals_live_windows_dont_overlap;
alter table public.student_generated_meals
  add constraint student_generated_meals_live_windows_dont_overlap
    exclude using gist (
      user_id with =,
      daterange(starts_on, (starts_on + duration_days)) with &&
    ) where (retired_at is null);

-- Ceinture, et pas bretelle: deux plans vivants qui démarrent le même jour sont
-- déjà refusés par l'exclusion ci-dessus. Cet index-ci rend le refus LISIBLE
-- (23505 nomme la colonne) et sert de garde si l'exclusion venait à être
-- assouplie.
create unique index if not exists student_generated_meals_one_live_start_idx
  on public.student_generated_meals (user_id, starts_on)
  where retired_at is null;

-- Le lecteur chaud: « quel plan possède cette date pour cet élève ». Il tombe
-- sur l'index d'exclusion pour le chevauchement, mais pas pour ce parcours-ci.
create index if not exists student_generated_meals_user_window_idx
  on public.student_generated_meals (user_id, starts_on)
  where retired_at is null;

-- « Un plan de cet élève couvre-t-il encore cette semaine » — le prédicat des
-- deux sondes qui décident si le tap du soir et le point du dimanche partent.
create index if not exists student_generated_meals_user_ends_idx
  on public.student_generated_meals (user_id, ends_on)
  where retired_at is null;

comment on column public.student_generated_meals.starts_on is
  'Premier jour couvert, dans le calendrier LOCAL de l''élève. Avec '
  '`duration_days`, c''est ce qui donne une date exacte à un jeton de jour '
  '(« tue ») — la table n''en avait aucune avant le 2026-08-07.';
comment on column public.student_generated_meals.duration_days is
  'Nombre de jours couverts, 1 à 7. Le plafond est structurel: au-delà un jeton '
  'de jour désignerait deux dates dans la même ligne.';
comment on column public.student_generated_meals.ends_on is
  'Dernier jour couvert. GÉNÉRÉE: cinq prédicats la lisent, et cinq recopies de '
  'la même addition divergeraient.';
comment on column public.student_generated_meals.retired_at is
  'Cette ligne a été REMPLACÉE par une autre. Ne répond JAMAIS à « est-elle '
  'courante » — ça, ce sont les dates qui le disent, à chaque lecture.';

commit;

-- ===========================================================================
-- VÉRIFICATION — ce qui doit être vrai après cette migration
-- ===========================================================================
do $$
declare
  v_null_windows bigint;
  v_live_per_user bigint;
  v_overlaps bigint;
begin
  select count(*) into v_null_windows
  from public.student_generated_meals
  where starts_on is null or duration_days is null;
  if v_null_windows > 0 then
    raise exception 'window backfill left % rows without a window', v_null_windows;
  end if;

  -- Au plus une ligne vivante par élève APRÈS backfill: c'est l'état que
  -- `desc limit 1` décrivait déjà. S'il y en a deux, le backfill a menti.
  select coalesce(max(n), 0) into v_live_per_user
  from (
    select count(*) as n from public.student_generated_meals
    where retired_at is null group by user_id
  ) s;
  if v_live_per_user > 1 then
    raise exception 'backfill left % live plans for one student', v_live_per_user;
  end if;

  select count(*) into v_overlaps
  from public.student_generated_meals a
  join public.student_generated_meals b
    on a.user_id = b.user_id and a.id < b.id
   and a.retired_at is null and b.retired_at is null
   and daterange(a.starts_on, a.starts_on + a.duration_days)
       && daterange(b.starts_on, b.starts_on + b.duration_days);
  if v_overlaps > 0 then
    raise exception 'exclusion constraint is not holding: % overlapping live pairs', v_overlaps;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.student_generated_meals'::regclass
      and conname = 'student_generated_meals_live_windows_dont_overlap'
  ) then
    raise exception 'overlap exclusion constraint missing after migration';
  end if;
end $$;

-- ===========================================================================
-- 5. L'ÉCRIVAIN — UNE TRANSACTION, PARCE QUE LA TRONCATURE ET L'INSERT NE
--    PEUVENT PAS ÊTRE DEUX APPELS
-- ===========================================================================
-- Le seul entrelacement vraiment nuisible est « troncature commitée, insert
-- échoué »: l'élève perd des jours pour un plan qui n'est jamais arrivé. Deux
-- appels supabase-js ne peuvent pas l'éviter; une fonction le peut.
--
-- DEUX BRANCHES NOMMÉES (R6), et rien d'autre n'est accepté:
--   `replace_current` — je me suis trompé, je refais CE plan-là. La ligne
--                       remplacée est nommée par l'appelant: avec deux onglets,
--                       « le courant » n'est plus une notion univoque.
--   `prepare_next`    — j'en prépare un second qui démarre plus tard.
--
-- La troncature est CHIRURGICALE: seul `duration_days` bouge. Ni `dishes`, ni
-- `preparations`, ni `shopping_list`. Les clés de coche
-- (`meal_tick:<id>:<index>`) sont POSITIONNELLES: retirer des entrées de
-- `dishes` renumérote les suivantes et repointe silencieusement des coches
-- existantes vers la mauvaise assiette, sans erreur, dans la table que le coach
-- lit. C'est l'édition la plus dangereuse disponible ici.
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

  -- Sérialise les écritures d'un même élève. Deux onglets qui génèrent en même
  -- temps se disputent la même fenêtre, et l'un des deux doit voir l'état que
  -- l'autre a laissé — pas l'état d'avant.
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
           -- `from_duration_days` achète une vraie branche — si l'élève
           -- remplace ensuite le plan suivant par un qui démarre plus tard, on
           -- sait quelle fenêtre restituer.
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
    shopping_list, generated_from, content_locale
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
    coalesce(p_payload ->> 'content_locale', 'en')
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

-- ---------------------------------------------------------------------------
-- 6. RLS: L'ÉLÈVE LIT SES PLANS, IL NE LES ÉCRIT PLUS
-- ---------------------------------------------------------------------------
-- La policy était `for all`: un élève pouvait POSTer directement sur PostgREST
-- une ligne avec la fenêtre de son choix, en contournant les deux branches
-- d'intention et la résolution de fuseau. Vérifié: le front ne fait que lire
-- (`frontend/src/keel/api/mealGeneration.ts`), et le seul écrivain est
-- `generate-meal-v1` en service_role.
drop policy if exists student_generated_meals_owner_all on public.student_generated_meals;
drop policy if exists student_generated_meals_owner_read on public.student_generated_meals;
create policy student_generated_meals_owner_read on public.student_generated_meals
  for select to authenticated
  using (user_id = (select auth.uid()));
