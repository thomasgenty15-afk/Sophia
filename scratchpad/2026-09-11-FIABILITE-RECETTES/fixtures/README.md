# Fixtures figées des deux tirs de campagne — 2026-09-11

Lot 0 du chantier « Fiabiliser les portions et préserver les recettes »
(`docs/keel/PLAN-FIABILITE-ET-EQUILIBRE-RECETTES-2026-09-11.md`).

**Ces fichiers ne bougent plus.** Ils sont l'entrée de
`scripts/2026-09-11-mesure-grille.ts`, qui ne sait rien faire d'autre que les lire.

| plan | compte | requête | objectif |
|---|---|---|---|
| `1f8a8988-b3ed-4b83-a4d0-93297ac0d652` | `4566b443-…` (Paul) | `f5a3dd19-…` | `fat_loss` |
| `1eada05b-2c3d-4ed5-aa85-14edf2840b77` | `6c2aa5d2-…` (Max) | `ecaf04b2-…` | `muscle_gain` |

## Ce que chaque fichier porte

- **`plans.json`** — les deux lignes `student_generated_meals` entières : plats,
  préparations, boîtes, courses, sessions, portions, `generated_from`.
- **`contextes.json`** — le profil, l'objectif, la série de pesées, le foyer, les
  corps de fiche, les habitudes, les allergies et restrictions (vides ici), **plus
  l'heure et le fuseau de référence** et **la grille** des cases demandées.
- **`echanges.json`** — les deux prompts ENTIERS (`user_message`, `system_prompt`)
  et les deux **réponses brutes** (`output_text`), plus les deux appels
  `composition_fill`. Aucun jeton d'authentification.
- **`journaux.json`** — les compteurs déjà produits par ces deux requêtes. Ils
  servent de **témoins** : l'instrument rejoue, puis confronte ses nombres aux
  leurs (`keel.meal_energy.reading_index`, `keel.household_meal.cells`,
  `keel.household_meal.portion_sizing`, `keel.household_meal.final_gate`).
- **`empreintes.json`** — SHA-256 du référentiel, des fixtures et des quatorze
  modules de mesure.

## ⛔ Le référentiel n'est pas recopié ici, il est vérifié

Il vit dans `scratchpad/2026-09-11-REVUE-CAMPAGNE/referentiel.json` — une preuve
**existante** que le lot a ordre de préserver. Le dupliquer ferait deux
référentiels qui peuvent diverger. `chargerFixtures()` recalcule son SHA-256 et
**refuse de mesurer** s'il a changé : une mesure sur un référentiel changé est
une mesure d'autre chose.

## ⚠️ Ce que ces fixtures ne figent PAS, et il faut le savoir

**Le sas d'aujourd'hui n'est pas celui du run.** `grams_raw` est figé à la
génération ; le référentiel et `food_composition_pending` ne le sont pas. Le
second tir a écrit deux lignes de sas (`sas_written: 2`) dont le premier n'a pas
pu profiter : une relecture d'aujourd'hui peut donc résoudre un terme que le run
avait compté inconnu. **La portion manquante, elle, reste manquante** — une boîte
absente du payload le reste pour toujours.

**La grille n'est pas persistée nommément par le moteur.** `keel.household_meal.cells`
en donne les COMPTES (`cells: 9`, `spent_cells: 2`, `non_empty: 7`), jamais les
noms. Les deux cases retirées du vendredi (`breakfast`, `lunch`) sont dérivées de
l'heure locale — 15 h 07 CEST — et recoupées par les sept plats produits. La
dérivation est vérifiable : `slotsUnservableToday({hourNow: 15, rhythm:
DEFAULT_EATING_RHYTHM, declaredHours: []})` rend `breakfast` (passé) et `lunch`
(retenu pour les courses), soit 9 − 2 = 7. **C'est un trou du lot B : la grille
devrait être émise avec ses clés jour/moment.**

## ⛔ Aucune préférence n'est déduite d'un prénom ni d'un titre de recette

Tout ce qui entre dans un calcul vient d'une colonne nommée. Les prénoms ne
servent qu'à l'affichage du rapport.

## Comment ces fichiers ont été produits (lecture seule)

Depuis la racine du dépôt, sur la pile locale :

```sh
# plans.json
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -At -c "
select jsonb_pretty(jsonb_build_object('plans', jsonb_agg(to_jsonb(p) order by p.created_at)))
from (select id, user_id, household_id, plan_kind, starts_on, ends_on, duration_days, lead_days,
             servings, content_locale, created_at, updated_at, validated_at, retired_at,
             composition_unknowns, composition_energy_sources, dishes, preparations,
             shopping_list, cooking_sessions, member_portions, pantry, context, preferences,
             generated_from
      from student_generated_meals
      where id in ('1f8a8988-b3ed-4b83-a4d0-93297ac0d652',
                   '1eada05b-2c3d-4ed5-aa85-14edf2840b77')) p;"

# echanges.json  (les deux prompts et les deux réponses brutes)
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -At -c "
select jsonb_pretty(jsonb_agg(to_jsonb(e) order by e.created_at))
from (select id, request_id, source, created_at, provider, model, attempt, chain_index, status,
             http_status, json_mode, outcome, output_text, system_prompt, user_message,
             raw_response_truncated, user_message_truncated, system_prompt_truncated, metadata
      from llm_raw_response_events
      where user_id in ('4566b443-073c-4343-9e0e-73a1a93d0b94',
                        '6c2aa5d2-362c-42d4-9bd7-67120f8dac1c')) e;"
```

`contextes.json` assemble `profiles`, `student_goals`, `student_body_measures`,
`households`, `household_members`, `household_member_bodies`,
`household_member_habits`, `household_member_allergies`,
`household_food_restrictions` et `student_safety_constraints` pour ces deux
comptes, et y ajoute `instant`, `grille` et `contrat_de_calcul`.
`journaux.json` recopie `scratchpad/2026-09-11-REVUE-CAMPAGNE/compteurs.json`
sans le modifier.

## Lire la mesure

```sh
deno run --allow-read scripts/2026-09-11-mesure-grille.ts \
  scratchpad/2026-09-11-FIABILITE-RECETTES/fixtures

deno test --allow-read scripts/2026-09-11-mesure-grille_test.ts
```

`--allow-read` et rien d'autre : pas de réseau, pas d'écriture, pas d'appel
modèle. Un instrument qui ne peut rien appeler ne peut rien fabriquer.
