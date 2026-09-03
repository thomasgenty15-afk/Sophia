# Vérification RAPIDE · A3 (4e option d'objectif) + A4 (idées de repas) — après fusion

**Date** 2026-09-03, 15:30 → 16:10 · **Vérificateur** worktree `/Users/ahmedamara/Dev/Sophia-2-chantiers/VERIF`,
détaché à **`f3eea513`** (fusion de RAPIDE) · **Base du diff** `3f2af62a` · **Antériorité** `bfecdc28` ·
**Port** 5209 (`frontend-verif`) · **Tag** `qa0903r` (aucune fixture créée — voir §5) ·
**Mandats** MASTER PROMPT 2026-09-03-1308 §5.1, §5.2, §5.13 · ANALYSE §3, §4 ·
**Rapports rejoués** `2026-09-03-1345-RAPIDE-A3-…` et `2026-09-03-1445-RAPIDE-A4-…`.

> Rien n'est cru : tout est rejoué. Ce qui n'a pas été vu est ROUGE. Aucun commit, aucune écriture
> persistante en base, aucun mot de passe, aucun jeton. Les mutations sont défaites par `cp` et prouvées
> par `cmp` ; `git status --short` du worktree est vide à la fin.

---

## 1. Statique — PROUVÉ

| Contrôle | Mesure | Verdict |
|---|---|---|
| `git diff 3f2af62a..f3eea513 --stat` | 35 fichiers, +1972/−629 ; 10 commits (`7739857a` … `31ee930f`, fusion `f3eea513`) | voir §1.1 |
| `cd frontend && npx tsc -b --force` | **exit 0** (9,9 s) | ✅ |
| `npx vitest run` (entière) | **2072 tests · 2047 verts · 20 sautés · 5 rouges**, 128 fichiers | ✅ (5 étrangers, §1.2) |
| vitest ciblé (12 fichiers du lot + `pageSeams`, `parity`, `pageFrontier`, `routeGuards`) | **284 tests · 282 verts · 2 rouges** (= `awayFrom` ×2, baseline) — `parity` 6/6, `pageSeams` 2/2, `pageFrontier` 13/13, `goalTiles` 12/12, `mealIdeasRemoved` 6/6, `mouthProfile` 51/51, `mouthFormDialog` 104/104, `setupMouthsStep` 23/23, `planRefusals` 23/23, `meCardSheet` 13/13 | ✅ |
| `deno check supabase/functions/meal-document-v1/index.ts` | **exit 0** ; le diff de ce fichier ne contient **aucune ligne de code** (commentaire seul) | ✅ |
| `eslint` sur les 16 fichiers front du lot | **exit 0** | ✅ |
| `git diff 3f2af62a..f3eea513 -- supabase/migrations` | **0 ligne** — aucun `CHECK` touché | ✅ |
| Versions de prompt | `MEAL_PROMPT_VERSION = "meal.en.v24_raw_keeping_reaches_the_model"`, `HOUSEHOLD_PROMPT_VERSION = "v22_precedence_in_tail"` ; **aucune** ligne `PROMPT_VERSION` dans le diff de `_shared/keel` | ✅ |
| `GOAL_TOKENS` (`tokens.ts:630`) | trois jetons `fat_loss`, `maintenance`, `muscle_gain` ; `MEMBER_GOALS = GOAL_TOKENS` (`household.ts:240`) — **aucun 4e jeton** | ✅ |
| Namespace i18n `meals` | 233 → **228 clés** dans les deux packs ; les 5 retirées sont **exactement** `meals.error`, `meals.list.empty`, `meals.list.title`, `meals.subtitle`, `meals.title` (diff des listes triées, en et fr identiques) ; + `app.nav.meals`, `app.nav.meals.short` = les 7 annoncées | ✅ |
| `meals.loading` | présente (en + fr) ; deux appelants vivants : `MealBuilder.tsx:950`, `StudentWeekPlanPage.tsx:2042` | ✅ |
| Clés retirées : appelants résiduels hors i18n/tests | **0** pour les 7 clés et pour `goal_none` | ✅ |
| Blocs délimités | `// ── chantier-0903/RAPIDE — début/fin ──` en fin de `en.ts` (7984-8014) et `fr.ts` (6844-6874) ; 5 clés ajoutées (`household.goal.minor_maintenance`, `.minor_only`, `.minor_switched{from}`, `household.error.goal_not_for_minor`, `.target_not_for_minor`) ; les 11 retraits (4 A3 + 7 A4) listés dans le bloc, faits en place ; `catalog.ts` : seule l'entrée `"/app/meals"` de `PAGE_NAMESPACES` retirée + deux inventaires de commentaires corrigés, **aucun namespace neuf** | ✅ |
| Côté coach | `CoachMealsPage.tsx`, `/coach/meals` (`App.tsx:410`), `supabase/functions/coach-recipe-image-v1/` : **absents du diff**, présents dans l'arbre ; `loadCoachRecipes` présent, `loadStudentRecipes` parti | ✅ |
| `/app/meals` dans `frontend/src` | uniquement dans des commentaires (`App.tsx:480`, `StudentWeekPlanPage.tsx:2452`) et le test ; `pages/mealPlan/` n'existe plus sur le disque | ✅ |
| Barre du bas (`KeelAppShell.tsx` `NAV.student`, `bottom: true`) | exactement `/app/today`, `/app/chat`, `/app/plan`, `/app/progress`, dans cet ordre | ✅ |
| Sites `GoalTiles` | 5 montages JSX : `MouthFormDialog.tsx:976`, `HouseholdPage.tsx:1026` (`MouthFields`, monté par `MeCard` et `MemberRow` = les sites 983/993), `SetupPage.tsx:4451, 5017, 5712` ; **plus aucun `<select>` de direction** dans les trois fichiers | ✅ |

### 1.1 Périmètre du diff — les 35 fichiers, un par un

Dans le mandat (§5.1/§5.2, i18n autorisée, journaux, docs nommées) : `App.tsx`, `KeelAppShell.tsx`, `SetupPage.tsx`,
`HouseholdPage.tsx`, `MouthFormDialog.tsx` (le patron cité, et le formulaire qui « bascule et le dit »),
`GoalTiles.tsx` (neuf, le composant partagé), `api/household.ts` (`goalsForAge`), `api/mouthProfile.ts` (`persistMouth`),
`lib/mouthForm.ts` (le pli lu par `persistMouth`), `copy/planRefusals.ts`, `api/mealPlanModel.ts`,
`pages/mealPlan/StudentMealPlanPage.tsx` + `copy.ts` (supprimés), `i18n/{en,fr,catalog}.ts`, 8 fichiers de test
(dont 2 neufs), `meal-document-v1/index.ts` (commentaire), `FF-010`, `FF-045`, `le-foyer/README.md`, `PIVOT-FOYER.md`,
`MODEL.md`, les 2 journaux.

**Trois fichiers hors de la liste nominative du mandat, nommés par les bâtisseurs, contenu vérifié ligne à ligne :**

| Fichier | Ce que le diff contient | Lecture |
|---|---|---|
| `components/MealBuilder.tsx` (+8/−8) | un commentaire réécrit (`/app/meals` au passé) **et deux imports morts retirés** (`DAY_TOKENS`, `dishDayLabel`) — seules lignes de code | lint antérieur (prouvé par le bâtisseur sur la copie `HEAD`) ; zéro logique |
| `pages/StudentWeekPlanPage.tsx` (+2/−1) | **un commentaire** (`/app/meals` → « retiré le 2026-09-03 ») | zéro code |
| `docs/le-foyer/FF-044-la-bouche-sans-compte.md` (+4/−2) | « six jetons » → trois, `maintenance` seule sur un mineur | même correction que FF-045, même domaine |

Ce sont trois corrections de phrases que le lot rend fausses (le mandat A4 demande explicitement ce genre de
correction pour trois autres fichiers). **Aucune ligne de logique.** Je les classe **écarts de périmètre non
bloquants** — l'orchestrateur peut lire la règle « tout fichier hors mandat = défaut » plus strictement ; le contenu
exact est ci-dessus pour trancher.

### 1.2 Les 5 rouges de la suite entière — tous étrangers, antériorité prouvée

| Rouge | Preuve |
|---|---|
| `src/edge/coverage-guard.int.test.ts` ×2 | `scripts/.vitest-red-baseline` (nominatif, 2026-08-22) |
| `src/keel/api/household.int.test.ts › awayFrom …` ×2 | `scripts/.vitest-red-baseline` |
| `src/keel/components/mealBoxes.int.test.ts › un contenant sans bouche, sans item ou sans id ne sort pas` | **rejoué par moi** sur `git worktree add --detach … bfecdc28` (node_modules liés) : **1 failed / 44 passed** — rouge avant la lane, hors baseline ; worktree retiré ensuite (`git worktree list` : 0 `tmp`) |

Aucun autre rouge. Le gate n'a pas été lancé (cassé à la base : 18 erreurs Deno dans dix tests `_shared/keel/`,
non touchés par la lane — `git diff 3f2af62a..f3eea513 -- supabase/` = un commentaire) ; ses contrôles front
sont rejoués ci-dessus à la main.

---

## 2. Mutations — 9 jouées (7 des rapports + 2 à moi), chacune restaurée par `cp`, prouvée par `cmp` — PROUVÉ

Script : `scratchpad/mutations.sh` du dossier de session ; copies dans `scratchpad/mut/`, hors dépôt.
Après les neuf : `git status --short` **vide**.

| # | Mutation (fichier · commande) | Suites jouées | Rouge vu | Attendu (rapport) | Restauration |
|---|---|---|---|---|---|
| M1 (A3) | `GoalTiles.tsx` : une `<label>` avec `<input type="radio" value="">` « Aucune direction particulière » insérée avant `offered.map` | `goalTiles`, `setupMouthsStep`, `mouthFormDialog` | **15 / 139** (7 + 3 + 5) — dont « ⛔ aucune option vide », « rien de coché tant que personne n'a choisi », « ⛔ plus d'option vide : aucun `<select>`, aucune valeur "" » | 15 / 139 | `cmp` identique |
| M2 (A3) | `api/household.ts` `goalsForAge` : `ageState === "minor" \|\| ageState === "unknown"` | `household`, `goalTiles`, `setupMouthsStep`, `mouthFormDialog` | **10 / 167** = 8 du lot (« un adulte ET un âge INCONNU voient les trois », « un âge INCONNU : les trois aussi » ×2, « `goalForAge` plie … et rien d'autre », « trois boutons radio », …) + 2 `awayFrom` (baseline) | 10 / 167 | `cmp` identique |
| M3 (A3) | `api/mouthProfile.ts` `persistMouth` : `const [first, second] = [writeDate, writeGoal];` (ordre fixe) | `mouthProfile` | **2 / 51** (« ⛔ S4 — une direction qui NE bouge PAS s'écrit AVANT la date », « le refus de la porte écrite EN PREMIER arrête la chaîne, dans les deux ordres ») | 2 / 51 | `cmp` identique |
| M4 (A3) | `lib/mouthForm.ts` `mouthToPersist` : `const draft = typed;` (pli retiré) | `mouthProfile` | **1 / 51** (« une direction refusée à cet âge part en `maintenance`, SANS cible ») | 1 / 51 | `cmp` identique |
| M5 (A4) | `App.tsx` : `<Route path="/app/meals" element={<ProductPlan />} />` réintroduite | `mealIdeasRemoved`, `pageSeams` | **1 / 8** (« la route /app/meals a quitté le routeur, avec son import ») | 1 / 8 | `cmp` identique |
| M6 (A4) | `KeelAppShell.tsx` : `{ to: "/app/meals", …, bottom: true }` réintroduit | idem | **1 / 8** (« la barre du bas de l'élève a quatre onglets, et aucun ne mène à /app/meals ») | 1 / 8 | `cmp` identique |
| M7 (A4) | `catalog.ts` : `"/app/meals": ["meals","app","shell","chat"]` réintroduite | idem | **2 / 8** (le cas du test neuf **et** `pageSeams` « chaque chemin déclaré correspond à une <Route> ») | 2 / 8 | `cmp` identique |
| **M8 (moi)** | `api/household.ts` `goalForAge` : `return goal;` (ne plie plus jamais) | les 5 suites A3 | **8 / 218** = 6 du lot (« `goalForAge` plie … », « part en `maintenance`, SANS cible », « pliée sur `maintenance`, cochée, et DITE » ×3 sites, « en français, les mots d'un enfant sont français ») + 2 `awayFrom` | — | `cmp` identique |
| **M9 (moi)** | `api/household.ts` `goalsForAge("minor")` : `\|\| g === "fat_loss"` (le mineur revoit `fat_loss`) | les 5 suites A3 | **13 / 218** = 11 du lot (dont « ce qui est retiré à un mineur est EXACTEMENT ce que la garde SQL refuse » — la migration lue sur le disque mord ; « UNE tuile » ×3 sites) + 2 `awayFrom` | — | `cmp` identique |

Note sur M1 : mon premier jet de la tuile vide ne compilait pas (les trois suites tombaient au chargement, « no
tests ») — ce n'était pas une preuve, je l'ai rejouée avec une insertion propre ; le 15/139 ci-dessus est celui de
la seconde passe. Les deux mutations à moi confirment que la garde tient **par la valeur rendue** (M9 fait tomber
les tuiles sur trois sites, pas seulement la fonction) et que le pli est **une seule ligne** (M8 : 6 rouges dans
5 fichiers pour une ligne).

---

## 3. Cohérence C7 (§2.4) et docs ↔ base — PROUVÉ

- **Trois étapes** : `STEP_ORDER = ["situate", "people", "request"]` (`api/onboarding.ts:1066`), rendues par
  `funnelSteps(branch)` (`SetupPage.tsx:1270`) ; `SelfStep` et `MouthsStep` vivent toutes deux sous `people`.
  `onboarding.ts`, `setupMisses` : **absents du diff**.
- **`canGenerate` seule source du bouton** : `grep -n canGenerate SetupPage.tsx` → import `:71`, doctrine `:211`,
  deux appels (`:1283` le verdict, `:2972` la relecture après écriture) ; **aucune ligne `canGenerate` dans le diff**.
- **L'entonnoir hors des sélecteurs** : les 24 hunks de `SetupPage.tsx` lus ; dans le corps de `SetupPage()` ils
  ne touchent que `saveSelf` (`goalForAge` sur `saveOwnGoal`, cible pliée), `addMouth` (`goalForAge` vers
  `keel_household_add_member`, cible pliée), `saveMouthCard`/`saveMouthBirthDate` (→ `writeMouthBirthDate`,
  neuf, seul écrivain de la date), `saveMouthGoal` (`MemberGoal` sans `""`). Rien sur les questions, les
  branches, les étapes.
- **Barre du bas** = exactement `/app/today`, `/app/chat`, `/app/plan`, `/app/progress` (§1).
- **`GOAL_TOKENS` à trois** (§1) ; `isDirectionalGoal` s'appuie sur `MEMBER_GOALS` + `scaleDirectionOf`.
- **Docs ↔ migration `20260822041500`** (diff des 6 docs lu en entier) : README foyer, FF-044, FF-045 (§5, R10
  neuve, §7 deux lignes de refus), PIVOT-FOYER §8.4 (encadré « re-tranché deux fois ») disent : un mineur →
  `maintenance` seule ; `goal_not_for_minor` sur l'ajout, la direction **et la date** ; `target_not_for_minor`
  sur la cible ; `maintenance` et `null` passent ; `unknown` ≠ `minor` ; lignes existantes non corrigées.
  **La migration dit la même chose** : 3 × `'reason', 'goal_not_for_minor'` (`:260, :355, :424`),
  1 × `'target_not_for_minor'` (`:507`), « `unknown` NE SUIT PAS `minor` » (`:195`), `maintenance` ouvert (`:95, :352`).
  Et **la base locale porte ces fonctions** : `pg_proc` → `add_member`, `set_member_goal`, `set_member_birth_date`
  contiennent `goal_not_for_minor` ; `set_member_target` contient `target_not_for_minor`.
- **Les quatre portes rejouées en SQL, transaction annulée** (session simulée par le patron
  `coach_document_corpus_test.sql` — `set_config('request.jwt.claims', …)` + `set local role authenticated`, sur le
  persona `qa1v.foyer`, **rien de persisté** : 0 ligne `Verif%` après `rollback`) :

  | Geste | Réponse | Attendu |
  |---|---|---|
  | `add_member('Verif1', '2012-05-20', 'fat_loss')` | `goal_not_for_minor` | ✅ |
  | `add_member(…, mineur, 'maintenance')` / `(…, mineur, null)` | `ok` / `ok` | ✅ |
  | `add_member('Verif4', null, 'fat_loss')` (âge inconnu) | `ok` | ✅ (`unknown` ≠ `minor`) |
  | `set_member_goal(mineur, 'fat_loss')` / `('muscle_gain')` | `goal_not_for_minor` ×2 | ✅ |
  | **ordre d'avant** : Verif4 `fat_loss` → `set_member_birth_date(mineur)` | `goal_not_for_minor` (« le détour temporel ») | ✅ — c'est ce que M3 protège |
  | **ordre du lot** : `set_member_goal(maintenance)` puis `set_member_birth_date(mineur)` | `ok`, `ok` | ✅ |
  | `set_member_target(mineur, 45, 0.25)` / `(null, null)` | `target_not_for_minor` / `ok` | ✅ |

  Les phrases de `planRefusals.ts` correspondent à ces deux motifs (`planRefusals.int.test.ts` 23/23, qui lit la
  migration sur le disque).
- FF-010 R6 → `/app/plan` ; `MODEL.md:28` et `:163-171` réécrits au passé, côté coach nommé gardé ;
  `meal-document-v1/index.ts` : le commentaire nomme le vrai lecteur (`ShoppingListPanel` sur `/app/plan`).

---

## 4. Navigateur (port 5209, worktree VERIF) — PROUVÉ sans session

Aucun onglet sur `http://localhost:5209` ne porte de session (`Object.keys(localStorage)` : `[]`, aucun
`sb-*-auth-token`). Tout ce qui se voit sans session a été vu :

| Écran | 320 px | 1280 px |
|---|---|---|
| `/app/meals` | `pathname = /app/meals`, titre « Page not found \| Sophia », `h1` « This page does not exist. », « 404 » dans le corps, `meta robots = noindex,nofollow`, **`scrollWidth 320 === innerWidth 320`**, capture à `scrollY = 0` | idem, **`scrollWidth 1280 === innerWidth 1280`** |
| `/app/meals?lang=fr` (le sélecteur du produit : `?lang=` → `sophia.ui_locale = "fr"` en `localStorage`, `runtime.ts:59`) | même 404, `scrollWidth 320` | — |
| `/app/plan` (contraste) | → **`/auth?redirect=%2Fapp%2Fplan`**, `h1` « Vous revoilà. » (fr) / « Welcome back. » (`?lang=en`), `scrollWidth 320` | → `/auth`, idem |

Donc : une route qui existe envoie à la porte ; `/app/meals` tombe sur la 404 du produit **avant** toute garde, ce
n'est pas une redirection vers `/auth`. **Hors périmètre, nommé** : `NotFoundPage.tsx` est en anglais codé en dur
(`:39-46`, non i18n-isée) — c'est pourquoi le 404 reste anglais sous `?lang=fr` ; le fichier n'est **pas** dans
le diff, antérieur, pas un défaut du lot.

Viewport remis en `desktop` à la fin.

---

## 5. Non prouvé — ROUGE (session requise, geste humain)

Ce vérificateur n'entre aucun mot de passe, ne forge aucun jeton, ne touche pas `auth.sessions`. La fixture
`qa0903r` du journal A3 §8.3 demande une ligne `auth.users` avec un mot de passe : **non créée** (c'est entrer
un mot de passe dans une commande). Ce que le SQL côté données devait établir (« `goalsForAge` côté données ») a
été établi autrement en §3 (quatre portes, deux ordres, transaction annulée). Reste ROUGE, avec le geste exact :

1. **La barre du bas à 4 onglets, 320 px, sans débordement, deux langues.** Se connecter avec
   `qa1v.foyer@keeltest.dev` / `1234567` (lecture seule, **ne rien enregistrer**) sur
   `http://localhost:5209/app/today` (ou 5174), largeur 320 : la barre montre **Aujourd'hui · Conversation ·
   Plan · Progression** (rien d'« Idées de repas »/« Repas »), `document.documentElement.scrollWidth === 320` ;
   puis `?lang=en` : Today · Chat · Plan · Progress ; puis 1280 px. Preuve de substitution : source + test
   `mealIdeasRemoved` cas 3 + mutation M6.
2. **Une bouche mineure à `fat_loss` en base → « Manger normalement » coché + phrase de bascule + Save qui passe.**
   Aucun compte QA à mot de passe connu n'a une telle bouche (les 3 lignes héritées de la base locale appartiennent
   à des maîtres sans mot de passe connu — ne pas les viser). Geste : créer la fixture `qa0903r.master@keeltest.dev`
   par SQL (patron `docs/keel/qa-fixtures/00-base.sql`, `profiles.locale = 'fr-FR'`, `country = 'FR'`), un foyer,
   une bouche sans compte `birth_date = '2012-05-20'` puis `update household_members set goal = 'fat_loss' where
   member_id = …` (la RPC refuse, c'est le cas hérité) ; se connecter ; `/app/household` → la ligne → Modifier :
   **une tuile « Manger normalement » cochée** + la phrase `household.goal.minor_switched` qui nomme « Perte de
   masse grasse » ; Save ; relecture SQL `goal = 'maintenance'`. Preuve de substitution : `goalTiles` 12/12,
   `mouthFormDialog` KID, M8, et l'ordre `set_goal(maintenance)` → `set_birth_date` vu passer en SQL (§3).
3. **`/app/setup` étape 2 et fiche de `/app/household` : trois tuiles, rien de coché sur `goal = null`.** Le foyer
   de `qa1v.foyer` suffit **sans rien enregistrer** : Odalric (owner, `∅`), Casimir (mineur 2010-02-11, `∅`),
   Peregrine (adulte, `muscle_gain`), Wilfrid (mineur 2019-03-04, `∅`). Attendu : Odalric → trois tuiles, aucune
   cochée ; Casimir/Wilfrid → une tuile « Manger normalement », non cochée, + `household.goal.minor_only` ;
   Peregrine → « Prendre du muscle » cochée. 320 et 1280 px, `scrollWidth === innerWidth`, fr puis `?lang=en`.
   Preuve de substitution : `setupMouthsStep` cas 195-226, `goalTiles` « rien de coché tant que personne n'a choisi ».
4. **`/app/meals` avec une session** : même 404 attendue (catch-all hors de toute garde) — non vue connecté.

---

## 6. Défauts du lot

**Aucun.** Chaque test annoncé « retourné » se retourne (assertions lues : `household.int.test.ts:366` affirme
`goalsForAge("minor") = ["maintenance"]` en littéral et `:384` confronte la liste à la migration lue sur le disque ;
`setupMouthsStep:195` exige une tuile et l'absence du mot d'adulte) ; chaque mutation rougit avec le compte du
rapport ; aucun fichier de logique hors mandat ; aucun rouge non étranger ; aucune doc ne contredit la base.

Écarts nommés, non bloquants (à trancher par l'orchestrateur si la règle de périmètre se lit à la lettre) :
`MealBuilder.tsx` (commentaire + 2 imports morts), `StudentWeekPlanPage.tsx` (commentaire), `FF-044` (doc) —
§1.1. Hors périmètre croisé, non touché : `NotFoundPage.tsx` anglais codé en dur ; `meal-document-v1/index.ts:80,85`
(« ton écran repas ») ; `CoachMealsPage.tsx:31` (commentaire côté coach, interdit) ; la policy
`meal_ideas_student_read` sans lecteur front (décision de base, nommée dans `mealPlanModel.ts`).

---

## Ligne finale

**VERT** — tout ce qui est rejouable est vert (statique, 9 mutations, C7, docs ↔ base, SQL des quatre portes,
404 de `/app/meals` à 320/1280 en deux langues) ; les seuls ROUGE sont « session requise » (§5, quatre gestes
humains décrits). Sous réserve de la lecture stricte de « fichier hors mandat » pour trois modifications de
commentaires/doc sans logique (§1.1).
