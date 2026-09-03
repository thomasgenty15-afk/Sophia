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
| 1 | `<à remplir>` | la veille dérivée : modules purs + `eatenSpan` branché + tests |

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
