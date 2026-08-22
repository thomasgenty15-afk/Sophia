#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# L16′ — L'ACTIVITÉ: COMBIEN DE BOUCHES SONT DIMENSIONNÉES SUR UNE HYPOTHÈSE,
#        ET COMBIEN NE LE SONT SUR RIEN.
# ══════════════════════════════════════════════════════════════════════════
#
# Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `⟳ L16′`.
#
#     bash scripts/keel_l16_population_activite_20260822.sh
#
# ── ⛔ CE QU'IL VÉRIFIE, ET IL SORT EN ERREUR SI ÇA NE TIENT PAS ───────────
# L'IDENTITÉ:  crossed + legacy + assumed  ==  nombre de bouches dimensionnées
# Elle se prend contre un TÉMOIN INDÉPENDANT — `generated_from.household.
# member_count`, écrit par un autre chemin que les deux histogrammes — et pas
# entre les deux histogrammes: `index.ts` les remplit dans deux boucles sur la
# MÊME liste, donc une bouche perdue en amont disparaît des deux côtés et
# l'égalité naïve reste vraie. Une garde qui ne peut pas rougir ressemble à une
# garde qui marche.
#
# ── ⛔ IL IMPRIME TOUJOURS LES DEUX DÉNOMINATEURS ──────────────────────────
# §⑨ n° 50 et son amendement. [A] = tout le corpus; [B] = le millésime de
# prompt VIVANT. La population exclue est NOMMÉE et COMPTÉE à côté de chaque
# chiffre. [A] protège du seuil qu'on abaisse; [B] protège du seuil qu'on ne
# pouvait pas rater. Ni l'un ni l'autre ne suffit seul.
#
# ── ⛔ LA PORTE CONDITIONNELLE N'EST PAS TRANCHÉE ICI ──────────────────────
# `crossed ≥ 50 %` dépend d'une décision produit (vague D): *l'activité
# doit-elle RETENIR l'entonnoir d'inscription ?* Ce script la MESURE, sur les
# deux populations, et écrit `NON TRANCHÉE`. Un verdict ici serait une décision
# prise en passant — ce que §⑦ interdit en toutes lettres.
#
# ── ⛔ CE SCRIPT NE FAIT QUE LIRE ──────────────────────────────────────────
# Aucune écriture en base, aucun appel de modèle.

set -euo pipefail

DB_CONTAINER="${KEEL_DB_CONTAINER:-supabase_db_Sophia_2}"

psql_q() {
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
}

# Le millésime VIVANT, écrit ici en toutes lettres: `meal_generation.ts` pour la
# lane solo, `+household.v21_one_box_per_group` pour la lane foyer.
VIVANT_FOYER='meal.en.v18_one_box_per_group+household.v21_one_box_per_group'
VIVANT_SOLO='meal.en.v18_one_box_per_group'

printf '═══════════════════════════════════════════════════════════════════════════\n'
printf "L16′ — LA POPULATION DE L'ACTIVITÉ\n"
printf 'exécuté le %s · base %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$DB_CONTAINER"
printf '═══════════════════════════════════════════════════════════════════════════\n'

psql_q -v vivant_foyer="$VIVANT_FOYER" -v vivant_solo="$VIVANT_SOLO" <<'SQL'
\echo ''
\echo '── ① LES DEUX DÉNOMINATEURS, ET CE QUE CHACUN EXCLUT ─────────────────────'
with p as (
  select id, plan_kind,
         generated_from->>'prompt_version' as pv,
         generated_from->'household' as h,
         generated_from->'household'->'box_sizing' as bs
  from student_generated_meals
)
select
  '[A] corpus entier' as denominateur,
  count(*) as plans,
  count(*) filter (where bs->'activity_source' is not null) as compteur_a_tourne,
  count(*) filter (where plan_kind = 'personal') as "exclu: lane solo (aucun box_sizing)",
  count(*) filter (where plan_kind = 'household' and bs is null) as "exclu: foyer sans box_sizing",
  count(*) filter (where plan_kind = 'household' and bs is not null
                     and bs->'activity_source' is null) as "exclu: foyer < 2026-08-20"
from p
union all
select
  '[B] millésime VIVANT',
  count(*),
  count(*) filter (where bs->'activity_source' is not null),
  count(*) filter (where plan_kind = 'personal'),
  count(*) filter (where plan_kind = 'household' and bs is null),
  count(*) filter (where plan_kind = 'household' and bs is not null
                     and bs->'activity_source' is null)
from p where pv in (:'vivant_foyer', :'vivant_solo');

\echo ''
\echo '── ② ⛔ L IDENTITÉ, PLAN PAR PLAN — contre le témoin `member_count` ──────'
with q as (
  select id, created_at, plan_kind, generated_from->>'prompt_version' as pv,
    (generated_from->'household'->>'member_count')::int as temoin,
    (select sum(v::int) from jsonb_each_text(
       generated_from->'household'->'box_sizing'->'activity_source') e(k,v)) as somme_source,
    (select sum(v::int) from jsonb_each_text(
       generated_from->'household'->'box_sizing'->'mouths') e(k,v)) as somme_mouths,
    generated_from->'household'->'box_sizing'->'activity_source' as src
  from student_generated_meals
  where generated_from->'household'->'box_sizing'->'activity_source' is not null
)
select left(id::text, 8) as plan,
       to_char(created_at, 'MM-DD HH24:MI') as cree,
       temoin as "témoin",
       somme_source as "Σ source",
       somme_mouths as "Σ mouths",
       (src->>'crossed')::int as crossed,
       (src->>'legacy')::int as legacy,
       (src->>'assumed')::int as assumed,
       case when somme_source = temoin and somme_mouths = temoin
            then 'TIENT' else '⛔ ROMPUE' end as identite
from q order by created_at;

\echo ''
\echo '── ③ LE RÉFÉRENTIEL — DEUX POPULATIONS, TROIS MOTS IDENTIQUES ───────────'
\echo '   ⚠️ `assumed` NE DÉSIGNE PAS LA MÊME CHOSE DANS LES DEUX LIGNES.'
\echo '   Le compteur #6 du tableau de bord V0-E′ part de `household_member_bodies`,'
\echo '   donc d une LIGNE DE CORPS. Le runtime part d une BOUCHE: sans ligne de'
\echo '   corps, `activityFactorOf({null,null,false}, null)` rend `assumed`.'
select
  'lignes de corps (#6 tel qu''écrit)' as population,
  count(*) filter (where b.member_id is not null) as total,
  count(*) filter (where b.day_activity is not null and b.sport_frequency is not null) as crossed,
  count(*) filter (where b.member_id is not null
                     and not (b.day_activity is not null and b.sport_frequency is not null)
                     and b.activity_level is not null) as legacy,
  count(*) filter (where b.member_id is not null
                     and not (b.day_activity is not null and b.sport_frequency is not null)
                     and b.activity_level is null) as assumed,
  count(*) filter (where b.member_id is null) as "comptées NULLE PART"
from household_members m left join household_member_bodies b on b.member_id = m.member_id
union all
select
  'bouches (ce que le runtime lit)',
  count(*),
  count(*) filter (where b.day_activity is not null and b.sport_frequency is not null),
  count(*) filter (where not (b.day_activity is not null and b.sport_frequency is not null)
                     and b.activity_level is not null),
  count(*) filter (where not (b.day_activity is not null and b.sport_frequency is not null)
                     and b.activity_level is null),
  0
from household_members m left join household_member_bodies b on b.member_id = m.member_id;

\echo ''
\echo '── ④ LA PORTE CONDITIONNELLE — MESURÉE, ⛔ NON TRANCHÉE ────────────────'
\echo '   `crossed ≥ 50 %` dépend de: *l activité doit-elle RETENIR l entonnoir ?*'
\echo '   Décision du 2026-08-19 (mémoire `allergies-no-longer-gate-the-funnel`):'
\echo '   seuls nom, date, corps et objectif retiennent. La renverser demande de'
\echo '   la NOMMER en vague D. ⛔ Ce script ne la tranche pas.'
select
  population, crossed, total,
  round(100.0 * crossed / nullif(total, 0), 1) as "crossed %",
  case when crossed * 2 >= total then 'au-dessus de 50 %' else 'sous 50 %' end as "où en est-on",
  'NON TRANCHÉE (vague D)' as porte
from (
  select 'lignes de corps' as population,
         count(*) filter (where b.day_activity is not null and b.sport_frequency is not null) as crossed,
         count(*) filter (where b.member_id is not null) as total
  from household_members m left join household_member_bodies b on b.member_id = m.member_id
  union all
  select 'bouches',
         count(*) filter (where b.day_activity is not null and b.sport_frequency is not null),
         count(*)
  from household_members m left join household_member_bodies b on b.member_id = m.member_id
) t;
SQL

# ── ⛔ LA SORTIE EN ERREUR — l'identité est une IDENTITÉ, pas un rapport ────
# Elle est prise sur les plans QUI PORTENT LE COMPTEUR. Un plan sans compteur
# n'est pas une identité rompue: c'est un compteur qui n'a pas tourné, et il
# est compté à part au bloc ①. Confondre les deux rendrait cette porte rouge en
# permanence — « une garde cassée bloque tout et ressemble à une garde qui
# marche ».
ROMPUS="$(psql_q -tA <<'SQL'
with q as (
  select (generated_from->'household'->>'member_count')::int as temoin,
    (select sum(v::int) from jsonb_each_text(
       generated_from->'household'->'box_sizing'->'activity_source') e(k,v)) as somme_source,
    (select sum(v::int) from jsonb_each_text(
       generated_from->'household'->'box_sizing'->'mouths') e(k,v)) as somme_mouths
  from student_generated_meals
  where generated_from->'household'->'box_sizing'->'activity_source' is not null
)
select count(*) from q
where temoin is null or somme_source is distinct from temoin or somme_mouths is distinct from temoin;
SQL
)"
MESURES="$(psql_q -tA -c "select count(*) from student_generated_meals
  where generated_from->'household'->'box_sizing'->'activity_source' is not null;")"

printf '\n═══════════════════════════════════════════════════════════════════════════\n'
if [ "$MESURES" -eq 0 ]; then
  # ⛔ ZÉRO PLAN MESURÉ N'EST PAS « L'IDENTITÉ TIENT ». C'est le zéro ambigu, et
  # ce fichier existe pour ne pas le rendre une treizième fois.
  printf '⛔ AUCUN plan ne porte `box_sizing.activity_source` — RIEN N EST VÉRIFIÉ.\n'
  printf '   Ce n est pas « identité tenue »: le compteur n a pas tourné.\n'
  printf '═══════════════════════════════════════════════════════════════════════════\n'
  exit 1
fi
if [ "$ROMPUS" -ne 0 ]; then
  printf '⛔ IDENTITÉ ROMPUE sur %s plan(s) sur %s.\n' "$ROMPUS" "$MESURES"
  printf '   Une quatrième population existe et personne ne la voit.\n'
  printf '═══════════════════════════════════════════════════════════════════════════\n'
  exit 1
fi
printf 'IDENTITÉ TENUE sur %s plan(s) sur %s portant le compteur.\n' "$MESURES" "$MESURES"
printf '⚠️ Elle ne dit RIEN des plans où le compteur n a pas tourné — bloc ①.\n'
printf '═══════════════════════════════════════════════════════════════════════════\n'
