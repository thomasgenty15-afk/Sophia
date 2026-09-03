# RAPIDE · A4 — les idées de repas (P4) — journal

**Date** 2026-09-03, démarré 14:20 · **Lane** RAPIDE · **Worktree** `/Users/ahmedamara/Dev/Sophia-2-chantiers/RAPIDE` ·
**Branche** `chantier-0903/RAPIDE`, base `bfecdc28`, après A3 (`c0731332`) · **Mandat** MASTER PROMPT 2026-09-03-1308 §5.2 · ANALYSE 2026-09-03-1237 §4 ·
**Décision appliquée sans question** D4.1 (`/app/meals` est la cible ; l'envie de la semaine, FF-050, n'est pas touchée).

> Journal écrit au fil de l'eau (règle §2.3 n°25). Ce qui n'a pas été vu au navigateur est **ROUGE** et le reste.

---

## 1. Ce qui a été fait — par morceau

Le retrait est **le lecteur élève**, et rien d'autre : la bibliothèque de recettes du coach (`meal_ideas`, `/coach/meals`, `CoachMealsPage`, `coach-recipe-image-v1`, `loadCoachRecipes`, `createRecipe`…) reste intacte. Aucun fichier de `supabase/migrations`, aucune table, aucune policy touchée.

| Fichier | Avant | Après |
|---|---|---|
| `frontend/src/keel/pages/mealPlan/StudentMealPlanPage.tsx` (124 l.) | l'écran « Idées de repas » : `loadStudentRecipes` → liste en lecture seule, `KeelAppShell` | **supprimé** (`git rm`) — le dossier `mealPlan/` disparaît avec lui |
| `frontend/src/keel/pages/mealPlan/copy.ts` (123 l.) | `MEAL_COPY` + `c()` : un « hand-off i18n » de W8, **sans aucun importeur** (mort depuis le lot 4) | **supprimé** |
| `frontend/src/App.tsx` | `import StudentMealPlanPage` (l. 57) + `<Route path="/app/meals">` sous `KeelStudentRoute` › `KeelOnboardingGate` (l. 481-491) | import retiré ; la route remplacée par une note qui dit le retrait, la date, la décision, et « ne pas rebrancher par symétrie ». L'ancienne URL tombe sur le catch-all `path="*"` → `NotFoundPage` |
| `frontend/src/keel/components/KeelAppShell.tsx` | 5 entrées `bottom: true` dans `NAV.student` (today, chat, plan, **meals**, progress) ; en-tête « The entry below is the missing edge » | **4 onglets** ; l'en-tête garde la règle (« une route sans lien… ») et dit que l'entrée qui l'a enseignée a été retirée le 2026-09-03 |
| `frontend/src/keel/api/mealPlanModel.ts` | `loadStudentRecipes()` (l. 81-99) ; en-tête « tous ses élèves la lisent » | fonction retirée ; l'en-tête dit qu'**aucun écran élève ne lit plus** la bibliothèque, que le module ne sert plus que `/coach/meals`, et que la policy `meal_ideas_student_read` reste en base **sans lecteur front** (décision de base, pas un nettoyage) |
| `frontend/src/keel/components/MealBuilder.tsx` | commentaire « `/app/meals` porte autre chose : les IDÉES… » (l. 88-89) | réécrit au passé, daté. **Et** deux imports inutilisés retirés (`DAY_TOKENS`, `dishDayLabel`) — voir §1.1 |
| `frontend/src/keel/pages/StudentWeekPlanPage.tsx` | commentaire « Les IDÉES que le coach dépose vivent sur `/app/meals` » (l. 2451) | « ne sont plus montrées à l'élève (…retiré le 2026-09-03, P4) ; elles restent sur `/coach/meals` » |
| `supabase/functions/meal-document-v1/index.ts` | commentaire menteur (l. 236) : « `/app/meals` sait le télécharger derrière une URL signée » — cet écran n'a **jamais** lu `student_meal_documents` | **un commentaire, rien d'autre** : le vrai lecteur est `ShoppingListPanel` (sur `/app/plan`, via `api/mealDocument.ts`) ; la phrase nomme l'ancienne erreur et sa date. `deno check` passe |
| `docs/fonctionnalites/conversation/FF-010-la-lecture-du-foyer.md` §7 | « l'agent le dit et porte vers `/app/meals` » | porte vers **`/app/plan`**, là où l'on compose ; la cellule dit que R6 n'a jamais été implémentée avec l'ancienne cible |
| `docs/keel/MODEL.md` | l. 28 « Ses recettes \| bibliothèque recettes » ; l. 149-153 « `/app/meals` est déjà sorti de ce piège… C'est la bonne forme » | l. 28 : « sur `/coach/meals` ; aucun écran élève ne les lit depuis le 2026-09-03 » ; le paragraphe garde l'histoire du 2026-08-05 et dit que l'écran a été **retiré** (P4, D4.1) : bonne forme sans usage, côté coach gardé, l'élève va sur `/app/plan` |

### 1.1 Réparation en passant, nommée — `MealBuilder.tsx`

eslint rougit sur `MealBuilder.tsx` : `'DAY_TOKENS' is defined but never used` (l. 16) et `'dishDayLabel' is defined but never used` (l. 40). **Antérieur à ce lot**, prouvé par `git show HEAD:… | eslint --stdin` : les **mêmes deux erreurs** sur la copie `HEAD`. Le gate ne les voyait pas (il ne linte que les fichiers modifiés) ; ce lot modifie le fichier (un commentaire), donc il les verrait. Même précédent que A3 sur `MouthFormDialog` : réparé **a minima** (les deux noms retirés de leurs listes d'import, aucune autre ligne), nommé ici. Risque de fusion avec CUISINE (A1 touche `MealBuilder.tsx:56` et plus bas) : hunks non adjacents.

### 1.2 Ce qui n'a PAS été touché, et pourquoi

- **Le namespace `meals`** (~120 clés du moteur de repas, monté par `/app/plan`, `/app/household`, `/app/setup`) : interdit par le mandat, et vérifié vivant (`meals.slot.*`, `meals.aisle.*`, `meals.tick.*`, `meals.today.*`…). Le test neuf l'affirme (`meals.slot.breakfast` présent dans les deux packs).
- **Le côté coach** : `CoachMealsPage.tsx` (son commentaire l. 31 cite encore « élève `/app/meals` » — laissé, interdit), `/coach/meals`, `coach-recipe-image-v1`, `meal_ideas`.
- `App.tsx:51-56` : la note « RÉPARATION TRANSITOIRE, NON COMMITTÉE — `MealPlanPage` et trois composants `mealPlan/` ont été SUPPRIMÉS… » parle de la route **coach** `/coach/clients/:studentId/meals` (neutralisée par un autre chantier). Elle se retrouve maintenant juste au-dessus de l'import de `KeelStudentRoute` ; elle est périmée mais côté coach — laissée, nommée.

---

## 2. Les « 8 clés » du mandat : SEPT retirées, UNE gardée — et pourquoi

La liste du mandat (`meals.title|subtitle|list.*|loading|error`, `app.nav.meals(.short)`) venait d'un **motif de noms**, pas d'un audit d'appelants. Retirée, **`meals.loading` fait rougir `tsc`** sur deux appelants vivants : `MealBuilder.tsx:951` et `StudentWeekPlanPage.tsx:2042` (`/app/plan`, « Loading… » pendant que les plans se chargent). Vérification faite ensuite **clé par clé** (`grep` des appelants hors `i18n/` et hors tests) :

| Clé | Appelants hors de l'écran retiré | Sort |
|---|---|---|
| `app.nav.meals` | aucun | retirée (en + fr) |
| `app.nav.meals.short` | aucun | retirée |
| `meals.title` | aucun | retirée |
| `meals.subtitle` | aucun | retirée |
| `meals.list.title` | aucun | retirée |
| `meals.list.empty` | aucun | retirée |
| `meals.error` | aucun | retirée |
| **`meals.loading`** | **2** (`MealBuilder.tsx:951`, `StudentWeekPlanPage.tsx:2042`) | **gardée**, redéposée à côté du moteur (`meals.shopping.*` / `meals.aisle.*`) avec une note qui dit pourquoi |

**Retirée aussi** : l'entrée `"/app/meals": ["meals", "app", "shell", "chat"]` de `PAGE_NAMESPACES` (`catalog.ts`), avec son commentaire. Les deux inventaires en tête de `catalog.ts` (« les sept écrans de l'app élève », « cinq écrans montent `meals` ») sont corrigés — ils étaient au présent. **Aucune clé ajoutée.** Les retraits sont listés en sous-section `A4` du bloc `// ── chantier-0903/RAPIDE — début/fin ──` des deux packs (règle adaptée par l'orchestrateur : retraits **en place**, commit i18n séparé).

Commentaires historiques qui citent encore `/app/meals` et que je laisse (ils décrivent le lot 4, au passé) : `fr.ts:14`, `fr.ts:4333`, `pageSeams.int.test.ts:56`. Un commentaire qui, lui, ment au présent mais vit dans le namespace interdit : `en.ts` au-dessus de `meals.slot.any_meal` (« la bibliothèque de `/app/meals` laisse le moment ouvert ») — nommé, non touché.

---

## 3. Le test neuf, et ses mutations

`frontend/src/keel/components/mealIdeasRemoved.int.test.ts` (patron `routeGuards.int.test.ts` : lecture de source, commentaires blanchis comme dans `pageSeams` — la note qui explique le retrait cite l'ancienne URL et ne doit pas compter comme une route). Six cas, chacun avec **un cas qui passe** :

1. `path="/app/meals"` et `StudentMealPlanPage` absents d'`App.tsx` — et `path="/app/plan"`, `path="*"` présents.
2. La page et `copy.ts` n'existent plus sur le disque.
3. `NAV.student` : aucun `"/app/meals"`, et les onglets `bottom: true` sont **exactement** `[/app/today, /app/chat, /app/plan, /app/progress]`, dans cet ordre.
4. `loadStudentRecipes` absent de `mealPlanModel.ts` — `loadCoachRecipes` présent.
5. `PAGE_NAMESPACES` sans `/app/meals` — avec `/app/plan`.
6. Les sept clés absentes des **deux** packs ; `meals.loading`, `meals.slot.breakfast`, `app.nav.plan.short` présents dans les deux.

Typecheck du test : `tsc -p tsconfig.test.json` → **0 erreur** dans ce fichier (93 dans l'arbre de tests, le même compte que A3 a mesuré à `bfecdc28` — ce lot n'en ajoute aucune).

| # | Mutation | Test(s) joué(s) | Rouge vu | Restauration |
|---|---|---|---|---|
| M1 (mandat) | `App.tsx` : réintroduire `<Route path="/app/meals" …>` | `mealIdeasRemoved` + `pageSeams` | **1 rouge / 8** (« la route /app/meals a quitté le routeur ») | `cp` → 8/8 |
| M2 (mandat) | `KeelAppShell.tsx` : réintroduire `{ to: "/app/meals", …, bottom: true }` dans `NAV.student` | idem | **1 rouge / 8** (« la barre du bas … quatre onglets ») | `cp` → 8/8 |
| M3 (à moi) | `catalog.ts` : réintroduire `"/app/meals": [...]` dans `PAGE_NAMESPACES` | idem | **2 rouges / 8** — le mien **et** `pageSeams` « chaque chemin déclaré correspond à une <Route> » : deux gardes indépendantes sur le même retrait | `cp` → 8/8 |

Après restauration : `cmp` des trois fichiers contre les copies prises avant les mutations → **identiques octet pour octet** ; `git diff --stat` inchangé. Les copies vivent dans `scratchpad/mut-a4/` du dossier de session, hors dépôt.

---

## 4. Ce qui est prouvé / ce qui est ROUGE

### Prouvé (worktree, port 5203)

- `cd frontend && npx tsc -b --force` → **exit 0** (après le retour de `meals.loading` ; avant, 2 erreurs — c'est ce qui a révélé §2).
- eslint sur les 9 fichiers front touchés → **0 erreur** (après §1.1).
- `deno check supabase/functions/meal-document-v1/index.ts` → **exit 0**.
- vitest ciblé : `mealIdeasRemoved` (6), `pageSeams` (2), `parity` (6), `pageFrontier` (13), `routeGuards` (3) → **30/30**.
- vitest, suite **entière** : **2072 tests, 2047 verts, 20 sautés, 5 rouges** — les 5 sont étrangers (§5), nommés un par un ; +6 tests par rapport à A3 (2066), ce sont les miens.
- Les 3 mutations (§3) rougissent et se restaurent.
- **Navigateur, sans session, `http://localhost:5203/app/meals`** (le worktree, servi par `frontend-rapide`) :
  - **320 px** : `location.pathname = /app/meals`, titre « Page not found | Sophia », `h1` « This page does not exist. », le texte porte « 404 », `document.documentElement.scrollWidth = 320 = innerWidth` (aucun débordement), capture à scroll 0.
  - **1280 px** : idem, `scrollWidth = 1280`, `meta robots = noindex,nofollow` (la 404 du produit, `NotFoundPage`, pas un écran blanc ni une redirection).
  - **Contraste** : `http://localhost:5203/app/plan` pour le même visiteur → redirigé vers `/auth` (« Vous revoilà. »). Une route qui existe envoie à la porte ; `/app/meals` n'existe plus et tombe sur la 404 **avant** toute garde.
  - Console : `[vite] Failed to reload /src/keel/pages/mealPlan/StudentMealPlanPage.tsx` — un reliquat HMR du serveur **réutilisé** (module chargé avant le `git rm`) ; un chargement frais de `/app/meals` ne demande **aucune** ressource sous `pages/mealPlan/` (vérifié sur les requêtes réseau : seul `api/mealPlanModel.ts` est chargé — importé par `CoachMealsPage`, normal).

### ROUGE — geste humain requis : connexion à une fixture

- **La barre du bas à 4 onglets, à 320 px, sans débordement.** Elle n'est rendue que derrière une session (`KeelAppShell` sur une route gardée). Aucun onglet connecté n'existe ; cet agent n'entre aucun mot de passe et ne forge aucun jeton. Ce qui est prouvé à la place : la source (`NAV.student` = 4 `bottom: true`, test §3 n°3, mutation M2). **Le geste qui le rend vert** : se connecter avec `qa1v.foyer@keeltest.dev` / `1234567` (persona maître existant, lecture seule — ne rien enregistrer), ouvrir `/app/today` sur le port 5203 (ou 5174 après fusion), largeur **320 px** : la barre montre **Aujourd'hui · Conversation · Plan · Progression** (4 onglets, plus d'« Idées de repas »/« Repas »), `document.scrollWidth === 320` ; répéter en anglais (`?lang`/profil `en` : Today · Chat · Plan · Progress) et à 1280 px.
- **`/app/meals` pour un compte connecté** : même 404 attendue (la route n'existe pour personne — le catch-all est hors de toute garde), non vue avec une session.

### Invariant C7 (entonnoir) — non touché

`SetupPage.tsx`, `canGenerate`, `onboarding.ts`, `setupMisses.ts` : **aucune ligne modifiée**. Ce lot ne touche ni l'entonnoir ni `/app/household`.

---

## 5. Rouges étrangers — nommés, prouvés antérieurs, non touchés

| Rouge | Preuve d'antériorité | Sort |
|---|---|---|
| `src/edge/coverage-guard.int.test.ts` ×2 (Edge Functions / triggers non inscrits) | `scripts/.vitest-red-baseline` (nominatif, 2026-08-22) | non touché |
| `src/keel/api/household.int.test.ts › awayFrom …` ×2 | `scripts/.vitest-red-baseline` | non touché |
| `src/keel/components/mealBoxes.int.test.ts › … un contenant sans bouche, sans item ou sans id ne sort pas` | rejoué par A3 sur un worktree détaché à `bfecdc28` : rouge **avant** la lane, hors baseline | non touché (E seul) |
| `scripts/agent-gate.sh › check_tests` : `deno test --no-run _shared/keel/` — 18 erreurs TS dans dix fichiers de test étrangers (`daily_pulse_test`, `draft_note_classify_test`, `daily_pulse_locale_test`, `pot_demand_test`, …) | état de `bfecdc28` ; ce lot ne touche sous `supabase/` qu'**un commentaire** de `meal-document-v1/index.ts` | le gate s'arrête là pour toutes les lanes ⇒ commits `--no-verify`, motif dans chaque message ; les contrôles front rejoués à la main (§4) |
| `tsc -p tsconfig.test.json` : 93 erreurs dans l'arbre de tests | 93 mesurées par A3 à `bfecdc28` ; **0 dans `mealIdeasRemoved`** | non touché |

---

## 6. Hors périmètre croisé, nommé, non touché

- `meal-document-v1/index.ts:80,85` — les **phrases utilisateur** « Tu peux l'ouvrir depuis ton écran repas. » / « You can open it from your meals screen. » désignent un écran qui n'a jamais été `/app/meals` (le document se télécharge depuis `ShoppingListPanel` sur `/app/plan`). Le mandat n'autorise qu'un commentaire dans ce fichier : nommé, non touché.
- La policy `meal_ideas_student_read` (`20260728120000`, `20260804210000`) reste en base **sans lecteur front** : une décision de base, pas un nettoyage — nommée dans l'en-tête de `mealPlanModel.ts`.
- `CoachMealsPage.tsx:31` (commentaire « élève `/app/meals` ») : côté coach, interdit.
- `pageSeams.int.test.ts:56`, `fr.ts:14`, `fr.ts:4333`, `en.ts` (note de `meals.slot.any_meal`) : voir §2.
- `docs/keel/EXECUTION_LOG.md`, `docs/keel/NUIT-FOYER.md`, `docs/nutrition-pivot/*` : journaux et plans datés qui citent `/app/meals` — l'histoire ne se réécrit pas.
- `HouseholdMergeCard.tsx:45`, la lane 1:1, le gel 402, la bascule de langue, le vérificateur de traditions, le foyer orphelin : non croisés.
- `MODEL.md` est sale dans l'arbre principal (autre session) : édité dans **ce** worktree seulement ; sa ligne `/app/meals` y est la 163 (149 ici) — l'orchestrateur gère la fusion.

---

## 7. Les commits (branche `chantier-0903/RAPIDE`, après `c0731332`) — dans l'ordre RÉEL

| Ordre | Commit | sha | Contenu |
|---|---|---|---|
| 1 | lot A4 | `abbd9d8d` | 2 suppressions, 5 sources front, 1 test neuf, 1 commentaire serveur, 2 docs, ce journal (v1) — `--no-verify`, motif dans le message |
| 2 | i18n | `86dac467` | `en.ts` + `fr.ts` + `catalog.ts` seulement — `--no-verify` |
| 3 | journal (v2) | _(le commit qui suit)_ | ce fichier, complété des sha |

Ordre choisi exprès : **lot d'abord**, **i18n ensuite** (l'inverse aurait rendu `tsc` rouge sur `t("meals.title")`). **Mesuré** sur un worktree détaché à `abbd9d8d` (le lot seul, node_modules liés, retiré ensuite) : `tsc -b --force` **exit 0** ; `mealIdeasRemoved` + `pageSeams` → **3 rouges / 8** (les deux cas du test neuf qui lisent le catalogue et les packs, et « chaque chemin déclaré correspond à une <Route> » de `pageSeams`) — exactement les rouges qu'un catalogue et des packs pas encore commités produisent. L'arbre de travail vérifié en §4 porte les **deux** commits ; c'est la tête de branche qui est verte, pas le lot pris seul.

Chemins passés **un par un** à `git add` (la bourde zsh de A3 : `$VAR` ne se découpe pas). Aucun `git add -A`, aucun `stash`/`checkout`/`reset`/`restore` ; les restaurations de mutation sont des `cp`.
