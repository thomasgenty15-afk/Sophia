# CUISINE — A2 · style de cuisine et nombre de courses (P2 + D6.1 + D6.2)

**Worktree** `/Users/ahmedamara/Dev/Sophia-2-chantiers/CUISINE` · branche `chantier-0903/CUISINE`
· **migration réservée** `20260903171000` (renumérotée : `…141000` était passée sous la tête du
registre) · tag QA `qa0903c` · **Mandat** MASTER §5.6 · ANALYSE §2 entier + §6.3 (D6.1, D6.2).

> Journal écrit **au fil de l'eau**. A1 est prêt à prouver (`2b57bfa9`) ; A2 démarre dessus.

---

## 0. Ce qui vient de A1 et que A2 utilise

- La **veille** est le rang 0 de la fenêtre quand elle existe (`lead_days = 1`). La première
  session de cuisine de A2 tombe **dessus** — c'est le geste que P1 a rendu automatique.
- `timing` est sur la ligne et dans la réponse ; `plan_rationale` porte déjà les phrases de la
  veille. A2 ajoute les siennes **à côté**, jamais à la place.

## 1. Commits

| # | sha | Contenu |
|---|---|---|
| 1 | `<à remplir>` | `_shared/keel/cooking_plan.ts` (module pur) + 15 tests + réexport front |

## 2. Décisions D2.x / D6.x appliquées

- **D2.1** durable (`practical_constraints`), éditable avant chaque composition ·
  **D2.2** les trois libellés de l'ANALYSE · **D2.3** le style plafonne les **sessions**, jamais
  les courses (la course en trop se **compte** et la rationale le dit) · **D2.4**
  `weeklyCookingMinutes` réveillé et **dit** · **D2.5** l'effet FF-054 `cooked: no` descend le
  **style** d'un cran (`oneStyleLower`), plus `cooking_time_min` · **D2.6** fait de **maison**
  (ligne du maître) · **D6.1** `generate-meal-v1` lit `household_members.away_days` en union ·
  **D6.2** bloc de prompt « transportable / bon froid » à côté de `eatingOutBlock` · **D6.3**
  namespace `setup.work_lunch.*` gardé.

## 3. Ce que le module pur tient, et ce qu'il refuse

`sessions = min(runs, 3, cap(style), joursMangés)`. Trois notes fermées, chacune adossée à une
phrase de rationale : `runs_1_needs_freezer`, `style_caps_sessions`, `days_cap_sessions`.

⛔ **Il PLAFONNE, il ne pousse pas.** Une session de plus est une vague de courses de plus, donc
un déplacement de plus (`plan_feasibility.ts:27-40`). « Le moins possible » + 3 courses rend
**2 sessions** et laisse la 3ᵉ course disponible pour du frais du jour ; `unusedGroceryRuns` la
compte pour que la rationale puisse le dire, au lieu de laisser deux vagues sous une réponse
« trois » se lire comme une option ignorée.

⛔ **Clé absente ≠ `minimal`.** Cicatrice `20260818110000:48-51`, déjà payée sur
`kitchen_equipment`. `readCookingStyle`/`readGroceryRuns` rendent `null` = *jamais demandé*, et les
lecteurs retombent alors sur `cooking_time_min` tel quel — le comportement d'hier, à l'octet près.

⛔ **`freezer: null` refuse comme `false`.** « On ne sait pas s'il en a un » n'est pas une raison
de promettre une semaine au congélateur.

## 4. ROUGE — ce qui n'a PAS été vu

- Aucun run réel : la fenêtre appartient à l'orchestrateur.
