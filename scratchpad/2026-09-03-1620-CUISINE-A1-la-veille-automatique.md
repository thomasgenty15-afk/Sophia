# CUISINE — A1 · la veille automatique (P1)

**Worktree** `/Users/ahmedamara/Dev/Sophia-2-chantiers/CUISINE` · branche `chantier-0903/CUISINE`
· base `31ee930f` · **migration réservée** `20260903140000` · tag QA `qa0903c`
· **Mandat** MASTER §5.5 · ANALYSE §1 · décisions D1.1 → D1.6 par défaut.

> Journal écrit **au fil de l'eau** (règle §2.3-25). Un rapport écrit à la fin n'existe pas.

---

## 0. L'ÉTAT REPRIS — ce qu'un agent tué avait laissé, et ce qu'il fallait corriger

Trois fichiers modifiés, **non commités**, aucun test lancé.

| Fichier | Verdict | Détail |
|---|---|---|
| `plan_hours.ts` — `leadDayFor` | **juste** | la table des cinq motifs est celle de l'ANALYSE §1.2 ; `hourNow: null` ⇒ `clock_unreadable`, jamais deviné ; `assertHourNow` réutilisé. **Aucun test ne la couvrait** — écrits ici. |
| `meal_plan_window.ts` — `MAX_LEAD_DAYS`, `planTimingOf`, doc | **juste** | `planTimingOf` fait bien primer le refus de fenêtre sur le motif d'horloge. |
| `meal_plan_window.ts` — `eatenSpan` | **FAUX : garde morte** | la fonction était écrite, documentée (« les deux lanes l'appellent ») et **n'avait aucun appelant**. `firstBlockingPlan` comparait toujours des spans NUS. Corrigé : `LivePlanSpan` porte `leadDays` **requis**, et `firstBlockingPlan` plie chaque ligne par `eatenSpan`. C'est le TYPE qui tient le `select` — trois projections l'ont réclamé (ci-dessous). |
| `grocery_waves.ts` — `serves` sur `buyOn > firstBuyOn` | **juste, non prouvé** | le changement était bon et **aucun test ne le distinguait** de l'ancien (au cas nominal `firstBuyOn === startsOn`). Deux tests écrits qui séparent les deux règles. |

Le `.eq` sur `startsOn` a bien été **gardé** (interdit du mandat respecté) : la veille EST `startsOn`.

---

## 1. Commits

| # | sha | Contenu |
|---|---|---|
| 1 | `7c5128ad` | la veille dérivée : modules purs + `eatenSpan` branché + tests |
| 2 | `5ba7f237` | migration `20260903140000` + son bloc de contrôle (6/6) |
| 3 | `e09d15b3` | les deux lanes dérivent, écrivent `timing`, et le DISENT ; bump v24→v25 |
| 4 | `b089f28d` | la case retirée (11 sites) ; `timing` rendu ; ligne PDF |
| 5 | `e201cc60` | i18n chantier-0903/CUISINE (A1) |
| 6 | *(ci-dessous)* | FF-005 passée 🔴 (D1.5) + journal |

### Suites du lot A1 complet

- `cd frontend && npx tsc -b --force` → **exit 0**.
- `npx vitest run` → **2046 passés / 2071**, **5 rouges ÉTRANGERS et antérieurs** :
  `coverage-guard` ×2, `awayFrom` ×2, `mealBoxes.int.test.ts › un contenant sans bouche…`.
  Aucun autre rouge.
- Deno (tous ceux que le mandat nomme, tous **verts**) : `cook_the_day_before_test` (27),
  `grocery_waves_test` (29), `meal_plan_window_test`, `household_merge_test`,
  `constant_pinning_gate_test`, `wave_cascade_test`, `accident_test`, `evening_strip_test`,
  `day_review_test`, `plan_rationale_test` (85), `meal_pdf_locale_test` (18),
  `precedence_binding_test`, `fridge_window_test`. `deno check` vert sur
  `generate-meal-v1`, `generate-household-meal-v1`, `meal-document-v1`.
- vitest ciblés : `oneCookingSessionField.int.test.ts` (20, retourné),
  `setupDraftCache.int.test.ts`, `planDraft.int.test.ts`, `shoppingWhen.int.test.ts` — verts.

### Mutations du code (hors migration, dont les 4 sont plus haut)

| Mutation | Rouge attendu | Vu |
|---|---|---|
| `hourNow` deviné (`(input.hourNow ?? 0) < CUTOFF`) | l'horloge illisible accorde une veille | `A1 — la table de leadDayFor` FAILED |
| `serves` remis sur `buyOn > startsOn` | la 1ʳᵉ vague tombée après le début reste muette | `A1 — la PREMIÈRE vague…` FAILED |

Restaurées par `cp` depuis une copie de scratch, `cmp` vert sur les deux, suites re-vertes
(56/56). **Jamais `git checkout`, jamais `git stash`.**

### Versions de prompt

| Constante | Avant | Après | Preuve |
|---|---|---|---|
| `MEAL_PROMPT_VERSION` | `meal.en.v24_raw_keeping_reaches_the_model` | `meal.en.v25_the_day_before_is_derived` | test épinglé |
| `HOUSEHOLD_PROMPT_VERSION` | `v22_precedence_in_tail` | **inchangé** | `A1 — l'enveloppe du FOYER ne bouge pas d'un octet` |

La consigne n'a pas changé d'un caractère : c'est la **population** qui la reçoit qui change
(`cookOnlyDay` n'était posé que sur un plan dont quelqu'un avait coché une case). Bumper le
foyer « par symétrie » aurait fait croire à une population qui a changé de consigne sans rien
voir.

### Clés i18n

**Ajoutées** (bloc `chantier-0903/CUISINE`, sous-section A1, `en.ts` **et** `fr.ts`) :
`meals.timing.day_before`, `meals.timing.same_morning`.
**Retirées** : `plan.cooking.day_before_label`, `…_hint`, `…_starts_today`, `…_no_room`
(vérifiées appelant par appelant : le seul lecteur était `CookDayBeforeField.tsx`, supprimé ;
zéro occurrence dans `catalog.ts`).

### Les décisions D1.x, telles qu'appliquées

- **D1.1** la veille est DANS la fenêtre · **D1.2** composer avant 18 h pour demain ⇒ « ce
  soir », phrase dédiée · **D1.3** fenêtre de 8 autorisée, jours mangés ≤ 7 · **D1.4** fuseau du
  compositeur (les deux lanes lisaient déjà `profiles.timezone` du compte qui compose) ·
  **D1.5** FF-005 passée 🔴, motif écrit dans la fiche · **D1.6** rien à ajouter, et c'est
  **par construction** : la veille n'est plus une réponse stockée mais une **dérivation faite à
  chaque appel**, et l'adoption repasse par la même fonction edge avec la date du jour — un
  onglet ouvert la nuit recalcule donc `leadDayFor` avec le nouveau `todayDate`.

### Hors périmètre croisé, nommé et non réparé

- `household_merge_notice_io.ts` (région fusion, « lue jamais touchée ») : **touché au
  minimum** — `LiveHouseholdPlan.leadDays` + `lead_days` dans son `select`. Sans ça, la lane
  foyer aurait refusé un plan N+1 que la base accepte. `mergeWindowWritable` passe
  `leadDays: 0` explicitement, avec le commentaire qui dit où la veille devra entrer le jour où
  la fusion en dérivera une.
- `HouseholdMergeCard.tsx:45` (`toLocaleDateString`) : laissé exprès, non touché.
- `TableStepPlanning.tsx` / `HouseholdPage.tsx` : **jamais ouverts** (région de la lane FOYER).

### Suites du commit 1

`deno check` **vert** sur les deux lanes. Deno : `cook_the_day_before_test` 26/26,
`grocery_waves_test` 29/29, `meal_plan_window_test` + `household_merge_test` +
`constant_pinning_gate_test` 155/155, `wave_cascade` + `accident` + `evening_strip` +
`day_review` + `plan_rationale` + `meal_pdf_locale` + `fridge_window` 239/239.

### La migration `20260903140000` — contrôle et mutations

Validée **en transaction annulée** (`begin; …; rollback;` via `docker exec -i psql`), base laissée
intacte (colonne absente, 0 ligne, CHECK d'origine en place — vérifié après coup).

**Contrôle en fin de fichier : 6/6.** ① 7 jours mangés + veille = fenêtre de 8, acceptée ·
② la veille de N+1 sur le dernier jour mangé de N, acceptée · ③ un jour mangé partagé, refusé ·
④ 8 jours **mangés**, refusés (`bad_eaten_days`) · ⑤ veille de 2 jours, refusée (`bad_lead_days`) ·
⑥ la veille de B sur le **premier** jour de A **tronque** A à 1 jour, elle ne refuse pas.

**Quatre mutations, quatre rouges** (jouées sur des copies de scratch, jamais sur le fichier) :

| Mutation | Rouge |
|---|---|
| exclusion remise sur `daterange(starts_on, …)` | ② « la veille du plan N+1 … a été refusée : conflicting key value violates exclusion constraint » |
| boucle ① remise sur `v_clash.starts_on >= p_starts_on` | ⑥ « … a été refusée au lieu de tronquer : plan_overlaps_existing » |
| `check (… between 1 and 8)` + borne des repas désarmée | ④ « huit jours MANGÉS ont été acceptés » |
| coupe remise sur `p_starts_on` au lieu de `v_eats_from` | ⑥ « violates check constraint …_duration_days_check » |

⚠️ **La mutation ② est arrivée VERTE au premier jet** : les cinq premiers cas de contrôle ne
distinguaient pas l'ancienne condition de la nouvelle. Le cas ⑥ a été écrit **pour ça**, et c'est
lui seul qui arme la boucle plpgsql.

### ⛔ Deux pièges trouvés en écrivant la migration, qui auraient cassé le produit en silence

1. **`plan_kind` est dans la clé de l'exclusion ET de l'index unique** — ajouté par
   `20260811080000`, **pas** par `20260807090000` (le fichier que l'analyse cite). Recréer les
   deux d'après `20260807090000` aurait **supprimé la séparation perso / foyer** : le maître ne
   pourrait plus tenir son plan perso et le plan commun sur la même semaine. Mesuré sur la base
   locale, où cette paire existe (`53fb05ba…`, 22/08 perso + 22/08 commun) : la contrainte a
   **refusé de se créer**, ce qui est la seule raison pour laquelle le piège a été vu.
2. **`scope` se dérivait de `duration_days`** : une fenêtre de deux jours dont l'un est la veille
   est un plan **d'un jour**. La RPC et la lane le dérivent maintenant des jours **mangés**.

---

## 2. Messages de l'orchestrateur reçus en cours de lot (à replacer à la fusion)

1. **`plan_feedback_retained.ts` est réécrit par la session parallèle (son lot B), qui passe AVANT
   mon A2.** C'est la région de **D2.5** (l'effet FF-054 `cooked: no` doit descendre le **style**
   d'un cran, pas `cooking_time_min`). Mon changement y sera **minimal et localisé** ; s'il est
   écrit avant que son sha tombe, il est écrit contre l'état de ma base et **doit être replacé sur
   son lot B**.
2. Dans ce même lot B : `questionsFor(restrictionFlag)` **perd** son paramètre `goal`, et
   `FEEDBACK_QUESTIONS` **perd** `hunger_between_meals` et `could_finish`. Rien de ce que j'écris
   ne dépend de ces deux questions.
3. À la fusion : **`HouseholdPromptInput.notes` est REQUIS** dans l'arbre principal. Je n'ajoute
   **aucun appelant** de `buildHouseholdPromptBlocks` (vérifié pour D6.2 : le bloc « transportable »
   se pose à côté de `eatingOutBlock`, dans le même constructeur, sans nouvel appelant).
   Également changées et non dans ma base : `memoLinesForPrompt(pc, {subject, who})` et
   `isNextPlanItemAlive(entry, plans)`.

---

## 3. ROUGE — ce qui n'a PAS été vu

*(complété au fil du lot ; voir §7 pour le script de fenêtre)*

- **Aucun run réel** : le runtime edge sert l'arbre principal, la fenêtre appartient à l'orchestrateur.
- **Un plan de SEPT jours mangés n'a pas de veille automatique.** `withCookDayBefore` refuse
  encore `no_room` à sept jours mangés, alors que la migration accepte `duration_days = 8`. Le
  refus ne vient plus de la base mais de **l'alphabet des jetons** : une fenêtre de huit jours
  donnerait au jour de cuisine le jeton exact du dernier jour mangé, `windowDates` (un `Record`
  par jeton) ne saurait plus dater ni la session du rang 0 ni les plats du dernier jour, et le
  parseur jetterait ces plats comme s'ils étaient posés sur la veille. **Autoriser 8 ici sans
  dater les sessions produirait un plan faux en silence.** Le refus est gardé, nommé, rendu comme
  `same_morning` et expliqué dans `plan_rationale`. Levée : adresser les sessions **par date** et
  non par jeton — hors périmètre de A1.
