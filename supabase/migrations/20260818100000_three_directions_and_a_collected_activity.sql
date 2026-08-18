-- KEEL — TROIS DIRECTIONS, UN NIVEAU D'ACTIVITÉ, ET UN MINEUR QUI PORTE LES TROIS.
--
-- ══════════════════════════════════════════════════════════════════════════
-- ① SIX OBJECTIFS DEVIENNENT TROIS
-- ══════════════════════════════════════════════════════════════════════════
--
-- Décision humaine du 2026-08-18. `tokens.ts` s'était déjà écrit la conclusion
-- sans la tirer, et la phrase est de lui:
--
--   « The axis that actually branches a generated week is the DIRECTION OF THE
--     SCALE: down (fat_loss), up (muscle_gain), or neither. "Neither" then
--     splits by what the student is after instead: recomposition, performance,
--     health, maintenance. »
--
-- Les six valeurs étaient donc un axe à TROIS positions, dont la troisième
-- était découpée en quatre nuances. Et le dépôt avait déjà MESURÉ que ces
-- nuances rendaient la même chose: `household_portions.ts` porte, en
-- commentaire daté, « `health` rendait la chaîne de `maintenance` pendant des
-- semaines sans que rien n'échoue ».
--
--   fat_loss       ─────────────────────►  fat_loss      (la balance descend)
--   muscle_gain    ─────────────────────►  muscle_gain   (la balance monte)
--   maintenance    ─┐
--   recomposition  ─┤
--   performance    ─┼──────────────────►  maintenance   (la balance ne bouge pas)
--   health         ─┘
--
-- ⚠️ LES LIGNES SONT RÉÉCRITES, ET C'EST LE CŒUR DE CETTE MIGRATION.
-- Une valeur retirée d'une énumération sans que les lignes suivent laisse des
-- ORPHELINES, et une orpheline ne se voit pas: elle sort en `undefined` d'un
-- `Record`, ou en « n'atteint personne » d'une portée. La migration du
-- 2026-08-13 avait le droit de ne rien nettoyer parce qu'elle ajoutait une
-- GARDE (« une garde qui dépendrait d'un nettoyage n'est pas une garde »);
-- celle-ci retire un VOCABULAIRE, et un vocabulaire retiré doit emporter ses
-- lignes.
--
-- CE QUI EST RÉÉCRIT, ET COMBIEN (compté sur la base locale au 2026-08-18):
--   student_goals.goal                  45 `health` + 5 `recomposition`
--   household_members.goal               4 `health`
--   coach_doctrine_compilations.goal    12 lignes de CACHE — voir plus bas
--   coach_doctrines.beliefs[].goal_scope 6 `recomposition`
--   coach_doctrines.arbitrations[]       1 `health`
--   coach_food_rules.goal_scope          0
--   coach_timing_rules.goal_scope        0
--
-- ⚠️ LE CACHE DE DOCTRINE EST PURGÉ, PAS TRADUIT. `coach_doctrine_compilations`
-- porte une ligne par VARIANTE (`default` + un par objectif). Traduire les
-- quatre variantes de la troisième position les ferait entrer en collision sur
-- leur clé unique, et surtout: le TEXTE compilé d'une variante `health` a été
-- produit par un compilateur qui connaissait six portées. Le recompiler est le
-- seul geste juste, et il se fait tout seul à la première lecture — le cache
-- se remplit à la demande. Une ligne de cache réécrite raconterait la doctrine
-- d'hier sous le nom d'aujourd'hui, ce qui est très exactement l'échec que
-- `doctrine_versions` existe pour empêcher.
--
-- ⚠️ CE QUI N'EST **PAS** TOUCHÉ, ET IL FAUT LE DIRE:
--   · `student_weight_divergence_episodes.goal_direction` porte `up`/`down`,
--     un AUTRE vocabulaire, qui décrivait déjà la balance et pas la nuance.
--     Il n'a jamais eu six valeurs; le repli le rejoint plutôt qu'il ne le
--     change.
--   · La liste de termes interdits À VOIX HAUTE (`household_portions.ts`,
--     règles `portion.goal`) GARDE ses six jetons. Ce n'est pas une
--     énumération de vocabulaire, c'est une purge-list: `recomposition`,
--     `performance` et `health` restent des mots qu'on ne prononce pas à
--     table, et les retirer d'une liste d'interdits SERAIT le bug (cicatrice
--     « références legacy qui doivent survivre »).
--
-- ══════════════════════════════════════════════════════════════════════════
-- ② LE NIVEAU D'ACTIVITÉ — LA COLONNE QUI MANQUAIT
-- ══════════════════════════════════════════════════════════════════════════
--
-- `energy_target.ts` sert une fourchette de 28 à 33 kcal/kg, et son en-tête
-- dit pourquoi, mot pour mot: « rien ne collecte le niveau d'activité », donc
-- multiplier un métabolisme de base par une constante devinée « produit une
-- cible fausse avec l'aplomb d'un tableau ». La constante devinée existe et
-- porte un nom: `ACTIVITY_FACTOR = 1.5` dans `meal_envelope.ts`.
--
-- Quatre crans, jamais un nombre demandé à la personne. `null` reste une
-- réponse — « on ne sait pas » — et rend exactement le comportement d'avant.
-- C'est pourquoi la colonne est NULLABLE et SANS DÉFAUT: un défaut ferait
-- d'une non-réponse une réponse, et cette réponse pèserait ensuite dans un
-- calcul d'énergie.
--
-- Deux tables, parce qu'il y a deux sortes de bouches:
--   `profiles.activity_level`               — qui a un compte
--   `household_member_bodies.activity_level` — qui n'en a pas
-- Elle vit avec `height_cm` et `gender` des deux côtés, c'est-à-dire avec ce
-- qui sert déjà l'équation, et pas dans une table de plus.
--
-- ══════════════════════════════════════════════════════════════════════════
-- ③ ⚠️ LE RENVERSEMENT — UN MINEUR PORTE LES TROIS OBJECTIFS
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── CE QUE CETTE MIGRATION RENVERSE, ET AVEC QUELLE AUTORITÉ ───────────────
-- `20260813180000_minor_may_carry_a_direction.sql` a ouvert la direction à un
-- mineur en gardant deux refus à l'écriture, sur les deux portes RPC:
--
--   « `fat_loss` et `recomposition`. Ce sont les deux directions du registre
--     qui RETIRE — celui qui parle de silhouette et de poids. […] elles
--     restent refusées À L'ÉCRITURE: le mot "inconstructible" de l'encadré est
--     tenu là où il était déjà tenu. »
--
-- Décision humaine du 2026-08-18: **un mineur porte les trois objectifs,
-- exactement comme un majeur.** Les deux portes s'ouvrent. Une garde levée sur
-- une seule laisserait l'autre fermée, et c'est toujours celle qu'on n'a pas
-- regardée qui sert — la migration du 13/08 le disait déjà de ses deux portes,
-- et la phrase vaut dans les deux sens.
--
-- ── LE DÉFAUT RÉEL CORRIGÉ DANS LE MÊME GESTE ─────────────────────────────
-- La migration du 13/08 était **livrée à moitié**. Elle autorisait `muscle_gain`
-- sur un mineur en base; le moteur, lui, écrasait TOUJOURS la direction d'un
-- mineur:
--
--   -- household_portions.ts :: servingDirectionFor()
--   if (member.ageState === "minor") return CHILD_DIRECTION;   // avant toute
--                                                              // lecture du but
--
-- On pouvait donc poser « prendre du muscle » sur un ado, la ligne s'écrivait,
-- l'écran l'affichait, et rien ne changeait dans l'assiette. **La décision
-- était en base, le comportement n'a jamais suivi** — et aucun test ne le
-- trouvait, parce que rien n'échouait. `CHILD_DIRECTION` devient le repli d'un
-- mineur SANS objectif.
--
-- ── ⚠️ CE QUI PROTÈGE À LA PLACE, ET C'EST LA MOITIÉ QUI COMPTE ────────────
-- La raison écrite le 13/08 n'a JAMAIS été « pas de direction ». Elle a
-- toujours été « pas de direction qui fasse d'un enfant une cible de poids »
-- (PIVOT-FOYER §8.4: « le registre est éducatif — jamais CORRECTIF SUR LE
-- CORPS »). Trois choses tiennent cette phrase après l'ouverture, et aucune
-- n'est un refus d'objectif:
--
--   1. L'ÉNERGIE RESTE FERMÉE. `childEnvelopeFromBody` (`meal_envelope.ts`) ne
--      prend pas de paramètre `goal` — ce n'est pas un `if` qu'on pourrait
--      oublier de rejouer, c'est un paramètre qui n'existe pas. Un mineur
--      reste en MAINTENANCE calculée sur son âge (Schofield par tranche
--      pédiatrique, FAO/WHO/UNU), quoi qu'il y ait dans sa colonne. Une
--      direction est une consigne de service; une bande d'énergie est un
--      déficit. On ouvre la première, jamais la seconde.
--
--   2. LE PLAFOND DU RYTHME EST CALCULÉ SUR SON ÂGE. `weight_pace.ts` borne
--      l'écart quotidien d'un mineur à 10 % de SON besoin estimé, au lieu du
--      plafond de 500 kcal de l'adulte — soit environ 0,16 kg/semaine sur un
--      enfant dont le besoin est estimé à 1 800 kcal. Un déficit chez
--      quelqu'un en croissance ne se borne pas comme chez un adulte, et un
--      plancher fixe serait aveugle à l'âge dans les deux sens.
--
--   3. LE CORPS D'UN ENFANT N'EST JAMAIS ÉNONCÉ. FF-047: ni taille ni pesée à
--      côté de son prénom, dans le prompt comme à table. On calcule avec, on
--      ne le dit pas. Sans ce silence, la direction d'un enfant deviendrait
--      DÉRIVABLE par n'importe qui à table — et c'est le dégât exact que §8.4
--      nomme. Cette garde-là ne bouge pas d'un millimètre.
--
-- ── ⚠️ CE QUI RESTE OUVERT, ET QUI N'EST PAS TRANCHÉ ICI ──────────────────
-- Faut-il, EN PLUS, un accord explicite du maître pour poser « perdre du
-- poids » sur un enfant — une seconde main sur le geste, distincte du fait de
-- pouvoir l'écrire ? La question est posée et volontairement NON implémentée:
-- l'inventer seul poserait une porte de consentement dont personne n'aurait
-- décidé la forme, et une porte de consentement mal posée est pire qu'aucune.
--
-- ── L'ÂGE EST RELU À CHAQUE APPEL, ET ÇA NE CHANGE PAS ────────────────────
-- `keel_age_state` reste la seule borne des dix-huit ans du dépôt. Ce qui
-- change est ce qu'on en FAIT: plus aucun refus n'en dépend côté objectif. La
-- LECTURE (`goalApplies`) continue de refuser toute direction à un âge
-- INCONNU — « je ne sais pas » et « c'est un enfant » ne sont pas la même
-- phrase, et c'est la seule asymétrie qui survit.

begin;

-- ══════════════════════════════════════════════════════════════════════════
-- ① LES LIGNES D'ABORD, LES CONTRAINTES ENSUITE
-- ══════════════════════════════════════════════════════════════════════════
--
-- L'ordre n'est pas négociable: resserrer un CHECK avant d'avoir replié les
-- lignes ferait échouer la migration sur la première ligne `health`, et une
-- migration qui échoue au milieu laisse la moitié du repli en place.

update public.student_goals
   set goal = 'maintenance'
 where goal in ('recomposition', 'performance', 'health');

update public.household_members
   set goal = 'maintenance'
 where goal in ('recomposition', 'performance', 'health');

-- Les portées de doctrine, dans le jsonb. `distinct` parce que deux nuances
-- repliées sur la même valeur produiraient un doublon dans la portée, et une
-- portée qui contient deux fois `maintenance` n'est pas fausse mais elle est
-- illisible à l'écran du coach.
create or replace function public.keel_fold_goal_scope(p_scope jsonb)
returns jsonb
language sql
immutable
set search_path to ''
as $function$
  select coalesce(
    (
      select jsonb_agg(distinct folded)
      from jsonb_array_elements_text(p_scope) as raw,
      lateral (
        select case raw
          when 'recomposition' then 'maintenance'
          when 'performance' then 'maintenance'
          when 'health' then 'maintenance'
          else raw
        end
      ) as f(folded)
    ),
    '[]'::jsonb
  );
$function$;

comment on function public.keel_fold_goal_scope(jsonb) is
  'Repli 2026-08-18 des six objectifs vers trois, appliqué à une portée jsonb. '
  'Existe pour que le repli des convictions et celui des arbitrages soient LE '
  'MÊME code: deux boucles jsonb écrites à côté l''une de l''autre divergent, '
  'et c''est celle qu''on relit le moins qui garde l''ancien vocabulaire.';

update public.coach_doctrines d
   set beliefs = (
         select coalesce(jsonb_agg(
           case when e ? 'goal_scope'
                then jsonb_set(e, '{goal_scope}', public.keel_fold_goal_scope(e->'goal_scope'))
                else e end
           order by ord
         ), '[]'::jsonb)
         from jsonb_array_elements(coalesce(d.beliefs, '[]'::jsonb))
              with ordinality as t(e, ord)
       ),
       arbitrations = (
         select coalesce(jsonb_agg(
           case when e ? 'goal_scope'
                then jsonb_set(e, '{goal_scope}', public.keel_fold_goal_scope(e->'goal_scope'))
                else e end
           order by ord
         ), '[]'::jsonb)
         from jsonb_array_elements(coalesce(d.arbitrations, '[]'::jsonb))
              with ordinality as t(e, ord)
       )
 where exists (
   select 1
   from jsonb_array_elements(
          coalesce(d.beliefs, '[]'::jsonb) || coalesce(d.arbitrations, '[]'::jsonb)
        ) as e,
        jsonb_array_elements_text(coalesce(e->'goal_scope', '[]'::jsonb)) as g
   where g in ('recomposition', 'performance', 'health')
 );

-- ⚠️ L'ORDRE DES ENTRÉES EST PRÉSERVÉ (`with ordinality`). Une doctrine est un
-- texte que le coach a rangé; un `jsonb_agg` sans ordre le remettrait dans
-- l'ordre du stockage, et le coach retrouverait ses convictions mélangées sans
-- avoir rien fait.

-- Les portées des règles du coach, en `text[]`.
update public.coach_food_rules
   set goal_scope = (
         select coalesce(array_agg(distinct
           case g when 'recomposition' then 'maintenance'
                  when 'performance' then 'maintenance'
                  when 'health' then 'maintenance'
                  else g end
         ), '{}'::text[])
         from unnest(goal_scope) as g
       )
 where goal_scope && array['recomposition', 'performance', 'health']::text[];

update public.coach_timing_rules
   set goal_scope = (
         select coalesce(array_agg(distinct
           case g when 'recomposition' then 'maintenance'
                  when 'performance' then 'maintenance'
                  when 'health' then 'maintenance'
                  else g end
         ), '{}'::text[])
         from unnest(goal_scope) as g
       )
 where goal_scope && array['recomposition', 'performance', 'health']::text[];

-- LE CACHE, PURGÉ. Voir l'en-tête: une compilation est le produit d'un
-- compilateur qui connaissait six portées, et la recompiler est le seul geste
-- juste. Elle se refait à la première lecture.
delete from public.coach_doctrine_compilations;

-- ── LES CONTRAINTES, MAINTENANT QUE PLUS RIEN NE LES VIOLE ────────────────

alter table public.student_goals
  drop constraint if exists student_goals_goal_check;
alter table public.student_goals
  add constraint student_goals_goal_check
  check (goal = any (array['fat_loss'::text, 'maintenance'::text, 'muscle_gain'::text]));

alter table public.household_members
  drop constraint if exists household_members_goal_check;
alter table public.household_members
  add constraint household_members_goal_check
  check (goal is null or goal = any (array['fat_loss'::text, 'maintenance'::text, 'muscle_gain'::text]));

-- ⚠️ `focus_axis` ÉTAIT ADOSSÉ À DEUX VALEURS QUI N'EXISTENT PLUS.
-- Le CHECK disait `focus_axis is null or goal in ('health','performance')`, et
-- le commentaire de colonne le justifiait: « l'objectif des dynamiques sans
-- cible chiffrée ». Les deux se replient sur `maintenance`, qui EST désormais
-- la dynamique sans cible chiffrée — c'est la même intention, sous le seul nom
-- qui reste. Laisser le CHECK tel quel rendrait la colonne inécrivable pour
-- tout le monde, en silence: aucun `goal` ne pourrait plus le satisfaire.
alter table public.student_goals
  drop constraint if exists student_goals_focus_axis_goal_check;
alter table public.student_goals
  add constraint student_goals_focus_axis_goal_check
  check (focus_axis is null or goal = 'maintenance'::text);

-- ⚠️ ET `target_waist_cm` PAREIL. Il était réservé à `recomposition` — « c'est
-- la mesure qui porte cet objectif, le poids y est constant par définition ».
-- La phrase décrit exactement `maintenance` après le repli.
alter table public.student_goals
  drop constraint if exists student_goals_target_waist_goal_check;
alter table public.student_goals
  add constraint student_goals_target_waist_goal_check
  check (target_waist_cm is null or goal = 'maintenance'::text);

-- `student_goals_target_weight_goal_check` autorisait déjà EXACTEMENT
-- fat_loss/muscle_gain/maintenance. Il n'est pas touché, et c'est un signe:
-- la colonne du poids visé avait déjà été écrite contre les trois positions de
-- la balance, avant même qu'on décide de n'en garder que trois.

alter table public.coach_food_rules
  drop constraint if exists coach_food_rules_goal_scope_check;
alter table public.coach_food_rules
  add constraint coach_food_rules_goal_scope_check
  check (goal_scope <@ array['fat_loss'::text, 'maintenance'::text, 'muscle_gain'::text]);

alter table public.coach_timing_rules
  drop constraint if exists coach_timing_rules_goal_scope_check;
alter table public.coach_timing_rules
  add constraint coach_timing_rules_goal_scope_check
  check (goal_scope <@ array['fat_loss'::text, 'maintenance'::text, 'muscle_gain'::text]);

alter table public.coach_doctrine_compilations
  drop constraint if exists coach_doctrine_compilations_goal_check;
alter table public.coach_doctrine_compilations
  add constraint coach_doctrine_compilations_goal_check
  check (goal = any (array['default'::text, 'fat_loss'::text, 'maintenance'::text, 'muscle_gain'::text]));

create or replace function public.keel_doctrine_goal_scope_ok(entries jsonb)
 returns boolean
 language sql
 immutable
 set search_path to ''
as $function$
  select not exists (
    select 1
    from jsonb_array_elements(coalesce(entries, '[]'::jsonb)) as e
    where jsonb_typeof(e) = 'object'
      and e ? 'goal_scope'
      and (
        jsonb_typeof(e->'goal_scope') <> 'array'
        or exists (
          select 1
          from jsonb_array_elements_text(e->'goal_scope') as g
          where g not in ('fat_loss', 'maintenance', 'muscle_gain')
        )
      )
  );
$function$;

comment on function public.keel_doctrine_goal_scope_ok(jsonb) is
  'Lot doctrine-by-goal: chaque entrée de beliefs/arbitrations peut porter un '
  'goal_scope, qui doit être un tableau de goals connus. Absent = global. '
  '2026-08-05: vocabulaire élargi à muscle_gain. 2026-08-18: vocabulaire '
  'RESSERRÉ à trois — recomposition, performance et health se replient sur '
  'maintenance (`keel_fold_goal_scope`), et les lignes ont été réécrites dans '
  'la même migration: un CHECK resserré sur des lignes non repliées les rend '
  'inéditables, ce qui est une panne muette pour le coach.';

-- ══════════════════════════════════════════════════════════════════════════
-- ② LE NIVEAU D'ACTIVITÉ
-- ══════════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists activity_level text;

alter table public.profiles
  drop constraint if exists profiles_activity_level_check;
alter table public.profiles
  add constraint profiles_activity_level_check
  check (
    activity_level is null
    or activity_level = any (array[
      'sedentary'::text, 'on_feet'::text, 'trains_some'::text, 'trains_hard'::text
    ])
  );

comment on column public.profiles.activity_level is
  'Le niveau d''activité DÉCLARÉ, en quatre crans lisibles — jamais un nombre '
  'demandé à la personne (un nombre demandé est un nombre inventé, et '
  'l''inventé entre ensuite dans un calcul avec l''autorité d''une mesure). '
  'NULL = personne n''a répondu, et rend exactement le comportement d''avant '
  'le 2026-08-18: facteur 1,5 dans `meal_envelope.ts`, fourchette 28-33 kcal/kg '
  'dans `energy_target.ts`. PAS DE DÉFAUT: un défaut ferait d''une non-réponse '
  'une réponse, et cette réponse pèserait dans une estimation d''énergie.';

alter table public.household_member_bodies
  add column if not exists activity_level text;

alter table public.household_member_bodies
  drop constraint if exists household_member_bodies_activity_level_check;
alter table public.household_member_bodies
  add constraint household_member_bodies_activity_level_check
  check (
    activity_level is null
    or activity_level = any (array[
      'sedentary'::text, 'on_feet'::text, 'trains_some'::text, 'trains_hard'::text
    ])
  );

comment on column public.household_member_bodies.activity_level is
  'Même vocabulaire et même NULL que `profiles.activity_level`, pour une '
  'bouche SANS COMPTE. ⚠️ Sur un MINEUR il ne peut que FAIRE MONTER le besoin '
  'estimé, jamais le faire descendre (`childActivityFactor`): la case est '
  'cochée par le compte maître, et laisser « assis toute la journée » retirer '
  '9 % du besoin d''un corps en croissance sur la foi d''une case cochée par '
  'quelqu''un d''autre est la direction d''erreur qu''on refuse.';

-- ⚠️ LE LECTEUR DES CORPS DU FOYER DOIT RENDRE LA COLONNE, SINON ELLE EST
-- MORTE. `keel_household_bodies_for` est le SEUL chemin par lequel le corps
-- d'une bouche sans compte atteint le moteur; une colonne ajoutée sans être
-- ajoutée à cette signature est une collecte qu'on affiche et que personne ne
-- lit — c'est-à-dire un champ décoratif, et un champ décoratif fait croire que
-- le produit tient compte de quelque chose dont il ne tient pas compte.
--
-- `drop` puis `create`: changer le TYPE DE RETOUR d'une fonction SQL n'est pas
-- permis par `create or replace`.
drop function if exists public.keel_household_bodies_for(uuid);

create function public.keel_household_bodies_for(p_household uuid)
returns table(
  member_id uuid,
  height_cm numeric,
  weight_kg numeric,
  gender text,
  age_years integer,
  activity_level text
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    hm.member_id,
    b.height_cm,
    b.weight_kg,
    b.gender,
    case
      when public.keel_household_member_birth_date(hm.member_id) is null then null
      else extract(
        year from age(
          current_date,
          public.keel_household_member_birth_date(hm.member_id)
        )
      )::integer
    end as age_years,
    b.activity_level
  from public.household_members hm
  left join public.household_member_bodies b on b.member_id = hm.member_id
  -- Un `p_household` nul rend zéro ligne: `= null` n'est jamais vrai.
  where hm.household_id = p_household;
$function$;

comment on function public.keel_household_bodies_for(uuid) is
  'Les corps des bouches d''un foyer, âge RECALCULÉ à chaque appel. Depuis le '
  '2026-08-18 elle rend aussi `activity_level`: sans lui, la colonne collectée '
  'à l''écran n''atteindrait jamais l''équation qui la justifie.';

revoke all on function public.keel_household_bodies_for(uuid) from public;
grant execute on function public.keel_household_bodies_for(uuid) to authenticated;
grant execute on function public.keel_household_bodies_for(uuid) to service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- ③ LE RYTHME ET LE POIDS VISÉ D'UNE BOUCHE SANS COMPTE
-- ══════════════════════════════════════════════════════════════════════════
--
-- `student_goals` porte déjà `target_weight_kg` pour qui a un compte. Une
-- bouche sans compte n'a pas de `student_goals`: sa direction vit sur
-- `household_members.goal`, et sa cible doit vivre à côté.
--
-- ⚠️ LE RYTHME EST UNE COLONNE, PAS UNE DÉRIVATION. On pourrait le recalculer
-- du poids visé et d'une date; on ne le fait pas, parce que c'est la personne
-- qui règle le curseur et que la DATE d'arrivée se déduit du rythme, jamais
-- l'inverse. Ranger la date et deviner le rythme inverserait ce qui est
-- déclaré et ce qui est calculé.

alter table public.household_members
  add column if not exists target_weight_kg numeric;
alter table public.household_members
  add column if not exists target_pace_kg_per_week numeric;

alter table public.household_members
  drop constraint if exists household_members_target_weight_range_check;
alter table public.household_members
  add constraint household_members_target_weight_range_check
  check (target_weight_kg is null or (target_weight_kg >= 25 and target_weight_kg <= 400));

-- LE PLAFOND ABSOLU EN BASE, ET PAS SEULEMENT AU SLIDER. « Une limite d'UI
-- n'est pas une limite »: elle doit tenir face à un appel direct. Le plafond
-- ADAPTÉ à la personne (le plus petit des trois nombres de `weight_pace.ts`)
-- ne peut pas s'écrire ici — il dépend d'un corps que ce CHECK ne peut pas
-- lire. Celui-ci est donc la borne GROSSIÈRE, et il ne dispense pas de
-- l'autre: c'est `paceCeilingFor` qui décide du cran affiché.
alter table public.household_members
  drop constraint if exists household_members_target_pace_range_check;
alter table public.household_members
  add constraint household_members_target_pace_range_check
  check (target_pace_kg_per_week is null or (target_pace_kg_per_week > 0 and target_pace_kg_per_week <= 1));

-- UNE CIBLE SANS DIRECTION N'A PAS DE SENS, ET UNE DIRECTION `maintenance` NON
-- PLUS: la balance ne bouge pas, donc il n'y a ni cible ni rythme à régler.
-- Même règle que `student_goals_target_weight_goal_check`, moins la
-- maintenance — qui, elle, garde une cible de RÉFÉRENCE côté compte (centre
-- d'une bande) parce que le point hebdo s'en sert. Une bouche sans compte n'a
-- pas de point hebdo.
alter table public.household_members
  drop constraint if exists household_members_target_needs_direction_check;
alter table public.household_members
  add constraint household_members_target_needs_direction_check
  check (
    (target_weight_kg is null and target_pace_kg_per_week is null)
    or goal in ('fat_loss', 'muscle_gain')
  );

comment on column public.household_members.target_weight_kg is
  'Le poids visé d''une bouche SANS COMPTE, DÉCLARÉ — jamais dérivé. '
  'N''existe que pour `fat_loss` et `muscle_gain`: sur `maintenance` la '
  'balance ne bouge pas, et sur une bouche sans direction il n''y a rien à '
  'viser. Le refus d''une cible sous le plancher d''énergie est NOMMÉ et vit '
  'dans `weight_pace.ts` (`below_energy_floor`), pas ici: il demande un corps '
  'qu''un CHECK ne peut pas lire.';

comment on column public.household_members.target_pace_kg_per_week is
  'Le rythme RÉGLÉ au curseur, en kg/semaine. Le plafond ici est la borne '
  'grossière (1 kg, décision du 2026-08-18); le plafond RÉEL est le plus petit '
  'de trois nombres et se calcule sur le corps (`paceCeilingFor`). Un mineur y '
  'est borné sur SON besoin estimé — c''est ce qui ouvre l''objectif sans '
  'ouvrir le régime.';

-- ══════════════════════════════════════════════════════════════════════════
-- ④ LES DEUX PORTES DU MINEUR S'OUVRENT — ET LE VOCABULAIRE SE RESSERRE
-- ══════════════════════════════════════════════════════════════════════════

create or replace function public.keel_household_set_member_goal(p_member uuid, p_goal text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_household uuid;
  v_role text;
  v_target record;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  -- TROIS VALEURS DEPUIS LE 2026-08-18. Un client plus vieux qui enverrait
  -- encore `health` reçoit `bad_goal` — un refus NOMMÉ, jamais un repli muet:
  -- replier ici écrirait `maintenance` sur quelqu'un qui a cliqué « santé »
  -- sans que personne le lui dise. Le repli est le geste d'UNE migration, pas
  -- celui d'une porte d'écriture.
  if p_goal is not null and p_goal not in ('fat_loss', 'maintenance', 'muscle_gain') then
    return jsonb_build_object('ok', false, 'reason', 'bad_goal');
  end if;

  select hm.household_id, hm.role into v_household, v_role
  from public.household_members hm
  where hm.user_id = v_user;

  if v_household is null then
    return jsonb_build_object('ok', false, 'reason', 'no_household');
  end if;

  select hm.member_id, hm.user_id into v_target
  from public.household_members hm
  where hm.member_id = p_member and hm.household_id = v_household;

  if v_target.member_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;

  -- L'ORDRE DES DEUX REFUS EST LA RÈGLE. `not_your_line` d'abord: un secondaire
  -- qui vise la ligne d'un enfant doit s'entendre dire qu'il n'est pas chez lui,
  -- pas qu'il faudrait passer par un « about you » que l'enfant n'a pas.
  if v_role <> 'owner' and v_target.user_id is distinct from v_user then
    return jsonb_build_object('ok', false, 'reason', 'not_your_line');
  end if;

  -- D1. La bouche a un compte: son objectif vit dans SON « about you ».
  if v_target.user_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'has_account');
  end if;

  -- ⚠️ IL N'Y A PLUS DE REFUS D'ÂGE ICI, ET C'EST LE RENVERSEMENT DU
  -- 2026-08-18. `goal_not_for_minor` a existé du 13/08 au 18/08 et refusait
  -- `fat_loss` et `recomposition` à un mineur. Ce qui protège désormais est
  -- ailleurs, et l'en-tête de cette migration le nomme en trois points:
  -- l'énergie d'un mineur reste une maintenance calculée sur son âge, le
  -- plafond de son rythme est calculé sur son besoin, et son corps n'est
  -- jamais énoncé. Ne pas remettre un refus ici sans renverser ces trois-là
  -- d'abord: ce sont eux qui portent la règle, pas cette porte.
  --
  -- ⚠️ ET `keel_household_add_member` A LA MÊME OUVERTURE. Les deux écrivent la
  -- même colonne; une garde levée sur une seule laisserait l'autre fermée, et
  -- c'est toujours celle qu'on n'a pas regardée qui sert.

  update public.household_members
     set goal = p_goal
   where member_id = p_member;

  return jsonb_build_object('ok', true);
end;
$function$;

create or replace function public.keel_household_add_member(p_first_name text, p_birth_date date default null::date, p_goal text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_household uuid;
  v_role text;
  v_first text := btrim(coalesce(p_first_name, ''));
  v_count integer;
  v_member uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select hm.household_id, hm.role into v_household, v_role
  from public.household_members hm
  where hm.user_id = v_user;

  if v_household is null then
    return jsonb_build_object('ok', false, 'reason', 'no_household');
  end if;
  if v_role <> 'owner' then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;
  if char_length(v_first) < 1 or char_length(v_first) > 40 then
    return jsonb_build_object('ok', false, 'reason', 'bad_first_name');
  end if;
  if p_goal is not null and p_goal not in ('fat_loss', 'maintenance', 'muscle_gain') then
    return jsonb_build_object('ok', false, 'reason', 'bad_goal');
  end if;
  if p_birth_date is not null and p_birth_date > current_date then
    return jsonb_build_object('ok', false, 'reason', 'bad_birth_date');
  end if;

  -- ⚠️ PLUS DE `goal_not_for_minor` ICI NON PLUS — voir
  -- `keel_household_set_member_goal` et l'en-tête. Les deux portes s'ouvrent
  -- dans le MÊME commit, exprès.

  -- LE PLAFOND, EN BASE ET PAS À L'ÉCRAN (lot 7). « Une limite d'UI n'est pas
  -- une limite »: il doit tenir face à un appel direct de la RPC. Il compte les
  -- BOUCHES — toutes, comptes ou pas — et n'a rien à voir avec ce qui est
  -- facturé (section 3).
  select count(*) into v_count
  from public.household_members hm
  where hm.household_id = v_household;

  if v_count >= public.keel_household_max_mouths() then
    return jsonb_build_object('ok', false, 'reason', 'household_full');
  end if;

  insert into public.household_members
    (household_id, user_id, role, first_name, birth_date, goal)
  values
    (v_household, null, 'member', v_first, p_birth_date, p_goal)
  returning member_id into v_member;

  return jsonb_build_object('ok', true, 'member_id', v_member);
end;
$function$;

comment on function public.keel_household_set_member_goal(uuid, text) is
  'Pose la direction nutritionnelle d''une bouche SANS COMPTE. Le maître écrit '
  'celle de n''importe laquelle de son foyer; une bouche qui a réclamé son '
  'profil passe par son « about you » (refus `has_account`). Depuis le '
  '2026-08-18 un MINEUR porte LES TROIS directions, exactement comme un '
  'majeur: le refus `goal_not_for_minor` du 2026-08-13 est LEVÉ, sur cette '
  'porte et sur `keel_household_add_member`. Ce qui protège à la place n''est '
  'plus un refus d''écriture — c''est que l''énergie d''un mineur reste une '
  'maintenance calculée sur son âge, que le plafond de son rythme se calcule '
  'sur son besoin, et que son corps n''est jamais énoncé (FF-047). Le '
  'vocabulaire est passé à trois valeurs; un jeton retiré est refusé '
  '`bad_goal`, jamais replié en silence.';

comment on function public.keel_household_add_member(text, date, text) is
  'Ajoute une bouche SANS COMPTE au foyer du maître. Refuse `not_owner`, '
  '`household_full` (plafond en base), `bad_first_name`, `bad_birth_date` et '
  '`bad_goal`. ⚠️ `goal_not_for_minor` N''EXISTE PLUS depuis le 2026-08-18 — '
  'même renversement que `keel_household_set_member_goal`, dans le même '
  'commit, parce que deux portes qui écrivent la même colonne ne peuvent pas '
  'porter deux règles.';

commit;
