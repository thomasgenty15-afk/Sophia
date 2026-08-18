# L3-A — « dehors » n'est pas « absent » (la collecte et le modèle)

**Date** 2026-08-18 11:15 · Branche `ff-001-quotidien-du-coach` · aucun push, aucun merge
**Spec** [2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md](2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md) §2.2, §2.2 bis
**Orchestration** [2026-08-18-ORCHESTRATION-CHANTIER-OBJECTIFS.md](2026-08-18-ORCHESTRATION-CHANTIER-OBJECTIFS.md) lot L3

---

## 0. Ce qui est fait, en une phrase

La grille de présence porte **trois** états au lieu de deux, la question
hebdomadaire du bureau se **collecte** et **pré-remplit** la grille en une seule
transaction, et **rien de ce que le moteur produisait n'a bougé d'un
caractère** — l'exploitation est à L7/L8.

---

## 1. LA FORME EXACTE DE LA DONNÉE — ce que L7 et L8 doivent lire

> ### C'est la section à lire en premier si vous êtes L7 ou L8.

### 1.1 Le troisième état vit sur `away_days`, dans une clé `kind`

```jsonc
// household_members.away_days  ·  et student_goals.practical_constraints.away_days
[
  { "day": "tue", "slots": ["lunch"], "kind": "eating_out", "source": "self" },
  { "day": "sat",                     "kind": "away",       "source": "household" },
  { "day": "sun", "slots": ["dinner"] }        // ← forme d'AVANT ce lot: vaut `away`
]
```

| Jeton | Le plan compose ? | Le plan dit un nombre ? |
|---|---|---|
| *(pas d'entrée)* | oui — une part | — |
| `kind: "eating_out"` | non | **oui** |
| `kind: "away"` **ou jeton absent** | non | non |

- `parseAwayDays` ne lit que `day` et `slots` : le jeton lui est **invisible**,
  exactement comme `source`. C'est ce qui permet le troisième état **sans
  toucher `meal_generation.ts`**.
- `keel_away_tagged` propage l'entrée entière (`e || {"source":…}`) : le jeton
  traverse le roster, et **l'union des deux sources reste la concaténation**.
- **Aucune ligne existante n'est nettoyée.** Sans jeton on lit `away`, le
  silence — c'est-à-dire le comportement d'hier.

### 1.2 Les lecteurs, côté moteur (`_shared/keel/household_presence.ts`)

```ts
parseMemberAway(raw)      // → { effective, self, household, eatingOut? }
presenceStateFor(away, day, slot)   // → "at_table" | "eating_out" | "away"
memberEatingOutCells({ away, rhythm, windowDays })  // → MealCell[]
resolveWindowPresence(...).eatingOut
//   → ReadonlyArray<{ member_id: string; cells: { day, slot }[] }>
//     Vide quand personne ne mange dehors. C'est CE champ que L8 lit pour
//     savoir OÙ un conseil chiffré a le droit d'exister.
resolveWindowPresence(...).trace[i].eating_out   // archivé dans generated_from
```

> ⛔ **Ne lisez pas `away.eatingOut` directement pour décider.**
> `presenceStateFor` porte l'arbitrage entre les deux sources ; lire le champ
> seul ferait un second avis sur « qui est dehors ».

> ⚠️ `eatingOut` est **facultatif dans le type** `MemberAway`, et **toujours
> rendu** par `parseMemberAway`. Il l'est pour une raison mécanique : d'autres
> modules construisent des `MemberAway` à la main dans leurs fixtures
> (`household_merge_notice_test.ts:325`, hors de mon périmètre), et le rendre
> obligatoire les aurait cassés sans rien prouver. Un `MemberAway` bâti à la
> main n'a donc aucun « dehors » — tout y est `away`, le silence, exactement
> comme avant ce lot. Test dédié.

### 1.3 La réponse hebdomadaire (`household_members.work_lunch`)

```jsonc
{ "at_work": true, "mode": "lunchbox" | "outside", "microwave": true | false }
// null = LA QUESTION N'A JAMAIS ÉTÉ POSÉE. Ce n'est PAS « non ».
```

```ts
parseWorkLunch(raw)  // → { atWork, mode, microwave } | null
workLunchPrefillCells(answer)   // les cases que le pré-remplissage couvre
WORK_WEEK_DAYS  // ["mon","tue","wed","thu","fri"] — le sens de « la semaine »
WORK_LUNCH_SLOT // "lunch"
```

**Ce que L7 doit en faire** (et que je n'ai PAS fait — c'est son lot) :

| Réponse | Contrainte à poser dans le prompt |
|---|---|
| `mode: "lunchbox"`, `microwave: true` | le déjeuner doit être **transportable** |
| `mode: "lunchbox"`, `microwave: false` | transportable **ET BON FROID** |
| `mode: "lunchbox"`, `microwave: null` | pas demandé / pas répondu — **on n'invente pas « non »** |
| `mode: "outside"` | rien à composer ; la case est déjà `eating_out` dans la grille |

Lecture serveur : `keel_household_work_lunch_for(p_user)` (`service_role`),
une ligne par bouche **à qui on a demandé**. Une bouche absente du résultat
n'a **jamais été interrogée** — ce n'est pas « elle ne mange pas au bureau ».

### 1.4 Côté navigateur — le jumeau

`frontend/src/keel/lib/presenceMarks.ts` : `AwayMark` (= `AwayDay` + `kind`),
`awayKindOf`, `parseAwayMarks(raw, source?)`, `presenceStateOf`,
`mergeAwayMarks`, `parseWorkLunch`, `workLunchPayload`, `workLunchPrefillCells`.

`frontend/src/keel/api/workLunch.ts` : `loadWorkLunch()`,
`setMemberWorkLunch(memberId, answer | null)`.

> Le navigateur ne peut pas exécuter `household_presence.ts` (il traînerait tout
> le moteur), d'où le jumeau — même choix que `api/mealGeneration.ts`. **Un test
> charge les DEUX sous node et prouve qu'ils rendent le même état** sur six
> formes de colonne et huit formes de réponse (`presenceMarks.int.test.ts`,
> bloc « LE JUMEAU NE DÉRIVE PAS DE SON AUTORITÉ »).

---

## 2. La règle qui gouverne le lot, et où elle est tenue

```
réponse hebdo ──PRÉ-REMPLIT──► la grille ──DÉCIDE──► la composition
```

**Le pré-remplissage est appliqué UNE FOIS, à l'écriture de la réponse, dans la
même transaction** (`keel_household_set_member_work_lunch` →
`keel_away_with_work_lunch`). Il n'est **jamais re-dérivé à la lecture**.

C'était l'arbitrage central. Un pré-remplissage recalculé à chaque affichage de
la grille remettrait « dehors » sur le midi qu'on vient de décocher, à chaque
fois — le défaut le plus frustrant qui soit. Le matérialiser à l'écriture rend
la grille seule autorité ensuite.

Trois propriétés, toutes prouvées :

1. **Il ne retire jamais une absence.** Il ne touche que des entrées portant
   exactement sa forme (un midi de semaine, `eating_out`). Une vacance marquée à
   la main survit à tout changement de réponse.
2. **Il est idempotent** — on retire d'abord, on réécrit ensuite. La même
   réponse enregistrée deux fois ne fait pas dériver le tableau vers le
   plafond de 42.
3. **La gamelle ne coche rien.** Un repas emporté est un repas **composé**. Le
   marquer « dehors » retirerait cinq déjeuners du plan de quelqu'un qui compte
   dessus pour remplir sa boîte. C'est le piège n°1 du lot ; deux tests le
   gardent, des deux côtés.

### L'arbitrage entre les deux sources : **LE SILENCE GAGNE**

La personne dit « dehors mardi midi », le maître marque « en vacances toute la
semaine ». Les deux retirent la part ; elles ne se contredisent que sur un
point — dit-on un nombre ? **On ne le dit pas.** Un conseil chiffré au milieu de
vacances s'écrit à l'écran ; un conseil qui manque ne s'y voit pas, et laisse le
produit dans l'état d'hier.

**L'arbitrage est PAR CASE, jamais par jour.** Le maître marque le dîner de
mardi (dentiste), elle mange dehors ce midi-là : le midi reste « dehors ».
Faire gagner le silence sur toute la journée effacerait un midi qu'elle vient
de déclarer.

---

## 3. Ce qui a été livré

| Fichier | État |
|---|---|
| `supabase/functions/_shared/keel/household_presence.ts` | +386 — 3 états, arbitrage, `work_lunch` |
| `supabase/functions/_shared/keel/household_presence_test.ts` | +227 — 12 tests neufs |
| `supabase/migrations/20260818120000_lunch_out_is_not_absence.sql` | **neuf**, 773 lignes — ⚠️ **non appliquée** (§6) |
| `frontend/src/keel/lib/presenceMarks.ts` | **neuf** — le jumeau navigateur |
| `frontend/src/keel/lib/presenceMarks.int.test.ts` | **neuf** — 16 tests |
| `frontend/src/keel/lib/planGridModel.ts` | le cinquième silence : `{ kind: "eating_out" }` |
| `frontend/src/keel/lib/planGridModel.int.test.ts` | +5 tests |
| `frontend/src/keel/components/MealPickerGrid.tsx` | trois états + extraction de `MealPickerGridBody` |
| `frontend/src/keel/components/mealPickerGrid.int.test.ts` | **neuf** — 6 tests sur la valeur rendue |
| `frontend/src/keel/api/workLunch.ts` | **neuf** — la collecte |

### La migration, en huit gestes

`20260818120000_lunch_out_is_not_absence.sql` :

1. `keel_away_kinds_ok(jsonb)` + contrainte `household_members_away_days_kind_check`
   — vocabulaire **fermé** (`away` | `eating_out`), **absence de jeton permise**.
   ⚠️ Une fonction et pas un prédicat inline : une contrainte `check` n'accepte
   pas de sous-requête, et le prédicat porte sur chaque entrée d'un tableau.
2. Colonne `household_members.work_lunch jsonb` (nullable = jamais demandé)
   + contrainte de forme. **Pas de table neuve ⇒ rien à réclamer au lifecycle
   RGPD** : la colonne vit sur une table déjà réclamée.
3. `keel_away_with_work_lunch(jsonb, text)` — le pré-remplissage, pur, idempotent.
4. `keel_household_set_member_work_lunch(uuid, jsonb)` — réponse **+**
   pré-remplissage dans la même transaction.
   Motifs : `not_authenticated | bad_work_lunch | not_a_member | not_your_line |
   not_adult | too_many_away`.
5. `keel_household_work_lunch_for(uuid)` / `keel_household_work_lunch()`.
   ⚠️ **Pas dans le roster, délibérément** : y ajouter une colonne obligerait à
   dropper `keel_household_roster_for`, une fonction que trois lots touchent en
   ce moment. Patron de `keel_household_habits_for` (2026-08-14).
6. `keel_household_set_member_away` recréée : un `kind` hors vocabulaire est
   refusé **par son nom** (`bad_away_kind`) plutôt que par une erreur SQL brute.
   Tout le reste est repris mot pour mot de D14.
7. Privilèges reposés, `anon` nommé (cicatrice du dépôt).
8. Bloc de contrôle : mineur refusé, adulte accepté, 5 midis pré-remplis,
   idempotence, **la grille survit**, jeton fermé, legacy valide, roster, lecture
   par sujet — puis `rollback`.

**`not_adult` couvre aussi l'âge INCONNU.** On ne pose pas une question d'adulte
à quelqu'un dont on ne sait pas s'il en est un. L'âge se **déduit** de la date de
naissance (`keel_household_member_age`) et n'est jamais redemandé.

---

## 4. Preuves

| Épreuve | Résultat |
|---|---|
| Suite Deno `_shared/keel/` (avec typecheck, via `agent-gate`) | **3243 passed, 0 failed** |
| `household_presence_test.ts` | **36 passed** (24 d'avant + 12 neufs) |
| vitest — mes 3 fichiers + parité i18n | **48 passed** |
| vitest complet | 14 rouges, **tous étrangers** (§6) |
| `cd frontend && npx tsc -b` | **exit 0** |
| `eslint` sur mes 7 fichiers front | propre |
| `agent-gate` | **`agent-gate: pass`** (au commit) |

### Les 12 mutations — chacune ROUGE du premier coup, puis restaurée

| # | Mutation | Ce qu'elle désarme |
|---|---|---|
| M1 | repli de `kindOf` → `"eating_out"` | le silence est le repli d'un jeton absent/inconnu |
| M2 | `eatingOut: withoutCells(out, shut)` → `out` | le silence gagne sur le dehors |
| M3 | retrait du `.filter(cells.length > 0)` | seules les bouches qui mangent dehors sont listées |
| M4 | `mode !== "outside"` → `mode === null` | **la gamelle ne coche aucun midi** |
| M5 | `at_work` illisible → `{atWork:false}` | « jamais demandé » n'est pas « non » |
| M6 | `presenceStateFor` décide sur la présence du champ | l'état se décide par CASE |
| M7 | `WORK_WEEK_DAYS` + `"sat"` (front) | le jumeau ne dérive pas de son autorité |
| M8 | ordre inversé dans `presenceStateOf` | le silence gagne, côté navigateur aussi |
| M9 | `mergeAwayMarks` jette les jours hors fenêtre | enregistrer un week-end n'efface pas mardi midi |
| M10 | `eating_out` → `away` dans `buildPlanGrid` | la grille du plan distingue les deux |
| M11 | `threeState` → `false` sur la cellule | le trois-états est rendu quand on le demande |
| M12 | `threeState &&` → `false &&` sur la phrase | la phrase qui sépare les deux états est rendue |

Aucune n'a demandé de durcissement de fixture.

### La garde centrale : **le prompt ne bouge pas d'un caractère**

`household_presence_test.ts` → « L3 — LE PROMPT NE BOUGE PAS D'UN CARACTÈRE » :
la même fenêtre, avec et sans jeton, rend un `block`, un `servings`, un
`householdAway` et un `absentAllWindow` **identiques**. Seul `eatingOut` change.
Si ce test tombe, ce lot a écrit dans le prompt — c'est-à-dire qu'il est entré
en collision avec L7, qui regroupe tous les changements de prompt en un bump.

---

## 5. Clés i18n ajoutées (sur le disque, **non commitées** — convention des lanes)

`frontend/src/keel/i18n/en.ts` et `fr.ts` :

| Clé | EN | FR |
|---|---|---|
| `meals.grid.eating_out` | eating out | repas dehors |
| `meals.picker.state_at_table` | Eating here | Ici, à table |
| `meals.picker.state_eating_out` | Eating out | Dehors |
| `meals.picker.state_away` | Not around | Pas là |
| `meals.picker.some_out_one` | {n} of them is a meal out: it leaves the plan, not the day. | Dont {n} repas dehors : il sort du plan, pas de la journée. |
| `meals.picker.some_out_many` | {n} of them are meals out: they leave the plan, not the day. | Dont {n} repas dehors : ils sortent du plan, pas de la journée. |

`meals.grid.eating_out` est **posée pour L8** : elle n'a pas encore de lecteur
(voir §7). `parity.int.test.ts` passe.

---

## 6. ⚠️ Les rouges restants, et à qui ils appartiennent

### 6.1 La migration N'EST PAS APPLIQUÉE — et elle ne doit pas l'être seule

**Deux raisons, dans cet ordre.**

**① L'ordre de la vague.** `20260818100000` (L1) n'est pas encore posée.
Appliquer la mienne (`…120000`) avant la sienne rendrait la sienne **hors
ordre — donc sautée en silence** (cicatrice nommée du dépôt). L'application se
fait quand **la vague entière** est complète : L1, puis L2, puis L3.

**② Le CLI refuse de tourner** dans cet environnement, et ce n'est pas dû à ma
migration :

```
Found local migration files to be inserted before the last migration on remote database.
Rerun the command with --include-all flag to apply these migrations:
  20260811090000_meal_plan_feedback.sql
  20260811100000_doctrine_activity_stance.sql
  20260811110000_food_composition_gaps.sql
  20260811121000_food_composition_null_nutrients.sql
  20260811130000_food_composition_gaps_2.sql
  20260812090000_ciqual_full_import.sql
  20260812091000_ciqual_english_aliases.sql
```

Ces sept-là **ne sont pas dans le registre** (`supabase_migrations.schema_migrations`)
— c'est le retard hors-ordre préexistant du poste, la cicatrice « migration hors
ordre = sautée en silence ». Le CLI refuse d'appliquer **quoi que ce soit** tant
qu'on ne les prend pas avec.

```bash
# À LANCER PAR L'HUMAIN, ET SEULEMENT QUAND LA VAGUE 1 EST COMPLÈTE.
# ⚠️ Applique AUSSI les sept migrations ci-dessus, dont `ciqual_full_import`
# (import d'aliments, long). Elle posera les trois migrations du chantier
# dans l'ordre: L1 (…100000), L2 (…110000), L3 (…120000).
supabase migration up --include-all
```

Notes :
- `npx supabase` (2.75.3) tombe sur `open supabase/.temp/profile: no such file
  or directory` puis `index out of range`. **Utiliser le binaire global**
  (`/usr/local/bin/supabase`, 2.67.1), qui fonctionne.
- ⛔ Je n'ai lancé **ni** `db push`, **ni** `db reset`, **ni** `functions deploy`,
  **ni** `secrets`, **ni** `link`.
- La migration n'a donc **jamais été exécutée**. Son bloc de contrôle est écrit
  pour se prouver lui-même au premier passage ; **c'est le vérificateur qui
  devra le voir passer**. Relue trois fois, dont une passe dédiée aux pièges
  SQL (la sous-requête interdite en `check` a été trouvée et corrigée ainsi,
  ainsi que la sélection de fixture — §6.2).

### 6.2 Deux corrections nées de la relecture, à connaître

- **`check` + sous-requête** : PostgreSQL le refuse à la création. Replié dans
  `keel_away_kinds_ok`, `immutable`.
- **La fixture du bloc de contrôle** : `keel_household_member_birth_date` fait
  gagner `profiles.birth_date` sur la fiche (D18). Poser 1990 sur la ligne
  membre ne suffit donc pas — le bloc choisit maintenant un compte **sans foyer
  ET dont le profil n'est pas mineur** (1404 candidats en local). Les blocs de
  D14 et G1 prennent « le premier compte » puis sautent le contrôle s'il est
  déjà dans un foyer : sur une base peuplée, **ils sautent toujours**.

### 6.3 vitest complet : 14 rouges, aucun de moi

Tous dans la lane **L1** (les six objectifs → trois) ou préexistants :

- `bodyMeasures`, `coachDoctrine`, `coachProtocol`, `dailyPractices`,
  `household` (directions d'un mineur), `servingDirections`, `planRefusals` — L1 ;
- `src/edge/coverage-guard.int.test.ts` — **préexistant** : deux fonctions edge
  (`household-merge-notices-v1`, `keel-daily-recommendation-v1`) et un trigger
  (`household_member_bodies_touch`) non déclarés dans les listes connues.
  **Ma migration n'ajoute aucun trigger** et aucune fonction edge.

`tsc -b` était rouge sur `bodyMeasures.ts` / `coachProtocol.ts` (L1) pendant la
majeure partie du lot ; il est repassé **vert** quand L1 a avancé, et le commit
est passé à ce moment-là.

### 6.4 ⚠️ OÙ EST MON TRAVAIL DANS L'HISTORIQUE — commit `d9ac75cb`

> **Les dix fichiers de ce lot ont été commités par `d9ac75cb`, sous le message
> de L2 (« le plan proposait des cuissons sans savoir si ce foyer a un four »).**
> C'est là qu'il faut les chercher, pas sous un message parlant de déjeuner
> dehors. Les chemins :
>
> ```
> supabase/functions/_shared/keel/household_presence.ts
> supabase/functions/_shared/keel/household_presence_test.ts
> supabase/migrations/20260818120000_lunch_out_is_not_absence.sql
> frontend/src/keel/lib/presenceMarks.ts
> frontend/src/keel/lib/presenceMarks.int.test.ts
> frontend/src/keel/lib/planGridModel.ts
> frontend/src/keel/lib/planGridModel.int.test.ts
> frontend/src/keel/components/MealPickerGrid.tsx
> frontend/src/keel/components/mealPickerGrid.int.test.ts
> frontend/src/keel/api/workLunch.ts
> ```
>
> `git show d9ac75cb -- <chemin>` les relit. **Aucune réparation d'historique
> n'a été tentée** (ni `reset`, ni `revert`, ni `rebase`, ni `amend`) : elle
> appartient à l'humain.

**Ce qui s'est passé.** J'ai fait `git add` de mes dix chemins, puis
`git commit -- <chemins>`. Entre les deux, **L2 a commité l'index entier** — qui
contenait mes fichiers déjà stagés. Mon commit a échoué sur
`fatal: cannot lock ref 'HEAD'`, et les dix fichiers sont partis dans :

```
d9ac75cb  « le plan proposait des cuissons sans savoir si ce foyer a un four »
```

**Rien n'est perdu ni abîmé** : `git status` sur mes dix chemins est vide, le
contenu commité est identique au disque, et la suite est verte dessus. Ce qui
est perdu, c'est **l'attribution** : le message de ce commit est celui de L2, et
mon message de lot (43 lignes, rédigé) n'est nulle part. Je n'ai **pas** réécrit
l'historique — un `reset` ou un `rebase` sur un dépôt travaillé par cinq lanes
coûterait infiniment plus que l'attribution.

> ### La leçon, et elle vaut pour les lots suivants
> **`git add` est le danger, pas `git commit`.** Stager, c'est poser son travail
> dans un espace PARTAGÉ où le prochain `git commit` de n'importe qui l'emporte.
> `git commit -- <chemins>` prend le disque et n'a **pas besoin** de `git add` :
> il faut donc ne jamais stager, et commiter par chemins directement. La règle
> anti-collision §2.4 dit « commits par chemins explicites » — il faut lire
> **« et sans `git add` »**.

---

## 7. Les coutures laissées ouvertes, nommées

Chacune est **hors de mon périmètre exclusif** ; je me suis arrêté et je les
signale, comme la règle §2.2 l'impose.

### 7.1 Pour **L6** (étape `table`, `SetupPage`, `onboarding.ts`)

Le trois-états et la question hebdo sont **construits et testés, pas branchés** :

1. **Le formulaire dépliant** de §2.2 (`api/workLunch.ts` → `setMemberWorkLunch`),
   **majeurs uniquement** — la base refuse `not_adult`, mais l'écran ne doit pas
   poser la question pour se la faire refuser. Filtrer sur `ageState === "adult"`
   du roster.
2. **La grille à trois états** s'allume en passant `onSaveMarks` à
   `MealPickerGrid` (au lieu de `onSave`), et en lui donnant `away` lu par
   `parseAwayMarks(r.away_days, "household")` **au lieu de** `awayFrom(...)` —
   sinon `parseAwayDays` strip le jeton et la grille relit « absent ».
   ⚠️ `frontend/src/keel/api/household.ts` (`awayFrom`, `HouseholdMemberView`)
   n'est **pas** à moi : c'est là qu'il faut brancher, et je n'y ai pas touché.
3. Le refus doit être rendu **près du geste** — cicatrice mesurée trois fois
   dans `SetupPage`.

### 7.2 Pour **L7** (prompt)

- Les contraintes `lunchbox` / `microwave` (§1.3) : **transportable**, et **bon
  froid** quand `microwave` vaut `false`.
- Lecture serveur : `keel_household_work_lunch_for(p_user)`, puis
  `parseWorkLunch`.
- ⚠️ Le générateur (`generate-household-meal-v1/index.ts`) ne lit **pas encore**
  cette fonction — il faut l'ajouter à côté de `keel_household_habits_for`.
  Ce fichier n'appartient à aucun lot du tableau : à réclamer explicitement.

### 7.3 Pour **L8** (le conseil chiffré)

- La source : `resolveWindowPresence(...).eatingOut` (§1.2).
- ⚠️ **Le rendu du cinquième silence n'existe pas encore.**
  `components/plan/PlanGrid.tsx:152` et `components/plan/PlanDayBlock.tsx:237`
  testent `cell.kind === "away" | "fixed_intake" | "leftovers" | "empty"` par
  conditionnels **non exhaustifs** : une case `eating_out` s'y rendrait
  **vide**, sans erreur de compilation. La clé `meals.grid.eating_out` est déjà
  posée dans les deux langues ; il manque deux lignes de JSX par fichier.
  **Aucune régression aujourd'hui** : `StudentWeekPlanPage.tsx:2386` passe
  `parseAwayDays(pc.away_days)`, qui strip le jeton — aucune case `eating_out`
  ne peut donc atteindre ces écrans avant que quelqu'un branche
  `parseAwayMarks`. Les deux gestes vont ensemble.
- Le chiffre reste une **consigne**, jamais un solde ni un reste
  (« il te reste 680 kcal » est la phrase d'un tracker, spec §2.2 ⓑ).

### 7.4 Le point fin de l'union, à connaître avant de s'en étonner

Le pré-remplissage écrit sur `household_members.away_days`, donc avec
`source: "household"`. **Une bouche AVEC un compte ne peut pas l'effacer depuis
sa propre déclaration** (`practical_constraints.away_days`) : l'union des deux
sources la lui rendrait. Ce n'est pas neuf — c'est la propriété de l'arbitrage B
de D14, vraie pour toute marque du maître depuis le 2026-08-12 — et ce lot ne la
change pas. La correction passe par la **même** porte que la marque
(`setMemberAway` sur la ligne membre), qui est celle que la grille du foyer
utilise déjà.

### 7.5 Un choix pris seul, à contredire si l'utilisateur le veut

**La question hebdo ne demande pas QUELS jours.** « La semaine » vaut
lundi→vendredi (`WORK_WEEK_DAYS`), comme §2.3 le rend (« lundi→vendredi »).
Demander les jours ajouterait un écran pour un cas que la grille corrige en un
clic — et c'est la grille qui décide. Si ça doit changer, c'est une constante et
une ligne de SQL, pas une refonte.

---

## 8. Ce que je n'ai PAS touché (périmètre tenu)

`meal_generation.ts` · le prompt · `meal_envelope.ts` · `household_portions.ts` ·
`tokens.ts` · `energy_target.ts` · `api/household.ts` · `PlanGrid.tsx` ·
`PlanDayBlock.tsx` · `PlanResult.tsx` · `MealBuilder.tsx` · `SetupPage.tsx` ·
`StudentWeekPlanPage.tsx` · `ui/Modal.tsx` · `household_merge_notice_test.ts`.

Migration réservée respectée : **`20260818120000`**, une seule, et aucune autre
inventée.
