# Huit points, huit agents — analyse du dépôt, décisions à trancher, ordre d'exécution

**Date** 2026-09-03 12:37 · **Branche** `ff-001-quotidien-du-coach` · HEAD `5d630e4d`
**Nature** lecture du code (huit explorations parallèles, ~700 fichiers ouverts), pas une
proposition de design hors-sol. Chaque affirmation cite `fichier:ligne`. Rien n'est implémenté.
**À lire avec** [CLAUDE.md](../CLAUDE.md) · [docs/keel/MODEL.md](../docs/keel/MODEL.md) ·
[le-foyer/README.md](../docs/fonctionnalites/le-foyer/README.md) · le prompt maître du 17/08
([2026-08-17-MASTER-PROMPT-PLAN-FOYER-PAR-JOUR.md](2026-08-17-MASTER-PROMPT-PLAN-FOYER-PAR-JOUR.md))
dont ce document reprend le format et les règles transverses (§2).

---

## 0. Ce qu'il faut savoir avant de lire les huit points

### 0.1 La moitié de ce qui est demandé existe déjà, à moitié

| Demande | Ce qui existe | Ce qui manque |
|---|---|---|
| Courses/cuisson la veille, coupure 18 h | `SHOPPING_CUTOFF_HOUR = 18` (`_shared/keel/plan_hours.ts:54`) ; `withCookDayBefore` (`meal_plan_window.ts:512-544`) ; `suggested_window` calculé et **jamais rendu** | la veille est une **case manuelle** ; `buyOn` est **borné au premier jour du plan** (`grocery_waves.ts:316`) |
| Sessions de cuisine / cadence de courses | 1 session = 1 vague, déduit (`grocery_waves.ts`) ; `one_cooking_session` gaté congélateur | **aucune question sur les courses**, **aucun plafond** de sessions, `cook_days` écrit `[]` depuis le 01/09 |
| Membre qui dit « pas mangé » | bifurcation maître/membre **armée** (`evening_strip_io.ts:98`, `masterOnly`) ; boîtes par bouche dans le plan | le membre n'a **ni chat, ni bande, ni coche** : les crons filtrent `keel_role='student'`, il porte `NULL` |
| Créneaux loupés | canal C1 de FF-062 (`slot_meal_ask.ts`) : photo / décrire / passer | limité aux créneaux `eating_out` déclarés, et au chat |
| Courbe de poids | `student_body_measures`, série datée append-only | **interdite** par FF-031 §3 (« pas de graphe ») — à renverser par écrit |

### 0.2 Cinq demandes contredisent une décision écrite, et il faut la renverser explicitement

Le dépôt refuse les renversements silencieux ; chacun s'écrit là où la phrase inverse vivait.

| # | Décision écrite | Où | Point qui la renverse |
|---|---|---|---|
| R1 | « il faut arrêter avec le dépliable » (2026-08-19, trois motifs mesurés) | `MouthFormDialog.tsx:326-345` | **P5** : deux cadres repliables par membre |
| R2 | « Pas de graphe quotidien, aucune nouvelle surface d'affichage du poids » | FF-031 §3, R12 | **P7** : courbe 1 sem → depuis la création |
| R3 | « Un kcal photo ne se somme JAMAIS » (biais −26,6 %, ×2,5 sur les deltas) | `api/mealPhoto.ts:92-96` ; « sommer les comptes est un score d'adhérence déguisé » `20260808050000:50-56` | **P7** : totaux jour/semaine/plan avec parts estimées |
| R4 | « ❌ le chat, dans cette version » pour un profil réclamé ; « ❌ aucun canal 1:1 dans le foyer » | FF-048 §3 ; le-foyer/README:138-141 | **P8** : bande du soir et photo pour le membre |
| R5 | « Un profil réclamé n'atteint pas `/app/progress` » — **verrouillé par un test** | `routeGuards.int.test.ts:50-59`, `KeelHouseholdRoute.tsx:22-26` | **P7**, **P8** |

Et une demande qui **n'en contredit aucune** mais qu'on croyait interdite : FF-005 §3 refuse de *déduire* la stratégie de courses ; P2 la **demande** (1/2/3 courses) et en déduit l'usage du congélateur. C'est conforme.

### 0.3 ⛔ Le blocage qui précède tout : l'arbre de travail

`git status` : **369 entrées** — 235 modifiés, 123 non suivis, 13 stagés dont 6 `MM` (stagés puis
remodifiés). Les stagés forment un lot cohérent « le chiffre affiché » à moitié commité
(`energy_gate.ts`, `meal-energy-v1`, `20260901140000_the_direction_opens_the_number.sql`,
`fr.ts`, `en.ts`, `catalog.ts`…). `fr.ts` et `en.ts` portent **~80 ko** de traduction non
commitée. Au moins deux lanes ont écrit cette nuit (`SetupPage.tsx` 01:51, `generate-*-v1` 01:49,
vitrine 23:23).

**Conséquence directe** : un `git worktree` par agent partirait de `HEAD`, **sans onze jours de
travail**. Huit agents ne peuvent donc travailler en parallèle **que si l'arbre est d'abord commité**
(Lot 0, §11). Sinon, tout est en série dans le même arbre, comme les chantiers précédents.

---

## 1. P1 — Les courses et la cuisson la veille, automatiques

### 1.1 Ce que le code fait aujourd'hui

- **La règle des 18 h existe**, avec le motif de l'utilisateur en commentaire : `plan_hours.ts:50-54`.
  Trois lecteurs : `proposedWindowStart:157` (propose **demain** après 18 h, motif
  `shopping_cutoff`, **jamais un refus**), `cookingAskedToday:230`, `firstWindowDayIsCookable:248`.
  `hourNow` vient du fuseau **serveur** (`profiles.timezone` → `localMinuteInZone`,
  `generate-meal-v1/index.ts:1069-1108`) ; **le front ne connaît pas l'heure** (`browserLocalDate()`
  seulement, `useMealTicks.ts:120-123`).
- **La veille existe comme case** : `CookDayBeforeField.tsx`, montée sur `/app/plan`
  (`MealBuilder.tsx:1140`) et dans l'entonnoir (`SetupPage.tsx:6688`). La réponse voyage dans le
  corps HTTP (`cook_the_day_before`), jamais en base. `withCookDayBefore`
  (`meal_plan_window.ts:512-544`) recule `starts_on` d'un jour, allonge `duration_days` d'un jour,
  et nomme la veille `cookOnlyDay` : elle est **dans la fenêtre et hors des jours à remplir**
  (prompt `:2116`, parseur `:2245`, rationale `:3479`, `emptySlotsIn` la saute). Deux refus nommés :
  `no_room` (7 jours déjà) et `in_the_past`. **La veille a déjà le droit d'être aujourd'hui**
  (`:533-536`).
- **La date d'achat est bornée au premier jour du plan** : `grocery_waves.ts:300` (`let buyOn =
  startsOn`) et `:316` (`earliest > startsOn ? earliest : startsOn`), motif écrit `:305-306`
  (« on n'envoie personne faire des courses la semaine d'avant »). Avec une veille dans la fenêtre,
  la première vague tombe **de fait** sur la veille (rang 0). `:317` ne pose `serves` que si
  `buyOn > startsOn` — `servesCookOn` est `null` sur la vague du rang 0 (piège documenté `:216-229`).
- **La bande du soir** ne pose la question de courses que si `buyOn === localDate` **et** si le plan
  est courant (`evening_strip_io.ts:273`, `planWindowState`). Avec la veille dans la fenêtre,
  `starts_on` = la veille ⇒ le plan est courant ce soir-là ⇒ la question part. ✅
- **Aucune notion de plan « qui commence dans le passé »** : `resolveRequestedWindow:257` refuse
  `startsOn < today` ; `catchUpWindowStart` (`useMealTicks.ts:144`) rattrape le passé.
- `grocery_strategy` de FF-005 : **zéro occurrence dans le code**.

### 1.2 Comment l'implémenter

**Une seule fonction pure décide, côté serveur, dans `plan_hours.ts`** (sœur de
`firstWindowDayIsCookable`) :

```
leadDayFor({ startsOn, today, hourNow }) →
  { leadDay: date | null, timing: "day_before" | "same_morning", reason }

  startsOn ≥ today + 2                → leadDay = startsOn − 1        timing day_before
  startsOn = today + 1, hourNow < 18  → leadDay = today               timing day_before
  startsOn = today + 1, hourNow ≥ 18  → leadDay = null                timing same_morning  ⚠ avertissement
  startsOn = today                    → leadDay = null                timing same_morning  ⚠ avertissement
                                        (après 18 h : proposedWindowStart pousse déjà à demain → cas 3)
  hourNow = null (horloge illisible)  → leadDay = null, reason "clock_unreadable" — jamais deviné
```

Puis, dans les deux lanes (`generate-meal-v1/index.ts:1294-1303`,
`generate-household-meal-v1/index.ts:3169-3178`) : `withCookDayBefore` est appelé avec
`asked = leadDay !== null` **dérivé**, plus jamais lu de la requête. La case disparaît.

**La veille reste DANS la fenêtre** (décision D1.1, ci-dessous). Ce qui rend ce choix possible
sans toucher vingt lecteurs : tout ce qui itère les sessions par jeton de jour (`CookingSessions`,
`PlanDayBlock`, `dishSession`, la cascade, le glissement, le PDF) marche déjà avec `cookOnlyDay`.
Ce que ça coûte, et qu'il faut payer dans ce lot :

1. **Le plafond de 7** : `no_room` deviendrait **systématique** sur tout plan de 7 jours. Le
   plafond doit se redéfinir en **jours mangés** : `MAX_WINDOW_DAYS = 7` s'applique à
   `daysToEat`, la fenêtre peut faire 8. CHECK `duration_days between 1 and 7`
   (`20260807090000:147-148`) → `1 and 8` avec une colonne `lead_days smallint default 0`
   (0 ou 1) et un CHECK `duration_days - lead_days between 1 and 7`.
2. **La contrainte d'exclusion** (`20260807090000:174`) : la veille du plan N+1 **est** le dernier
   jour mangé du plan N (on fait les courses dimanche soir pour lundi pendant qu'on dîne encore
   le plan de la semaine). Physiquement juste, refusé par la base. L'exclusion doit porter sur
   les **jours mangés** : `daterange(starts_on + lead_days, starts_on + duration_days)`. FF-006
   l'a écrit : les trois mécanismes (boucle de la RPC `write_student_meal_plan`, index unique,
   exclusion) **bougent ensemble**, plus `firstBlockingPlan` (`meal_plan_window.ts:339-352`).
3. **`buyOn`** : la borne `startsOn` reste juste — la veille EST `startsOn`. Ce qui change est
   `:317` : `serves` doit se poser sur `buyOn > firstBuyOn`, sinon `servesCookOn` reste `null`
   partout et `shiftProposalAfterShoppingLater` (`accident.ts:1081`) ne propose plus rien —
   **panne silencieuse**.
4. **L'avertissement de timing** : porté par le **serveur** dans la réponse et dans
   `generated_from.timing` (jamais calculé au navigateur : le front n'a pas l'heure, et
   `local_date.ts:9-12` refuse tout repli UTC). Le crochet existe : `planDraft.ts:170-171`
   lit déjà `suggestedShifted`, que **aucun `.tsx` ne rend**. Rendu : en tête de `PlanResult`
   (donc aperçu **et** validé, FF-053 C8), sur `KitchenToday`, et une ligne dans le PDF
   (`meal_pdf.ts:161-178`). Texte : *« Courses et cuisson dès le matin pour être prêt à midi. »*
   Aucun composant `Notice` n'existe dans `ui/` — réutiliser `Card`.
5. **`one_cooking_session`** : `cookOnlyDay` est placé en tête de `effectiveCookDays`
   (`meal_generation.ts:3813`) ⇒ la session unique tombera **toujours** sur la veille. C'est
   souhaitable, et c'est un changement de comportement à nommer dans la rationale.
6. **Retrait de la case** : `CookDayBeforeField.tsx`, ses 4 clés `plan.cooking.day_before_*`
   (`fr.ts:6433-6444`), `MealBuilder.tsx:56,497,858,918,1140-1148`, `SetupPage.tsx` (10 sites),
   `planDraft.ts:554,570`, `mealGeneration.ts:800`, `household.ts:1656`,
   `setupDraftCache.ts:103,346`. ⚠️ `oneCookingSessionField.int.test.ts:86-110` **exige** la
   présence de `<CookDayBeforeField` : le test se retourne, il ne se supprime pas.

### 1.3 Décisions à prendre avant de coder

| # | Question | Recommandation |
|---|---|---|
| **D1.1** | La veille : dans la fenêtre (mécanisme actuel) ou hors fenêtre (`buyOn` seul recule) ? | **Dans la fenêtre.** Hors fenêtre, la *session* de la veille est inexprimable (`cooking_sessions[].day` est un jeton résolu par `windowDates`, qui ne connaît que la fenêtre) — or la demande dit « courses **et** cuisson ». Le prix est une migration sur trois mécanismes (§1.2 pts 1-2). |
| **D1.2** | Composer avant 18 h pour **demain** : la veille = aujourd'hui, donc courses **et** cuisson aujourd'hui, ce soir ? | Oui, c'est ce que la demande dit, et `withCookDayBefore:533-536` l'autorise déjà. Nommer dans la rationale : *« tout est cuisiné ce soir »*. |
| **D1.3** | Un plan de 7 jours mangés = fenêtre de 8. Faut-il autoriser 8, ou plafonner à 6 mangés + 1 ? | Autoriser 8 (jours mangés ≤ 7). Plafonner à 6 amputerait la fin, ce que `:489-492` interdit. |
| **D1.4** | Foyer : quel fuseau décide de `hourNow` quand deux comptes ont deux fuseaux ? | Celui du **compositeur** (le maître), déjà le cas des deux lanes. |
| **D1.5** | Sort de FF-005 (`grocery_strategy`, jamais construit) | Remplacée par P2 (le nombre de courses). Passer la fiche 🔴 avec le motif. |
| **D1.6** | Un `buyOn` déjà passé au moment d'adopter (onglet ouvert la nuit) | Garde symétrique de `catchUpWindowStart` : si `leadDay < today`, recalculer à l'adoption (`writeFromDraft` recompose déjà). |

### 1.4 Effort, tests, fichiers

**3 jours.** Fichiers : `plan_hours.ts`, `meal_plan_window.ts`, `grocery_waves.ts:296-333`,
les deux `index.ts`, une migration (cap + exclusion + RPC), `PlanResult`, `KitchenToday`,
`meal_pdf.ts`, retrait de la case (11 sites). Tests à retourner : `grocery_waves_test.ts` (~30),
`cook_the_day_before_test.ts` (15, dont 4 de câblage par lecture de source),
`oneCookingSessionField.int.test.ts`, `shoppingWhen.int.test.ts`, `wave_cascade_test.ts`,
`accident_test.ts`, `evening_strip_test.ts`, `day_review_test.ts`, `plan_rationale_test.ts:539,661`,
`planDraft.int.test.ts:188`, `meal_pdf_locale_test.ts`, **`constant_pinning_gate_test.ts:842`**
(toute constante exportée nouvelle doit y être épinglée). Bump `MEAL_PROMPT_VERSION` (v24 → v25)
et `HOUSEHOLD_PROMPT_VERSION` si l'enveloppe bouge.

---

## 2. P2 — « Comment voulez-vous cuisiner ? » et « Combien de courses ? »

### 2.1 Ce que le code fait aujourd'hui

- **La seule question chiffrée** est `setup.plan.time` = « Combien de temps dure une session de
  cuisine » (`fr.ts:3509`) → `practical_constraints.cooking_time_min`, **bloquante** dans
  l'entonnoir (`onboarding.ts:590`, `weight: "wrong"`). Lue par `readCookingCapacity` — **dupliquée**
  dans les deux lanes (`generate-meal-v1/index.ts:479-514`, `generate-household-meal-v1/index.ts:559-584`),
  sans test qui compare les deux.
- Les autres leviers existent : `recipe_difficulty` (`simple|normal|keen`), `variety`
  (`repeat|some|varied`), `budget_amount`, `kitchen_equipment` (7 jetons, dont `freezer`, à
  **trois états** : clé absente ≠ `[]`), `one_cooking_session` (requête, gaté congélateur des deux
  côtés + rationale : trois implémentations alignées, `freezerMirror.int.test.ts` les tient),
  `cooking_shape` (foyer ≥ 2, **plafond jamais ordre**, `capCookingShape`).
- **Aucune question sur les courses** — zéro clé i18n, zéro champ. Les vagues sont une **sortie** :
  `buyOn = max(startsOn, cuisson − fenêtreCrue(groupe))`, une session ⇒ une vague.
- **Aucun plafond de sessions.** `plan_feasibility.ts:45-49` dit pourquoi il n'y a pas de
  `sessionsFloor` exporté (« rien ne le lirait ») et `:27-40` pourquoi on n'ajoute jamais une
  session (= une vague de courses = un déplacement de plus).
- `cook_days` est **écrit `[]`** depuis le 01/09 (`planBudget.ts:242`) pour neutraliser les
  valeurs héritées ; trois lecteurs dorment : `cookDayLines`, `daysOutOfBatchReach`,
  `weeklyCookingMinutes` (donc le seuil de 90 min qui ouvre « un plat ou deux »).
  ⚠️ `oneCookingSessionField.int.test.ts:73` **interdit littéralement** le retour d'un champ
  « jours de cuisine » à l'écran.
- Constantes : `MAX_FRIDGE_DAYS = 3`, `FREEZER_WINDOW_DAYS = 7`, `SESSION_OVERRUN_FACTOR = 2`,
  `SEPARATE_DISH_MIN_WEEKLY_MINUTES = 90`.
- Le libellé de la 3e option existe déjà : `plan.cooking.difficulty_keen` = **« J'aime cuisiner,
  envoie »** (`fr.ts:6390`).

### 2.2 Comment l'implémenter

**Deux réponses durables** sur le profil (FF-005 : « une propriété de sa vie »), dans
`practical_constraints` : `cooking_style ∈ {minimal, balanced, keen}` et `grocery_runs ∈ {1,2,3}`.
Clé absente = **jamais demandé**, jamais « minimal » (cicatrice `20260818110000:48-51`).
`cooking_time_min` cesse d'être demandé et devient **dérivé** ; la clé reste (cinq lecteurs,
`WRITABLE_FIELDS`, l'effet du retour de fin de plan).

**Un module pur, une seule définition** (`_shared/keel/cooking_plan.ts`, réexporté côté front comme
`groceryWaves.ts` l'est — « si tu ajoutes une règle ici, tu as recréé le jumeau ») :

```
deriveCookingPlan({ style, runs, freezer: true|false|null, daysToEat, leadDay, mealsToCover })
→ { sessions, cookDays[], sessionMinutes, difficulty, variety, usesFreezer, notes[] }
```

| Style \ Courses | 1 course | 2 courses | 3 courses |
|---|---|---|---|
| **Le moins possible** — 30 min · `simple` · `repeat` | 1 session (veille), **congélateur requis** ; sinon → 2 sessions, note `runs_1_needs_freezer` | 2 sessions : rang 0, rang 3 | 2 sessions ; la 3e course = frais du jour (note « 2 courses suffisent ») |
| **Un juste milieu** — 60 min · `normal` · `some` (défaut) | 1 session, congélateur requis ; sinon 2 | **2 sessions** (cas nominal) | 3 sessions : rangs 0, 2-3, 5 |
| **J'aime cuisiner** — 120 min · `keen` · `varied` | 1 grosse session (plafond ×2 = 240) ; congélateur requis | 2 sessions + jours `cook_fresh` | **3 sessions**, jours `cook_fresh` entre |

- `sessions = min(runs, 3, cap(style))` ; `cookDays` = rang 0 (la veille de P1) puis espacés de
  `MAX_FRIDGE_DAYS` sur les **repas à couvrir** (les absences réduisent la demande —
  `resolveWindowPresence`), jamais sur le calendrier nu.
- `cookDays` dérivés sont **écrits à la composition** comme `[]` l'est aujourd'hui (même écrivains,
  `planBudget.ts:242`, `onboarding.ts:2526`) : ça **réveille exprès** les trois lecteurs endormis, et
  `planGroceryWaves` produit alors exactement `sessions` vagues. Invariant de rang 2
  (`SYNTHESE-GENERATION-PLAN.md §6`) : **rien de dérivé ne part sans une ligne de `plan_rationale`**
  (« 2 courses : jeudi et dimanche » / « une seule session, tout au congélateur »).
- Congélateur : la porte reste celle qui existe (`askedOneCookingSession && hasFreezerDeclared`),
  on ne crée **pas** une quatrième chance de diverger ; « 1 course » **implique** `one_cooking_session`
  et son refus nommé quand il n'y a pas de congélateur (`one_cooking_session_refused`).
- Foyer ≥ 2 : le style **plafonne** `cooking_shape` via `capCookingShape` (« le moins possible » ⇒
  `one_dish`). ⚠️ `weeklyCookingMinutes = cookDays.length × minutes` se réveille : 1 × 30 = 30 < 90 ⇒
  `one_dish` forcé — vraisemblablement voulu, à décider (D2.4).
- Ordre des questions : **l'équipement avant le style** (le congélateur gate « 1 course ») — l'ordre
  de `TableStepPlanning` est mesuré sur le HTML rendu (`tableStepPlanning.int.test.ts`).
- Entonnoir : `cooking_style` et `grocery_runs` en `weight: "wrong"` ; `cooking_time_min` passe en
  `"better"` (l'entrée reste : le moteur lit la clé). Catalogue `onboarding.ts:589-597`, porte
  `:1268-1276`, `savePlanAnswers:2526-2527`, `setupMisses.ts`, `setupDraftCache.ts:101-103,345-346`.
- Migration : `comment on column` reprenant **mot pour mot** `20260818110000:69-100` + les deux clés ;
  **aucun CHECK sur la valeur** (doctrine `20260805150000:58-64`) ; étendre la liste fermée de
  `20260901180000:87-93` **et** `WRITABLE_FIELDS` (`api/fieldChanges.ts:31-38`, `_shared/keel/field_change.ts`)
  — le contrôle ⑤ de cette migration échoue sinon.
- Compat : les comptes existants gardent `cooking_time_min` ; sans style, les lecteurs l'utilisent
  tel quel (additif) ; la question apparaît sur `/app/plan` à l'état « jamais demandé ».
- Surfaces : un composant `CookingStyleField` + `GroceryRunsField` (patron `CookingShapeField` :
  jetons dans `api/`, mots dans le composant — `pageSeams` rougit sinon), montés aux **deux** endroits
  (`SetupPage.tsx:6844-6871` à la place du temps ; `MealBuilder.tsx:1341-1372`).
- Bump `MEAL_PROMPT_VERSION` (+ foyer si l'enveloppe change) ; deux tests l'exigent nommément.

### 2.3 Décisions à prendre avant de coder

| # | Question | Recommandation |
|---|---|---|
| **D2.1** | Durable (profil) ou par demande (comme `one_cooking_session`) ? | **Durable**, éditable sur `/app/plan` avant chaque composition. « Cette semaine je reçois » se règle par `one_cooking_session` qui reste. |
| **D2.2** | Les libellés FR des trois styles | « Le moins possible — je réchauffe » · « Un juste milieu » · « J'aime cuisiner, envoie » (réutilise `difficulty_keen`). À valider. |
| **D2.3** | `runs` > cap du style (« le moins possible » + 3 courses) | Le style plafonne les **sessions**, pas les courses : 2 sessions, et la rationale dit que deux courses suffisent. Ne jamais forcer une session que la personne n'a pas demandée (`plan_feasibility.ts:27-40`). |
| **D2.4** | Réveiller `weeklyCookingMinutes` (seuil 90 min ⇒ un plat) pour les foyers | Oui, mais **dit** : c'est un changement de comportement pour les foyers, pas un nettoyage. |
| **D2.5** | Le retour de fin de plan (`cooked: no` → `cooking_time_min`, FF-054) | L'effet migre : « pas eu le temps » descend le **style** d'un cran, jamais un nombre de minutes que plus personne ne voit. |
| **D2.6** | Foyer : fait de **maison** (ligne du maître, comme `kitchen_equipment`) ou par personne ? | Fait de maison. Un secondaire qui prend la main a le sien. |

### 2.4 Effort, tests, fichiers

**3 jours** (après P1 : la veille est le rang 0). Voir la liste exhaustive du rapport P2 ; les
pièges à ne pas rater : `plan_feedback_retained.ts:100` **parse `COOKING_SESSION_MINUTES` par
regex sur la source** ; `retained_item_test.ts:304` cite `cookDays.length × cooking_time_min` ;
`kitchen_equipment_solo_lane_test.ts:126` exige « le message d'avant, au caractère près » sans
réponse ; `eatingRhythm.int.test.ts:148-158` liste les clés de `practical_constraints`.

---

## 3. P3 — La 4e option d'objectif

### 3.1 Ce que le code fait aujourd'hui

- Le socle ne porte **que trois jetons** : `GOAL_TOKENS = ["fat_loss","maintenance","muscle_gain"]`
  (`_shared/keel/tokens.ts:630`) ; `recomposition`, `performance`, `health` repliés le 18/08
  (`RETIRED_GOAL_TOKENS:687`, migration `20260818100000:317-326`). `schema.sql:9267` est **périmé**.
- **La 4e ligne est l'option vide** : `<option value="">Aucune direction particulière</option>` —
  `fr.ts:2491` (`household.member.goal_none`), `fr.ts:3044` (`setup.mouths.goal_none`), et la
  variante muette `—` sur l'étape « moi » (`SetupPage.tsx:4358`). Sites : `SetupPage.tsx:4358,
  4925, 5602, 5137`, `HouseholdPage.tsx:983, 993`. Le radiogroup de `MouthFormDialog.tsx:956-978`
  n'en a que trois.
- « Pas d'objectif » est un **état porté par tout le moteur** : `goalApplies` → `false`,
  `NEUTRAL_DIRECTION` distinct de `SERVING_DIRECTION.maintenance` (`household_portions.ts:285-295`),
  `energySwitchFrom` distingue `no_direction` de `maintenance` par le même `null`.
- ⚠️ **Les mineurs** : depuis `20260822041500`, `fat_loss` **et** `muscle_gain` sont refusés sur un
  mineur (`goal_not_for_minor`) ; seul `maintenance` passe. L'écran propose pourtant les trois
  (`goalsForAge` ignore son paramètre, `api/household.ts:266-270`), le refus arrive **en jeton brut**
  (aucune clé i18n `goal_not_for_minor`, absent de `planRefusals.ts`), et la migration nomme
  l'option vide comme **seul remède** (« le maître retire l'objectif, puis pose la date », `:112-121`).
  Le README foyer `:164` et FF-045 disent encore le contraire. Trois sources qui divergent.

### 3.2 Comment l'implémenter

1. Retirer l'option vide des cinq sites ; resserrer `MemberGoal | ""` en `MemberGoal`
   (`HouseholdPage.tsx:986`, `SetupPage.tsx:5598`). Retirer les 4 clés i18n (`fr:2491,3044`,
   `en:4196,5208`).
2. Le sélecteur devient **trois tuiles radio sans pré-sélection** (patron `MouthFormDialog`) : une
   ligne existante à `goal = null` n'a rien de coché tant que le maître ne choisit pas. L'état
   `null` reste valide **en base** (parts standard), l'écran ne peut plus le produire.
3. **Mineur** : `goalsForAge(ageState)` filtre enfin — un `minor` ne voit que « Maintenir » avec une
   phrase (« pour un enfant : manger normalement ») ; un `unknown` voit les trois. Quand une date
   saisie rend quelqu'un mineur alors que sa direction est `fat_loss`/`muscle_gain`, le formulaire
   **bascule à `maintenance` et le dit** ; `persistMouth` écrit `setGoal(maintenance)` **avant**
   `setBirthDate` (l'ordre actuel `setName → setBirthDate → setGoal` reçoit `goal_not_for_minor`).
4. Traduire `goal_not_for_minor` et `target_not_for_minor` dans `planRefusals.ts` + i18n (bug
   présent, indépendant de ce lot mais sur le même fichier).
5. Aligner les trois docs (README foyer `:164`, FF-045, PIVOT-FOYER §8.4) sur la migration du 22/08.
6. Optionnel : purger les clés mortes `setup.goal.{recomposition,performance,health}` et jumelles.

### 3.3 Décisions à prendre

| # | Question | Recommandation |
|---|---|---|
| **D3.1** | Confirmer que la « 4e option » est bien « Aucune direction particulière » | Oui — aucun écran ne rend un 4e jeton réel. |
| **D3.2** | Libellé du seul choix d'un mineur | « Manger normalement » plutôt que « Maintenir un poids stable » (registre éducatif, PIVOT §8.4). |
| **D3.3** | Une bouche adulte à `goal = null` en base | Rien de coché à l'écran, part standard au moteur — inchangé. |

**Effort : 0,5 jour.** Tests : `household.int.test.ts:438-486` (MEMBER_GOALS = CHECK sur disque),
`:355-380` (`goalsForAge` adulte = enfant — **se retourne**), `bodyMeasures.int.test.ts:175-200`,
`setupSelfStepTarget.int.test.ts:161`, `setupMouthsStep.int.test.ts:170` (« mineur porteur des trois
directions » — **se retourne**), `servingDirections.int.test.ts`.

---

## 4. P4 — « L'idée de recette pour le user »

### 4.1 Identification

**C'est l'onglet « Idées de repas »** de la barre du bas (`app.nav.meals`, `fr.ts:2126`), route
`/app/meals` (`App.tsx:483-491`), page `pages/mealPlan/StudentMealPlanPage.tsx` (120 lignes) : la
**bibliothèque de recettes du coach**, en lecture seule (`meal_ideas`, `loadStudentRecipes`,
`api/mealPlanModel.ts:82-99`). Sous-titre : *« Des idées, rien de plus — rien n'est suivi ici »*
(`fr.ts:4607`). Elle n'entre **nulle part** dans la composition (`generate-meal-v1/index.ts:322`
le dit), n'écrit rien, n'a aucun aval.

Le seul autre candidat est **l'envie de la semaine** (FF-050) — mais c'est une idée **de**
l'utilisateur vers le moteur, pas une idée proposée **à** lui ; la retirer supprimerait le seul canal
de demande du foyer. À écarter, sauf confirmation contraire (D4.1).

### 4.2 Retrait

Supprimer : la page et `pages/mealPlan/copy.ts` (déjà mort), la route, l'entrée de nav
(`KeelAppShell.tsx:116-121` — la barre passe de 5 à 4), `loadStudentRecipes`, 8 clés i18n
(`meals.title|subtitle|list.*|loading|error`, `app.nav.meals(.short)`), l'entrée `/app/meals` de
`PAGE_NAMESPACES` (`catalog.ts:529-534`). **Garder** tout le côté coach (`CoachMealsPage`,
`/coach/meals`, `coach-recipe-image-v1`, la table). Corriger : FF-010 R6 (« porte vers
`/app/meals` » — règle non implémentée, à réécrire vers `/app/plan`), le commentaire menteur de
`meal-document-v1/index.ts:236`, `MODEL.md:28`.

⚠️ Le namespace i18n `meals` **ne se supprime pas** : c'est le vocabulaire du moteur de repas
(~120 phrases, `catalog.ts:230-236`), monté par `/app/plan`, `/app/household`, `/app/setup`.

**Effort : 0,5 jour.** Décision **D4.1** : confirmer la cible. Vérifier que la barre à 4 onglets
tient à 320 px.

---

## 5. P5 — La page Foyer : membres dépliables, paramètres du foyer, ajout

### 5.1 Ce que le code fait aujourd'hui

- `/app/household` (`HouseholdPage.tsx`, 2 446 l.) rend : `MeCard` (fiche du maître **en ligne**),
  `AddMouthCard` (formulaire d'ajout **en ligne**, pas une pop-up), `MembersCard` → `MemberRow`
  (accordéon **à un niveau** : identité, corps, régime, `HouseholdHabitsCard`, absences +
  `MealPickerGrid`, retirer/détacher, mute fusion, allergies + règles), `HouseholdMergeCard`,
  `HouseholdPlanCard`, `InviteCard`. Quatre lectures **réservées au maître** (`:343`) ; pour un
  non-maître, `MembersCard` est une **liste en lecture seule** (`:1386-1416`).
- Les cartes de **maison** vivent dans l'entonnoir, étape 3 : `TableStepPlanning.tsx` =
  `KitchenEquipmentCard:125` (« Avec quoi vous cuisinez », `setup.equipment.title`) →
  `HouseholdTraditionsCard:139` (**« Les jours que vous ne déplacez pas »**, clé
  `setup.traditions.title`, `fr.ts:2926`, `en.ts:5063` ; table `household_traditions`, plafond 3 par
  trigger, RPC `not_owner`) → `WorkLunchCard:153` (P6). La carte des traditions est **totalement
  autonome** (elle lit et écrit seule).
- Les « préférences » de la personne sont **deux choses** : (a) `MouthPreferencesFields`
  (`MouthFormDialog.tsx:1075`, titre « Préférences alimentaires », `fr.ts:3169`) = régime, allergies,
  dégoûts/règles, rythme, habitudes + extras, shaker — **sur `member_id`** ; (b) `FoodPreferencesCard`
  = ce que la **conversation** a retenu (`practical_constraints.food_preferences`, `user_id`),
  montée dans la modale « réglages » de `/app/plan` (`StudentWeekPlanPage.tsx:2414`) avec
  `EatingRhythmCard:2379` et `CookingCapacityCard:2397`.
- Le composant partagé est prêt : `MouthCoreFields:729` (blocs identité · corps+activité+appétit ·
  direction+cible, **en ligne**) + `MouthFormDialog:465` (le chrome `Modal` autour des blocs 4-6,
  **n'enregistre rien**) + `MouthPreferencesButton:513` + `persistMouth` (`api/mouthProfile.ts:680-843`,
  11 portes injectées, ordre imposé).
- ⚠️ **Deux formulaires d'ajout divergent** : `/app/household` utilise `MouthCoreFields` ;
  `/app/setup` étape 2 **réécrit les champs à la main** (`SetupPage.tsx:4801-5010`). « La pop-up de
  l'étape 2 » n'existe pas comme pop-up : c'est un bloc dépliable.
- Le repli a été **retiré sur décision** (2026-08-19, `MouthFormDialog.tsx:326-345`).
- Droits : maître seul (`not_owner`) pour corps, cible, shaker, allergies, règles, traditions,
  invitation ; « sa ligne » (`not_your_line`) pour prénom, date, habitudes, absences, déjeuner ;
  **refusé à qui a un compte** (`has_account`) pour objectif, rythme, régime — ils vivent dans son
  « about you ». `keel_household_member_bodies` rend **zéro ligne** à un non-maître. Le plafond de 8
  est en base (`keel_household_max_mouths()`), recopié **deux fois** côté front
  (`HOUSEHOLD_MAX_MOUTHS`, `HOUSEHOLD_MAX_MEMBERS`).

### 5.2 La page cible

```
/app/household
├─ LES MEMBRES  (le maître en premier ; badge d'âge ; ordre du roster)
│   └─ pour chaque bouche : en-tête (prénom · état d'âge · ÉTAT D'ACCÈS) puis
│       ▸ le bloc d'accès, dans l'en-tête (§5.5) :
│           sans compte  → [Inviter] = e-mail + lien à partager, avec la phrase de l'offre
│           invitée      → « invitation envoyée le … » · [Renvoyer]
│           réclamée     → « a son accès » · [Retirer l'accès]  (la bouche reste)
│       ▾ Informations personnelles   = MouthCoreFields (identité · corps · direction+cible)
│       ▾ Préférences alimentaires    = MouthPreferencesFields (régime · allergies · dégoûts/règles ·
│                                       rythme · habitudes/extras · shaker)
│                                     + « Le déjeuner en semaine » (P6, adultes seulement)
│                                     + « Ce que Sophia a retenu » (FoodPreferencesCard, comptes seulement)
│   └─ [+ Ajouter une personne]  (maître, tant que < 8)  → Modal
│         = MouthCoreFields + les préférences en accordéon DANS la même fenêtre
│           (pas un second Modal : deux `createPortal` imbriqués n'ont jamais été essayés ici)
├─ PARAMÈTRES DU FOYER
│   ├─ AVEC QUOI VOUS CUISINEZ         = KitchenEquipmentCard (la MÊME carte, aussi dans l'entonnoir)
│   ├─ LES REPAS TRADITIONS            = HouseholdTraditionsCard (valeur de `setup.traditions.title` changée)
│   └─ (comment vous cuisinez / combien de courses — P2, si D2.6 = fait de maison)
├─ HouseholdMergeCard · HouseholdPlanCard   (inchangées)
└─ InviteCard disparaît : son menu « qui invites-tu ? » devient le bouton de chaque ligne
```

Pour un **membre réclamé** : sa propre ligne est éditable sur ce qu'il a le droit d'écrire
(prénom, date, habitudes, absences, déjeuner ; objectif/rythme/régime par ses écrivains « about
you » — `MouthSubject.hasAccount` + `isSelf` existent pour ça) ; les autres lignes = prénom et état
seulement ; **jamais un cadre « personne n'a de corps »** (règle `HouseholdPage.tsx:345-350`).

### 5.3 Ce qu'il faut faire

1. **Unifier l'ajout** : `SetupPage` étape 2 (`MouthsStep`) doit monter `MouthCoreFields` au lieu de
   ses champs recopiés — sinon deux formulaires divergent (mode d'échec nommé du dépôt). C'est le
   vrai travail du lot, et il touche `SetupPage.tsx` (350 ko, actif cette nuit).
2. Le dépliant à deux cadres dans `MemberRow`, avec **une garde de chargement par cadre**
   (`mount-snapshot-forms-need-a-loading-gate` : `setMemberHabits`, `setMemberRhythm`,
   `setMemberTarget` **remplacent** ce qu'elles trouvent — un cadre monté sur `habits === null`
   efface au premier Save).
3. Déplacer les deux cartes de maison de `TableStepPlanning` vers la section « Paramètres » ;
   **garder `KitchenEquipmentCard` aussi dans l'entonnoir** (le congélateur gate P2) — c'est déjà le
   patron du 01/09 (même carte repliée sur `/app/plan`).
4. Renommer : valeur de `setup.traditions.title` → « Les repas traditions » (FR) / « Tradition
   meals » (EN) ; garder la **clé** (pas de rupture de parité ni de `catalog.ts`).
5. Rapatrier `FoodPreferencesCard` (prop `embedded` prête), `EatingRhythmCard` (pour le maître,
   écrivain `practical_constraints` — pour une bouche, le rythme est déjà dans
   `MouthPreferencesFields`) ; `CookingCapacityCard` va avec P2 sur `/app/plan` (composition).
6. Unifier les deux constantes du plafond de 8.
7. i18n : `/app/household` déclare déjà `setup`, `plan`, `allergen` (`catalog.ts`) ; `known` et
   `health` **non** — déclarer avant de monter quoi que ce soit venu de `/app/about-you` ou
   `/app/health`, sinon `pageSeams` rougit.

### 5.4 Décisions à prendre

| # | Question | Recommandation |
|---|---|---|
| **D5.1** | Renverser « arrêter avec le dépliable » (19/08) | Oui, **par écrit** dans `MouthFormDialog.tsx:326-345` : deux cadres nommés, ouverts par défaut sur la ligne que l'on vient d'ouvrir, et le récapitulatif `filledPreferenceBlocks` reste visible replié — ça répond aux trois motifs mesurés. |
| **D5.2** | L'ajout : Modal unique avec accordéon, ou Modal + Modal | Modal unique. |
| **D5.3** | L'entonnoir étape 2 passe sur `MouthCoreFields` dans **ce** lot | Oui — sinon la pop-up et l'étape 2 divergent dès le premier jour. C'est ce qui rend le lot lourd. |
| **D5.4** | Que devient `/app/about-you` (`KnownAboutYouCard`, mémoire structurée) | Rejoint le cadre « Préférences alimentaires » de la bouche **avec compte** (« ce que Sophia a retenu ») ; la route reste tant que la nav n'est pas revue. |
| **D5.5** | Que devient `/app/health` (allergies, `student_safety_constraints`, `user_id`) | Les allergies **du foyer** (`household_member_allergies`) sont déjà dans les préférences de la bouche ; les contraintes de **compte** (médicaments, conditions) restent sur `/app/health` renommée — à trancher avec P7 (D7.1). |
| **D5.6** | Un membre réclamé édite-t-il **son corps** ? | Aujourd'hui `set_member_body` est `not_owner` : non. Garder, et le dire à l'écran (« ton corps est renseigné par {maître} ») — ou ouvrir `not_your_line`, ce qui est une décision produit (asymétrie assumée deux fois, LOTS3-5 §2.4). |
| **D5.7** | L'invitation : lien à partager (aujourd'hui) ou e-mail envoyé par le produit | Garder le lien **et** ajouter « copier » + `mailto:` pré-rempli. Un vrai envoi est une fonction edge neuve (patron `coach-invite-student-v1`, plafond, `EMAIL_DELIVERY_ENABLED`) : lot à part, pas P5. |
| **D5.8** | Le prix affiché sur le bouton : 1,99 € (site) ou 2,00 € (FF-049 §7, gestes Stripe) | **Une seule source** : la clé `offer.extra` et `prices.ts`. L'écran ne recopie jamais un montant. L'humain tranche le chiffre avant les gestes Stripe. |
| **D5.9** | Une invitation en attente : renvoyer, révoquer, expirer | Renvoyer = un nouveau jeton (refus `rate_limited` existant). Révoquer n'existe pas et n'est pas demandé. Les invitations expirées ne sont jamais purgées (trou n°11) : à nommer, pas à réparer ici. |

### 5.5 L'invitation, depuis la ligne du membre

**Ce qui existe.** `InviteCard` (`HouseholdPage.tsx:2201-2306`) en bas de page : un menu
déroulant sur `claimableMembers` (les bouches **sans compte**), un e-mail, et le lien
`/join-household?token=…` rendu à l'écran (`:2306`). Aucun e-mail n'est envoyé (FF-060 R7 :
« l'écran rend le lien, il n'envoie aucun e-mail » ; en local `EMAIL_DELIVERY_ENABLED=1` est un
pistolet chargé). La cible vit **sur l'invitation** (`keel_household_invite(email, member_id)`,
FF-048 R2), jamais choisie au moment de rejoindre. Refus nommés : `not_owner · bad_email ·
not_a_member · already_claimed · rate_limited`. L'aperçu `anon` (`keel_household_preview_invitation`)
rend nom du foyer, prénom, adresse. Rejoindre **attache** un `user_id` à la ligne existante
(`member_id` inchangé), pose `access_tier = 'household_member'` et **exige une session et un
pays** (FF-048 R12). Le geste inverse existe : `keel_household_detach_member` (« retirer
l'accès », la bouche reste) distinct de `remove` (détruit la bouche) — deux libellés, FF-048 R11,
déjà sur la page (`:1997`). Ce qui est facturé est le profil **réclamé** (FF-049 R2-R4) ; rien ne
facture tant que les cinq gestes Stripe ne sont pas faits, et `free_until IS NULL` vaut couvert.
La phrase de l'offre existe déjà, source unique : `offer.extra` = « {amount} par mois pour chaque
autre personne qui veut son propre accès » (`fr.ts:287`).

**Ce qui change.** Le menu déroulant disparaît : l'affordance vit dans l'**en-tête de chaque
ligne**, avec trois états dérivés des faits (pas d'un drapeau) :

| État | Dérivé de | Rendu |
|---|---|---|
| sans compte, sans invitation vivante | `user_id IS NULL`, aucune ligne `household_invitations` non consommée et non expirée | `[Inviter]` → champ e-mail + la phrase `offer.extra` + « ce que ça lui donne, et pas » (FF-048 R10) → lien + copier + `mailto:` |
| invitée | une invitation non consommée, `expires_at > now()` | « invitation envoyée le {date} à {e-mail} » · `[Renvoyer]` |
| réclamée | `user_id IS NOT NULL`, rôle `member` | « a son accès » · `[Retirer l'accès]` (détacher) |
| le maître | rôle `owner` | rien |

Le maître seul voit ces boutons (`isOwner`). **Une bouche mineure est invitable** comme
aujourd'hui (rien ne l'interdit en base ; FF-049 §7 note que facturer l'accès d'un enfant est une
décision commerciale non prise) — à ne pas restreindre en passant. Lecture des invitations
vivantes : l'écran ne les relit pas aujourd'hui (`InviteCard` ne montre que le jeton qu'il vient de
créer), mais **la lecture est ouverte** : `household_invitations_member_read`
(`20260808000000_household_foundation.sql:307-309`, `for select to authenticated`, filtre
`household_id = keel_household_of(auth.uid())`, `grant select … to authenticated` `:788`). Un
`select member_id, email, created_at, expires_at, consumed_at` scopé `.eq("household_id")` suffit ;
**jamais `token_hash`** dans la projection. ⚠️ La policy est **household-wide** : un profil réclamé
lit les adresses e-mail invitées des autres bouches — déjà le cas, à nommer à côté du trou n°11
(invitations expirées jamais purgées, adresses de tiers), pas à élargir.

**Effort : 4,5 jours** (dont 1,5 pour l'unification de l'étape 2, 0,5 pour l'invitation par ligne). Tests : `mouthFormDialog.int.test.ts`
(« la fiche est la MÊME pour tout le monde » — un bloc conditionné à l'âge le fait rougir),
`setupMouthsStep.int.test.ts`, `meCardSheet.int.test.ts`, `tableStepPlanning.int.test.ts` (ordre
sur HTML), `pageSeams`, `parity`. Environnement `node` : on monte les **corps**, jamais le `Modal`.

---

## 6. P6 — « Le déjeuner en semaine » quitte l'étape 3

### 6.1 Ce que le code fait aujourd'hui

- `WorkLunchCard` est la 3e carte de `TableStepPlanning` (étape 3 `request` — l'étape `table` a
  été supprimée le 19/08, son contenu vit là). Titre `setup.work_lunch.title` = « Le déjeuner en
  semaine » (`fr.ts:3470`). Trois questions dépliées (`workLunchForm.ts:120`) : au bureau ? →
  gamelle ou dehors ? → micro-ondes au bureau ?
- **Déjà par membre**, adultes seulement (`askableWorkLunchPeople`, `unknown` exclu), compte ou pas
  (la porte SQL n'a pas de refus `has_account` : « où quelqu'un déjeune est un FAIT »).
- Stockage : `household_members.work_lunch jsonb` (`20260818120000:152`), RPC
  `keel_household_set_member_work_lunch` qui **pré-remplit `away_days`** avec cinq midis
  `eating_out` dans la même transaction (`:238-243`) ; `null` efface. Garde d'écriture
  `workLunchWriteIsNeeded` (la RPC **retire puis réécrit** les cinq midis : une écriture identique
  ressuscite un midi décoché à la main) ; `answers === null` ≠ `Map` vide (mutation mesurée : 0
  rouge sur 9 sans ce repli pur).
- **Aucun lecteur serveur de `work_lunch`** : toute l'influence passe par `away_days[kind=eating_out]`
  (`presenceStateFor`, `eatingOutBlock`, `eatingOutAdvice`, `slot_meal_io`). **`lunchbox` et
  `microwave` n'ont aucun lecteur** — la promesse « transportable / bon froid » des trois
  commentaires n'est **pas tenue**.
- ⛔ **Le générateur individuel ignore `household_members.away_days`** (`generate-meal-v1/index.ts:1480`
  ne lit que `practical_constraints.away_days`, jamais le roster). Or depuis le 01/09 un solo a un
  foyer d'une bouche et compose avec cette lane : **sa réponse n'a aucun effet sur son plan.** Idem
  pour un secondaire.
- Pas une question d'entonnoir (`away_days` est `weight: "better"`, `step: null`) : le déplacement
  ne change **rien** à ce qui bloque l'étape 3. Valeur par défaut sûre : absence ⇒ `at_table`
  partout, le plan compose les cinq déjeuners.

### 6.2 Ce qu'il faut faire

1. Extraire `PersonWorkLunch` (`WorkLunchCard.tsx:202`, déjà le composant unitaire) et le monter
   dans le cadre « Préférences alimentaires » de chaque bouche **adulte** de `/app/household` (P5),
   **au-dessus de `MealPickerGrid`** — la réponse et la grille qu'elle pré-remplit sur le même écran
   (§2.2 bis de la conception : « pré-remplir n'est pas décider, la grille gagne »). Carte **sœur**,
   pas dans le brouillon de `MouthPreferencesFields` (elle écrit tout de suite, compare au `saved`
   serveur, et ne s'adresse qu'aux adultes — trois raisons, dont un test qui refuse une fiche
   conditionnée à l'âge).
2. Retirer la carte de `TableStepPlanning` (qui tombe à deux cartes — P5 les déplace) ;
   `SetupPage.tsx:3194-3202` perd `workLunchRoster`, module qui devient supprimable (sur
   `/app/household`, `age_state` à trois valeurs vient du roster).
3. Réécrire les libellés qui disent « à l'étape suivante » (`fr.ts:3487, 3490`,
   `setup.request.presence_intro`) — déjà approximatifs depuis le 19/08.
4. **Reproduire les trois gardes** au nouveau site : `workLunchWriteIsNeeded` contre le `saved`,
   relecture **avant** `onSaved` (`workLunchCommit.ts:48-52`), repli `null` ≠ `Map` dans un module pur.
5. Déplacer les 10 cas de `tableStepPlanning.int.test.ts:144-277` vers le nouveau site (ils
   portent des cicatrices mesurées) ; **ne pas toucher** `presenceMarks.int.test.ts:200-340` (le pin
   du payload et du miroir serveur).

### 6.3 Décisions à prendre — et elles sont le vrai lot

| # | Question | Recommandation |
|---|---|---|
| **D6.1** | Faire lire `household_members.away_days` à `generate-meal-v1` (union avec `practical_constraints.away_days`, comme la lane foyer) | **Oui, dans ce lot.** Sinon la question déménagée reste décorative pour tout solo et tout secondaire. Une trentaine de lignes + un test de câblage par lecture de source sur les deux lanes. |
| **D6.2** | Tenir enfin la promesse `lunchbox` / `microwave` : un bloc de prompt « transportable ; bon froid sans micro-ondes » à côté de `eatingOutBlock` (`household_meal_generation.ts:1604`) | **Oui**, c'est le sens de la question. Bump `HOUSEHOLD_PROMPT_VERSION` (+ tronc si D6.1 sert la lane solo). |
| **D6.3** | Namespace i18n | Garder `setup.work_lunch.*` (déjà déclaré sur `/app/household`) — renommer casse la parité pour rien. |

**Effort : 1,5 jour** (0,5 sans D6.1/D6.2). Serial **avant** P5 (même page, même `MemberRow`).

---

## 7. P7 — La page de suivi (« Health »), bornée

### 7.1 Ce que le code fait aujourd'hui

- ⚠️ **`/app/health` est déjà pris** : `StudentHealthPage.tsx` = allergies / intolérances /
  médicaments (`student_safety_constraints`), namespace `health.*` (~40 clés), référencée par
  l'onboarding et `StudentConstraintsCard`. Aucun chiffre.
- **La page de suivi vivante est `/app/progress`** (`StudentProgressPage.tsx`) : régularité,
  vivabilité (taps du soir), « la semaine dans l'assiette » avec les **trois comptes FF-009** (coché /
  hors plan / photographié — **jamais sommés**, `20260808050000:50-56`), journal jour par jour avec
  **vignettes photo signées**, rythme sur **5 moments** dérivés de l'heure (`MOMENTS`,
  `mealRhythm.ts:71` — parce que `slot_key` est NULL sur 71 % des faits), portions, séances, poids =
  un nombre + un delta. `ProgressPage.tsx` et 32 clés `progress.*` sont **morts**.
- Garde de rôle : `KeelStudentRoute` (`keel_role='student'`) — **un profil réclamé ne l'atteint
  pas** (`keel_role = NULL`), verrouillé par `routeGuards.int.test.ts:50-59`.
- ⚠️ **La garde TCA de `/app/progress` est morte** : elle lit `weekly_reviews.risk_band`, colonne
  sans écrivain depuis le 08/08 (`20260808200000_weekly_reviews_risk_band_orphaned.sql`). Le signal
  vivant est `evaluateRestrictionForStudent`, **côté serveur seulement**, atteint par `loadEnergyGate`.
- Énergie : `meal-energy-v1` rend kcal **par plat et par jour** (`plans[].dishes[].kcal`,
  `days[].kcal`, `basis`, `complete`, `meals_out`, `subject`) — **jamais stocké** (FF-059 R5), après
  les **5 portes** (`energy_gate.ts` : TCA, mineur/âge inconnu — **91 % de la base** —, doctrine,
  interrupteur tri-état, cible). Deux calculateurs : `maintenanceRange` (**fourchette** kcal/kg,
  `energy_target.ts:363`, pour l'affichage) et `estimatedMaintenanceKcal` (**point** Mifflin,
  `meal_envelope.ts:861`, pour dimensionner — et un test **refuse** sa constante dans l'autre module).
  `SLOT_DAY_WEIGHT` couvre bien les **six** créneaux (`mouth_anchor.ts:470` : 0,25 / 0,10 / 0,40 /
  0,10 / 0,35 / 0,10 — la mémoire « 3 sur 6 » est périmée), avec l'avertissement « ce n'est PAS une
  recommandation nutritionnelle, ça normalise, ça ne prescrit pas » (`:461-463`).
- Photo : `protocol_events.recognized.energy_estimate = {kcal, basis, confidence_band}` écrit
  **si les portes ouvrent** ; ⛔ « un kcal photo ne se somme jamais » (`mealPhoto.ts:92-96`).
  Correction humaine : `energy_correction.ts` (`photo_estimate` → `declared_quantities`).
- Créneaux loupés : le canal **C1** (FF-062, `slot_meal_ask.ts`) détecte un créneau `eating_out`
  non composé et offre photo / décrire / passer, fait `slot_meal:<date>:<slot>`, `fat_loss` et
  `muscle_gain` seulement. Mais `meal_precision.ts:14-24` **interdit** de demander une quantité :
  « décrire » ne peut produire qu'une estimation, jamais `declared_quantities`.
- Poids : `student_body_measures` append-only, index `(user_id, kind, local_date desc)`, RLS
  `owner_all` + coach ; dérivation pure `body_measure_series.ts` (dernière du jour, moyenne de la
  semaine). **Aucune policy foyer** : le maître ne lit pas le poids d'un membre — conforme à la cible.
  Rappel de pesée C2 : tous les 2 jours (perte **et** maintien), 5 en prise.
- Plans : `student_generated_meals` porte `starts_on/duration_days/ends_on/retired_at/plan_kind`,
  **ni statut ni compteur** ; « courant/écoulé » se dérive. Accident : fait `accident_off_plan:<id>:<idx>`
  dans `protocol_events` (préfixe de chaîne, non indexé) ; le glissement ne laisse qu'un `updated_at`.
- Temps : `preparations[].active_minutes/total_minutes`, `cooking_sessions[].total_minutes`,
  `dishes[].same_day.minutes`. **Aucune baseline** « sans Sophia » nulle part.

### 7.2 Comment l'implémenter

**Route et nom (D7.1)** : `/app/progress` **devient** la page « Suivi » (libellé de nav « Suivi »
ou « Santé »), garde `KeelHouseholdRoute` + `.eq("user_id", me)` partout (RLS ne remplace pas le
filtre) ; `/app/health` (allergies) est renommée « Sécurité » et ses allergies rejoignent P5.
**Toujours une personne, jamais le foyer** : structurel, puisque le maître ne peut lire ni les
coches ni le poids d'un membre.

**Un agrégat serveur, une passe** (D7.9) : nouvelle fonction `keel-tracking-v1` (ou un `scope`
sur `meal-energy-v1`) qui appelle `loadEnergyGate` **d'abord** (la garde TCA côté client est morte),
puis rend pour une fenêtre `[from, to]` : par jour, les plats du plan (kcal, base `plan_quantities`,
état de coche), les faits photo (kcal, base `photo_estimate`), les créneaux **loupés** (rythme
déclaré ∖ plats composés ∖ faits), leurs **estimations** (base neuve `slot_estimate`), et les
compteurs. `useMealEnergy.ts:37-41` ne cache rien ; N appels par plan sont intenables.

**Le bloc permanent (tous objectifs)**

| Item | Définition proposée | Source |
|---|---|---|
| Plans effectués | plans dont la fenêtre est écoulée, non retirés, **et** portant ≥ 1 coche vivante (D7.2) ; pour un membre : les plans `household` de son foyer où il a une part | `student_generated_meals` + `protocol_events` |
| Plans modifiés | plans distincts avec un fait `accident_off_plan:%`, un `cooking_session_states.happened=false`, un `grocery_wave_states.done=false`, ou un glissement — **à tracer** : `applyPlanShift` écrit `generated_from.shifts[]` (3 lignes, D7.3) | idem + 2 tables d'état |
| Temps économisé | **aucune baseline n'existe** (D7.4). Proposition honnête : deux chiffres mesurés — « repas décidés pour toi » (Σ plats composés) et « cuisiné K fois pour M repas » (levier du batch) — et, **seulement** si l'utilisateur pose une convention datée (ex. 12 min de décision + recette par repas), un « temps économisé » qui porte sa **base** comme un kcal porte la sienne (`basis: "convention_2026_09"`) | payload des plans |

**Le bloc objectif (`fat_loss` / `muscle_gain` — porte ④ ouverte par la direction)**

- **Tracker jour / semaine / plan** : le total du jour = Σ plats du plan **cochés ou non décochés**
  (base exacte) + Σ photos (base estimée) + Σ estimations de créneaux loupés (base estimée). Le
  total porte **la base la plus faible** de ses composantes et la mention « estimé, certaines données
  manquent » (D7.5 renverse `mealPhoto.ts:92-96`, par écrit, avec le biais de −26,6 % nommé dans
  la note de base). Semaine = Σ jours ; plan = Σ sur la fenêtre. Jamais « il te reste X kcal »,
  jamais un `%` d'adhérence (FF-059 R10).
- **Dans chaque jour** : les plats du plan avec leur coche ; les photos (vignettes existantes) ; les
  créneaux loupés = les six occasions déclarées (`eating_rhythm`, pas les 5 `MOMENTS` — D7.6 choisit
  le vocabulaire des six) sans plat composé et sans fait.
- **Remplir après coup** : bouton « Décrire » sur un créneau loupé → dialogue texte → analyse par
  le modèle (le chemin texte de `analyze-meal-photo-v1` / `meal_declaration_floor`) ; kcal de base
  `photo_estimate`-like (« estimé d'après ta description ») ou, si la description porte des
  quantités **écrites par la personne**, `declared_quantities` (`quantity_from_prose.ts` lit déjà
  des nombres écrits). D7.7 : ce chemin **contourne exprès** `meal_precision.ts` (qui interdit de
  *demander* une quantité — ici on ne demande rien, la personne écrit).
- **Estimation d'un créneau non renseigné** : `maintenanceRange` (ou `directedRange` si direction)
  × `SLOT_DAY_WEIGHT[slot]`, milieu de fourchette arrondi aux 50, base `slot_estimate`, phrase « estimé,
  modifiable dans la journée » (D7.8 : extension de sens de `SLOT_DAY_WEIGHT`, à réécrire dans son
  en-tête). Entrées : âge, sexe, taille, poids (`loadStudentBody`), activité, appétit — toutes
  collectées.
- **Courbe de poids** : périodes 1 sem / 1 mois / 3 / 6 / 12 mois / depuis la création, depuis
  `student_body_measures` (dernière du jour), pour la personne. Renverser FF-031 §3 **par écrit**
  (D7.10) ; garder `weight_readout` suspendu sous plancher (porte serveur). Aucun composant de
  graphe dans `ui/` : un SVG simple.
- **Membre à 1,99 €** : ses propres lignes (il a un compte) ; sa part du plan du foyer
  (`member_portions`, kcal par portion déjà supporté par `plan_energy`) ; jamais celles d'un autre.

**Ce qui diverge maintien vs objectif** : le maintien n'a **que** le bloc permanent — sauf la
courbe de poids, à trancher (D7.11 : C2 relance déjà la pesée tous les 2 jours en maintien).

### 7.3 Décisions à prendre

| # | Question | Recommandation |
|---|---|---|
| **D7.1** | Route et nom : « Health » est occupé | `/app/progress` = « Suivi » ; `/app/health` renommée « Sécurité » (contraintes de compte) |
| **D7.2** | « Plan effectué » : fenêtre écoulée, ou ≥ 1 coche | ≥ 1 coche (sinon on compte des plans jamais ouverts) |
| **D7.3** | Tracer les glissements dans `generated_from.shifts[]` | Oui, dans P8 (qui touche `applyPlanShift`) |
| **D7.4** | Temps économisé : convention chiffrée, ou deux chiffres mesurés | Deux chiffres mesurés ; la convention **seulement** si l'utilisateur la pose et la date |
| **D7.5** | Renverser « un kcal photo ne se somme jamais » | Oui, à condition que le total porte sa base la plus faible et la mention « estimé » — à écrire dans `mealPhoto.ts` à la place de la phrase inverse |
| **D7.6** | Vocabulaire des créneaux : 6 occasions déclarées ou 5 moments horaires | Les 6 occasions ; accepter que les faits sans `slot_key` se rangent par l'heure |
| **D7.7** | « Décrire » un repas loupé peut-il produire `declared_quantities` | Oui si la personne écrit des quantités ; sinon estimé |
| **D7.8** | Réutiliser `SLOT_DAY_WEIGHT` pour estimer un repas | Oui, en réécrivant son en-tête |
| **D7.9** | Agrégat serveur neuf vs N appels | Fonction neuve, `loadEnergyGate` en tête |
| **D7.10** | Renverser FF-031 §3 (courbe) | Oui, par écrit, même format que le renversement du 18/08 |
| **D7.11** | Courbe de poids en maintien | Oui (C2 pèse déjà les maintiens) — l'utilisateur tranche |
| **D7.12** | Sort de `ProgressPage.tsx` mort + 32 clés | Supprimer dans ce lot |

**Effort : 5 jours.** Tests : `routeGuards.int.test.ts` (se retourne), `no_calorie_to_student_property_test.ts`
(reste vert : rien sans base), `energy_target_test.ts` (refuse Mifflin dans ce module), `mealPhoto`,
`studentProgressWeight.int.test.ts`, `body_measure_series_test.ts`, `energy_gate_test.ts`.

---

## 8. P8 — Le membre à 1,99 € déclare qu'il n'a pas mangé

### 8.1 Ce que le code fait aujourd'hui

- **Une coche est par utilisateur × position** : `meal_tick:<planId>:<idx>` dans
  `protocol_events` (`user_id`, `source_message_id`), index unique `(user_id, source_message_id)`,
  RLS **owner-only** (le maître ne lit pas les faits d'un membre — décision `20260727120000:29-32`).
  **Deux comptes peuvent donc porter la même clé sur le même plat sans collision** : le modèle « une
  ligne par bouche » est déjà possible sans migration.
- **Le membre réclamé n'atteint rien** : `keel_role = NULL` (`20260811060000:64-68`) ⇒ tous les crons
  (`keel-daily-pulse-v1/index.ts:198`, `keel-proactive-v1:183`, `keel-weekly-flow-v1:237`…) filtrent
  `student` ; `/app/chat` et `/app/today` sont `KeelStudentRoute`. Il lit le plan du foyer (policy
  `student_generated_meals_household_read`) mais `useMealTicks` n'est lié qu'au plan **personnel**
  (`MealBuilder.tsx:758`, `mealId = null` pour lui ⇒ zéro coche). `MyShareCard` n'a **aucune case**.
- **La bifurcation maître/membre est armée et testée** : `respondsForHousehold`
  (`evening_strip_io.ts:98-117`, `member ⇒ false`, fail-closed), `masterOnly` sur ① courses et ②
  cuisson (`keel-daily-pulse-v1:395-448`, `day_review_io.ts:85-101`). **Elle n'est jamais atteinte.**
- FF-058 R10-R13 **spécifient déjà la cible** : la cuisson est un fait du foyer, la consommation un
  fait de personne ; le maître ne coche jamais pour un profil réclamé ; maître ✓ et membre ✗ **ne se
  contredisent pas** ; une bouche sans compte n'a pas de coche ; le silence n'écrit rien (jamais de
  coche automatique — cicatrice `auto-tick-writes-undeniable-false-facts`).
- **Le « reste » est refusé faute de lecteur** : `accident.ts:1136-1144` (`leftover` « rentre en
  trois lignes le jour où quelque chose le lit »). `REALIGNMENT_ACTIONS` = `shift_dish · no_cook ·
  shift_session · nothing_to_change`.
- **Le glissement est global au plan** (`applyPlanShift`, `accident_io.ts:763-861`, verrou
  `updated_at`, réécrit `dishes[].day`, `preparations[].cook_on`, `cooking_sessions[].day`) ; un
  état **par personne** n'a aucune structure. `cooking_session_states.happened` est un booléen sans
  portée.
- **Ce qui est prêt** : `writeOffPlanTapFact` (« j'ai mangé autre chose », aucun aliment inventé),
  `meal-photo-upload-v1` (tout JWT, sans plan), `deliverChatMessage` (pousse dans le chat de n'importe
  quel compte), `keel_household_set_member_away` (patron exact d'une RPC « ma ligne » :
  `not_your_line`), `cooking_session_states` / `grocery_wave_states` (patron exact d'une table d'état,
  avec **pourquoi pas le payload** : le glissement réécrit le jsonb).
- **Les boîtes** : `preparations[].boxes[{id, member_ids, grams}]`, `dish.uses[].box_id` — la part
  d'une bouche est **littéralement un contenant** dans le frigo. C'est ce qui rend « sa part non
  consommée » représentable.
- `meal_plan_feedback` est `unique(meal_id)` : le membre n'est jamais interrogé — **par propriété,
  pas par règle** (FF-054 §11 n°2 non tranché).

### 8.2 Comment l'implémenter

**Lot 8.0 — le membre existe pour le produit** (fondation, aussi consommée par P7)
- Une garde `KeelHouseholdRoute` sur `/app/chat` pour le palier `household_member` — un chat
  **Sophia → la personne**, qui ne viole pas « aucun canal 1:1 » (c'est entre membres que le canal
  est refusé). Renverser FF-048 §3 « ❌ le chat » **par écrit** (D8.1).
- `keel-daily-pulse-v1` : une **seconde requête** d'audience (`household_members.role='member' and
  user_id is not null`), jamais `keel_role='student'` (refusé par FF-048 R14 et `KeelHouseholdRoute:22-27`).
- `loadPlannedDishContext` (`planned_dish_io.ts:85-140`) et `loadPlanForTick` (`evening_strip_io.ts:483`)
  : pour un membre, le plan du jour est le plan **`household`** de **son** foyer —
  `.eq("plan_kind","household").eq("household_id", keel_household_of(user))`, **jamais** le retrait
  du `.eq("user_id")` sans garde équivalente (run adversarial H2, `evening_strip_io.ts:468-482`).
  Rejoindre la liste `READERS` de `household_plan_kind_readers_test.ts`.
- Ordre du cron : les maîtres **avant** les membres dans le même tick, pour que la cascade d'une
  session ratée ampute la bande ③ du conjoint (FF-061 §11).

**Lot 8.1 — la coche du membre sur le plan du foyer** (aucune migration)
- `useMealTicks` lié au `householdMealId` pour un membre, plats filtrés par `dishIsFor` ; cases
  dans `MyShareCard`. Sa bande ③ du soir est construite depuis le plan du foyer, ses plats seulement.
  Un ✗ ouvre le formulaire A de FF-057 (commandé / pas eu le temps / autre chose) puis l'invitation
  photo (FF-025) — `writeOffPlanTapFact` et l'upload sont prêts.
- **Le maître ne change pas** : son tap dit « fait et servi comme prévu, moi compris ».

**Lot 8.2 — les scénarios, comme faits et conséquences, jamais comme corrections**

| Cas | Ce qui est écrit | Conséquence |
|---|---|---|
| Silence des deux | rien (R3 ; jamais de coche automatique) | Le **lecteur** (P7) compte « mangé, base `assumed` » — D8.2 |
| ✓ des deux | deux lignes | compte |
| Maître ✓ · membre ✗ (+ photo/desc) | deux lignes + fait `off_plan` du membre | **sa boîte** de ce repas est un **reste** : proposition **au membre seul** — « ta boîte de mardi : jeudi midi ? » si dans `MAX_FRIDGE_DAYS`, « au congélateur » si équipé, « jetée ». Écrit dans une table d'état **par bouche**, jamais un glissement du plan |
| Maître ✗ | son untick + une **nouvelle étape** dans sa bande : « Qui n'a pas mangé ? » `[moi]` `[tout le foyer]` `[choisir…]` (cases = bouches **sans compte** uniquement) | « tout le foyer » ⇒ la casserole reste ⇒ l'action existante `shift_dish` (plan-wide, légitime : c'est le maître) ; « certaines bouches » ⇒ leurs boîtes sont des restes (même table, `declared_by = maître`) |
| Contradiction | **structurellement impossible** sur un profil réclamé : le maître ne peut pas le cocher (R11) ; « tout le foyer » chez le maître ne couvre pas les comptes | le lecteur résout par bouche : **la ligne déclarée par la personne gagne** sur la déclaration du maître — D8.3 |

- **La table d'état** (une migration) : `meal_share_outcomes(generated_meal_id, dish_index,
  member_id, declared_by user_id, outcome ∈ {not_eaten, shifted, frozen, discarded}, shifted_to_day,
  answered_local_date)`, clé `(generated_meal_id, dish_index, member_id, declared_by)`. Patron
  `20260812140000` : **revoke `authenticated`** dès la migration, RLS, jumelle `_for(p_user)` pour le
  serveur (`auth.uid()` NULL sous `service_role`), export RGPD **dans la même migration**. Lecture :
  chacun ses lignes ; le maître, en plus, celles des bouches **sans compte**. Jamais celles d'un
  profil réclamé (c'est la surveillance retirée).
- **Le lecteur du reste** (ce qui manquait à `leftover`) : la vue de la part (`MyShareCard`, le bloc
  jour du maître) rend « boîte de mardi, encore au frigo » avec les deux boutons ; P7 lit l'état
  pour le compte de la journée. Aucune re-composition, aucun appel modèle (« le glissement qui
  devient V3 » reste interdit).
- **Aucune action de glissement depuis un membre** (D8.4) : FF-058 R9, « la capture et la réparation
  sont deux fiches ». Le membre déclare ; le plan du foyer ne bouge que par le maître.
- Ni courses, ni cuisson, ni retour de fin de plan pour le membre : les deux premiers sont déjà
  `masterOnly` ; le troisième l'est par `unique(meal_id)` — **l'écrire** dans FF-054 §11.

### 8.3 Décisions à prendre

| # | Question | Recommandation |
|---|---|---|
| **D8.1** | Ouvrir le chat au membre (renverse FF-048 §3) | Oui, chat Sophia → personne, sans canal entre membres |
| **D8.2** | « Pas de nouvelles = mangé » : écrire ou lire | **Lire** (base `assumed`) ; jamais écrire une coche que personne n'a posée |
| **D8.3** | La contradiction | Structurelle : le maître ne peut pas parler pour un compte ; par bouche, la ligne de la personne gagne |
| **D8.4** | Un membre peut-il décaler quoi que ce soit du plan | Non. Il déclare, et il décide du sort de **sa boîte** |
| **D8.5** | Le maître peut-il marquer les bouches **sans compte** comme n'ayant pas mangé | Oui — c'est un fait de nourriture (une boîte restée), pas la surveillance d'un adulte ; R12 reste vrai (aucune coche **de consommation** lue pour un enfant : on ne compte rien, on range une boîte) |
| **D8.6** | Le membre doit-il aussi voir les questions courses/cuisson en lecture | Non |
| **D8.7** | `enable_confirmations = false` : plus de pouvoir au membre = plus de valeur à un lien volé | Geste humain côté Dashboard Auth avant la prod (FF-048 §7) |

**Effort : 5 jours** (8.0 = 1,5 ; 8.1 = 1 ; 8.2 = 2,5). Tests : `routeGuards.int.test.ts`
(se retourne), `evening_strip_test.ts`, `day_review_test.ts`, `household_plan_kind_readers_test.ts`
(nouveau lecteur), `accident_test.ts` (l'action `leftover` gagne un lecteur), `myShare.int.test.ts`
(la carte gagne des cases, `sharePresentedTo` reste), `mealTicks.int.test.ts`. Run réel obligatoire :
un foyer à deux comptes, deux bandes le même soir, un ✗ du membre, une boîte décalée.

---

## 9. Les fils qui relient les huit points

| Fil | Points | Conséquence sur l'ordre |
|---|---|---|
| **`SetupPage.tsx`** (7 118 l., actif cette nuit) | P1, P2 (étape 3), P3 (sélecteurs), P5 (étape 2 sur `MouthCoreFields`), P6 (`TableStepPlanning`) | P3 d'abord (petit) ; P6 puis P5 en série ; P1 puis P2 en série ; les deux séries se croisent sur l'étape 3 → **P6 avant P1** (il retire `TableStepPlanning`), P2 remonte la question du style à sa place |
| **`fr.ts` / `en.ts` / `catalog.ts`** (`MM`, 80 ko non commités) | tous | Convention du dépôt : packs modifiés sur le disque, **jamais commités par un lot**, clés listées au rapport ; une passe de fusion finale rejoue `parity` |
| **`generate-meal-v1` + `generate-household-meal-v1` + `meal_generation.ts`** | P1, P2, P6 (D6.1/D6.2) | Une seule lane à la fois ; trois bumps de version, **un par lot**, jamais fusionnés (populations à distinguer dans `generated_from`) |
| **Garde de rôle du membre** (`KeelHouseholdRoute`, `routeGuards.int.test.ts`) | P7, P8 | P8 lot 8.0 la livre ; P7 la consomme (contrat nommé) |
| **`protocol_events` en écriture / en lecture** | P8 écrit (membre), P7 lit (agrégat) | Parallèle sous contrat : préfixes `meal_tick:`, `accident_off_plan:`, `slot_meal:`, table `meal_share_outcomes` |
| **`HouseholdPage.tsx` / `MemberRow`** | P5, P6 | Série |
| **La base locale partagée, le runtime edge, Kong** | tous | Un tag QA par lane (`trial_seat_limit = 3`), un port par lane, `docker restart supabase_edge_runtime_Sophia_2` coordonné (il coupe les 7 autres), `local_extend_kong_functions_timeout.sh` après chaque restart |
| **Le gate de commit** | tous | Il lance **toute** la suite vitest : un rouge d'une lane bloque les commits des autres. Baselines (`.vitest-red-baseline`…) ne se régénèrent que par une lane nommée |

---

## 10. L'ordre d'exécution

```
LOT 0 (humain + 1 agent, ½ journée) — sans lui, pas de parallélisme
   commit de l'arbre (lot énergie stagé, i18n, sessions de la nuit) · registre des décisions D1–D8
   un port + un tag QA + une minute de cron par lane

T1  (½ journée, série rapide dans l'arbre principal)
   A3 · la 4e option            A4 · les idées de repas
        petits, front, ils touchent SetupPage/HouseholdPage/App.tsx que tout le monde reprend ensuite

T2  (parallèle, 4 lanes en worktree, chacune en série interne)
   Lane FOYER      A6 (déjeuner → Foyer, D6.1/D6.2)  ─→  A5 (page Foyer, étape 2 unifiée)
   Lane CUISINE    A1 (la veille automatique)         ─→  A2 (style + courses)
   Lane MEMBRE     A8.0 (le membre existe) ─→ A8.1 (sa coche) ─→ A8.2 (scénarios, restes)
   Lane SUIVI      A7 (page de suivi) — démarre sur le contrat 8.0, consomme 8.0 dès qu'il est commité

T3  (1 agent, 1 journée)
   E · fusion i18n (parity), run réel bout en bout sur un foyer à deux comptes :
       composer après 18 h → veille/matin → style+courses → bande du soir maître et membre →
       ✗ du membre → boîte décalée → page de suivi des deux → retrait des cartes de l'entonnoir vérifié
```

**Pourquoi cet ordre**
- A6 avant A1 : A6 retire `TableStepPlanning` de l'étape 3, A1/A2 réécrivent le bloc cuisine juste
  en dessous. Deux lanes sur la même région du même fichier au même moment est le mode d'échec
  que le prompt maître du 17/08 interdit (§1).
- A1 avant A2 : la veille est le **rang 0** de la fenêtre ; A2 y pose sa première session.
- A8.0 avant A7 : la garde de rôle et l'audience des crons sont la fondation des deux ; A7 ne peut
  pas la livrer sans casser A8.
- A3 et A4 en tout premier : deux heures chacun, et ils touchent des fichiers que **toutes** les
  lanes reprennent (SetupPage, HouseholdPage, App.tsx, KeelAppShell, i18n).

**Chaque agent** reçoit ce document entier + son mandat (§1-§8) + les règles transverses §2 du
prompt maître du 17/08 (lire avant d'écrire ; jamais de matcher maison ; tout champ déclaré par le
modèle a un compteur ; versions de prompt par population ; commandes à risque jamais seul ;
`migration up` seulement, registre vérifié avant de choisir un numéro ; `git add` par chemins ;
jamais `stash`/`checkout`/`reset` ; i18n non commitée ; mutations sur toute garde neuve ; ce qui
n'est pas vu en run réel est consigné rouge). Chaque agent écrit son rapport horodaté dans
`scratchpad/2026-09-JJ-HHMM-A<n>-<sujet>.md`.

**Vérification « en conditions réelles »**, par lane :
- FOYER : navigateur à 320 et 1280 px, persona maître (`qa1v.foyer@keeltest.dev`, mdp `1234567`)
  **et** un persona secondaire réclamé (fixture à créer avec un tag propre) ; un ajout jusqu'à 8
  bouches (le 9e refusé `household_full`) ; un mineur avec `fat_loss` → bascule à maintien ;
  **le parcours d'invitation entier** depuis la ligne d'une bouche : lien rendu, aperçu `anon`,
  compte créé par SQL (jamais par le parcours : `EMAIL_DELIVERY_ENABLED=1`), réclamation avec
  session et pays, la ligne passe à « a son accès », `access_tier = household_member`, puis
  « retirer l'accès » et la bouche reste avec ses allergies et sa part.
- CUISINE : quatre runs réels `intent: "draft"` (avant 18 h pour demain · après 18 h pour demain ·
  le jour même · plan de 7 jours mangés = fenêtre 8), compteurs SQL (`shopping_waves`,
  `one_cooking_session`, `uses_kept_freezer`), la bande du soir sur la veille.
- MEMBRE : deux comptes, un soir, deux bandes ; le run adversarial H2 rejoué (charge forgée citant
  le plan d'un autre foyer → `stale`).
- SUIVI : la garde TCA **serveur** vue en train de mordre (fixture sous plancher : zéro chiffre,
  zéro courbe) ; le total d'une journée avec les trois bases ; la courbe sur 12 mois d'une fixture
  à 60 pesées.

---

## 11. Le Lot 0, en détail — ce qui doit se passer avant de lancer quoi que ce soit

1. **Commiter l'arbre**, par l'humain ou un agent sous sa validation. Le lot énergie stagé
   (`20260901140000`, `energy_gate.ts`, `meal-energy-v1`…) est un commit ; les packs i18n
   (80 ko) en sont un autre ; ce qui reste des sessions de la nuit (`SetupPage`, `generate-*`,
   `planDraft`) un troisième. Sans ça : pas de worktree possible, et tout se fait en série.
2. **Trancher le registre** : D1.1, D2.1, D2.2, D3.2, D4.1, D5.1, D5.3, D5.7, D5.8, D6.1/D6.2,
   D7.1, D7.4, D7.5, D7.10, D8.1, D8.4, D8.5 — les autres ont une recommandation qu'un agent peut
   suivre seul.
3. **Poser le poste** : `./scripts/check-local-jwt-alg.sh` ; `./scripts/supabase_local.sh start`
   (jamais `supabase start` nu) ; `functions serve --env-file supabase/.env` ;
   `TIMEOUT_MS=900000 ./scripts/local_extend_kong_functions_timeout.sh` ; quatre entrées neuves dans
   `.claude/launch.json` (ports libres : 5203, 5204, 5206-5209) ; quatre tags QA ; vérifier
   `ls supabase/migrations | cut -d_ -f1 | uniq -d` vide et disque == registre.
4. **Réserver les numéros de migration** par lane (P1 : cap/exclusion ; P2 : commentaire de
   colonne + liste fermée ; P8 : `meal_share_outcomes` ; P7 : aucune) — un horodatage par lane,
   choisi **après** lecture du registre, car une migration hors ordre est sautée en silence.
5. **Rappeler l'interdit** `EMAIL_DELIVERY_ENABLED=1` : toute inscription jouée au navigateur envoie
   un vrai mail ; les fixtures se créent par SQL, jamais par le parcours.

---

## 12. Effort total et ce qu'il ne couvre pas

| Lane | Jours | Note |
|---|---|---|
| A3 + A4 | 1 | |
| A6 → A5 | 1,5 + 4,5 | l'unification de l'étape 2 est la moitié de A5 ; l'invitation par ligne, une demi-journée |
| A1 → A2 | 3 + 3 | trois bumps de prompt, une migration sur trois mécanismes |
| A8 | 5 | une migration, un chat pour le membre, une table d'état |
| A7 | 5 | une fonction edge d'agrégat, quatre renversements écrits |
| E | 1 | |
| **Total** | **~24 jours-agent**, ~8 jours de calendrier en parallèle | |

**Non couvert, et nommé** : le mode 1:1 (`plan_versions`, gardé exprès) ; la fusion / prise de
main (lue, jamais touchée) ; le gel 402 et Stripe ; `keelGenerationModel()` sur la lane foyer
(chantier à part, connu) ; FF-005 `single_run` (remplacée par A2) ; le vérificateur de traditions qui
ne sait pas qu'un cabillaud est un poisson ; le foyer orphelin ; le pont de FF-062 vers une balance
connectée.
