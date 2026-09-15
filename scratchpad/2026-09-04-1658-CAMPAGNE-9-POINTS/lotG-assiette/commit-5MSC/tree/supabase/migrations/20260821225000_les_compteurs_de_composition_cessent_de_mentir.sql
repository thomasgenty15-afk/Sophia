-- ============================================================================
-- V0-B · LES COMPTEURS DE COMPOSITION CESSENT DE MENTIR
--
-- Plan: scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md — fiche `V0-B`
-- Amont: 20260821030000_le_sas_des_aliments_inconnus.sql (lot 18)
--
-- CE QUE CETTE MIGRATION RÉPARE
-- -----------------------------
-- Le lot 18 a ajouté `composition_unknowns` et `composition_energy_sources` à
-- `student_generated_meals` avec `not null default 0` / `not null default '{}'`.
-- Les 180 plans qui existaient déjà ont donc reçu la valeur PAR DÉFAUT — pas une
-- mesure. Mesuré le 2026-08-21 à 22:41 CEST, avant cette migration:
--
--   composition_energy_sources | composition_unknowns | count
--   ---------------------------+----------------------+-------
--   {}                         |                    0 |   180
--
-- Une seule ligne. Aucun de ces 180 plans n'est passé par `composition_fill.ts`
-- — le module est arrivé APRÈS eux (plan le plus récent: 2026-08-19 10:18 UTC).
-- Et `composition_fill_weekly` lisait ces zéros comme des mesures: SIX semaines
-- à `unknowns_median = 0`, c'est-à-dire un sans-faute parfait sur une population
-- que le sas n'a jamais regardée.
--
-- ⛔ C'est le mode d'échec que ce dépôt paie le plus souvent, et il porte un nom
-- écrit: « un lot désarmé ressemble à un lot qui marche ». Le rapport du lot 18
-- annonçait ce symptôme comme un risque FUTUR sans voir qu'il était déjà là.
--
-- LA DIRECTION, ÉCRITE AVANT D'AVOIR VU LE RÉSULTAT
-- --------------------------------------------------
-- La vue passe de « 6 semaines à médiane 0 » à AUCUNE LIGNE.
-- ⛔ UN TABLEAU DE BORD VIDE EST LE BON RÉSULTAT. Il redeviendra plein au
-- premier plan réellement mesuré (`V0-D`), et ce qu'il montrera alors sera vrai.
--
-- ⟳ CE QUE LA FICHE `V0-B` NE DISAIT PAS, ET QUI A ÉTÉ MESURÉ ICI
-- ----------------------------------------------------------------
-- ① Les deux colonnes ne sont pas seulement `default`, elles sont **`not null`**
--    (`pg_attribute.attnotnull = t` sur les deux). `drop default` seul ne suffit
--    donc pas: l'`update … = null` échouerait sur la contrainte de non-nullité.
--    `drop not null` est ajouté ci-dessous — c'est ce qui rend la colonne capable
--    de dire « personne n'a mesuré », qui est une information différente de zéro.
--
-- ② La vue `composition_fill_weekly` n'a **jamais** porté `security_invoker`:
--    `select reloptions from pg_class where relname='composition_fill_weekly'`
--    rendait **vide** AVANT cette migration. La cicatrice du dépôt
--    (« `create or replace view` perd `security_invoker` ») s'applique quand même,
--    mais dans l'autre sens: il n'y a rien à REPOSER, ce lot le POSE pour la
--    première fois. Le `alter view … set` plus bas est donc un durcissement, pas
--    une restauration.
--
-- ③ Le trigger `student_generated_meals_set_updated_at` écrit `now()` sur CHAQUE
--    update, sans condition. Un `update … set … = null` nu récrirait donc
--    `updated_at` sur les 180 lignes — dont **152 portent un `updated_at`
--    distinct de `created_at`**, c'est-à-dire une information réelle (un plan
--    tronqué, retiré, remplacé). Et `updated_at` **sort dans l'export RGPD**
--    (`account-export-v1`, `SCOPE.studentGeneratedMeals`). Écraser 152 dates de
--    dernière modification pour repartir une colonne de compteur serait une perte
--    irréversible, hors du périmètre de ce lot. Le trigger est donc désactivé
--    autour du seul `update`, et remis juste après, dans la même transaction.
--
-- CE QUE CETTE MIGRATION NE CRÉE PAS
-- ----------------------------------
-- Aucune table, aucune fonction, aucun type. La vue est REMPLACÉE, pas créée:
-- `create or replace view` conserve son ACL. Le `revoke` de la fin est donc
-- redondant — il est écrit quand même, parce que la règle du plan (« toute
-- surface, `revoke all … from anon, authenticated` dans la même migration ») ne
-- coûte rien à tenir et qu'un lecteur ne devrait pas avoir à aller vérifier
-- ailleurs que la vue reste fermée.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) LES DEUX COLONNES PEUVENT ENFIN DIRE « PERSONNE N'A MESURÉ »
-- ---------------------------------------------------------------------------
--
-- `drop default`   — une ligne écrite sans compteur ne reçoit plus un zéro qui
--                    ressemble à un succès.
-- `drop not null`  — et elle a le droit de ne rien porter du tout.
--
-- ⚠️ Le CHECK `composition_unknowns >= 0` est laissé EN PLACE et n'a pas besoin
-- d'être touché: en SQL, `null >= 0` vaut `null`, et un CHECK qui vaut `null`
-- est satisfait. La garde continue de refuser -1 et accepte l'absence.
alter table public.student_generated_meals
  alter column composition_unknowns drop default,
  alter column composition_unknowns drop not null,
  alter column composition_energy_sources drop default,
  alter column composition_energy_sources drop not null;

comment on column public.student_generated_meals.composition_unknowns is
  'LOT 18 compteur ④ — nombre de termes DISTINCTS que le référentiel de base '
  'n''a pas su lire sur ce plan, mesuré AVANT tout remplissage. C''est le seul '
  'chiffre qui dise si le lot réussit: il doit BAISSER semaine après semaine. '
  'V0-B (2026-08-21): `null` = AUCUNE MESURE, et ce n''est PAS zéro. Les 180 '
  'plans antérieurs au sas portent `null`, pas le défaut qu''ils avaient reçu.';

comment on column public.student_generated_meals.composition_energy_sources is
  'LOT 18 compteurs ①②③ — part de l''énergie du plan par provenance: '
  '{table, promoted, model, group_bounds} en fractions de 0 à 1, plus `kcal`. '
  'V0-B (2026-08-21): `null` = AUCUNE MESURE, et ce n''est PAS `{}`.';

-- ---------------------------------------------------------------------------
-- 2) LES 180 PLANS ANTÉRIEURS RENDENT LE DÉFAUT QU'ON LEUR AVAIT DONNÉ
-- ---------------------------------------------------------------------------
--
-- ⚠️ C'est une écriture de données, et elle se défait par un `update` inverse:
-- les valeurs écrasées sont EXACTEMENT les valeurs par défaut de la colonne,
-- jamais une mesure. Le retour arrière est écrit au registre du plan.
--
-- ⛔ LE TRIGGER `updated_at` EST DÉSACTIVÉ POUR CE SEUL `update`. Voir ③ en tête
-- de fichier: 152 des 180 lignes portent un `updated_at` qui dit quelque chose,
-- et il part dans l'export RGPD. Un compteur de mesure n'a pas le droit de
-- coûter une date de dernière modification. La désactivation vit dans la même
-- transaction que sa remise: si quoi que ce soit échoue, le `rollback` remet le
-- trigger avec le reste.
alter table public.student_generated_meals
  disable trigger student_generated_meals_set_updated_at;

update public.student_generated_meals
   set composition_unknowns = null,
       composition_energy_sources = null
 where created_at < '2026-08-21';

alter table public.student_generated_meals
  enable trigger student_generated_meals_set_updated_at;

-- ---------------------------------------------------------------------------
-- 3) LA VUE CESSE DE COMPTER CE QUE PERSONNE N'A MESURÉ
-- ---------------------------------------------------------------------------
--
-- ⚠️ UNE SEULE CHOSE CHANGE PAR RAPPORT À LA DÉFINITION DU LOT 18: la clause
-- `where`. Les neuf colonnes, leur ordre, leurs types et le `group by` sont
-- recopiés à l'identique — `create or replace view` l'exige, et un lecteur qui
-- compare les deux fichiers doit pouvoir voir la différence d'un coup d'œil.
--
-- ⛔ POURQUOI UN `where` ET PAS UN `filter` SUR L'AGRÉGAT. `percentile_cont` et
-- `max` ignorent déjà les `null`: sans le `where`, la semaine apparaîtrait
-- QUAND MÊME, avec `plans = 50` et `unknowns_median = null`. Une ligne à médiane
-- vide se lit « la mesure a échoué » alors que la vérité est « il n'y a rien à
-- mesurer ». Le `where` fait disparaître la ligne, ce qui est la seule lecture
-- honnête: aucun plan de cette semaine n'est passé par le sas.
create or replace view public.composition_fill_weekly as
select
  date_trunc('week', created_at)::date as week,
  plan_kind,
  count(*)::int as plans,
  percentile_cont(0.5) within group (order by composition_unknowns)::numeric
    as unknowns_median,
  max(composition_unknowns)::int as unknowns_max,
  round(avg((composition_energy_sources->>'table')::numeric), 3) as share_table,
  round(avg((composition_energy_sources->>'promoted')::numeric), 3) as share_promoted,
  round(avg((composition_energy_sources->>'model')::numeric), 3) as share_model,
  round(avg((composition_energy_sources->>'group_bounds')::numeric), 3) as share_group_bounds
from public.student_generated_meals
-- ⛔ LA LIGNE QUI FAIT TOUT LE LOT.
where composition_unknowns is not null
group by 1, 2;

comment on view public.composition_fill_weekly is
  'LOT 18 — la lecture des quatre compteurs, par semaine et par lane. '
  'unknowns_median doit BAISSER; sinon le sas ne remplit pas la table. '
  'V0-B (2026-08-21): les plans dont personne n''a mesuré la composition '
  '(`composition_unknowns is null`) sont EXCLUS. Une vue vide veut dire '
  '« aucun plan mesuré », et c''est une information juste — pas une panne.';

-- ⛔ `create or replace view` PERD `security_invoker` (cicatrice du dépôt:
-- « invisible aux tests »). Ici la vue ne l'avait jamais — `reloptions` était
-- vide — donc ce `alter` la DURCIT au lieu de la restaurer. Dans les deux cas la
-- règle est la même et elle vit dans la MÊME migration que le `create or replace`:
-- c'est la seule position qui survive au prochain lot qui touchera cette vue.
--
-- ⚠️ Sans danger, vérifié: `anon` et `authenticated` n'ont aucun privilège sur
-- cette vue (`has_table_privilege` → `f`, `f`), et `service_role` a bien `select`
-- sur `student_generated_meals`. Personne ne perd un accès qu'il avait.
alter view public.composition_fill_weekly set (security_invoker = true);

revoke all on public.composition_fill_weekly from anon, authenticated;

commit;
