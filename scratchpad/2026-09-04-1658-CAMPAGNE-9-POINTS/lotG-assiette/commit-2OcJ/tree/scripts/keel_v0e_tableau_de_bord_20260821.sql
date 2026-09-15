-- ══════════════════════════════════════════════════════════════════════════
-- V0-E′ — LE TABLEAU DE BORD, AVANT LE RUN · la part SQL (8 des 10 compteurs)
-- ══════════════════════════════════════════════════════════════════════════
--
-- Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `⟳ V0-E′`.
-- Pilote: `scripts/keel_v0e_tableau_de_bord_20260821.sh` — c'est LUI qu'on
-- lance, parce que deux compteurs (#3, #4) exigent le résolveur de production
-- sous Deno et ne peuvent pas exister ici.
--
--     docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres -tA \
--       -f - < scripts/keel_v0e_tableau_de_bord_20260821.sql
--
-- ── ⛔ CE FICHIER NE FAIT QUE LIRE ─────────────────────────────────────────
-- Aucun `insert`, `update`, `delete`, `create`, `drop`. `V0-E′` est la mesure
-- de départ de toutes les vagues; une mesure qui écrit n'est plus un départ.
--
-- ── LE FORMAT DE SORTIE, ET POURQUOI ──────────────────────────────────────
-- Une seule colonne texte, une ligne par compteur:
--     <numéro>|<compteur>|<valeur>|<source>
-- Le pilote fusionne ces lignes avec celles du script Deno et trie sur le
-- numéro. Les lignes `DETAIL|…` portent le détail, sous le tableau.
--
-- ── ⛔ CE QU'ON NE MESURE PAS ICI, ET IL FAUT SAVOIR POURQUOI ──────────────
-- Les compteurs #3 (lignes résolues ET pesées) et #4 (motifs d'abstention)
-- N'ONT PAS de définition SQL honnête: ils demandent `resolveIngredients`,
-- `foldPreparationsIntoDishes` et `dishEnergy`, c'est-à-dire la normalisation
-- des termes, les alias, les classes de rendement, les masses conventionnelles
-- de condiment et le pliage au prorata. Les réécrire en SQL serait un SECOND
-- moteur de résolution — la faute que ce dépôt paie en boucle. Ils sont donc
-- rendus par `keel_v0e_resolveur_20260821.ts`, qui IMPORTE la production.

with
-- ───────────────────────────────────────────────────────────────────────────
-- #1 — PLANS PORTANT `dishes[].boxes`
--
-- ⚠️ DÉFINITION: **tableau NON VIDE**, pas « clé présente ». La distinction a
-- déjà mordu à côté: sur `preparations[].boxes`, 56 plans portent la clé et 50
-- seulement portent un tableau non vide. Les deux sont comptés, et l'écart est
-- imprimé dans le détail — un compteur qui ne dirait que l'un des deux
-- laisserait croire à un mécanisme qui produit du vide.
-- ───────────────────────────────────────────────────────────────────────────
c1 as (
  select
    count(*) as plans,
    count(*) filter (
      where exists (
        select 1 from jsonb_array_elements(m.dishes) d where d ? 'boxes'
      )
    ) as cle_presente,
    count(*) filter (
      where exists (
        select 1 from jsonb_array_elements(m.dishes) d
        where jsonb_typeof(d -> 'boxes') = 'array'
          and jsonb_array_length(d -> 'boxes') > 0
      )
    ) as tableau_non_vide,
    count(*) filter (
      where exists (
        select 1 from jsonb_array_elements(m.preparations) p where p ? 'boxes'
      )
    ) as prep_cle_presente,
    count(*) filter (
      where exists (
        select 1 from jsonb_array_elements(m.preparations) p
        where jsonb_typeof(p -> 'boxes') = 'array'
          and jsonb_array_length(p -> 'boxes') > 0
      )
    ) as prep_tableau_non_vide
  from student_generated_meals m
),

-- ───────────────────────────────────────────────────────────────────────────
-- #2 — JOURNÉES CALCULABLES, PAR LANE **ET PAR LANGUE**
--
-- ⛔ CE COMPTEUR N'EXISTE PAS. Ce n'est pas `0`, et il ne doit jamais être
-- rendu comme un `0`: un zéro se lit « mesuré, et le résultat est nul », alors
-- que la vérité est « personne n'a jamais mesuré ça ». C'est le lot `L2-lang`
-- (vague 2), et il exige **dix générations en fr-FR** — parce que le corpus ne
-- porte aujourd'hui presque aucun plan français, et que mesurer une langue sur
-- un plan, c'est mesurer une génération.
--
-- La ventilation des locales est imprimée dans le détail: c'est l'OBSTACLE
-- exact, chiffré, plutôt qu'une affirmation.
-- ───────────────────────────────────────────────────────────────────────────
c2 as (
  select
    count(*) filter (where content_locale like 'fr%') as plans_fr,
    count(*) filter (where content_locale like 'fr%' and plan_kind = 'household')
      as plans_fr_foyer,
    count(*) as plans
  from student_generated_meals
),
c2_detail as (
  select string_agg(
    format('     %-8s %-10s %s', content_locale, plan_kind, n),
    E'\n' order by content_locale, plan_kind
  ) as txt
  from (
    select content_locale, plan_kind, count(*) as n
    from student_generated_meals group by 1, 2
  ) t
),

-- ───────────────────────────────────────────────────────────────────────────
-- #5 — INCONNUS PAR PLAN (MÉDIANE)
--
-- ⟳ `V0-B` a changé cette ligne le 2026-08-21: les 180 plans sont passés à
-- `null` sur `composition_unknowns`, et `composition_fill_weekly` ne rend plus
-- aucune ligne. La médiane annoncée « 0 » était **un défaut de colonne, pas une
-- mesure**. On rend donc « non mesuré », avec le compte des lignes mesurées —
-- et c'est le bon résultat: un tableau de bord vide vaut mieux qu'un faux zéro.
-- ───────────────────────────────────────────────────────────────────────────
c5 as (
  select
    count(*) as plans,
    count(composition_unknowns) as mesures,
    percentile_cont(0.5) within group (order by composition_unknowns) as mediane,
    max(composition_unknowns) as maxi
  from student_generated_meals
),
c5_vue as (select count(*) as lignes from composition_fill_weekly),

-- ───────────────────────────────────────────────────────────────────────────
-- #6 — `crossed` / `legacy` / `assumed`, SUR LES 43 CORPS
--
-- La règle est celle d'`activityFactorOf` (`meal_envelope.ts:350-380`), lue et
-- transcrite ici sur les colonnes qui l'alimentent — c'est une cascade de trois
-- `if` sur deux colonnes, pas un moteur:
--     les DEUX axes         -> `crossed`
--     sinon un cran d'avant -> `legacy`
--     sinon                 -> `assumed`
-- ⚠️ `ACTIVITY_FACTOR_SOURCES` compte les TROIS populations, y compris celle
-- qui « passe ». Le patron du dépôt est explicite là-dessus.
-- ───────────────────────────────────────────────────────────────────────────
c6 as (
  select
    count(*) as corps,
    count(*) filter (
      where day_activity is not null and sport_frequency is not null
    ) as crossed,
    count(*) filter (
      where not (day_activity is not null and sport_frequency is not null)
        and activity_level is not null
    ) as legacy,
    count(*) filter (
      where not (day_activity is not null and sport_frequency is not null)
        and activity_level is null
    ) as assumed
  from household_member_bodies
),

-- ───────────────────────────────────────────────────────────────────────────
-- #7 — PLANS DONT LA CEINTURE DE RÉGIME A VU **PLUS D'UNE BOUCHE**
--
-- La trace vit sous `generated_from -> 'household' -> 'regime_belt'` — et PAS
-- à la racine de `generated_from`, où une lecture naïve rend 0 partout.
-- ───────────────────────────────────────────────────────────────────────────
c7 as (
  select
    count(*) as plans_a_ceinture,
    count(*) filter (where (rb ->> 'mouths')::int > 1) as mouths_gt_1,
    coalesce(sum((rb ->> 'refused')::int), 0) as refused,
    coalesce(sum((rb ->> 'checked')::int), 0) as checked,
    coalesce(sum((rb ->> 'silenced')::int), 0) as silenced,
    coalesce(sum((rb ->> 'unknown_mouth')::int), 0) as unknown_mouth
  from (
    select generated_from -> 'household' -> 'regime_belt' as rb
    from student_generated_meals
    where generated_from -> 'household' ? 'regime_belt'
  ) t
),

-- ───────────────────────────────────────────────────────────────────────────
-- #8 — `portion_note` PORTANT UN GRAMMAGE
--
-- Deux définitions sont mesurées, parce qu'une seule serait une affirmation:
--   ① la note contient un CHIFFRE
--   ② la note contient un nombre suivi d'une unité de masse (`\y` et pas `\b`:
--      en regex Postgres, `\b` est un backspace, pas une frontière de mot —
--      écrit `\b`, le compteur rend 0 et a l'air d'une bonne nouvelle)
-- ───────────────────────────────────────────────────────────────────────────
c8 as (
  select
    count(*) as entrees,
    count(*) filter (where e ->> 'portion_note' ~ '[0-9]') as avec_chiffre,
    count(*) filter (
      where e ->> 'portion_note' ~* '[0-9]+\s*(g|kg|ml|cl|oz)\y'
    ) as avec_unite_de_masse
  from student_generated_meals m,
    lateral jsonb_array_elements(m.member_portions) e
),

-- ───────────────────────────────────────────────────────────────────────────
-- #9 — CONTRAINTES ACTIVES : COUVERTES / NON COUVERTES / HORS DE PORTÉE
--
-- ⛔ LA DÉFINITION, SANS AMBIGUÏTÉ — elle est double, et les deux moitiés
-- comptent:
--   · la ceinture de sortie ne regarde que `severity = 'medical'`
--     (`findMedicalConstraintViolations`), ET
--   · elle n'arme que sur `safetyConstraintTokens`, qui rend
--     `allergen_ref | substance_ref | medication_class` — **jamais** `dietRef`
--     ni `conditionRef` (c'est la cicatrice `diabetes`, écrite dans le code).
--
--   COUVERTES      = active · medical · porte un jeton
--   NON COUVERTES  = active · `strict` · porte un jeton  ← la population de `S2`
--   HORS DE PORTÉE = active · aucun jeton (les `diet`) — élargir la sévérité
--                    ne les atteindrait PAS, et c'est voulu
--   PREFERENCE     = comptée à part: une préférence n'est pas une sécurité
--
-- ⚠️ ET LA POPULATION QUI PASSE EST RENDUE, pas seulement celle qui manque:
-- `ANCHOR_REASONS` est le patron du dépôt, et un compteur qui ne nomme que les
-- échecs ne distingue pas « ça marche » de « ce n'est pas branché ».
-- ───────────────────────────────────────────────────────────────────────────
c9 as (
  select
    count(*) as actives,
    count(*) filter (where severity = 'medical') as medical,
    count(*) filter (where severity = 'strict') as strict,
    count(*) filter (where severity = 'preference') as preference,
    count(*) filter (where severity = 'medical' and jeton) as couvertes,
    count(*) filter (where severity = 'strict' and jeton) as non_couvertes,
    count(*) filter (where severity = 'preference' and jeton) as preference_a_jeton,
    count(*) filter (where not jeton) as hors_portee
  from (
    select
      severity,
      coalesce(
        nullif(btrim(allergen_ref), ''),
        nullif(btrim(substance_ref), ''),
        nullif(btrim(medication_class), '')
      ) is not null as jeton
    from student_safety_constraints
    where status = 'active'
  ) t
),
c9_detail as (
  select string_agg(
    format('     %-11s %-12s jeton=%-5s %s', severity, kind, jeton, n),
    E'\n' order by severity, kind
  ) as txt
  from (
    select
      severity, kind,
      coalesce(
        nullif(btrim(allergen_ref), ''),
        nullif(btrim(substance_ref), ''),
        nullif(btrim(medication_class), '')
      ) is not null as jeton,
      count(*) as n
    from student_safety_constraints
    where status = 'active'
    group by 1, 2, 3
  ) t
),

-- ───────────────────────────────────────────────────────────────────────────
-- #10 — BOUCHES SANS `birth_date`, ET PROFILS SANS `birth_date`
--
-- C'est l'entrée de la porte mineur. Les deux populations sont distinctes et
-- ne se remplacent pas: une bouche de foyer n'a pas de `profiles`.
-- ───────────────────────────────────────────────────────────────────────────
c10 as (
  select
    (select count(*) from household_members) as bouches,
    (select count(*) from household_members where birth_date is null) as bouches_sans,
    (select count(*) from profiles) as profils,
    (select count(*) from profiles where birth_date is null) as profils_sans
),

-- Le corpus, en tête de sortie.
corpus as (
  select
    (select count(*) from student_generated_meals) as plans,
    (select count(*) filter (where plan_kind = 'household')
       from student_generated_meals) as plans_foyer,
    (select coalesce(sum(jsonb_array_length(dishes)), 0)
       from student_generated_meals) as plats,
    (select coalesce(sum(jsonb_array_length(preparations)), 0)
       from student_generated_meals) as preparations,
    (select count(*) from food_composition_refs) as refs,
    (select count(*) from food_composition_aliases) as alias
),

lignes as (
  select 0 as ord, 0 as sub, format(
    'CORPUS  %s plans (%s foyer · %s solo) · %s plats · %s préparations · '
    || 'référentiel %s lignes / %s alias',
    plans, plans_foyer, plans - plans_foyer, plats, preparations, refs, alias
  ) as line from corpus

  union all
  select 1, 0, format(
    '1|plans portant dishes[].boxes (tableau NON VIDE)|%s / %s|sql',
    tableau_non_vide, plans
  ) from c1

  union all
  select 2, 0,
    '2|journées calculables PAR LANE ET PAR LANGUE|⛔ N''EXISTE PAS '
    || '(ce n''est pas 0) — lot L2-lang, vague 2|—'
  from c2

  union all
  select 5, 0, format(
    '5|inconnus par plan (médiane)|⛔ NON MESURÉ — %s / %s plans portent une '
    || 'valeur ; composition_fill_weekly rend %s ligne(s)|sql',
    mesures, plans, (select lignes from c5_vue)
  ) from c5

  union all
  select 6, 0, format(
    '6|facteur d''activité crossed / legacy / assumed|%s / %s / %s sur %s corps|sql',
    crossed, legacy, assumed, corps
  ) from c6

  union all
  select 7, 0, format(
    '7|plans dont la ceinture a vu > 1 bouche|%s / %s (refused: %s)|sql',
    mouths_gt_1, plans_a_ceinture, refused
  ) from c7

  union all
  select 8, 0, format(
    '8|portion_note portant un grammage|%s / %s|sql',
    avec_unite_de_masse, entrees
  ) from c8

  union all
  select 9, 0, format(
    '9|contraintes actives non couvertes / couvertes|%s non couvertes · %s couvertes '
    || 'sur %s actives (%s medical · %s strict · %s preference)|sql',
    non_couvertes, couvertes, actives, medical, strict, preference
  ) from c9

  union all
  select 10, 0, format(
    '10|bouches sans birth_date · profils sans birth_date|%s / %s · %s / %s|sql',
    bouches_sans, bouches, profils_sans, profils
  ) from c10

  -- ── LE DÉTAIL, sous le tableau ────────────────────────────────────────
  union all
  select 100, 1, format(
    E'\n── #1 · CLÉ PRÉSENTE vs TABLEAU NON VIDE ───────────────────────────────────\n'
    || '     dishes[].boxes         clé présente %s · tableau non vide %s (sur %s plans)' || E'\n'
    || '     preparations[].boxes   clé présente %s · tableau non vide %s' || E'\n'
    || '     ⚠️ l''écart %s vs %s sur les préparations est la raison pour laquelle' || E'\n'
    || '        « clé présente » n''est PAS la définition retenue.',
    cle_presente, tableau_non_vide, plans,
    prep_cle_presente, prep_tableau_non_vide,
    prep_cle_presente, prep_tableau_non_vide
  ) from c1

  union all
  select 100, 2, format(
    E'\n── #2 · L''OBSTACLE, CHIFFRÉ ────────────────────────────────────────────────\n'
    || '     plans en locale fr* : %s / %s — dont foyer : %s' || E'\n'
    || '     ⇒ mesurer « par langue » sur ce corpus mesurerait UNE génération,' || E'\n'
    || '       pas une langue. C''est pourquoi L2-lang exige dix générations.' || E'\n'
    || '     ventilation des locales :' || E'\n%s',
    plans_fr, plans, plans_fr_foyer, (select txt from c2_detail)
  ) from c2

  union all
  select 100, 5, format(
    E'\n── #5 · POURQUOI « NON MESURÉ » ET PAS « 0 » ───────────────────────────────\n'
    || '     plans %s · portant une valeur %s · médiane %s · max %s' || E'\n'
    || '     composition_fill_weekly : %s ligne(s)' || E'\n'
    || '     ⟳ V0-B a retiré le défaut de colonne le 2026-08-21. Le « 0 » annoncé' || E'\n'
    || '       par le plan était ce défaut, jamais une mesure.',
    plans, mesures, coalesce(mediane::text, '∅'), coalesce(maxi::text, '∅'),
    (select lignes from c5_vue)
  ) from c5

  union all
  select 100, 8, format(
    E'\n── #8 · LES DEUX DÉFINITIONS COÏNCIDENT ────────────────────────────────────\n'
    || '     entrées member_portions %s · note avec un chiffre %s · '
    || 'note avec un nombre + unité de masse %s' || E'\n'
    || '     ⇒ toute note qui porte un chiffre porte un grammage. La définition' || E'\n'
    || '       retenue est la seconde (nombre + unité), la plus stricte.',
    entrees, avec_chiffre, avec_unite_de_masse
  ) from c8

  union all
  select 100, 9, format(
    E'\n── #9 · LA DÉFINITION, ET LES QUATRE POPULATIONS ───────────────────────────\n'
    || '     COUVERTES      %s  (active · medical · porte un jeton)' || E'\n'
    || '     NON COUVERTES  %s  (active · strict  · porte un jeton) ← la population de S2' || E'\n'
    || '     HORS DE PORTÉE %s  (aucun jeton : safetyConstraintTokens ne rend pas dietRef)' || E'\n'
    || '     PREFERENCE     %s  (dont %s portent un jeton) — hors sécurité, par décision' || E'\n'
    || '     ventilation :' || E'\n%s',
    couvertes, non_couvertes, hors_portee, preference, preference_a_jeton,
    (select txt from c9_detail)
  ) from c9
)
-- ── LA MISE À PLAT ────────────────────────────────────────────────────────
-- ⚠️ CHAQUE LIGNE d'un bloc de détail est préfixée, pas seulement la première.
-- Sans ça, un `grep '^DETAIL|'` côté pilote ne garde que la première ligne du
-- bloc et le reste disparaît en silence — mesuré, et c'est exactement le genre
-- de perte muette que ce tableau de bord existe pour ne pas commettre.
select case when ord = 0 or ord >= 100 then 'DETAIL|' || l else l end
from lignes,
  lateral unnest(string_to_array(lignes.line, E'\n')) with ordinality as u(l, n)
order by ord, sub, n;
