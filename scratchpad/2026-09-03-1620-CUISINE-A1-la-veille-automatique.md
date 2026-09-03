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
| 2 | `<à remplir>` | migration `20260903140000` + son bloc de contrôle (6/6) |

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
