-- ============================================================================
-- A1 · LA VEILLE ENTRE DANS LA FENÊTRE, ET LA BASE COMPTE LES JOURS MANGÉS.
--
-- Chantier: scratchpad/2026-09-03-1308-MASTER-PROMPT-8-CHANTIERS.md §5.5 (P1)
-- Analyse:  scratchpad/2026-09-03-1237-ANALYSE-8-POINTS-ET-PLAN-8-AGENTS.md §1
-- Amont:    20260807090000_meal_plan_window.sql  (le cap de 7, l'exclusion)
--           20260821231500_le_zero_de_composition_cesse_detre_une_mesure.sql
--           (la définition d'aujourd'hui de `write_student_meal_plan`, reprise
--            ici PAR EXTRACTION `pg_get_functiondef` puis patchée — jamais
--            recopiée à la main: cette fonction porte le verrou d'avance, le
--            raccourcissement des plans qui chevauchent et le refus de
--            `plan_kind`, et une transcription approximative de l'un des trois
--            se paierait sur la fenêtre de quelqu'un.)
--
-- ── CE QUE LE PRODUIT DEMANDE ────────────────────────────────────────────────
-- Les courses et la cuisson se font LA VEILLE du premier jour mangé, et c'est
-- AUTOMATIQUE (plus de case à cocher). `leadDayFor` (`_shared/keel/plan_hours.ts`)
-- tranche sur la date, le jour local et l'heure — coupure à 18 h. Un plan
-- « lundi→vendredi, je cuisine dimanche » EST un plan « dimanche→vendredi » dont
-- le dimanche ne porte aucun repas: la veille est DANS la fenêtre et HORS des
-- jours mangés (décision D1.1).
--
-- ── CE QUE ÇA COÛTE À LA BASE, ET C'EST TOUT CE FICHIER ──────────────────────
-- Trois mécanismes de `20260807090000` comptaient les jours de FENÊTRE comme
-- des jours MANGÉS. Avec une veille systématique, chacun devient faux:
--
--   ① `duration_days between 1 and 7` refuserait TOUT plan de sept jours mangés
--      (il en fait huit avec sa veille). Sept jours n'est pas une préférence
--      produit: c'est l'alphabet des jetons (`mon`…`sun`), et il porte sur les
--      jours MANGÉS. Le cap devient `1 and 8` PLUS `duration_days - lead_days
--      between 1 and 7` — le vrai invariant, écrit là où il vit.
--      ⛔ On n'ampute JAMAIS la fin d'un plan pour faire de la place (D1.3).
--
--   ② L'EXCLUSION refusait la vérité physique la plus banale du produit: la
--      veille du plan N+1 EST le dernier jour mangé du plan N. On fait les
--      courses dimanche soir pour lundi pendant qu'on dîne encore la semaine
--      d'avant. L'exclusion porte donc sur `daterange(starts_on + lead_days,
--      starts_on + duration_days)`.
--
--   ③ L'INDEX UNIQUE `(user_id, starts_on)` refusait la même chose sous un
--      autre nom: un plan d'un jour le dimanche et un plan de la semaine dont
--      la veille EST ce dimanche partagent `starts_on` sans partager un seul
--      jour mangé. Il porte donc sur `(user_id, (starts_on + lead_days))`.
--      `date + smallint` est immutable — l'index est légal.
--
-- Et la BOUCLE DE CHEVAUCHEMENT de `write_student_meal_plan` recopie ①/② en
-- plpgsql: elle bouge dans LE MÊME FICHIER, sinon la RPC refuserait au nom de
-- l'ancienne règle ce que les contraintes acceptent (FF-006: les trois
-- mécanismes bougent ensemble). Son jumeau TypeScript `firstBlockingPlan`
-- (`_shared/keel/meal_plan_window.ts`) plie déjà chaque ligne par `eatenSpan`.
--
-- ── CE QUE CETTE MIGRATION NE FAIT PAS ──────────────────────────────────────
-- Elle ne change AUCUNE signature: `lead_days` voyage dans `p_payload`, comme
-- `mode`, `plan_kind` et les compteurs de composition. Ajouter un paramètre
-- créerait une SURCHARGE (Postgres garde l'ancienne fonction) et PostgREST
-- refuserait l'appel pour ambiguïté — un 300 sur chaque composition.
--
-- ── LA DIRECTION, ÉCRITE AVANT D'AVOIR VU LE RÉSULTAT ────────────────────────
-- Le bloc de contrôle en fin de fichier monte un plan N de sept jours mangés
-- avec sa veille (fenêtre de HUIT), puis un plan N+1 dont la veille EST le
-- dernier jour mangé de N — et vérifie que ça PASSE. Puis deux plans qui
-- partagent un jour MANGÉ, et vérifie que ça REFUSE. Il roule dans la
-- transaction de la migration et laisse la base vide (`rollback to savepoint`).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. LA COLONNE — combien de jours de CUISINE SANS REPAS en tête de fenêtre
-- ---------------------------------------------------------------------------
-- `0` ou `1`, et rien d'autre: on cuisine LA veille, pas l'avant-veille. La
-- valeur est épinglée côté code par `MAX_LEAD_DAYS` (`meal_plan_window.ts`),
-- lui-même épinglé par `constant_pinning_gate_test.ts`.
--
-- `not null default 0`: les 200+ lignes existantes n'ont pas de veille, et
-- c'est exactement ce que zéro dit. Aucun rattrapage, aucune devinette.
alter table public.student_generated_meals
  add column if not exists lead_days smallint not null default 0;

alter table public.student_generated_meals
  drop constraint if exists student_generated_meals_lead_days_check;
alter table public.student_generated_meals
  add constraint student_generated_meals_lead_days_check
    check (lead_days in (0, 1));

comment on column public.student_generated_meals.lead_days is
  'Jours de CUISINE SANS REPAS en tête de fenêtre — 0 ou 1 (2026-09-03, P1). '
  'La veille est DANS `[starts_on, starts_on + duration_days)` et HORS des '
  'jours mangés `[starts_on + lead_days, starts_on + duration_days)`. Tout '
  'lecteur qui compte des jours de REPAS doit ajouter `lead_days` au début — '
  'côté code, la seule conversion est `eatenSpan` (`meal_plan_window.ts`), et '
  'son argument est REQUIS pour qu''un `select` qui oublie cette colonne ne '
  'compile pas.';

-- ---------------------------------------------------------------------------
-- 2. LES BORNES — le sept porte sur les jours MANGÉS
-- ---------------------------------------------------------------------------
-- SEPT JOURS N'EST TOUJOURS PAS UNE PRÉFÉRENCE PRODUIT (voir 20260807090000):
-- au-delà, `wed` désigne deux dates dans une même ligne, et chaque clé de coche
-- (`meal_tick:<id>:<index>`), chaque rapprochement photo et chaque rendu
-- résolvent les jetons sur sept créneaux. Ce que ce lot corrige, c'est SUR QUOI
-- le sept se compte: les jours où l'on MANGE, pas les jours de la fenêtre.
--
-- ⚠️ ET LE HUIT N'EST PAS UNE PORTE OUVERTE: `duration_days = 8` n'est légal
-- qu'avec `lead_days = 1`, donc sept jours mangés. La paire de CHECK ci-dessous
-- est indissociable — enlever le second rouvrirait un plan de huit jours de
-- repas, que l'alphabet des jetons ne sait pas nommer.
alter table public.student_generated_meals
  drop constraint if exists student_generated_meals_duration_days_check;
alter table public.student_generated_meals
  add constraint student_generated_meals_duration_days_check
    check (duration_days between 1 and 8);

alter table public.student_generated_meals
  drop constraint if exists student_generated_meals_eaten_days_check;
alter table public.student_generated_meals
  add constraint student_generated_meals_eaten_days_check
    check (duration_days - lead_days between 1 and 7);

-- ---------------------------------------------------------------------------
-- 3. DEUX PLANS VIVANTS NE PARTAGENT JAMAIS UN JOUR **MANGÉ**
-- ---------------------------------------------------------------------------
-- L'invariant de 20260807090000 est intact — deux plans vivants d'un même élève
-- ne se chevauchent pas — et c'est sa MESURE qui change: elle porte sur les
-- jours de REPAS. Le jour de cuisine de l'un a le droit d'être le dernier
-- dîner de l'autre; c'est ce que les gens font, et la base le refusait.
alter table public.student_generated_meals
  drop constraint if exists student_generated_meals_live_windows_dont_overlap;
alter table public.student_generated_meals
  add constraint student_generated_meals_live_windows_dont_overlap
    exclude using gist (
      user_id with =,
      -- ⛔ `plan_kind` EST DANS LA CLÉ, ET IL Y ÉTAIT AVANT CE LOT
      -- (`20260811080000`, pas `20260807090000` qui ne le connaissait pas
      -- encore). C'est lui qui permet au maître de tenir SON plan perso ET le
      -- plan commun sur la même semaine. Le laisser tomber en recréant la
      -- contrainte aurait refusé le foyer entier, en silence, sur la première
      -- composition — vérifié sur la base locale, où la paire (perso 22/08,
      -- commun 22/08) existe et serait morte.
      plan_kind with =,
      daterange((starts_on + lead_days), (starts_on + duration_days)) with &&
    ) where (retired_at is null);

-- Ceinture, et pas bretelle (même motif qu'en 2026-08-07): l'exclusion refuse
-- déjà deux plans qui commencent à manger le même jour; cet index-ci rend le
-- refus LISIBLE (23505 nomme la colonne). Il déménage sur le PREMIER JOUR MANGÉ
-- pour la même raison que l'exclusion: `starts_on` seul refusait un plan d'un
-- jour le dimanche à côté d'un plan de semaine dont la veille est ce dimanche.
-- ⛔ `plan_kind` EST DANS LA CLÉ ICI AUSSI, pour la même raison et depuis la
-- même migration (`20260811080000`).
drop index if exists public.student_generated_meals_one_live_start_idx;
create unique index if not exists student_generated_meals_one_live_eaten_start_idx
  on public.student_generated_meals (user_id, plan_kind, ((starts_on + lead_days)))
  where retired_at is null;

-- ---------------------------------------------------------------------------
-- 4. LA RPC — la MÊME boucle, sur les mêmes jours mangés
-- ---------------------------------------------------------------------------
-- Corps extrait par `pg_get_functiondef` de la base locale (identique au fichier
-- 20260821231500, vérifié par `diff`), patché sur QUATRE points et rien d'autre:
--   · `v_lead` lu du payload, avec son refus nommé;
--   · les deux bornes (durée de fenêtre, jours mangés);
--   · la boucle de chevauchement et sa troncature, sur les jours mangés;
--   · l'insertion de la colonne, et `scope` dérivé des jours MANGÉS.
CREATE OR REPLACE FUNCTION public.write_student_meal_plan(p_user_id uuid, p_intent text, p_starts_on date, p_duration_days smallint, p_payload jsonb, p_replaces uuid DEFAULT NULL::uuid)
 RETURNS TABLE(meal_id uuid, retired_plan_id uuid, truncated_plan_id uuid, truncated_from smallint, truncated_to smallint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_new_id uuid;
  v_retired uuid;
  v_trunc_id uuid;
  v_trunc_from smallint;
  v_trunc_to smallint;
  v_clash record;
  v_kind text;
  v_household uuid;
  v_mode text;
  -- ⟳ A1 (2026-09-03) — LES JOURS DE CUISINE SANS REPAS EN TÊTE.
  v_lead smallint;
  -- Le premier jour MANGÉ de la fenêtre demandée. Calculé UNE fois: la boucle
  -- de chevauchement, la troncature et `scope` le relisent, et trois calculs
  -- de la même date divergeraient au premier ajustement.
  v_eats_from date;
begin
  if p_user_id is null then
    raise exception 'user_required';
  end if;
  -- R6: pas de branche par défaut. Une intention inconnue s'arrête ici plutôt
  -- que de retomber sur le comportement d'une autre.
  if p_intent not in ('replace_current', 'prepare_next') then
    raise exception 'unknown_intent: %', p_intent;
  end if;

  -- ⟳ A1 — LA VEILLE, LUE DU PAYLOAD ET REFUSÉE PAR SON NOM.
  -- Clé absente ⇒ `0`, c'est-à-dire « pas de veille »: c'est ce que portent les
  -- lignes d'avant ce lot ET tout appelant qui ne dérive pas de veille (la
  -- fusion, la reprise). Une valeur PRÉSENTE et fausse s'arrête ici; elle ne
  -- retombe pas sur zéro, sinon un appelant qui envoie `2` écrirait un plan
  -- dont la veille a disparu sans que personne ne le sache.
  v_lead := coalesce((p_payload ->> 'lead_days')::smallint, 0::smallint);
  if v_lead not in (0, 1) then
    raise exception 'bad_lead_days: %', v_lead;
  end if;

  -- ⟳ A1 — DEUX BORNES, ET ELLES DISENT DEUX CHOSES DIFFÉRENTES.
  -- La première borne la FENÊTRE (ce que la table peut stocker); la seconde
  -- borne les jours MANGÉS (ce que l'alphabet des jetons sait nommer). Les
  -- fondre en une seule laisserait passer huit jours de repas.
  if p_duration_days is null or p_duration_days not between 1 and 8 then
    raise exception 'bad_duration: %', p_duration_days;
  end if;
  if p_duration_days - v_lead not between 1 and 7 then
    raise exception 'bad_eaten_days: % jours mangés', p_duration_days - v_lead;
  end if;
  if p_starts_on is null then
    raise exception 'starts_on_required';
  end if;
  v_eats_from := p_starts_on + v_lead;

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

  -- `mode` ÉTAIT LE SEUL PARAMÈTRE SANS REFUS NOMMÉ, au milieu de neuf qui en
  -- ont un. La colonne est NOT NULL sans défaut ET porte un CHECK: un payload
  -- sans `mode`, ou avec un mode inventé, remontait une erreur Postgres brute
  -- exposant le SQL interne, là où tout le reste rend un motif lisible.
  v_mode := nullif(p_payload ->> 'mode', '');
  if v_mode is null then
    raise exception 'mode_required';
  end if;
  if v_mode not in ('from_pantry', 'to_shop') then
    raise exception 'unknown_mode: %', v_mode;
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
  --
  -- ⟳ A1 — TOUTES LES COMPARAISONS SONT SUR LES JOURS MANGÉS. La veille de la
  -- nouvelle fenêtre a le droit de tomber sur le dernier dîner d'un plan
  -- vivant: c'est le geste le plus banal du produit (« je fais dimanche soir
  -- les courses de lundi »), et il était refusé.
  for v_clash in
    select id, starts_on, duration_days, lead_days
      from public.student_generated_meals
     where user_id = p_user_id
       -- LA NATURE SÉPARE LES FENÊTRES. C'est ce qui permet au maître de tenir
       -- son plan perso ET le plan commun sur la même semaine.
       and plan_kind = v_kind
       and retired_at is null
       -- Non qualifie: daterange vit dans pg_catalog, qui reste implicitement
       -- dans le chemin meme avec un search_path vide. Le prefixer public. le
       -- rend introuvable.
       and daterange((starts_on + lead_days), (starts_on + duration_days))
           && daterange(v_eats_from, (p_starts_on + p_duration_days))
     order by starts_on
  loop
    if v_clash.starts_on + v_clash.lead_days >= v_eats_from then
      raise exception 'plan_overlaps_existing: %', v_clash.id;
    end if;

    -- LE CAS « CONTIENT » — mesuré le 2026-08-11, il perdait des jours en
    -- SILENCE. Plan vivant [06/09, 13/09), nouvelle fenêtre INTÉRIEURE
    -- [08/09, 10/09): l'ancien était tronqué à sa tête, et 10/09 → 12/09 ne
    -- se retrouvaient couverts par AUCUN plan. La trace annonçait en plus
    -- `days_taken: 5` quand le nouveau plan n'en prend que 2.
    --
    -- C'est exactement ce que le refus juste au-dessus existe pour empêcher:
    -- « le tronquer le ferait disparaître en silence — on refuse, en le
    -- nommant, pour que l'appelant le retire explicitement ». Le cas
    -- « commence avant ET finit après » violait la même règle sans être nommé.
    if v_clash.starts_on + v_clash.duration_days
       > p_starts_on + p_duration_days then
      raise exception 'plan_overlaps_existing: %', v_clash.id;
    end if;

    v_trunc_id := v_clash.id;
    v_trunc_from := v_clash.duration_days;
    -- ⟳ A1 — LA COUPE TOMBE SUR LE PREMIER JOUR MANGÉ DU NOUVEAU PLAN, pas sur
    -- son début de fenêtre: la veille du neuf n'appartient à personne, et
    -- couper là retirerait au plan d'avant un dîner qu'il sert encore.
    --
    -- ⚠️ LA COUPE NE PEUT PAS VIDER LE PLAN D'AVANT: le refus juste au-dessus
    -- garantit `v_clash.starts_on + v_clash.lead_days < v_eats_from`, donc
    -- `v_trunc_to > v_clash.lead_days`, donc au moins UN jour mangé lui reste.
    -- C'est ce qui tient le CHECK `duration_days - lead_days between 1 and 7`.
    v_trunc_to := (v_eats_from - v_clash.starts_on)::smallint;

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
  --
  -- ⟳ A1 — ET IL SE DÉRIVE DES JOURS MANGÉS. Une fenêtre de deux jours dont
  -- l'un est la veille est un plan D'UN JOUR: la nommer `several_days`
  -- contredirait `daysToFill`, qui n'en porte qu'un, et la consigne envoyée au
  -- modèle dit déjà l'autre chose (`generate-meal-v1`, même dérivation).
  insert into public.student_generated_meals (
    user_id, starts_on, duration_days, lead_days, scope, mode, meal_slot, servings,
    context, preferences, pantry, dishes, preparations, cooking_sessions,
    shopping_list, generated_from, content_locale,
    household_id, member_portions, plan_kind,
    -- LOT 18 — LES QUATRE COMPTEURS DE LA COMPOSITION, ÉCRITS SUR CHAQUE PLAN.
    -- Ils ne vivent PAS dans `generated_from`: ce champ ne sort que pour un
    -- `intent` autre que `draft`, et toute vérification en situation réelle se
    -- fait en `draft`. Un compteur rangé là serait aveugle très exactement
    -- pendant qu'on le regarde.
    composition_unknowns, composition_energy_sources
  )
  values (
    p_user_id,
    p_starts_on,
    p_duration_days,
    v_lead,
    case when p_duration_days - v_lead = 1 then 'day' else 'several_days' end,
    v_mode,
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
    v_kind,
    -- ⚠️ `greatest(0, ...)` EST GARDÉ, ET C'EST VOULU: la colonne porte un
    -- CHECK >= 0, et un appelant qui enverrait -1 ferait ÉCHOUER l'écriture du
    -- plan pour un compteur. Aucun instrument de mesure ne doit pouvoir coûter
    -- un dîner. La garde s'applique à une valeur PRÉSENTE.
    --
    -- ⛔ V0-B-bis — CE QUI CHANGE: l'ABSENCE ne fabrique plus un zéro.
    -- `coalesce(..., 0)` transformait « personne n'a mesuré » en « mesuré, zéro
    -- inconnu » — le mensonge exact que V0-B vient d'effacer sur 180 lignes.
    -- Et `greatest(0, null)` vaut `0` en SQL (greatest IGNORE les null): retirer
    -- le `coalesce` seul n'aurait RIEN changé. Il faut la branche explicite.
    case when p_payload ->> 'composition_unknowns' is null
           then null
           else greatest(0, (p_payload ->> 'composition_unknowns')::int)
    end,
    -- ⛔ V0-B-bis — MÊME GESTE côté parts d'énergie. `-> ` rend déjà SQL NULL
    -- quand la clé est absente; le `nullif` traite le cas restant, un `null`
    -- JSON explicite, que l'appelant envoie maintenant qu'il sait dire
    -- « pas mesuré ». `{}` était indiscernable de « mesuré, aucune source ».
    nullif(p_payload -> 'composition_energy_sources', 'null'::jsonb)
  )
  returning id into v_new_id;

  return query select v_new_id, v_retired, v_trunc_id, v_trunc_from, v_trunc_to;
end;
$function$;

-- ⚠️ Aucun `grant` ici, et c'est voulu: `create or replace function` CONSERVE
-- l'ACL existante. La signature est INCHANGÉE — `lead_days` voyage dans le
-- payload — donc il n'y a ni surcharge ni ACL neuve à poser.
comment on function public.write_student_meal_plan(uuid, text, date, smallint, jsonb, uuid) is
  'Seul point d''écriture d''un plan. A1 (2026-09-03): la fenêtre peut porter '
  'un jour de CUISINE SANS REPAS en tête (`p_payload ->> ''lead_days''`, 0 ou '
  '1). Toutes les comparaisons de chevauchement, la troncature et `scope` '
  'portent sur les jours MANGÉS `[starts_on + lead_days, starts_on + '
  'duration_days)`. La veille du plan N+1 a donc le droit d''être le dernier '
  'jour mangé du plan N. Refus nommés: `bad_lead_days`, `bad_eaten_days`.';

-- ---------------------------------------------------------------------------
-- 5. LE CONTRÔLE — il roule à l'application, et il ne laisse rien
-- ---------------------------------------------------------------------------
-- ⛔ POURQUOI ICI ET PAS DANS UN TEST. Les trois mécanismes (CHECK, exclusion,
-- boucle plpgsql) ne sont vérifiables QUE contre un vrai Postgres, et le lot
-- suivant qui les touchera n'aura pas de raison de rejouer un test Deno. Ce
-- bloc-ci tombe à l'application de la migration, sur la base de celui qui
-- l'applique, avec le message qui dit lequel des trois a cédé.
--
-- ⚠️ IL LAISSE LA BASE EXACTEMENT COMME IL L'A TROUVÉE: un `savepoint` posé
-- avant, un `rollback to savepoint` après, dans les deux issues.
do $ctl$
declare
  v_user uuid := '00000000-0000-4000-8000-00000903a100';
  v_n uuid;
  v_next uuid;
  v_failed text := null;
begin
  -- Un compte porteur. `student_generated_meals.user_id` référence `auth.users`
  -- dans certaines installations et pas dans d'autres; on insère donc l'usager
  -- s'il est référencable, et on abandonne le contrôle sans bruit sinon —
  -- un contrôle qui ne peut pas tourner ne doit pas bloquer une migration.
  begin
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'a1-lead-days-control@example.invalid', now(), now())
    on conflict (id) do nothing;
  exception when others then
    raise notice '[A1] contrôle sauté: auth.users inaccessible (%)', sqlerrm;
    return;
  end;

  -- ── ① SEPT JOURS MANGÉS + UNE VEILLE = UNE FENÊTRE DE HUIT, ACCEPTÉE ──────
  -- C'est le cas que `duration_days between 1 and 7` refusait, et il est la
  -- raison d'être de la paire de CHECK.
  select w.meal_id into v_n
    from public.write_student_meal_plan(
      v_user, 'prepare_next', date '2026-09-06', 8::smallint,
      jsonb_build_object('mode', 'to_shop', 'lead_days', 1)
    ) w;
  if v_n is null then
    v_failed := 'un plan de 7 jours mangés + veille (fenêtre de 8) a été refusé';
  end if;

  -- ── ② LA VEILLE DE N+1 EST LE DERNIER JOUR MANGÉ DE N, ET ÇA PASSE ────────
  -- N mange du 07/09 au 13/09. N+1 cuisine le 13/09 et mange du 14/09 au 20/09.
  -- L'exclusion d'avant ce lot refusait ce plan: sa fenêtre commence le 13/09.
  if v_failed is null then
    begin
      select w.meal_id into v_next
        from public.write_student_meal_plan(
          v_user, 'prepare_next', date '2026-09-13', 8::smallint,
          jsonb_build_object('mode', 'to_shop', 'lead_days', 1)
        ) w;
    exception when others then
      v_failed := 'la veille du plan N+1 sur le dernier jour mangé de N a été '
                  || 'refusée: ' || sqlerrm;
    end;
  end if;

  -- ── ③ UN JOUR **MANGÉ** PARTAGÉ RESTE REFUSÉ ─────────────────────────────
  -- N mange du 07/09 au 13/09. Une fenêtre qui commence à MANGER le 07/09
  -- tombe sur le PREMIER repas de N: c'est le refus ① de la boucle, celui qui
  -- existe pour qu'un plan ne disparaisse pas en silence.
  --
  -- ⚠️ ET PAS « le 13/09 »: mordre le DERNIER jour de N est une TRONCATURE
  -- légitime (D15) — N vient de perdre ce dîner, il en garde six. Prendre ce
  -- cas-là pour un refus est l'erreur que ce commentaire existe pour éviter,
  -- et c'est celle que la première écriture de ce bloc a faite.
  if v_failed is null then
    begin
      perform w.meal_id
        from public.write_student_meal_plan(
          v_user, 'prepare_next', date '2026-09-07', 1::smallint,
          jsonb_build_object('mode', 'to_shop', 'lead_days', 0)
        ) w;
      v_failed := 'deux plans partagent un jour MANGÉ et la base a accepté';
    exception when others then
      if sqlerrm not like '%plan_overlaps_existing%'
         and sqlerrm not like '%live_windows_dont_overlap%'
         and sqlerrm not like '%one_live_eaten_start%' then
        v_failed := 'le refus attendu porte un autre motif: ' || sqlerrm;
      end if;
    end;
  end if;

  -- ── ④ HUIT JOURS **MANGÉS** RESTENT REFUSÉS ──────────────────────────────
  -- La borne de fenêtre passe à 8; celle des jours mangés reste à 7. Enlever le
  -- second CHECK rouvrirait un plan que l'alphabet des jetons ne sait pas
  -- nommer, et c'est exactement ce que ce cas empêche.
  if v_failed is null then
    begin
      perform w.meal_id
        from public.write_student_meal_plan(
          v_user, 'prepare_next', date '2026-10-05', 8::smallint,
          jsonb_build_object('mode', 'to_shop', 'lead_days', 0)
        ) w;
      v_failed := 'huit jours MANGÉS ont été acceptés';
    exception when others then
      if sqlerrm not like '%bad_eaten_days%'
         and sqlerrm not like '%eaten_days_check%' then
        v_failed := 'huit jours mangés refusés pour un autre motif: ' || sqlerrm;
      end if;
    end;
  end if;

  -- ── ⑤ UNE VEILLE DE DEUX JOURS N'EXISTE PAS ──────────────────────────────
  if v_failed is null then
    begin
      perform w.meal_id
        from public.write_student_meal_plan(
          v_user, 'prepare_next', date '2026-10-05', 5::smallint,
          jsonb_build_object('mode', 'to_shop', 'lead_days', 2)
        ) w;
      v_failed := 'une veille de deux jours a été acceptée';
    exception when others then
      if sqlerrm not like '%bad_lead_days%' and sqlerrm not like '%lead_days_check%' then
        v_failed := 'la veille de deux jours refusée pour un autre motif: ' || sqlerrm;
      end if;
    end;
  end if;

  -- ── ⑥ LA BOUCLE COMPARE DES REPAS, PAS DES DÉBUTS DE FENÊTRE ─────────────
  -- ⛔ CE CAS EXISTE PARCE QUE LES CINQ AUTRES NE LE VOYAIENT PAS. Muté — la
  -- condition ① remise à `v_clash.starts_on >= p_starts_on` — le contrôle
  -- restait VERT à 5/5: la boucle plpgsql pouvait donc repartir sur l'ancienne
  -- règle sans que rien ne tombe, exactement le genre de garde désarmée que ce
  -- fichier existe pour empêcher.
  --
  -- LE GESTE RÉEL: un plan A court est en cours (02/11 → 04/11); on compose B
  -- à partir du 03/11 en cuisinant CE SOIR (02/11). La veille de B tombe sur un
  -- jour que A sert encore. Ce n'est pas un refus, c'est la TRONCATURE de D15:
  -- A garde son 02/11, B prend le reste. L'ancienne règle refusait, parce
  -- qu'elle lisait deux DÉBUTS DE FENÊTRE identiques.
  if v_failed is null then
    begin
      perform w.meal_id
        from public.write_student_meal_plan(
          v_user, 'prepare_next', date '2026-11-02', 3::smallint,
          jsonb_build_object('mode', 'to_shop', 'lead_days', 0)
        ) w;
      perform w.meal_id
        from public.write_student_meal_plan(
          v_user, 'prepare_next', date '2026-11-02', 3::smallint,
          jsonb_build_object('mode', 'to_shop', 'lead_days', 1)
        ) w;
    exception when others then
      v_failed := 'la veille de B sur le premier jour de A a été refusée au '
                  || 'lieu de tronquer: ' || sqlerrm;
    end;
    if v_failed is null then
      -- Et A a bien été RACCOURCI, pas laissé entier: la troncature tombe sur
      -- le premier jour MANGÉ de B (03/11), donc A garde exactement un jour.
      if (select duration_days from public.student_generated_meals
           where user_id = v_user and starts_on = date '2026-11-02'
             and lead_days = 0 and retired_at is null) is distinct from 1::smallint then
        v_failed := 'la troncature n''a pas coupé sur le premier jour MANGÉ du neuf';
      end if;
    end if;
  end if;

  -- ── ON NE LAISSE RIEN ────────────────────────────────────────────────────
  delete from public.student_generated_meals where user_id = v_user;
  delete from auth.users where id = v_user;

  if v_failed is not null then
    raise exception '[A1 · contrôle de la veille] %', v_failed;
  end if;
  raise notice '[A1] contrôle: 6/6 — la veille entre dans la fenêtre, le sept porte sur les repas';
end;
$ctl$;

commit;
