# CHECKLIST — lane INDIVIDUELLE : de l'écran au prompt

**Agent 1A-inv · 2026-08-18 · lecture de code seulement.**
Périmètre : `generate-meal-v1`, `generate-week-plan-v1`, `_shared/keel/meal_generation.ts`
et les modules `_shared/keel/*` qu'ils appellent. **Le foyer est hors périmètre**
(`generate-household-meal-v1`, `household_*`) : un autre agent le couvre. Il n'est
nommé ici que lorsqu'il est le **seul lecteur** d'un champ — ce fait-là est le sujet.

## ⛔ Ce que ce document N'EST PAS

Aucune génération n'a été lancée, aucun octet de prompt réel n'a été lu, aucun run
n'a été mesuré. L'outil qui rend le prompt réel lisible est en construction.
**La colonne « bloc du prompt » est une lecture du code qui COMPOSE le message, pas
une observation du message envoyé.** « Atteint le bloc X » signifie : *le code qui
construit X reçoit cette valeur et l'écrit*. Rien n'est dit de ce que le modèle en
fait, ni de ce qui survit à une troncature.

Point de passage unique : `generateWithGemini(systemPrompt, userMessage, …)` —
`supabase/functions/_shared/gemini.ts:146`.

## Les deux prompts de la lane

| | repas | semaine |
|---|---|---|
| entrée | `generate-meal-v1/index.ts:1661` (`buildMealPrompt`) | `generate-week-plan-v1/index.ts:743` (`buildWeekPlanPrompt`) |
| constructeur | `meal_generation.ts:2049` → `userMessage` ligne **2506** | `week_plan_generation.ts:393` → `userMessage` ligne **499** |
| système | `MEAL_SYSTEM_PROMPT`, `meal_generation.ts:1636` — **générique, aucune donnée d'élève** | `WEEK_PLAN_SYSTEM_PROMPT` — idem |
| appel | `generate-meal-v1/index.ts:1825` (+ 2 relances : **1940**, **2225**) | `generate-week-plan-v1/index.ts:797` |
| suffixes greffés après | `draftNoteSuffix` + `hungerSuffix` (`index.ts:1612`) | aucun |

**Tout ce qui est propre à l'élève vit dans le `userMessage`.** Aucun champ de la
table ci-dessous n'atterrit dans le `systemPrompt`.

### Blocs du `userMessage` repas, dans l'ordre écrit

| # | en-tête | ligne |
|---|---|---|
| 1 | `=== THIS STUDENT'S HARD CONSTRAINTS ===` + `=== DIAGNOSED CONDITIONS ===` | `meal_generation.ts:2507` |
| 2 | ligne de régime | `:2521` |
| 3 | bloc doctrine du coach | `:2522` |
| 4 | bloc protocole (mapping alimentaire) | `:2524` |
| 5 | `== THE CONVICTION KEYS YOU MAY NAME ==` | `:2533` |
| 6 | note 1:1 du coach | `:2540` |
| 7 | `== THIS STUDENT ==` | `:2556` |
| 7a | `-- WHO THEY ARE --` | `:2558` |
| 7b | `-- WHAT THEY ARE AFTER --` | `:2561` |
| 7c | `-- WHERE THEY ARE NOW --` | `:2581` |
| 7d | `-- HOW THEIR DAY RUNS --` | `:2589` |
| 7e | `-- WHEN THEY ARE NOT HERE --` | `:2605` |
| 7f | `-- WHAT THEY ALREADY HAVE --` (apports fixes) | `fixed_intakes.ts:603` |
| 7g | `-- WHAT THOSE DAYS ARE FOR --` | `day_properties.ts:144` |
| 7h | `-- WHAT THEY CAN COOK --` | `:2627` |
| 7i | `-- WHAT THEY HAVE TOLD ME --` | `:2650` |
| 7j | `-- THIS TIME --` | `:2679` |
| 7k | `-- WHAT THEY ALREADY HAVE --` (**garde-manger — même en-tête que 7f**) | `:2694` |
| 8 | `== WHAT IS IN SEASON WHERE THEY ARE ==` | `:2712` |
| 9 | `== WHAT TO COOK ==` | `:2738` |
| 10 | bloc de langue | `:2791` |

### Blocs du `userMessage` semaine

`safetyBlock` → doctrine → `== YOUR COACH'S CONVICTIONS ==` → note du coach →
`== THIS STUDENT ==` (goal, emphasis, maxNutrition, aspiration, situation,
focus_axis, contexte) → bloc satiété → **`practical constraints: <jsonb ENTIER
sérialisé>`** (`week_plan_generation.ts:560`) → `week starting:` → bloc de langue.

⚠️ **La lane semaine ne lit presque aucune clé nommée.** Elle `JSON.stringify` le
jsonb en entier, après un filtre qui est une **liste NOIRE** et non blanche —
`constraintsForPrompt`, `food_preference_promotion.ts:1215-1226` : il ne retire
que `food_preferences_dismissed`, `food_preferences_origin`, `retained_items`,
`retained_next_plan`, et réécrit `food_preferences`. **Tout le reste passe, y
compris toute clé ajoutée à l'avenir.** Ce qui y arrive n'a donc aucune consigne
qui le nomme.

---

# LA TABLE

**Bloc** : **✅** une ligne du prompt est écrite avec cette valeur ·
**⚠️** présent mais dégradé (unité perdue, nuance écrasée, bloc sans consigne) ·
**❌** n'atteint aucun prompt de cette lane.
**Saisi** : **⛔ solo** = le contrôle existe dans le code mais n'est **jamais rendu**
sur un compte individuel.

## A. Le corps et l'identité

| # | Information | Saisi (écran · fichier:ligne · URL) | Stocké | Lecteur (fichier:ligne) | Bloc |
|---|---|---|---|---|---|
| A1 | **Prénom** | `SetupPage.tsx:2588`, `/app/setup` étape 2. **⛔ solo** — gate `SetupPage.tsx:2582` (`branch !== "solo"`) | `profiles.full_name` (`onboarding.ts:1796`) | `household_turn_context.ts#firstName` — **foyer** | **❌ les deux.** Le dépôt le dit : `api/onboarding.ts:229` « `generate-meal-v1` ne le nomme nulle part (vérifié le 2026-08-12) ». Non-défaut assumé |
| A2 | **Date de naissance** | `SetupPage.tsx:2605` (`/app/setup` ét. 2) · `StudentWeekPlanPage.tsx:799` (`/app/plan`, modale, section 1) | `profiles.birth_date` | `student_body_io.ts:196` → `generate-meal-v1:1581` | **✅ repas** — jamais l'âge, la **bande** : `meal_body.ts:143` → `- age band: …` en 7a. **✅ semaine** — `ageBandOf` → `weekEmphasis` (`generate-week-plan-v1:772`), **module l'emphase, n'écrit pas de ligne propre** |
| A3 | **Taille** | `SetupPage.tsx:2619` · `StudentWeekPlanPage.tsx:750` | `profiles.height_cm` | `student_body_io.ts:196` → `mealBodyContextFrom` | **✅ repas, SOUS CONDITION** — `meal_body.ts:139` `if (bodyMetricsAllowed && …)` → `- height: N cm`. Coupé dès que le plancher TCA mord. **❌ semaine** |
| A4 | **Sexe** | `SetupPage.tsx:2669` · `StudentWeekPlanPage.tsx:843` | `profiles.gender` | idem A3 | **✅ repas** — `meal_body.ts:146`. Pas conditionné au flag TCA. **❌ semaine** |
| A5 | **Poids** | **TROIS surfaces, DEUX tables** — voir P1 ci-dessous | `student_body_measures` **ou** `weekly_reviews.biofeedback.weight_kg` | `student_body_io.ts:203-260` fusionne les deux, `student_body_measures` **gagne** (`:265` `derived.weight.get(week) ??`) | **✅ repas, SOUS CONDITION** — `meal_body.ts:166`, bloc 7c, avec la semaine de mesure. Coupé par le flag TCA. **⚠️ semaine** — jamais le nombre, une **tendance** (`trendOf`, `generate-week-plan-v1:775`) |
| A6 | **Tour de taille** | `StudentWeekPlanPage.tsx:886` (`/app/plan`, modale) | idem A5 | idem | **✅ repas** bloc 7c · **⚠️ semaine** tendance seule |
| A7 | **Niveau d'activité** | `SetupPage.tsx:2659` → `ActivityTiles` `:2493`, `/app/setup` ét. 2 — 4 tuiles | `profiles.activity_level` (+ `household_member_bodies.activity_level`) | `student_body_io.ts:299` → `generate-meal-v1:1580` | **❌ LES DEUX** — voir **R2** |
| A8 | **Séances d'activité** (date, type, durée, intensité) | `ActivitySessionsCard.tsx:419/431/454/471`, `/app/progress` | `student_activity_sessions` | — | **❌ les deux.** Aucun des deux générateurs n'importe `activity_session.ts`. Non vérifié au-delà du grep — voir « pas pu trancher » |

## B. La direction

| # | Information | Saisi | Stocké | Lecteur | Bloc |
|---|---|---|---|---|---|
| B1 | **Direction (objectif)** | `SetupPage.tsx:2685` (`<select>`, 3 valeurs) · `StudentWeekPlanPage.tsx:2166` (**6 cartes radio**) | `student_goals.goal` | `generate-meal-v1:682`, `:1696` | **✅ repas** — `goal: <jeton>` bloc 7b (`meal_generation.ts:2562`) · **✅ semaine** (`:517`). ⚠️ **Trois des six cartes de `/app/plan` plantent** — voir **R0** |
| B2 | **Poids visé** | `MouthFormDialog.tsx:934` (`/app/setup` ét. 2, **sous une direction qui bouge** seulement) · `StudentWeekPlanPage.tsx:386` (`/app/plan`, sous la carte d'objectif sélectionnée) | `student_goals.target_weight_kg` | `api/mouthProfile.ts:246` (front) ; `account-export-v1:392` | **❌ LES DEUX** — voir **R4** |
| B3 | **Rythme (kg/semaine)** | `MouthFormDialog.tsx:975` — **curseur**, `/app/setup` ét. 2, même porte que B2 **plus** un corps complet (`:947` `needs_body`, `:957` `no_margin`) | `student_goals.target_pace_kg_per_week` | `meal-energy-v1:737` ; `generate-household-meal-v1:4451` | **❌ LES DEUX** — voir **R4** |
| B4 | **Axe à faire monter** | `StudentWeekPlanPage.tsx:413` — **⛔ jamais rendu** : la porte est `indicatorFor(goal).axisObjective`, `false` sur les trois objectifs survivants (`api/bodyMeasures.ts:308/320/342`) | `student_goals.focus_axis` | `generate-meal-v1:682`, `:1688` ; `generate-week-plan-v1:761` | Les deux prompts l'écrivent (`meal_generation.ts:2568`, `week_plan_generation.ts:534`) **mais rien ne peut plus le remplir, et le seul écrivain l'EFFACE** — voir **R6** |
| B5 | **Aspiration** | `StudentWeekPlanPage.tsx:2255`, `/app/plan`, modale section 2 | `student_goals.aspiration` | **semaine seulement** : `generate-week-plan-v1:251`, `:757` | **❌ repas · ✅ semaine** — voir **R5** |
| B6 | **Situation** (prose stable) | **AUCUNE SURFACE.** Le champ a été retiré et la colonne délibérément sortie du payload — `StudentWeekPlanPage.tsx:1875-1886` | `student_goals.situation` | `generate-meal-v1:682`, `:1698` ; `generate-week-plan-v1:757` | Les deux prompts l'écrivent (`meal_generation.ts:2577`, `:526`) **mais aucun élève nouveau ne peut la remplir** — voir **R7** |

## C. Ce qu'on ne met pas dans l'assiette

| # | Information | Saisi | Stocké | Lecteur | Bloc |
|---|---|---|---|---|---|
| C1 | **Allergies** | `StudentHealthPage.tsx:313-385` (`/app/health`, formulaire complet) · `MouthFormDialog.tsx:773` (`/app/setup` ét. 2, **derrière le repli « Allergies »** `:763`) | `student_safety_constraints` (`kind`, `allergen_ref`, `substance_ref`, `medication_class`, `severity`, `declared_by`) | `safety_constraints.ts#loadStudentSafetyConstraints` ; `generate-meal-v1:1671` ; `generate-week-plan-v1:786` | **✅ LES DEUX**, en **tête** — `safetyConstraintsPromptBlock`, `safety_constraints.ts:275` |
| C2 | **Intolérance / religieux / dégoût / médicament** | `/app/health` uniquement, `<select>` `StudentHealthPage.tsx:313` (`CONSTRAINT_KINDS`) | même table, `kind` ∈ `intolerance`/`religious`/`dislike`/`medical` | idem | **✅ LES DEUX** — mais un simple **dégoût** sort sous `HARD CONSTRAINTS` : voir **R12** |
| C3 | **Maladies déclarées** | `/app/health` (`kind='medical'`), et la conversation | `student_safety_constraints.condition_ref` | idem | **✅ LES DEUX** — section propre `=== DIAGNOSED CONDITIONS … ===` (`safety_constraints.ts:294`), délibérément **hors** de la liste d'évitement |
| C4 | **Régime alimentaire** | `SetupPage.tsx:3863` — 4 chips (`omnivore`/`vegetarian`/`vegan`/`pescatarian`), `/app/setup` **étape 3** (pas l'étape 2 : `MouthFormDialog.tsx:844` le cache pour soi-même) | `student_safety_constraints` (`kind='diet'`, `diet_ref`) — sauf `omnivore` | `generate-meal-v1:899` → `dietaryRegimePromptLine` | **✅ repas** (`meal_generation.ts:2521`) · **❌ SEMAINE** — voir **R3** |

## D. La forme de la journée et de la semaine

| # | Information | Saisi | Stocké | Lecteur | Bloc |
|---|---|---|---|---|---|
| D1 | **Moments de repas** | `SetupPage.tsx:3913` (ét. 3, cases) · `EatingRhythmCard.tsx:251` (`/app/plan`, modale section 3) | `practical_constraints.eating_rhythm[].slot` | `parseEatingRhythm` ; `generate-meal-v1:1287` | **✅ repas** — bloc 7d, et il **dimensionne le plafond de plats** des deux côtés. **⚠️ semaine** — dump jsonb |
| D2 | **Taille de chaque moment** | `SetupPage.tsx:3933` — 3 chips **sous un moment coché** (`:3924`) · `EatingRhythmCard.tsx:275` | `…eating_rhythm[].size` | idem | **✅ repas** — `rhythmLines(rhythm)` |
| D3 | **Absences** | `MealPickerGrid.tsx:410/433`, monté `MealBuilder.tsx:1468` — lien `meals.picker.open` sous le champ de fenêtre (`MealBuilder.tsx:966`), `/app/plan`. Écrit par `StudentWeekPlanPage.tsx:1833` | `practical_constraints.away_days` | `parseAwayDays` (`meal_generation.ts:259`) ; `generate-meal-v1:1317` | **✅ repas** — bloc 7e, une ligne par jour. **⚠️ semaine** — dump jsonb |
| D4 | **Déjeuner dehors** | `WorkLunchCard.tsx:220/232/248` — **⛔ jamais rendu en solo** : `workLunchIsAskable` exige un `memberId` (`lib/workLunchForm.ts:103`), la carte rend `null` sur liste vide (`:129`) | `household_members.work_lunch` + `away_days` avec `kind:"eating_out"` | `parseAwayDays` | **❌ inatteignable en solo, ET écrasé même quand il l'est** — voir **R11** |
| D5 | **Propriétés de jour** (batch / restes) | **AUCUN ÉCRAN NULLE PART** | `practical_constraints.day_properties` | `parseDayProperties` ; `generate-meal-v1:1423` | Lecteur vivant, bloc 7g écrit (`day_properties.ts:144-157`), **clé que rien n'écrit** — voir **R8** |
| D6 | **Apports fixes (le shaker)** — libellé, grammes, **protéines/portion**, **kcal/portion** | `MouthFormDialog.tsx:1107/1117/1128/1139` — `/app/setup` ét. 2, repli **« Ce qu'elle mange déjà »** (`:708`, auto-ouvert si objectif = `muscle_gain`) puis bouton `household.mouth.shaker_add` (`:1089`) | `practical_constraints.fixed_intakes[]` | `parseFixedIntakes` ; `generate-meal-v1:1409` | **⚠️ repas** — le label, la quantité, le moment et les jours partent ; **les protéines et les kcal, non** — voir **R10** |

## E. Ce qu'il peut vraiment faire

E1–E5 passent toutes par `readCookingCapacity` (`generate-meal-v1/index.ts:378`,
appelée `:1432`) et sortent en bloc 7h (`meal_generation.ts:2461-2504`).

| # | Information | Saisi | Stocké | Bloc |
|---|---|---|---|---|
| E1 | **Jours de cuisine** | `SetupPage.tsx:4221` (ét. 4, 7 chips) · `MealBuilder.tsx:1102` (`/app/plan`) | `practical_constraints.cook_days` | **✅ repas** — `they can only cook on: …`, 3 branches (intersection vide / trop tard / normale). **⚠️ semaine** |
| E2 | **Temps par session** | `SetupPage.tsx:4256` · `MealBuilder.tsx:1127` | `…cooking_time_min` | **✅ repas** (`:2470`) |
| E3 | **Niveau de recette** | `CookingCapacityCard.tsx:127`, `/app/plan` modale section 4 — **cette carte seulement** | `…recipe_difficulty` | **✅ repas** (`:2475`) |
| E4 | **Répétition acceptée** | `CookingCapacityCard.tsx:140`, même endroit | `…variety` | **✅ repas** (`:2477`) |
| E5 | **Budget** | `SetupPage.tsx:4291` · `MealBuilder.tsx:1162` | `…budget_amount` | **✅ repas** — 2 lignes chiffrées (`:2487-2503`) dont l'ordre de sacrifice. Monnaie non nommée : délibéré, `country` est deux blocs plus haut |
| E6 | **Moyens de cuisson** | `KitchenEquipmentCard.tsx:151` → `TableStepPlanning.tsx:124`, `/app/setup` **étape 3, en tête**. Contrôles cachés tant que `practicalConstraints === null` (`:106`) ; sélection vide **refusée** | `…kitchen_equipment[]` (7 jetons) | **❌ LANE INDIVIDUELLE** — voir **R1** |
| E7 | **Forme de cuisson** | `CookingShapeField.tsx:86` — **⛔ jamais en solo** (`api/cookingShape.ts:107` exige ≥2 bouches) | non persisté | **❌** — hors sujet solo, noté pour ne pas le chercher |

## F. Ce qu'il a dit, et ce qui n'est vrai que cette fois

| # | Information | Saisi | Stocké | Lecteur | Bloc |
|---|---|---|---|---|---|
| F1 | **Consignes écrites** | `FoodPreferencesCard.tsx:359` (`/app/plan`, modale section `plan.section.told.title`) · `KnownAboutYouCard.tsx:471` (`/app/about-you`) | `practical_constraints.food_preferences` (origine `written`) | `readFoodPreferences` (`generate-meal-v1:340`, appel `:1757`) | **✅ repas** — bloc 7i, « what they WROTE THEMSELVES … treat these as instructions », **avec l'échappatoire nommée**, revérifiée par `written_instruction_check.ts`. **✅ semaine** (`:311`, `:733-738`) |
| F2 | **Goûts confirmés** | mêmes cartes (boutons de confirmation) + conversation | même colonne, autres origines | idem, `:1746` | **✅ repas** — seconde moitié du bloc 7i, « treat these as preferences » |
| F3 | **Rangement d'un souvenir** (`kind`, direction/magnitude de portion) | `KnownAboutYouCard.tsx:482/499/508`, `/app/about-you` | `…retained_items[]` | `readRetainedItems` ; `generate-meal-v1:1162` | **✅ repas** — routé vers 7i / 7d / 7h / 7j selon `kind`. ⚠️ voir **R9** et **P3** |
| F4 | **Envie du moment** | `MealBuilder.tsx:1229` — champ `meals-preferences`, `/app/plan` | **non persisté** — corps de requête, `generate-meal-v1:655` | — | **✅ repas** — bloc 7j, « what they feel like eating THIS TIME » (`:2683`) |
| F5 | **« Envie de la semaine »** | `MealBuilder.tsx:1256` — **⛔ jamais en solo** (`:1250`, `composingForHousehold`) | `household_envy_submissions` | — | **❌ lane individuelle.** `generate-meal-v1` ne lit pas cette table ; son canal est `practical_constraints.retained_next_plan` (`:1183`) |
| F6 | **Contexte du moment** (contrainte libre) | `MealBuilder.tsx:1281` — champ `meals-context` | non persisté — `:651` | — | **✅ repas** bloc 7j (`:2681`) · **✅ semaine** (`generate-week-plan-v1:754`) |
| F7 | **Garde-manger** | `MealBuilder.tsx:1207` — **seulement si mode = `from_pantry`** (`:1201`) | non persisté — `:656` | `readPantry` | **✅ repas, SOUS CONDITION** (`meal_generation.ts:2690`) → bloc 7k. Sinon « THEY HAVE NOT SHOPPED YET » |
| F8 | **Personnes à table** | `MealBuilder.tsx:992` — solo seulement (`:987`) | non persisté — `:650`, borné 1..12 | — | **✅ repas** — `people at the table: N` (`:2686`) |
| F9 | **Note de remix** (dialogue de brouillon) | `PlanDraftDialog.tsx:259`, après `setup.plan.compose` / composition | corps de requête | `plan_draft_note.ts` | **✅ repas** — `draftNoteSuffix`, greffé après le message (`index.ts:1612`) |
| F10 | **Fenêtre du plan** (du / au) | `SetupPage.tsx:4194/4207` · `MealBuilder.tsx:915/947` | `student_generated_meals.starts_on` / `.duration_days` | `meal_plan_window.ts` | **✅ repas** — `today is:` et `days to fill, in this order:` (bloc 9, `:2751-2757`) |
| F11 | **Mode** (`to_shop` / `from_pantry`) | `MealBuilder.tsx:879` | payload | `:442` | **✅ repas** — `mode: …` (bloc 9) |
| F12 | **Dégoûts** | `MouthFormDialog.tsx:1202` — **⛔ jamais en solo** (`:815`, `memberScoped`) → `household_food_restrictions` | — | — | **❌.** Le seul canal solo pour un dégoût est `/app/health` `kind='dislike'` (C2) ou la prose F1 |
| F13 | **Habitudes** (ligne libre par moment) | `MouthFormDialog.tsx:732` — **⛔ jamais en solo** (`:725`) ; note libre `SetupPage.tsx:4059` — **⛔ solo** (`:3981`) | `household_member_habits` | `household_habits.ts` — **foyer** | **❌ LES DEUX.** Aucune surface, aucun lecteur solo |

## G. Le contexte implicite

| # | Information | Saisi | Stocké | Bloc |
|---|---|---|---|---|
| G1 | **Pays** | inscription / `/account` | `profiles.country` (lu `generate-meal-v1:946`) | **✅ repas** — `they shop in: <ISO-3166>` (`:2716`). **❌ semaine** |
| G2 | **Fuseau** | inscription ; sinon `plan_versions.timezone` | `profiles.timezone` | **✅ repas** — `today's date:` et `today is:`. **Une absence de fuseau REFUSE la composition** (`local_day_unresolved`) |
| G3 | **Langue** | `LocaleSwitch.tsx:66` (barre d'app), `api/uiLanguage.ts:40` | `profiles.locale` | **✅ LES DEUX** — bloc de langue en **queue** (`:2791`, semaine `:578`). ⚠️ `student_goals.content_locale` est `select`é dans les deux et **jamais utilisé** (R14) |
| G4 | **Doctrine du coach** | `/coach/doctrine` | `coach_doctrines` | **✅ LES DEUX** — bloc 3 |
| G5 | **Mapping alimentaire du coach** | `/coach/meals` | protocole | **✅ repas** (`generate-meal-v1:872`, bloc 4). **❌ semaine** |
| G6 | **Note 1:1 du coach** | `/coach/clients/:id` | `coach_notes` | **✅ LES DEUX** — bloc 6 |
| G7 | **`allergy_check` / `diet_asked`** | comptabilité du tunnel — `api/onboarding.ts:2075`, `:2113`, `:1919` | `practical_constraints.allergy_check`, `.diet_asked` | **⚠️ semaine seulement** — aucun lecteur TS backend, et pourtant **sérialisés mot pour mot** dans le prompt de semaine (liste noire, R13) |

**Total : 44 lignes.**

---

# RUPTURES SUSPECTÉES, par gravité

## Gravité 0 — bloque agent 1A dès le premier geste

### R0 · `/app/plan` propose 6 directions, la base en accepte 3
- `frontend/src/keel/pages/StudentWeekPlanPage.tsx:236-243` :
  `GOAL_VALUES = ["fat_loss","muscle_gain","recomposition","performance","health","maintenance"]`,
  et les six cartes radio sont rendues (`:2166`).
- `supabase/migrations/20260818100000_three_directions_and_a_collected_activity.sql:287` :
  `check (goal = any (array['fat_loss','maintenance','muscle_gain']))`.
- `frontend/src/keel/api/bodyMeasures.ts:302-351` : `indicatorFor` est un `switch`
  sur les **trois** survivants, **sans `default`** (vérifié : le `switch` se ferme
  ligne 351 juste après `maintenance`).
- `StudentWeekPlanPage.tsx:2181-2188` appelle `indicatorFor(g.value as GoalToken)` —
  le `as GoalToken` désarme l'exhaustivité TypeScript. Cliquer *recomposition*,
  *performance* ou *health* rend `undefined` et déréférence `.target` / `.axisObjective`.
- Le `<select>` de `/app/setup:2685` ne propose, lui, que les trois bons jetons.
- **Conséquence QA :** la direction doit être posée depuis `/app/setup`, ou depuis
  `/app/plan` **en ne touchant qu'aux trois cartes valides**. C'est la cicatrice
  « `as` sur un type étranger désarme le typecheck » du dépôt, resignée.

## Gravité 1 — le champ est saisissable et n'atteint AUCUN prompt de la lane

### R1 · Les moyens de cuisson ne parlent qu'au foyer
- Écrit : `api/kitchenEquipment.ts:279` → `practical_constraints.kitchen_equipment`.
- **Seuls appelants de `readKitchenEquipment` :** `generate-household-meal-v1/index.ts:3612`
  et `:4614`. `generate-meal-v1` n'importe pas le module ; `buildMealPrompt`
  (`meal_generation.ts:2049-2345`) n'a aucun paramètre d'équipement.
- Le module l'assume et le date : `_shared/keel/kitchen_equipment.ts:17-27`
  (« ⛔ CE MODULE NE PARLE PAS AU MODÈLE … l'exploitation appartient au lot L7 »).
- Sur la lane semaine il n'arrive que comme fragment JSON brut (R13).
- Conséquence : la lane individuelle compose 50 min de four et « je congèle le
  reste » pour quelqu'un qui vient de déclarer n'avoir ni four ni congélateur.

### R2 · Le niveau d'activité n'entre pas dans la consigne
- Écrit : `SetupPage.tsx:2659` → `profiles.activity_level`. Lu : `generate-meal-v1:1580`.
- **Non passé à `buildMealPrompt`** — le call site `index.ts:1661-1786` ne le nomme pas.
- Seul consommateur : `envelopeFor(…)`, `index.ts:2086` — **après** l'appel modèle
  de `:1825`. Le dépôt le déclare : `api/onboarding.ts:366` donne pour `consumer`
  `meal_envelope.ts#ACTIVITY_FACTORS`.
- Chemin indirect **et conditionnel** : l'enveloppe alimente le verdict, qui peut
  produire `correctionRetryInstruction` (`meal_correction.ts:431`) réinjecté en
  **relance** (`:2225`). Cette relance n'existe que si le verdict rend au moins une
  phrase, et les phrases sont des **littéraux gelés sans nombre**
  (`meal_correction.ts:139-149`). Le niveau d'activité n'atteint donc jamais le
  premier prompt, et n'atteint le second que dilué et sans unité.

### R3 · Le régime alimentaire est absent du prompt de semaine
- `buildWeekPlanPrompt` (`week_plan_generation.ts:393-460`) n'a **aucun** paramètre
  de régime.
- `safetyConstraintTokens` (`safety_constraints.ts:360-364`) rend `allergenRef`,
  `substanceRef`, `medicationClass` — **jamais `dietRef`**, délibérément (verser
  « vegan » dans la liste d'évitement armerait la ceinture de sortie sur le mot).
- `grep "dietBlock\|dietary\|diet_ref"` sur `generate-week-plan-v1/index.ts` **et**
  `week_plan_generation.ts` : **zéro occurrence**.
- C'est mot pour mot le défaut que FF-042 vient de fermer sur la lane repas
  (`meal_generation.ts:2103-2117` le raconte) et que `household_diet.ts` a fermé sur
  la lane foyer. La lane semaine ne l'a pas eu.

### R4 · Le poids visé et le rythme n'entrent dans aucun générateur de plan
- `generate-meal-v1:682` : `select("goal, situation, focus_axis, practical_constraints, content_locale")`.
- `generate-week-plan-v1:251` : `select("goal, situation, aspiration, focus_axis, practical_constraints, content_locale")`.
- Ni `target_weight_kg` ni `target_pace_kg_per_week`. Seuls lecteurs backend :
  `meal-energy-v1:737` (le chiffre affiché) et `generate-household-meal-v1:4451`.
- **Poids visé :** exclusion **écrite et argumentée** — `meal_body.ts:63`, « Ce qui
  N'Y EST PAS, et n'y entrera pas ». `api/onboarding.ts:604` donne d'ailleurs pour
  `consumer` un fichier **frontend**.
- **Rythme :** aucun arbitrage trouvé. Colonne créée **aujourd'hui**
  (`20260818190000_the_pace_gets_a_write_port.sql:55`) avec `CHECK`, RPC, curseur
  borné par le corps — et aucun lecteur sur la lane qui compose. Voir « pas pu trancher ».

### R5 · L'aspiration n'atteint pas le prompt repas
- Écrite `StudentWeekPlanPage.tsx:2255` → `student_goals.aspiration`.
- Lue par `generate-week-plan-v1:251/757` et injectée (`week_plan_generation.ts:522`).
- **`generate-meal-v1:682` ne sélectionne pas la colonne.** Le bloc
  `-- WHAT THEY ARE AFTER --` du prompt repas n'a donc que le jeton, l'axe (mort,
  R6) et la situation (inécrivable, R7).

### R6 · `focus_axis` : le seul écrivain atteignable l'EFFACE
- Le `<select>` `StudentWeekPlanPage.tsx:413` n'est rendu que si
  `indicatorFor(goal).axisObjective` — `false` sur les trois objectifs survivants
  (`api/bodyMeasures.ts:308`, `:320`, `:342`). `bodyMeasures.ts:332` le dit :
  « le drapeau existe encore et n'est plus levé par aucune dynamique ».
- Pire que du code mort : `StudentWeekPlanPage.tsx:1871-1873` calcule
  `const axis = indicatorFor(…).axisObjective ? goalDraft.axis || null : null`
  puis l'envoie dans l'`upsert` (`:1889`). **Chaque enregistrement du formulaire
  d'objectif remet `focus_axis` à `null`.**
- Or les deux prompts l'écrivent (`meal_generation.ts:2568`, `week_plan_generation.ts:534`),
  et `generate-meal-v1:1688` est allé jusqu'à le relire défensivement contre
  `WEEKLY_AXES`. Colonne lue deux fois, remplie nulle part, effacée à chaque save.

### R7 · `situation` : deux lecteurs, plus aucun écrivain
- `StudentWeekPlanPage.tsx:1875-1886` retire délibérément la colonne du payload —
  le commentaire assume la conséquence : « Les nouveaux n'en auront pas ».
- Les deux générateurs la lisent et l'injectent (`generate-meal-v1:1698` →
  `meal_generation.ts:2577` ; `generate-week-plan-v1:757` → `:526`).
- Un compte QA neuf rendra donc toujours `their situation: not stated.` — **agent 1A
  ne peut pas remplir ce champ par l'écran.**

### R8 · Les propriétés de jour : un lecteur vivant sur une clé que rien n'écrit
- Lu : `parseDayProperties`, `generate-meal-v1:1423`. Écrit dans le prompt :
  `day_properties.ts:144-157` (bloc 7g), et pilote aussi une règle de parsing
  (`meal_generation.ts:3624`, « jour de restes → jeter les plats sans `uses` »).
- **Aucun writer.** Balayage commentaires retirés de `frontend/src`,
  `supabase/migrations` et `supabase/functions` : côté front uniquement des
  **lectures de la sortie** (`api/planDraft.ts:298`, `api/mealGeneration.ts:677`,
  `:1036`) ; aucune RPC ne pose la clé ; `generate-meal-v1` la relit puis la
  **réécrit dans `generated_from`** (`:2590`, `:2699`, `:2979`), ce qui n'est pas
  une écriture sur `practical_constraints`. Seules occurrences d'écriture :
  des fixtures jetables sous `scratchpad/`.
- **C'est le seul champ de la liste qu'agent 1A ne pourra pas remplir par l'écran.**

## Gravité 2 — présent dans le prompt, mais inexploitable ou ambigu

### R9 · Un champ injecté deux fois, deux valeurs, la conversation gagne en silence
- Les **cinq** clés de capacité de cuisine (`cook_days`, `cooking_time_min`,
  `recipe_difficulty`, `variety`, `budget_amount` — `retained_item.ts:269-273`) ont
  deux sources qui atterrissent au même endroit :
  1. l'écran → `student_goals.practical_constraints` ;
  2. la conversation → `logisticsOverlayFor` (`retained_items_routing.ts:401-428`).
- L'overlay **écrase** le jsonb en mémoire à `generate-meal-v1:1208-1211` (et
  `generate-week-plan-v1:681-684`), **avant** que `readCookingCapacity` ne le lise
  à `:1432`.
- **Agent 1A doit vérifier que `practical_constraints.retained_items` /
  `.retained_next_plan` sont vides** avant de conclure quoi que ce soit sur une
  valeur saisie à l'écran. Même mécanique pour le rythme (`rhythmOverlayFor`, `:1284-1300`).

### R10 · Le shaker arrive sans ses protéines ni ses calories
- La ligne écrite est `fixed_intakes.ts:611` :
  `` `- ${i.label} (${i.amount} ${i.unit})${when}, ${daysProse(i.days)}` ``
- Le type porte pourtant `proteinGPerServing` et `energyKcalPerServing`
  (`fixed_intakes.ts:143`, `:160`, parsés `:344-345`), et l'écran les **exige**
  (`MouthFormDialog.tsx:1128`, `:1139`, et `mouthForm.ts:607` refuse un shaker
  incomplet).
- Ces deux nombres ne partent que dans `augmentedIndexFor` (`:511-545`) → index de
  composition → verdict déterministe. **Le modèle qui compose ne sait pas ce que le
  shaker apporte**, donc ne peut pas en tenir compte en composant.
- L'absence des **kcal** est cohérente avec la règle « aucune calorie dans le texte
  d'un plan ». Celle des **grammes de protéine** ne l'est pas : le prompt système
  demande explicitement d'ancrer la protéine (`PROTEIN_ANCHOR_PROMPT_LINE`).

### R11 · Le déjeuner dehors : inatteignable en solo, et écrasé sur « absent »
Deux ruptures superposées.
- **Écran :** `WorkLunchCard.tsx:220/232/248` n'est **jamais rendu en solo** —
  `workLunchIsAskable` exige un `memberId` (`lib/workLunchForm.ts:103`) et la carte
  rend `null` sur liste vide (`:129`).
- **Parseur :** même quand la clé existe, `parseAwayDays` (`meal_generation.ts:259-305`)
  n'extrait que `day` et `slots` — **`kind` n'est jamais lu**, alors que le front
  distingue `"eating_out"` de `"away"` (`presenceMarks.ts:160-174`).
- Les deux sortiraient donc sous la même phrase (`:2606`) : « they are NOT eating
  here … compose nothing, buy nothing, **and count no portion for them** ». Pour un
  déjeuner dehors, « ne compte aucune portion » est juste ; « il ne mange pas » ne
  l'est pas, et rien ne permet au modèle de rattraper l'énergie ailleurs.

### R12 · Deux sections portent le MÊME en-tête dans le même message
`-- WHAT THEY ALREADY HAVE --` est écrit **deux fois** :
- `_shared/keel/fixed_intakes.ts:603` — les apports fixes (« count them as eaten and
  **do not put them in the shopping list** ») ;
- `_shared/keel/meal_generation.ts:2694` — le garde-manger (ce qu'il a en placard,
  **à cuisiner avec**).

Les deux atterrissent dans le même `userMessage` dès qu'un élève a un apport fixe
**et** compose en `mode: "from_pantry"` : deux sections homonymes qui demandent
l'inverse l'une de l'autre.

### R13 · La lane semaine sérialise tout, y compris la comptabilité du tunnel
`week_plan_generation.ts:560` : `practical constraints: ${JSON.stringify(...)}`.
Le filtre `constraintsForPrompt` (`food_preference_promotion.ts:1215-1226`) est une
**liste noire de 4 clés**. Partent donc au modèle, sans une seule consigne qui les
nomme : `eating_rhythm`, `away_days`, `fixed_intakes`, `kitchen_equipment`,
`day_properties`, `cook_days`, `cooking_time_min`, `recipe_difficulty`, `variety`,
`budget_amount`, le legacy `budget_band`, **et deux drapeaux de comptabilité
d'onboarding** — `allergy_check` (`api/onboarding.ts:2075`, aucun lecteur backend
nulle part) et `diet_asked` (`:1919`, lu seulement par la RPC roster du foyer).
Toute clé ajoutée à l'avenir partira aussi, par défaut.

## Gravité 3 — signalé, faible impact ou probablement délibéré

### R14 · `student_goals.content_locale` est sélectionné et jamais utilisé
Les deux fonctions le sélectionnent (`:682`, `:251`) puis écrivent
`content_locale: built.contentLocale` (`generate-meal-v1:2643`,
`generate-week-plan-v1:911`), issu de `profiles.locale`. Volontaire et commenté
(`generate-meal-v1:1779`) — mais la colonne reste dans le `select`.

### R15 · Un dégoût est servi comme une contrainte dure
`safetyConstraintsPromptBlock` (`safety_constraints.ts:275-278`) imprime `kind` et
`severity`, puis l'en-tête et la consigne globale (`:313-317`) traitent le bloc
entier comme non négociable. Un `kind='dislike'`, `severity='preference'` reçoit
donc la même force qu'une allergie médicale. L'information est là, la consigne ne
demande pas de la distinguer.

### R16 · Le prénom n'existe pas sur la lane individuelle
Documenté et voulu (`api/onboarding.ts:225-234`) : la question n'est pas posée en
branche `solo` **parce que** rien ne la lit. Aucune action — noté pour qu'un
vérificateur ne le compte pas comme un trou.

---

# COMMENT REMPLIR CHAQUE CHAMP DANS L'ÉCRAN

⚠️ Chemins **lus dans le code**, pas parcourus dans un navigateur. Agent 1A doit les
confirmer au premier passage et corriger ici ce qui diffère.
⚠️ `SetupPage.tsx` a été modifié par une autre session pendant ce relevé (4519 → 4516
lignes) : les numéros de ligne de ce fichier sont les plus fragiles de tout le document.

## `/app/setup` — le tunnel, 4 étapes en solo
`situate` → `people` → `table` → `request` (`api/onboarding.ts:919`,
`branchForMouths(1) === "solo"`). Étape `MouthsStep` **non rendue** en solo
(`SetupPage.tsx:1700`). L'écran est un `FunnelShell` **sans coquille d'app** : pas
de nav, pas de sortie. C'est la page d'atterrissage de tout compte sans ligne
`student_goals`.

**Étape 1 `situate`** — cliquer la tuile « Juste moi » (`SetupPage.tsx:2375`).
Avance toute seule (`:959`). En solo, **rien n'est écrit**.

**Étape 2 `people`** — la carte « moi ». Dans l'ordre de l'écran :
| Champ | Geste |
|---|---|
| Date de naissance | `type=date`, `SetupPage.tsx:2605` |
| Taille | nombre 90–250, `:2619` |
| Poids | nombre 25–400, `:2640` → **`student_body_measures`**, idempotent par jour local |
| **Niveau d'activité** | 4 tuiles, `:2659`. ⚠️ `mouthForm.ts:699` ne l'**exige** que sous une direction qui bouge — il reste cliquable sinon, mais rien ne le réclamera |
| Sexe | `<select>`, `:2669` |
| **Direction** | `<select>` 3 valeurs, `:2685` — **c'est la surface sûre**, pas les 6 cartes de `/app/plan` (R0) |
| **Poids visé** + **Rythme** | `MouthFormDialog.tsx:934` / `:975`, montés `SetupPage.tsx:2723`. **N'apparaissent que si la direction ≠ `maintenance`** (`:918` `folded`), et le **curseur de rythme** exige en plus un corps complet (`:947` `needs_body`, `:957` `no_margin`) — donc **saisir taille + poids AVANT** |
| **Allergies** | bouton `household.mouth.preferences_open` (`:2764`) → modale → **replier/déplier « Allergies »** (`MouthFormDialog.tsx:763`) → chips (`:773`), ou « Rien à déclarer » (`:796`) |
| **Shaker** | même modale → repli **« Ce qu'elle mange déjà »** (`:708`, auto-ouvert si direction = `muscle_gain`) → bouton `household.mouth.shaker_add` (`:1089`) → **4 champs, tous obligatoires** : libellé (`:1107`), grammes (`:1117`), **protéines/portion** (`:1128`), **kcal/portion** (`:1139`). `mouthForm.ts:607` refuse un shaker incomplet |

⚠️ Tout l'étape 2 est écrit par `saveSelf` (`SetupPage.tsx:965`) au clic sur
« Suivant » (`:1937`), **dans un ordre load-bearing** : profil → poids → naissance →
direction → cible/rythme → régime → allergies → habitudes → shaker. Le bouton refuse
d'avancer tant que `missesForStep(…,"people")` n'est pas vide (`:1989`).

**Étape 3 `table`** — deux cartes :
| Champ | Geste |
|---|---|
| **Moyens de cuisson** | `KitchenEquipmentCard.tsx:151`, en tête (`TableStepPlanning.tsx:124`). Les contrôles n'apparaissent qu'une fois `practicalConstraints` chargé (`:106`) — attendre. **Cocher au moins un outil** : une sélection vide est refusée par l'écrivain |
| **Régime alimentaire** | 4 chips, `SetupPage.tsx:3863` — **c'est ici, pas à l'étape 2** (`MouthFormDialog.tsx:844` le cache pour soi-même) |
| **Moments de repas** | 6 cases, `:3913` |
| **Taille de chaque moment** | 3 chips, `:3933` — **n'apparaissent que sous un moment coché** (`:3924`) |
| ⛔ Déjeuner dehors | `WorkLunchCard` **ne se rend pas en solo** — ne pas le chercher (R11) |

**Étape 4 `request`** :
| Champ | Geste |
|---|---|
| Fenêtre du plan | 2 `type=date`, `:4194` / `:4207` (le « au » est plafonné à début+6) |
| **Jours de cuisine** | 7 chips, `:4221` |
| **Temps par session** | chips, `:4256` |
| **Budget** | nombre, `:4291` |
| ⛔ Forme de cuisson / grille de présence | **jamais rendues en solo** (`api/cookingShape.ts:107`, `lib/presenceRoster.ts:88`) |
| Note de remix | après `setup.plan.compose` (`:2087`), le dialogue de brouillon s'ouvre : `PlanDraftDialog.tsx:259` |

## `/app/health`
Formulaire unique, toujours visible. `kind` (`:313`) → `what` (`:331`, **caché si
`kind='medical'`**) → **« Autre »** ouvre la saisie libre (`:357`) → `severity`
(`:372`) → `notes` (`:385`).
**C'est la seule surface solo pour un dégoût** (`kind='dislike'`) et pour tout ce qui
n'est pas une allergie du catalogue.
⚠️ Une contrainte **ne se supprime pas** : trigger
`student_safety_constraints_retraction_only` (migration `20260804190000`). Le bouton
`health.list.retract` (`:291`) passe en `status='retracted'`, il n'efface rien.

## `/app/about-you`
`KnownAboutYouCard` — éditer le texte d'un souvenir (`:471`), le ranger sous un
`kind` (`:482`), et pour `portion.adjust` la direction (`:499`) et l'ampleur (`:508`).
⚠️ La `value` structurée d'un `rhythm.set` / `logistics.set` est **lecture seule ici,
par conception** (`:452`, avertissement `:464`) — donc **impossible de désarmer R9
depuis cet écran**.
⚠️ **FLAG à vérifier en base** : `api/retainedItems.ts:1546` et
`StudentKnownPage.tsx:35-40` annoncent que la RPC `keel_write_retained_items` vit
dans une migration **écrite mais peut-être non appliquée**. Le fichier existe
(`20260818240000_a_write_port_for_what_sophia_knows.sql:197`). Tant qu'elle n'est pas
appliquée, tout cet écran échoue avec le refus nommé `no_write_port` (`:1574`).

## `/app/plan` — l'écran qui compose
La section « à propos de toi » est **une modale** : carte `:2025`, bouton
`plan.change` / `plan.about.setup` `:2028`, modale `:2074`, **4 accordéons**.
| Champ | Geste |
|---|---|
| Taille / naissance / sexe | modale → section 1 (`:2085`) → lien `plan.change`/`plan.add` sur la cellule → `:750` / `:799` / `:843` |
| Poids / tour de taille | même section, `:886`. **Cachés si `restricted`** (plancher TCA, `:879`). ⚠️ Écrivent dans **`weekly_reviews`**, pas dans `student_body_measures` — voir **P1** |
| **Direction** | modale → section 2 (`:2107`), 6 cartes. **⛔ Ne cliquer QUE `fat_loss`, `muscle_gain`, `maintenance`** (R0) |
| **Poids visé / bande / taille visée** | sous la carte sélectionnée (`:2223`, composant `:386`). Caché si `restricted` (`:368`) |
| **Aspiration** | `:2255`, sous la carte sélectionnée |
| ⛔ Axe | `:413` — **ne se rend jamais**, et sauver ce formulaire **efface** `focus_axis` (R6) |
| **Moments de repas** | section 3 (`:2289`) → `EatingRhythmCard.tsx:251` / `:275` |
| **Niveau de recette / répétition** | section 4 (`:2307`) → `CookingCapacityCard.tsx:127` / `:140` — **seule surface pour ces deux-là** |
| **Consignes écrites** | section `plan.section.told.title` (`:2324`) → `FoodPreferencesCard.tsx:359` |
| **Absences** | lien `meals.picker.open` sous le champ de fenêtre du composeur (`MealBuilder.tsx:966`) → `MealPickerGrid.tsx:410`/`:433`. **C'est le chemin solo des absences** |
| Mode `to_shop`/`from_pantry` | `MealBuilder.tsx:879` |
| Fenêtre du / au | `:915` / `:947` |
| Personnes à table | `:992` |
| Jours de cuisine / temps / budget | `:1102` / `:1127` / `:1162` |
| **Garde-manger** | `:1207` — **n'apparaît qu'en mode `from_pantry`** (`:1201`) |
| **Envie du moment** | `:1229`, champ `meals-preferences`. **C'est CE champ-là** |
| **Contexte / contrainte libre** | `:1281`, champ `meals-context` |
| ⛔ « Envie de la semaine » | `:1256` — **ne s'affiche pas en solo** (`:1250`) et écrit dans une table que la lane individuelle ne lit pas |

## `/app/progress` (`StudentProgressPage.tsx`)
Séances d'activité : date (`ActivitySessionsCard.tsx:419`), type (`:431`), durée
(`:454`), intensité (`:471`).
⚠️ **`pages/ProgressPage.tsx` est du code mort** — routé nulle part. Ne pas s'y fier.
⚠️ **Aucune saisie de poids ici** — elle est sur `/app/setup` et `/app/plan`.

## `/app/today`
Cochage des repas (`DishCard.tsx:163`) et motif de décochage (`:395`).
⚠️ La photo de repas (`:545`) et le formulaire de déviation (`DeviationDialog.tsx`)
n'existent que sous la branche `ready`, qui exige un `plan_versions` publié —
`TodayPage.tsx:929` écrit que **le cas nominal du modèle 1:N est qu'il n'y en a
aucun**. Ces surfaces sont donc inatteignables ; ne pas les compter comme des
champs à remplir.

## `/account`
Pays, fuseau. Langue : `LocaleSwitch.tsx:66` dans la barre d'app.
⚠️ **Sans fuseau lisible, `generate-meal-v1` refuse de composer** (`local_day_unresolved`).

## ⛔ Impossible par l'écran
- **Propriétés de jour** (`day_properties`) — R8. Aucun formulaire nulle part.
- **`situation`** — R7. Champ retiré, colonne toujours lue.
- **`focus_axis`** — R6. Porte jamais ouverte, et le save l'efface.
- **Déjeuner dehors**, **dégoûts (comme tels)**, **habitudes**, **envie de la semaine**
  — R11, F12, F13, F5 : gates `memberScoped` / `composingForHousehold`.

Observer les blocs correspondants exigerait de poser la clé en base. **Ce n'est pas
« remplir par l'écran »** et doit être consigné comme tel dans tout run.

## PIÈGES DE COMPTE — à régler AVANT le premier run

**P1 · Le poids a trois surfaces et deux tables.**
`/app/setup:2640` écrit dans **`student_body_measures`** ;
`/app/plan:886` passe par un jeton de formulaire de chat (`saveMeasures`, `:1925`)
et atterrit dans **`weekly_reviews`** (la table n'a pas de policy d'écriture élève,
`:1919`) ; `WeeklyCheckInDialog.tsx:230/238` sur `/app/chat` est une troisième
surface.
`student_body_io.ts:210-260` **fusionne les deux sources**, et
`student_body_measures` **gagne** (`:265`, `derived.weight.get(week) ?? readMeasure(...)`).
Un poids saisi sur `/app/plan` peut donc être masqué par un poids plus ancien saisi
sur `/app/setup` la même semaine ISO. **Choisir UNE surface par run et le noter.**

**P2 · Le plancher TCA efface le corps du prompt.**
Si `restrictionFlag` est vrai, **taille et poids disparaissent** (`meal_body.ts:139`,
`:165`) et `envelopeFor` passe en branche dégradée (`meal_envelope.ts:653`). Le
drapeau est **fail-closed** : une lecture en panne (`generate-meal-v1:1449-1466`)
produit exactement le même prompt qu'un élève sous restriction. Un run qui ne trouve
pas la taille doit d'abord éliminer cette cause — le log
`keel.meal.restriction_floor_unreadable` la nomme.

**P3 · Les `retained_*` battent l'écran.**
Voir R9. Vérifier que `student_goals.practical_constraints` ne porte ni
`retained_items` ni `retained_next_plan` avant d'attribuer une valeur du prompt à un
geste d'écran. Un compte qui a déjà conversé n'est pas une fixture propre.

**P4 · `mergePracticalConstraints` réécrit la colonne entière.**
`api/practicalConstraints.ts:58` : `{ ...(args.current ?? {}), ...args.patch }` dans
un `UPDATE`. `current` est le **instantané que la carte appelante a en props**. C'est
la cicatrice « `current` périmé efface l'écriture d'avant » du dépôt : deux cartes
ouvertes sur deux onglets, ou une carte montée avant une écriture faite ailleurs,
et la seconde écriture **efface la première**. Remplir les clés
`practical_constraints` **une carte à la fois, avec un rechargement entre deux**.

---

# CE QUE JE N'AI PAS PU TRANCHER

1. **Le rythme (`target_pace_kg_per_week`) : oubli ou arbitrage ?**
   Le poids visé a son exclusion **écrite** (`meal_body.ts:63`). Le rythme, non : il a
   une colonne, un `CHECK`, une RPC d'écriture, un curseur borné par le corps — et
   pour seuls lecteurs `meal-energy-v1` et la lane foyer. **Aucun commentaire** ne dit
   que la lane repas ne doit pas le lire. La colonne date du **2026-08-18, aujourd'hui**
   (`20260818190000_the_pace_gets_a_write_port.sql`) : c'est probablement un lot en
   cours. **À confirmer auprès de l'humain avant de le compter comme un défaut.**

2. **Le shaker sans ses grammes de protéine (R10) : refus délibéré ou oubli ?**
   L'absence des kcal suit la règle « aucune calorie dans le texte d'un plan ». Celle
   des grammes de protéine n'a pas de justification trouvée, et le prompt système
   réclame par ailleurs une ancre protéique.

3. **Les séances d'activité (`student_activity_sessions`, A8).**
   Un écran complet les collecte (`ActivitySessionsCard`), une table les stocke, un
   module `activity_session.ts` existe. Je n'ai **pas** trouvé d'import dans les deux
   générateurs, mais je n'ai pas remonté toute la chaîne (`activity_floor.ts`,
   `activity_stance.ts`, `daily_recommendation`). **À vérifier avant de conclure.**

4. **La série de poids traverse-t-elle vraiment ?**
   `student_body_io.ts:250` itère `for (const row of rows)` — les lignes
   `weekly_reviews`. Un poids de `student_body_measures` posé dans une semaine
   **sans** ligne `weekly_reviews` pourrait ne jamais entrer dans la série. Un
   commentaire ligne 286 suggère un rattrapage après cette boucle ; je ne l'ai pas lu
   en entier. **Conséquence directe pour agent 1A : un poids saisi sur un compte neuf
   peut n'apparaître dans aucun prompt sans que ce soit le plancher TCA.**

5. **`away_days` : l'élève voit-il l'union avec les marques du maître ?**
   La migration `20260812130000_household_presence.sql:436-448` décrit une **union**
   entre `household_members.away_days` et
   `student_goals.practical_constraints.away_days`, avec une clé `source`.
   `parseAwayDays` ne lit **ni `source` ni `kind`**, et `generate-meal-v1:1317` lit la
   colonne directement — donc **a priori** seulement la sienne. Non vérifié en base.

6. **`profiles.gender`.** `student_body_io.ts:196` la sélectionne ; je n'ai pas
   remonté la migration qui la crée ni comparé son `CHECK` à `MEAL_BODY_GENDERS`
   (`meal_body.ts:42`) ni à `MEMBER_GENDERS` du front.

7. **La RPC `keel_write_retained_items` est-elle appliquée ?**
   Question d'**état de base**, pas de code (le fichier existe). Elle décide si
   `/app/about-you` fonctionne du tout. `docker exec supabase_db_Sophia_2 psql …
   "select version from supabase_migrations.schema_migrations order by version desc
   limit 5;"` tranchera — et rappel du briefing : une migration **hors ordre est
   sautée en silence**.

8. **Les numéros de ligne de `SetupPage.tsx`.**
   Le fichier a bougé pendant le relevé (autre session, 4519 → 4516 lignes). Les
   références à ce fichier sont à revalider ; celles des modules `_shared/keel/*` et
   des deux `index.ts` ont été relues en fin de course et sont stables.
