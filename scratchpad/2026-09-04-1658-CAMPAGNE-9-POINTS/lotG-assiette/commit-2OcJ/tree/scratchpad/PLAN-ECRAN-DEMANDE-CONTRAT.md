# Contrat d'architecture — `/app/plan` devient l'écran de la demande

**Rôle de ce document.** Cinq lots (A, C, D, E, Phase 3) vont travailler **en parallèle** sur
les mêmes écrans. Sans contrat écrit, le dernier qui écrit gagne et le travail des autres est
détruit. Ce document est la seule autorité sur : qui possède quel fichier, quelles clés
bougent, quelles signatures existent, dans quel ordre on démarre.

**Statut des affirmations.** Chaque fait porte son chemin et sa ligne, vérifiés le 2026-08-13
sur la branche `ff-001-quotidien-du-coach`. Ce qui n'a **pas** pu être vérifié est marqué
`⚠️ NON VÉRIFIÉ`. Un contrat qui ment coûte plus cher qu'un contrat incomplet.

**Convention de chemin.** Tous les chemins sont relatifs à la racine du dépôt
`/Users/ahmedamara/Dev/Sophia 2/`.

---

## §0 — Ce que l'utilisateur a demandé, mot pour mot

> « Je pense que toute la partie création de plan doit se faire dans le plan de ma semaine,
> donc faut trouver un moyen de faire en sorte que ça passe. Par exemple "la maison à envie de
> quoi cette semaine" c'est pas bon, "c'est la maison a envie de quoi ?" sur l'écran de build
> du prochain plan. "Quelle façon de manger le plat commun suit" — je comprends pas ce qu'elle
> fait là cette section. La partie "à table" ne devrait pas être dans le foyer non plus, elle
> devrait être dans le plan de ma semaine. »

Traduit en quatre exigences, et ce sont les seules :

| # | Exigence | Conséquence technique |
|---|---|---|
| **R1** | La demande de plan se fait sur `/app/plan`, **pour tout le monde, maître compris** | `MealBuilder.tsx:596-597` doit tomber ; le routage de `SetupPage.tsx:799-801` doit être extrait |
| **R2** | L'envie déménage sur l'écran de build, et se reformule **« C'est la maison a envie de quoi ? »** | `household.envy.*` → `plan.envy.*` |
| **R3** | « Quelle façon de manger le plat commun suit » ne doit pas s'afficher quand elle n'a pas de sujet | garde de vacuité sur `ReferenceMemberCard` (§4bis) |
| **R4** | « À table » déménage de `/app/household` vers `/app/plan` | `TableCard` (`HouseholdPage.tsx:2027`) → composant à part, monté par `/app/plan` |

⚠️ **R2, telle que l'utilisateur l'a écrite, n'est pas du français canonique** (« C'est la
maison a envie de quoi ? »). C'est une **instruction produit explicite**, pas une coquille à
corriger : elle est reprise telle quelle dans §3. Si quelqu'un veut la corriger, c'est une
décision humaine, pas une décision de lot.

---

## §1 — La disposition finale de `/app/plan`

### 1.0 · Le cadre, et ce qui ne bouge pas

`/app/plan` est monté par `frontend/src/App.tsx:193-201` :

```
<Route path="/app/plan"
  element={<KeelHouseholdRoute><KeelOnboardingGate><StudentWeekPlanPage /></KeelOnboardingGate></KeelHouseholdRoute>} />
```

Trois faits que tout lot doit connaître :

1. **`KeelOnboardingGate` (`frontend/src/keel/components/KeelOnboardingGate.tsx:42-70`)
   redirige vers `/app/setup`** quand `hasAnsweredTheFunnel(userId)` rend `false` explicite
   (`frontend/src/keel/api/postLogin.ts:87-103`, lecture de `student_goals`). Une lecture qui
   **échoue** (`null`) laisse passer (fail-safe, ligne 62). Conséquence : sur `/app/plan`,
   l'état « pas de ligne `student_goals` » n'est atteignable **que** sur un hoquet de lecture.
   La branche `plan.about.empty` (`StudentWeekPlanPage.tsx:1707-1711`) reste donc, mais elle
   n'est **pas** le cas nominal de l'état (d).
2. **`KeelHouseholdRoute` (`frontend/src/keel/components/KeelHouseholdRoute.tsx:56-57`)** lit
   `household_members` **sans `.eq("user_id", …)`** (RLS scope au foyer). Elle retombe sur
   `KeelStudentRoute` quand le foyer est absent — donc un compte solo passe aussi.
3. **Aucune des deux gardes ne monte `KeelAppShell`.** L'écran d'attente `app.guard.checking`
   et le panneau de refus s'affichent **sans barre d'onglets ni réserve de padding**.

### 1.1 · L'ordre des blocs, du haut vers le bas

**Un seul ordre pour les quatre états.** La différence entre états est le **montage**, jamais
la position. Un bloc qui change de place selon l'état est un bloc qu'on cherche.

| # | Bloc | Fichier propriétaire | Condition de montage | Ce qu'il affiche quand il n'a rien |
|---|---|---|---|---|
| 1 | Bandeau d'échec | `StudentWeekPlanPage.tsx:1680-1686` | `failure !== null` | *rien* (démonté) |
| 2 | « À propos de toi » + sa modale | `StudentWeekPlanPage.tsx:1695-2008` | toujours | `plan.about.empty` (une phrase, un bouton) — inchangé |
| 3 | **`ReferenceMemberCard`** *(déménagé)* | `frontend/src/keel/components/plan/ReferenceMemberCard.tsx` **(NEUF)** | `isOwner && directionsDiverge` — voir §4bis | ***rien* (`return null`)** — c'est tout l'objet de R3 |
| 4 | **La demande** (`MealBuilder`, formulaire) | `frontend/src/keel/components/MealBuilder.tsx` | **toujours**, sauf pendant une génération | le formulaire **est** l'écran quand il n'y a pas de plan (`meals.form.title`) |
| 5 | Fenêtre de brouillon (Lot C) | `frontend/src/keel/components/plan/PlanDraftDialog.tsx` **(NEUF)** | `draftOpen === true` | `Modal` rend `null` fermé, sans démonter (§6.7) |
| 6 | `TakeTheHandCard` | `frontend/src/keel/components/TakeTheHandCard.tsx` | `place !== null && place.inHousehold && !place.isOwner` | garde sa première moitié (`plan.hand.title` + `plan.hand.body`), **sans bouton** |
| 7 | **Ma part** (Lot E) | `frontend/src/keel/components/plan/MyShareCard.tsx` **(NEUF)** | `myPortion !== null` | ***rien*** |
| 8 | Le plan (`PlanResult`) | `frontend/src/keel/components/plan/PlanResult.tsx` | `groups.length > 0` | `Card tone="dashed"` + `meals.result.empty` |
| 9 | **`TableCard` « À table »** *(déménagé)* | `frontend/src/keel/components/plan/TableCard.tsx` **(NEUF)** | `householdMeal !== null && householdMeal.portions.length > 0` | ***rien* (`return null`)** — déjà le comportement actuel (`HouseholdPage.tsx:2027-2028`) |
| 10 | Chiffre / bascules FF-059 | `MealBuilder.tsx:1163-1210` | `energy.ready && energy.switchOfferable` | *rien* |
| 11 | Modales courses / sessions | `ShoppingListPanel`, `CookingSessions` | montées en permanence, ouvertes par bouton | `Modal` rend `null` fermé |

**Pourquoi 3 avant 4.** « Quelle façon de manger le plat commun suit » est une **entrée** de la
composition, pas un résultat : la lire après le bouton, c'est la lire trop tard. Elle passe
**au-dessus** du formulaire et **sous** « À propos de toi », parce que c'est un fait de foyer
et pas un fait de personne.

**Pourquoi 9 après 8.** « À table » dit comment on **sert** ce que 8 dit qu'on **cuisine**.
L'inverse ferait lire des parts avant de savoir de quel plat.

### 1.2 · État (a) — maître d'un foyer ≥ 2 bouches

Détection : `place.inHousehold === true && place.isOwner === true`
(`frontend/src/keel/api/household.ts:558-584`, lue par `MealBuilder.tsx:290`).

| # | Monté ? | Détail |
|---|---|---|
| 1 | selon | — |
| 2 | **oui** | inchangé |
| 3 | **oui si divergence** | §4bis |
| 4 | **OUI — c'est le changement du lot** | Aujourd'hui `MealBuilder.tsx:596-597` calcule `householdOwner` et **ferme le formulaire**. Cette constante et ses **quatre** usages (`:597`, `:987`, `:1012`, `:1125`) tombent |
| 5 | selon | — |
| 6 | **non** | la branche `place.isOwner` de `TakeTheHandCard.tsx:80-90` est **supprimée** avec `plan.hand.owner_note` |
| 7 | **non** | le maître n'a pas « une part » : il a le plan |
| 8 | oui si plan | `cookedPlans` lui rend la ligne `household` et elle seule (§6.3) |
| 9 | **oui si portions** | c'est ici que « À table » a son sens plein |

**Le formulaire du maître, champ par champ, dans l'ordre :**

1. Fenêtre — deux dates (`meals.form.window_from` / `window_to`), `min = browserLocalDate()`,
   `max = lastNameableStart(today)` sur le départ, `max = addDays(start, 6)` sur la fin
   (`MealBuilder.tsx:658-732`)
2. Mode courses / garde-manger (`meals.form.mode_label`) — ⚠️ le générateur du foyer
   **force `mode: "to_shop"`** (`generate-household-meal-v1/index.ts:2957`). Le champ est donc
   **masqué** en état (a) : proposer un choix que le serveur ignore est une promesse fausse.
3. **La présence, par bouche** — une ligne par bouche, un `MealPickerGrid` par bouche, comme
   `SetupPage.tsx:2400-2434`. Remplace le champ « nombre de personnes » : le générateur du
   foyer **déduit** les couverts de la présence (`generate-household-meal-v1/index.ts:2966`).
4. Jours de cuisine (`plan.cooking.days_label`)
5. Temps par session (`plan.cooking.time_label`)
6. Budget (`plan.cooking.budget_label`) — obligatoire, garde `Number("") === 0` (`MealBuilder.tsx:463-474`)
7. **« C'est la maison a envie de quoi ? »** (`plan.envy.title`, §3)
8. « Ce qui se passe cette semaine » (`meals.form.context_label`)
9. Boutons : **Prévisualiser** (Lot C, `variant="secondary"`) puis **Composer** (`variant="primary"`, `type="submit"`)

### 1.3 · État (b) — compte solo, sans foyer

Détection : `place.inHousehold === false`.

| # | Monté ? | Détail |
|---|---|---|
| 3 | **non** | pas de foyer, pas de plat commun |
| 4 | oui | formulaire actuel **inchangé** : mode, fenêtre, `servings`, jours, temps, budget, garde-manger, préférences, contexte |
| 6 | **non** | `TakeTheHandCard.tsx:74` : `if (!place.inHousehold) return null` |
| 7 | **non** | — |
| 9 | **non** | pas de `member_portions` |

⚠️ **`place === null` NE FERME RIEN** (`MealBuilder.tsx:591-595`). Tant que la lecture n'a pas
abouti, le compte individuel — le chemin **majoritaire** — garde son formulaire. Aucun lot ne
doit transformer `place === null` en « pas de formulaire ».

### 1.4 · État (c) — secondaire réclamé (`user_id` non nul, `role = 'member'`)

Détection : `place.inHousehold === true && place.isOwner === false`.

| # | Monté ? | Détail |
|---|---|---|
| 3 | **non** | `isOwner` requis (gouvernance du maître) |
| 4 | **oui** | c'est ce qui lui permet de **prendre la main** : composer son propre plan personnel via `generate-meal-v1` |
| 6 | **oui** | posture par défaut = ne rien faire, et **aucune phrase ne le lui reproche** |
| 7 | **oui si sa part existe** | Lot E — sa ligne de `member_portions` en tête + « Je valide » / « Demander une modif » |
| 8 | oui **seulement s'il a un plan à lui** | ⚠️ `loadMealPlans` est scopé `.eq("user_id", userId)` (`frontend/src/keel/api/mealGeneration.ts:817`) : **aujourd'hui il ne voit RIEN** |
| 9 | **oui si portions** | `loadHouseholdMeal` n'est pas scopé user (`household.ts:1243-1264`) : il lit la ligne `plan_kind='household'` du foyer par RLS |

**Le trou que Lot E ferme.** Aujourd'hui, un secondaire arrive sur `/app/plan` et voit :
« C'est le foyer qui cuisine pour toi », **sans bouton** (il n'a pas de plan à valider), puis
`meals.result.empty`. Il ne voit **ni** ce que la maison cuisine **ni** sa propre part. Les
deux existent en base et sont lisibles par RLS.

### 1.5 · État (d) — aucun plan encore

C'est un **état transverse** : il se combine avec (a), (b) et (c). Ce qui change :

- **4** : `showForm` vaut `true` sans qu'on ait à cliquer (`!hasWeek`, `MealBuilder.tsx:597`).
  Le titre de section est `meals.form.title` et non `meals.rebuild.*` (`:606-612`).
- **8** : `Card tone="dashed"` + `meals.result.empty` — *« dis-moi par où commencer ci-dessus »*.
  ⚠️ **Cette phrase redevient VRAIE pour le maître** dès que le formulaire lui est rendu. La
  garde `householdOwner ? null : …` de `MealBuilder.tsx:1125` doit donc tomber **avec** la
  constante, pas après : la laisser rendrait un écran totalement vide au maître.
- **9** : rien.
- **2** : `plan.about.empty` seulement si `goal === null`, ce qui n'arrive qu'après un hoquet
  de lecture de la garde (§1.0).

### 1.6 · Le comportement à 320 px

⚠️ **CORRECTION AU BRIEF : la coupure est à `xl` (1280 px), pas à `lg`.**
`frontend/src/keel/components/KeelAppShell.tsx` ne contient **aucun** utilitaire `lg:`, `md:`
ou `sm:` — seulement trois `xl:` (lignes 287, 406, 583). La migration `lg` → `xl` est
documentée dans l'en-tête du fichier (`:32-63`) : à 1024 px les deux `<nav>` se chevauchaient
en silence.

**Les trois utilitaires solidaires** — ils bougent ensemble ou pas du tout :

| Élément | Fichier:ligne | Classe |
|---|---|---|
| Destinations en ligne (haut) | `KeelAppShell.tsx:287` | `hidden gap-2 text-sm xl:flex` |
| Barre d'onglets élève (bas) | `KeelAppShell.tsx:406` | `fixed inset-x-0 bottom-0 z-40 … pb-[env(safe-area-inset-bottom)] xl:hidden` |
| **Réserve de padding** | `KeelAppShell.tsx:583` | `variant === "student" ? "pb-[calc(4rem+env(safe-area-inset-bottom))] xl:pb-0" : ""` |

**Règles à 320 px, opposables :**

1. **Le corps de page ne défile JAMAIS horizontalement.** Tout tableau large défile **dans son
   conteneur**. Les deux tableaux du chemin `/app/plan` :
   - `frontend/src/keel/components/plan/PlanGrid.tsx:49-50` — `overflow-x-auto` + `min-w-[30rem]` (480 px), colonne collante `sticky left-0` (`:96`)
   - `frontend/src/keel/components/MealPickerGrid.tsx:159-160` — `overflow-x-auto` + `min-w-[26rem]` (416 px), colonne collante `sticky left-0 z-10 bg-paper` (`:170`, `:201`)
2. **Tout champ passe par `inputClass`** (`frontend/src/keel/components/ui/Field.tsx:34-38`).
   Il porte `w-full min-w-0 … text-base … lg:text-sm`. Les trois morceaux sont des corrections
   payées : `min-w-0` parce qu'un enfant flex a `min-width:auto` et fait déborder **toute la
   page** à 320 px ; `text-base` (16 px) parce que Safari iOS zoome au focus sous 16 px et ne
   dézoome jamais ; `border-line-strong` pour WCAG 1.4.11 (3:1).
   ⚠️ **Ne jamais recopier ces classes à la main.** `ReferenceMemberCard` a déjà payé ce défaut
   (`HouseholdPage.tsx:1002-1008`, note de correction en place).
3. **Le point le plus fragile de `/app/plan`** : `StudentWeekPlanPage.tsx:689-828` — un
   `flex flex-wrap gap-x-8 gap-y-4` contenant N cellules `min-w-[7rem]` (112 px), **sans
   wrapper `overflow-x`**. Deux cellules + `gap-x-8` = 256 px : ça passe en repliant, mais rien
   ne rattrape un débordement. **Tout ajout de cellule dans ce bloc doit être mesuré à 320 px.**
4. **La réserve de padding bas n'existe que pour `variant="student"`.** Tout bloc ajouté en bas
   de `/app/plan` (7, 9, 10) est couvert par elle **à condition** que
   `<KeelAppShell variant="student">` reste l'enveloppe. Ne pas la retirer.
5. **`Modal`** (`frontend/src/keel/components/ui/Modal.tsx`) : sous 640 px c'est une feuille
   collée en bas (`items-end`, `:92`), pleine largeur, `rounded-t-fiche`, `max-h-[90vh]`, avec
   défilement **interne** (`:133`). Il rend `null` quand `open === false` (`:82`) **sans
   démonter l'appelant** : un brouillon de saisie survit à une fermeture accidentelle.
   Tailles : `md` (`max-w-lg`, défaut) et `lg` (`max-w-2xl`) (`:38-43`).

---

## §2 — La propriété des fichiers, lot par lot

### 2.0 · La règle

> **Un fichier, un seul lot.** Un lot n'ouvre en écriture QUE les fichiers de sa colonne. S'il
> découvre qu'il a besoin d'un fichier d'un autre lot, il **s'arrête et le signale** — il ne
> l'édite pas « juste une ligne ».

### 2.1 · Les arbitrages, et pourquoi

**Arbitrage n°1 — `meal_generation.ts` et les deux `index.ts` de générateur : LOT A, seul.**
Lot C a besoin d'`intent: "draft"` dans les deux `index.ts`. Ces fichiers font 1 862 et
3 413 lignes ; deux lots qui les éditent en parallèle perdent l'un des deux travaux, sans
conflit git visible si les hunks sont éloignés. **Décision : Lot A implémente AUSSI le
court-circuit `draft`**, dont la spécification complète est en §4.3. C n'ouvre aucun fichier
backend. Le coût est un Lot A plus gros ; le bénéfice est zéro perte.

**Arbitrage n°2 — `StudentWeekPlanPage.tsx` : LOT D, seul.**
D, C et E le convoitent. **Décision : D le possède**, et il crée dans son **premier commit**
les deux fichiers de montage **en placeholders** (`return null`, prop-types exacts de §4.4 et
§4.5). Dès que ce commit est visible, `PlanDraftDialog.tsx` appartient à C et
`MyShareCard.tsx` appartient à E, définitivement. C'est le seul transfert de propriété du
chantier, et il a un signal précis (§5).

**Arbitrage n°3 — `en.ts` / `fr.ts` / `catalog.ts` / `planRefusals.ts` : LOT D, seul, EN PREMIER.**
Quatre lots ont besoin de clés neuves. Or :
- `fr.ts` est typé `TranslatedMessages` : retirer une clé d'`en.ts` sans la retirer de `fr.ts`
  ne **compile pas**, et le contraire fait rougir `parity.int.test.ts:22-30`.
- `frontend/src/keel/copy/planRefusals.int.test.ts` **scanne les sources** des deux `index.ts`
  (`:101-134`) : un jeton de refus ajouté côté serveur rend le test rouge tant que
  `planRefusals.ts` + `en.ts` + `fr.ts` ne le portent pas.

**Décision : Lot D lande la TOTALITÉ du tableau §3 dans un commit d'ouverture qui ne touche que
ces quatre fichiers.** Ensuite plus personne ne les ouvre. Corollaire opposable :
**⛔ Lot A n'a le droit d'inventer AUCUN jeton de refus** qui ne soit pas dans §3.

**Arbitrage n°4 — `_shared/keel/household_portions.ts` : LOT D.**
C'est un fichier backend confié à un lot frontend, et c'est voulu : les six chaînes de
`SERVING_DIRECTION` y vivent (`:146-172`), et la condition de vacuité de §4bis doit être lue
**là où les chaînes sont**, jamais recopiée. Lot A ne le touche pas.

**Arbitrage n°5 — `frontend/src/keel/api/household.ts` : LOT D.**
Lot E en a besoin en lecture. **Décision : E crée `frontend/src/keel/api/myShare.ts` (NEUF)**
qui **importe** de `household.ts` sans le modifier.

### 2.2 · Le tableau de propriété

#### Lot A — le moteur (backend uniquement)

| Fichier | Nature |
|---|---|
| `supabase/functions/_shared/keel/local_date.ts` | modifié |
| `supabase/functions/_shared/keel/plan_rationale.ts` | **NEUF** |
| `supabase/functions/_shared/keel/plan_rationale_test.ts` | **NEUF** |
| `supabase/functions/_shared/keel/meal_generation.ts` | modifié |
| `supabase/functions/generate-meal-v1/index.ts` | modifié |
| `supabase/functions/generate-household-meal-v1/index.ts` | modifié |
| `supabase/functions/_shared/keel/request_report.ts` | **câblage seulement** (ne pas changer la logique) |
| `supabase/functions/_shared/keel/request_report_gate.ts` | **câblage seulement** |

#### Lot D — l'écran (le lot le plus gros, et le premier)

| Fichier | Nature |
|---|---|
| `frontend/src/keel/i18n/en.ts` | modifié — **commit d'ouverture** |
| `frontend/src/keel/i18n/fr.ts` | modifié — **commit d'ouverture** |
| `frontend/src/keel/i18n/catalog.ts` | modifié — **commit d'ouverture** |
| `frontend/src/keel/copy/planRefusals.ts` | modifié — **commit d'ouverture** |
| `frontend/src/keel/pages/StudentWeekPlanPage.tsx` | modifié |
| `frontend/src/keel/pages/HouseholdPage.tsx` | modifié (retraits) |
| `frontend/src/keel/pages/SetupPage.tsx` | modifié (appelle `chooseGenerator`) |
| `frontend/src/keel/components/MealBuilder.tsx` | modifié |
| `frontend/src/keel/components/TakeTheHandCard.tsx` | modifié (branche maître retirée) |
| `frontend/src/keel/components/plan/ReferenceMemberCard.tsx` | **NEUF** |
| `frontend/src/keel/components/plan/TableCard.tsx` | **NEUF** |
| `frontend/src/keel/components/plan/PlanDraftDialog.tsx` | **NEUF (placeholder)** → passe à C |
| `frontend/src/keel/components/plan/MyShareCard.tsx` | **NEUF (placeholder)** → passe à E |
| `frontend/src/keel/api/planRouting.ts` | **NEUF** (`chooseGenerator`) |
| `frontend/src/keel/api/planRouting.int.test.ts` | **NEUF** |
| `frontend/src/keel/api/servingDivergence.ts` | **NEUF** (pont mince, §4bis) |
| `frontend/src/keel/api/mealGeneration.ts` | modifié (`intent: "draft"` côté client) |
| `frontend/src/keel/api/household.ts` | modifié (`intent: "draft"`, `generateHouseholdMeal`) |
| `supabase/functions/_shared/keel/household_portions.ts` | modifié (`distinctServingDirections`) |
| `supabase/functions/_shared/keel/household_portions_test.ts` | modifié |

#### Lot C — le brouillon

| Fichier | Nature |
|---|---|
| `frontend/src/keel/components/plan/PlanDraftDialog.tsx` | **repris de D** après son commit d'ouverture |
| `supabase/functions/_shared/keel/plan_draft_note.ts` | **NEUF** — voir §4.3 pour le nom |
| `supabase/functions/_shared/keel/plan_draft_note_test.ts` | **NEUF** |
| `frontend/src/keel/api/planDraft.ts` | **NEUF** |
| `frontend/src/keel/api/planDraft.int.test.ts` | **NEUF** |

#### Lot E — la part du réclamé

| Fichier | Nature |
|---|---|
| `frontend/src/keel/components/plan/MyShareCard.tsx` | **repris de D** après son commit d'ouverture |
| `frontend/src/keel/api/myShare.ts` | **NEUF** |
| `frontend/src/keel/api/myShare.int.test.ts` | **NEUF** |

#### Phase 3 — agents de contrôle navigateur

**Aucun fichier en écriture.** Rapports dans `scratchpad/` uniquement, horodatés
(`scratchpad/RAPPORT-QA-PLAN-<AGENT>-20260813.md`) — le dépôt est partagé entre sessions et
un nom de fichier non horodaté écrase le travail d'un autre.

### 2.3 · Les fichiers PARTAGÉS EN LECTURE SEULE

Tout lot peut les lire et les importer. **Aucun lot ne les modifie.** Une modification ici est
un signal d'arrêt, pas une amélioration en passant.

| Fichier | Ce qu'il porte |
|---|---|
| `supabase/functions/_shared/keel/household.ts` | `goalApplies`, `MINOR_FORBIDDEN_GOALS`, `MEMBER_AGE_STATES`, `ageStateFromVerdict` |
| `supabase/functions/_shared/keel/household_composition.ts` | `referenceMemberId`, `trunkSizing`, `mouthEnvelope` |
| `supabase/functions/_shared/keel/meal_plan_window.ts` | `resolveRequestedWindow` (`:235-261`), `MAX_WINDOW_DAYS = 7` (`:52`) |
| `supabase/functions/_shared/keel/forbidden_matcher.ts` | `findForbiddenMatches` (`:368`), `ForbiddenTerm` (`:41`) |
| `supabase/functions/_shared/keel/reengagement.ts` | `findGuiltTripping` (`:296`) |
| `supabase/functions/_shared/keel/household_meal_generation.ts` | `buildHouseholdPromptBlocks` (`:507`) |
| `supabase/functions/_shared/keel/locale.ts` | `resolveArtifactLocale` (`:172`) |
| `frontend/src/keel/api/mealWindow.ts` | `resolveRequestedWindow`, `lastNameableStart`, `selectMealPlans` |
| `frontend/src/keel/api/dates.ts` | `weekStartFor`, `addDays`, `daysBetween` |
| `frontend/src/keel/api/planBudget.ts` | `BUDGET_MAX`, `readPlanInputs`, `savePlanInputs`, `COOKING_SESSION_MINUTES` |
| `frontend/src/keel/components/MealPickerGrid.tsx` | la grille de présence — **une seule implémentation**, §6.8 |
| `frontend/src/keel/components/ui/*` | `Card`, `Field`, `Modal`, `Button`, `SetupSection` |
| `frontend/src/App.tsx` | aucune route ne change |

---

## §3 — La table de déménagement i18n

### 3.0 · Le mécanisme, vérifié

Trois gardes existent, et **elles ne font pas le même travail** :

| Garde | Fichier | Ce qu'elle vérifie | Mord-elle sur ce chantier ? |
|---|---|---|---|
| **Seams** | `frontend/src/keel/i18n/pageSeams.int.test.ts:179-205` | Part du composant de route **et de sa garde**, suit **tous** les imports relatifs transitivement, relève chaque littéral qui est une clé du seed, échoue si un **namespace** atteint n'est pas déclaré | **NON** — voir 3.1 |
| **Parity** | `frontend/src/keel/i18n/parity.int.test.ts:22-30` | `Object.keys(fr)` **exactement égal** aux clés d'`en` filtrées par `isTranslatedMessageKey` | **OUI** — toute clé créée ou supprimée d'un seul côté |
| **`t()` en DEV** | `frontend/src/keel/i18n/t.ts:62-67` | Lève si une page **déclarée** rend une clé hors de son périmètre | oui, au rendu |

⚠️ **Correction au brief.** `parity.int.test.ts` **ne vérifie PAS** qu'une clé est « portée par
une page déclarée ». Vérifié : ses quatre cas sont (1) égalité des ensembles fr/en, (2) mêmes
trous d'interpolation, (3) pas de recopie de l'anglais, (4) ni valeur vide ni espace de bord
(`:22`, `:31`, `:47`, `:359`), plus deux cas sur la frontière de namespaces (`:419`, `:428`).
**Aucun test du dépôt ne détecte une clé orpheline non atteinte par une page.** Conséquence
pratique et rassurante : Lot D peut lander des clés **avant** que leurs lecteurs existent,
sans rien faire rougir.

### 3.1 · Pourquoi le déménagement ne casse aucune couture

Vérifié dans `frontend/src/keel/i18n/catalog.ts` :

- `"/app/plan"` (`:542-565`) déclare déjà : `plan`, `meals`, `moment`, `photo`, `deviation`,
  `common`, `when`, `amount`, `sentence`, `question`, `day`, `slot`, `unit`, `food_group`,
  `part`, `timing`, `today`, **`household`**, `app`, `shell`, `chat`
- `"/app/household"` (`:494`) déclare déjà : `household`, **`meals`**, **`plan`**, `app`,
  `shell`, `chat`
- `"/app/setup"` (`:457`) déclare : `setup`, `allergen`, `household`, `plan`, `app`, `meals`

Les trois namespaces en jeu (`plan`, `household`, `meals`) sont déclarés des deux côtés, et
tous trois sont dans `TRANSLATED_NAMESPACES` (`catalog.ts:83+`). **Aucun seam ne bouge.**

⚠️ **LE PIÈGE DE SEAM QUI EXISTE VRAIMENT — `allergen`.**
`/app/plan` ne déclare **pas** `allergen`. Or `frontend/src/keel/api/onboarding.ts:50` importe
`../copy/allergens`, qui porte **13 littéraux `allergen.*`**. Le scanner suit les imports, pas
les appels. **⛔ `chooseGenerator()` ne doit donc JAMAIS vivre dans `api/onboarding.ts`** ni
importer quoi que ce soit qui en dépende. C'est la raison d'être du fichier neuf
`api/planRouting.ts` (§4.6). Même interdit pour `frontend/src/keel/copy/setupMisses.ts`, qui
porte des `setup.*`.

### 3.2 · Les clés qui DÉMÉNAGENT

| Clé actuelle | Fichier:ligne (fr / en) | Namespace d'arrivée | Nouvelle clé | Nouveau FR | Nouveau EN | Qui l'écrit |
|---|---|---|---|---|---|---|
| `household.envy.title` | `fr.ts:1782` / `en.ts:3976` | `plan` | `plan.envy.title` | **« C'est la maison a envie de quoi ? »** *(mot pour mot de l'utilisateur, §0/R2)* | `What is the house in the mood for?` | **D** |
| `household.envy.body` | `fr.ts:1783-1784` / `en.ts:3977-3978` | `plan` | `plan.envy.body` | « Une ligne, pour tout le monde, sur cette semaine-ci. Personne d'autre n'a rien à remplir, et la laisser vide ne pose aucun problème. » | `One line, for everyone, about this week. Nobody else has to fill anything in, and leaving it empty is fine.` | **D** |
| `household.envy.placeholder` | `fr.ts:1785` / `en.ts:3979` | `plan` | `plan.envy.placeholder` | « Léa veut des pâtes, Marc en a marre du poulet. » | `Lea wants pasta, Marc is sick of chicken.` | **D** |
| `household.envy.save` | `fr.ts:1786` / `en.ts:3980` | — | **SUPPRIMÉE** | — | — | **D** |
| `household.reference.title` | `fr.ts:1719` / `en.ts:3865` | `plan` | `plan.reference.title` | « Quelle façon de manger le plat commun suit » | `Whose way of eating the shared dish follows` | **D** |
| `household.reference.hint` | `fr.ts:1720-1721` / `en.ts:3866-3868` | `plan` | `plan.reference.hint` | *(texte actuel, inchangé)* | *(texte actuel, inchangé)* | **D** |
| `household.reference.default` | `fr.ts:1722` / `en.ts:3869` | `plan` | `plan.reference.default` | « Celle de la personne qui compose cette semaine-là » | `Whoever is composing that week` | **D** |
| `household.reference.saved` | `fr.ts:1723` / `en.ts:3870` | `plan` | `plan.reference.saved` | « Enregistré. » | `Saved.` | **D** |
| `household.portions.title` | `fr.ts:1792` / `en.ts:3986` | `plan` | `plan.table.title` | « À table » | `At the table` | **D** |
| `household.portions.standard` | `fr.ts:1793` / `en.ts:3987` | `plan` | `plan.table.standard` | « Une part standard » | `A standard serving` | **D** |

**Pourquoi renommer plutôt que réutiliser.** `/app/plan` déclare `household`, donc garder
`household.envy.title` **compilerait et passerait tous les tests**. On renomme quand même :
une clé `household.*` rendue par l'écran du plan est une **fausse piste permanente** pour qui
grepera dans six mois — et ce dépôt a déjà payé « une valeur figée survit à sa cause ».

### 3.3 · Les clés SUPPRIMÉES

| Clé | Fichier:ligne (fr / en) | Seul rendu | Pourquoi elle devient FAUSSE |
|---|---|---|---|
| `plan.hand.owner_note` | `fr.ts:1902-1903` / `en.ts:4337-4338` | `TakeTheHandCard.tsx:83` | Elle dit *« Compose-le depuis la page du foyer »*. Dès que le maître compose depuis `/app/plan`, la phrase envoie vers un écran qui ne compose plus. |
| `household.compose.title` | `fr.ts:1787` / `en.ts:3981` | `HouseholdPage.tsx:1923` | `ComposeCard` (déf. `:1863`) disparaît |
| `household.compose.body` | `fr.ts:1788-1789` / `en.ts:3982-3983` | `HouseholdPage.tsx:1924` | idem |
| `household.compose.submit` | `fr.ts:1790` / `en.ts:3984` | `HouseholdPage.tsx:2006` | idem |
| `household.compose.working` | `fr.ts:1791` / `en.ts:3985` | `HouseholdPage.tsx:2006` | idem |
| `household.envy.save` | `fr.ts:1786` / `en.ts:3980` | `HouseholdPage.tsx:1569` | l'envie n'a plus de bouton propre : elle part avec le formulaire de demande |

**Comment on referme `parity.int.test.ts`.** Chaque suppression est **deux** suppressions, dans
le même commit : `en.ts` **et** `fr.ts`. Une seule des deux fait échouer `tsc -b` (le type
`TranslatedMessages` de `fr.ts`) **et** `parity.int.test.ts:22-30`. Il n'y a pas de chemin où
l'oubli passe.

### 3.4 · Les clés à CRÉER

#### Pour Lot D — la demande

| Nouvelle clé | FR | EN |
|---|---|---|
| `plan.request.title` | « Demander un plan » | `Ask for a plan` |
| `plan.request.presence_title` | « Qui est là, jour par jour » | `Who is here, day by day` |
| `plan.request.presence_intro` | « Une ligne par bouche. Marque les repas que chacun ne prend pas à la maison sur cette fenêtre-ci. » | `One row per person. Mark the meals each one is not eating at home over this window.` |
| `plan.request.presence_open` | « Marquer les absences » | `Mark who's away` |
| `plan.reference.empty_note` | *(aucune — la carte se tait, elle ne s'explique pas)* | — |

#### Pour Lot A — l'explication des choix de calendrier

⚠️ **AUCUNE CLÉ i18n.** Les phrases de `plan_rationale.ts` sont **assemblées côté serveur**
dans la langue du contenu, comme `request_report_gate.ts` le fait déjà (`:80-120`). Un miroir
de gabarits côté front serait **une garde en double**, et c'est nommément « la cicatrice la
plus chère de ce dépôt » (`request_report_gate.ts:30-34`). Lot A n'écrit **qu'un** titre de
section, et c'est D qui le pose :

| Nouvelle clé | FR | EN | Qui l'écrit |
|---|---|---|---|
| `plan.rationale.title` | « Pourquoi ces jours-là » | `Why those days` | **D** |

#### Pour Lot C — le brouillon

| Nouvelle clé | FR | EN |
|---|---|---|
| `plan.draft.cta` | « Prévisualiser » | `Preview` |
| `plan.draft.working` | « Composition d'un aperçu… » | `Building a preview...` |
| `plan.draft.title` | « Ce que ça donnerait » | `What it would look like` |
| `plan.draft.note_label` | « Ce qui ne va pas » | `What's off` |
| `plan.draft.note_hint` | « Une phrase suffit. Elle sert à refaire l'aperçu, elle n'est pas enregistrée. » | `One sentence is enough. It is used to redo the preview; it is not saved.` |
| `plan.draft.note_placeholder` | « Trop de poisson, et rien le jeudi soir. » | `Too much fish, and nothing for Thursday night.` |
| `plan.draft.remix` | « Refaire avec ça » | `Redo with that` |
| `plan.draft.adopt` | « Adopter ce plan » | `Adopt this plan` |
| `plan.draft.adopting` | « Enregistrement… » | `Saving...` |
| `plan.draft.discard` | « Laisser tomber » | `Drop it` |
| `plan.draft.not_saved` | « Rien n'est encore enregistré. » | `Nothing is saved yet.` |
| `plan.draft.note_too_long` | « Trop long. Dis-le en une phrase. » | `Too long. Say it in one sentence.` |
| `plan.draft.note_rejected` | « Je ne peux pas repartir de cette phrase-là. Reformule ce que tu veux changer dans le plan. » | `I can't work from that sentence. Say again what you want changed in the plan.` |

#### Pour Lot E — la part du réclamé

| Nouvelle clé | FR | EN |
|---|---|---|
| `plan.mine.title` | « Ta part » | `Your share` |
| `plan.mine.standard` | « Une part standard » | `A standard serving` |
| `plan.mine.approve` | « Je valide » | `Looks right` |
| `plan.mine.approved` | « Validé. » | `Confirmed.` |
| `plan.mine.request_change` | « Demander une modif » | `Ask for a change` |
| `plan.mine.change_label` | « Ce que tu voudrais changer » | `What you'd like changed` |
| `plan.mine.change_sent` | « C'est parti au foyer. » | `Sent to the household.` |
| `plan.mine.household_dishes` | « Ce que la maison cuisine » | `What the house is cooking` |

#### Jetons de refus — la liste FERMÉE

⛔ **Lot A ne rend AUCUN jeton hors de cette liste.** `planRefusals.int.test.ts:101-134` scanne
`jsonResponse(req, { error: "…" })` dans les deux `index.ts` et exige un mot pour chacun.

| Jeton serveur | Clé | FR | EN | Lot qui l'ÉMET |
|---|---|---|---|---|
| `draft_not_composed` | `plan.refusal.draft_not_composed` | « L'aperçu n'a pas abouti. Rien n'a été enregistré, ton plan n'a pas bougé. » | `The preview didn't come through. Nothing was saved and your plan is untouched.` | **A** |
| `note_unusable` | `plan.refusal.note_unusable` | « Je ne peux pas repartir de cette phrase-là. Reformule ce que tu veux changer dans le plan. » | `I can't work from that sentence. Say again what you want changed in the plan.` | **A** |

*(Les 40+ jetons existants ne bougent pas — `frontend/src/keel/copy/planRefusals.ts:52-123`.)*

### 3.5 · Le rouge qui n'est PAS le vôtre

⚠️ **`frontend/src/keel/i18n/en.ts` porte 8 erreurs `no-irregular-whitespace` aux lignes
3319, 3320 et 3321.** Mesuré le 2026-08-13 :

```
3319:10, 3319:17, 3319:51, 3319:54, 3320:7, 3320:24, 3321:34, 3321:53
  error  Irregular whitespace not allowed  no-irregular-whitespace
✖ 8 problems (8 errors, 0 warnings)
```

Elles viennent d'une **refonte i18n menée par une AUTRE session**, en cours dans l'arbre de
travail. **Ne les répare pas, ne les commite pas.** Si `npm exec -- eslint src/keel/i18n/en.ts`
rend exactement ces 8 erreurs et rien d'autre, ton lot est propre. Si le compte change ou si
d'autres règles apparaissent, c'est de toi.

---

## §4 — Les signatures des modules purs neufs

### 4.0 · La règle qui gouverne toutes les signatures ci-dessous

> **⛔ AUCUN PARAMÈTRE DE GARDE OPTIONNEL.**
> Sept paramètres optionnels ont déjà été des gardes désarmées dans ce dépôt ; `safetyBand` est
> la cicatrice fondatrice. Le motif est écrit noir sur blanc dans
> `supabase/functions/_shared/keel/request_report_gate.ts:163-171` : *« un `?` rend l'oubli
> invisible à la compilation »*.
>
> **Propriété REQUISE + valeur nullable.** L'absence doit s'écrire : `x: T | null`, jamais
> `x?: T`. Et quand l'absence n'est pas une valeur légitime, la fonction **jette**, comme
> `gateRequestReport` le fait sur `restrictionFlag`, `doctrineForbidden` et `locale`
> (`:181-196`).

### 4.1 · `supabase/functions/_shared/keel/plan_rationale.ts` — Lot A

```ts
/**
 * FF-xxx — POURQUOI CES JOURS-LÀ. Module PUR.
 *
 * ── LE TROU QUE CE MODULE FERME ────────────────────────────────────────────
 * Le moteur prend des décisions de CALENDRIER que personne ne voit: il ajoute
 * un jour de cuisine que l'élève n'a pas coché parce que sa fenêtre le lui
 * impose, il coupe la fenêtre à dimanche, il saute un midi marqué absent. Vu de
 * l'écran, ces décisions sont indiscernables d'un bug — et un plan qui a l'air
 * faux ne se cuisine pas.
 *
 * ── L'ASSEMBLAGE EST BACKEND, ET C'EST LA RÈGLE, PAS UNE COMMODITÉ ─────────
 * `request_report_gate.ts:29-34` porte le raisonnement mot pour mot: assembler
 * côté écran obligerait à y dupliquer les gardes, et une garde en double
 * diverge — la cicatrice la plus chère de ce dépôt. Le backend connaît la
 * langue de l'élève (`resolveArtifactLocale` → `profiles.locale`), assemble,
 * garde, et rend des PHRASES FINIES. L'écran les affiche, il ne les décide pas.
 *
 * ⛔ IL N'EXISTERA JAMAIS DE MIROIR DE CES GABARITS DANS `frontend/`.
 *
 * ── CHAQUE PHRASE EST ARMÉE PAR UNE PRÉMISSE ──────────────────────────────
 * Aucune ligne ne sort d'un fait absent. `daysAdded: []` ne produit pas « aucun
 * jour ajouté »: il ne produit RIEN. Une phrase qui dit une absence apprend au
 * lecteur à ne pas lire les autres.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import { findGuiltTripping } from "./reengagement.ts";
import { type DayToken } from "./tokens.ts";

/** Les deux seules langues que ce module sait écrire. Miroir de `ReportLocale`. */
export type RationaleLocale = "fr" | "en";

/**
 * POURQUOI UNE PHRASE N'EST PAS SORTIE. Nommé, jamais un booléen.
 *
 * `guilt_tripping` est un BUG de nos propres gabarits et doit réveiller
 * quelqu'un; `nothing_to_explain` est le produit qui fonctionne — le cas
 * MAJORITAIRE, celui où le moteur a fait exactement ce qu'on lui a demandé.
 */
export type RationaleRefusal = "guilt_tripping" | "nothing_to_explain";

/**
 * LES FAITS DÉJÀ CONNUS AU MOMENT OÙ LE PLAN EST ÉCRIT.
 *
 * ⚠️ TOUTES LES PROPRIÉTÉS SONT REQUISES. Un appelant qui n'a pas su lire un
 * fait passe `null` ou `[]` EXPLICITEMENT — et les deux ne disent pas la même
 * chose: `[]` dit « aucun », `null` dit « je n'ai pas su lire ». La fonction
 * jette sur un `undefined`, parce qu'un champ oublié est le seul cas où on ne
 * peut affirmer ni l'un ni l'autre.
 */
export interface PlanRationaleFacts {
  /** Les jours que l'élève a COCHÉS. `[]` = il n'en a coché aucun. */
  declaredCookDays: readonly DayToken[];
  /**
   * Les jours que le moteur a AJOUTÉS parce que la fenêtre l'exigeait.
   * `[]` = aucun ajout, et c'est le cas nominal.
   */
  addedCookDays: readonly DayToken[];
  /** La fenêtre écrite en base, telle que `resolveRequestedWindow` l'a rendue. */
  window: { startsOn: string; durationDays: number };
  /** Ce que l'élève a DEMANDÉ, avant résolution. Sert à dire ce qui a été coupé. */
  requestedWindow: { startsOn: string; durationDays: number } | null;
  /**
   * LE JOUR LOCAL DE L'ÉLÈVE et son jeton — `localDateInZone` / `dayTokenInZone`.
   * REQUIS: sans lui, « ton plan commence aujourd'hui » est indécidable, et le
   * fuseau du SERVEUR classerait un dîner la veille (`local_date.ts:8-12`).
   */
  today: { localDate: string; dayToken: DayToken };
  /**
   * L'HEURE LOCALE, en minutes depuis minuit. `null` = pas résolue.
   * C'est ce qui permet de dire « il est 21 h, le dîner d'aujourd'hui n'est
   * plus une question » plutôt que de composer un repas déjà passé.
   */
  localMinuteOfDay: number | null;
  /** Les créneaux marqués absents DANS la fenêtre. `[]` = personne n'est parti. */
  awayInWindow: readonly { day: DayToken; slot: string }[];
  /** Le budget appliqué. `null` = aucun budget n'a été lu. */
  budgetAmount: number | null;
  /**
   * Le nombre de bouches réellement servies. `null` sur la lane individuelle.
   * REQUIS: `1` et `null` ne disent pas la même chose.
   */
  mouthsServed: number | null;
  /**
   * QUI A PRIS LA MAIN, et donc ne mange pas ce plan. `[]` = personne.
   * Prénoms, jamais d'identifiants: la phrase se lit à voix haute à table.
   */
  handTakenBy: readonly string[];
  /** QUI A ÉTÉ FUSIONNÉ dans ce plan. `[]` = aucune fusion. */
  mergedIn: readonly string[];
}

export interface PlanRationale {
  /** Les phrases finies, dans la langue du contenu. `[]` = rien à dire. */
  lines: string[];
  /** Pourquoi rien ne sort. `null` quand il y a des lignes. */
  refusal: RationaleRefusal | null;
}

/**
 * Ce qu'on affiche des choix de calendrier, ou pourquoi on n'affiche rien.
 *
 * ⚠️ JETTE sur un champ manquant ou une locale inconnue — même posture que
 * `gateRequestReport`. Un appelant qui n'a pas su lire le jour local de l'élève
 * ne doit pas recevoir une phrase par défaut: il doit ÉCHOUER BRUYAMMENT.
 *
 * ── LA DERNIÈRE PORTE EST L'ANTI-CULPABILISATION ──────────────────────────
 * Ces gabarits sont fixes et testés: ils ne devraient jamais mordre. Quand ça
 * arrive, ce n'est pas une ligne à retirer, c'est un signal qu'on ne sait plus
 * ce qu'on écrit. On coupe TOUT et on trace — copie exacte de la porte 4 de
 * `gateRequestReport` (`request_report_gate.ts:236-249`).
 */
export function explainPlanChoices(input: {
  facts: PlanRationaleFacts;
  locale: RationaleLocale;
}): PlanRationale;
```

**Contrainte de test.** `plan_rationale_test.ts` doit contenir **au moins un cas qui PASSE**
(des lignes non vides). Cicatrice du dépôt : *« une garde a besoin d'un cas qui passe, sinon
elle bloque tout en ressemblant à une garde qui marche. »* Le test doit aussi prouver
l'**idempotence** (`assertEquals(f(args), f(args))`), comme
`request_report_gate_test.ts:297`.

**Où le résultat voyage.** Dans la réponse JSON des deux générateurs, sous la clé
`rationale: { lines: string[], refusal: string | null }`, à côté de `meal` et `issues`.
⚠️ Il n'est **pas** persisté en base : c'est une explication d'un geste, pas un fait du plan.

### 4.2 · `supabase/functions/_shared/keel/local_date.ts` — ajout, Lot A

```ts
/**
 * L'HEURE LOCALE DE L'ÉLÈVE, en minutes depuis minuit.
 *
 * MÊME POSTURE QUE `localDateInZone`: jette sur un fuseau vide ou inconnu
 * plutôt que de replier sur UTC. « 21 h » et « 23 h » ne demandent pas le même
 * plan, et se tromper d'un fuseau fait composer un dîner déjà mangé.
 */
export function localMinuteInZone(timezone: string, now: Date): number;
```

⚠️ **`daysUntilSunday` (`local_date.ts:148`) et `daysFrom` (`:117`) n'ont AUCUN appelant en
production** — vérifié le 2026-08-13, seulement des mentions en commentaire
(`meal_plan_window.ts:9`, `meal_stretch.ts:30`). La résolution de fenêtre réelle vit dans
`meal_plan_window.ts:235-261` (`resolveRequestedWindow`). **Lot A ne les supprime pas** (ce
n'est pas son lot) et surtout **ne les appelle pas** en croyant qu'ils sont la règle.

### 4.3 · Le brouillon — spécification pour Lot A, usage pour Lot C

#### 4.3.1 · Le court-circuit `draft`, implémenté par LOT A

**Dans les deux `index.ts`.** Le vocabulaire d'`intent` est aujourd'hui fermé à
`{replace_current, prepare_next}` (`generate-meal-v1/index.ts:347`,
`generate-household-meal-v1/index.ts:828`). Il s'ouvre à **`draft`**, avec un contrat strict :

| Règle | Où |
|---|---|
| `intent: "draft"` est accepté par les deux fonctions | `generate-meal-v1:346-352`, `generate-household-meal-v1:827-834` |
| `replaces` est **refusé** avec `draft` (`unknown_intent`) | même bloc |
| Toutes les gardes AMONT s'appliquent à l'identique (gel, `goal_required`, `no_coach`, fenêtre, chevauchement, TCA, doctrine, règles de maison) | inchangées |
| **Le seul saut est l'ÉCRITURE** : la RPC `write_student_meal_plan` n'est PAS appelée | `generate-meal-v1:1590-1597`, `generate-household-meal-v1:2944-2951` |
| La réponse porte le **même payload** que le plan écrit, plus `draft: true`, `meal.id: null` | — |
| Aucun quota de fusion n'est consommé, aucune `member_portions` n'est écrite | — |
| Refus propre à ce chemin : **`draft_not_composed`** | §3.4 |

⚠️ **`plan_kind` reste une clé de `p_payload`, jamais un paramètre de RPC.** Vérifié :
`generate-meal-v1/index.ts:1606` (`plan_kind: "personal"`) et
`generate-household-meal-v1/index.ts:2973` (`plan_kind: "household"`). Il n'existe **aucun**
`p_plan_kind` dans le TypeScript du dépôt.
⚠️ **`household_plan_kind_readers_test.ts:112-125` exige que
`generate-household-meal-v1/index.ts` contienne encore `plan_kind: "household"`.** Le chemin
`draft` ne doit pas retirer cette ligne du fichier.

#### 4.3.2 · `supabase/functions/_shared/keel/plan_draft_note.ts` — Lot C

⚠️ **LE NOM.** `supabase/functions/_shared/keel/plan_feedback.ts` **EXISTE DÉJÀ** (346 lignes)
et sert le retour de fin de plan dans le chat (`FEEDBACK_QUESTIONS`, `questionsFor`,
`effectOf`). Un module nommé `plan_feedback_input.ts` à côté serait lu comme sa moitié
d'entrée, ce qu'il n'est pas. **Le nom retenu est `plan_draft_note.ts`** : ce module garde la
phrase qu'on écrit **sur un brouillon**, avant qu'il existe.

```ts
/**
 * LA PHRASE QU'ON ÉCRIT SUR UN BROUILLON, ET CE QU'ON A LE DROIT D'EN FAIRE.
 *
 * ⚠️ CE N'EST PAS `plan_feedback.ts`. Celui-là pose des QUESTIONS FERMÉES à la
 * fin d'une fenêtre, chacune avec son lecteur nommé, et il écrit en base.
 * Celui-ci lit UNE phrase libre sur un plan QUI N'EXISTE PAS ENCORE, la garde,
 * et la rend au prompt. Rien n'est persisté.
 *
 * ── POURQUOI UNE GARDE D'ENTRÉE ───────────────────────────────────────────
 * Ce texte part au modèle, dans le même message que la doctrine du coach et les
 * règles de maison. Une phrase d'utilisateur qui dit « ignore les consignes
 * précédentes » ou qui nomme un interdit du coach n'est pas une préférence:
 * c'est une injection dans un prompt qui porte des gardes de sécurité.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import { type ForbiddenTerm } from "./forbidden_matcher.ts";

export const DRAFT_NOTE_MAX_CHARS = 280;

export type DraftNoteRefusal =
  /** Rien d'exploitable: vide, ou uniquement de la ponctuation. */
  | "empty"
  /** Plus long que ce qu'une consigne de reprise peut porter. */
  | "too_long"
  /** La phrase nomme un interdit de la doctrine du coach. */
  | "doctrine_lock"
  /** La phrase porte une consigne au MODÈLE, pas au plan. */
  | "instruction_to_the_model";

export interface DraftNoteVerdict {
  /** Le texte à passer au prompt. `null` dès qu'il y a un refus. */
  usable: string | null;
  /** Le motif nommé. `null` quand `usable` est non nul. */
  refusal: DraftNoteRefusal | null;
}

/**
 * ⚠️ AUCUN PARAMÈTRE OPTIONNEL, ET LA FONCTION JETTE.
 * `doctrineForbidden` est REQUIS: `[]` dit « aucun interdit », `undefined` dit
 * « je n'ai pas su lire la doctrine » — et ces deux-là n'autorisent pas la même
 * chose. Même posture que `gateRequestReport` (`request_report_gate.ts:172-196`).
 */
export function readDraftNote(input: {
  raw: unknown;
  doctrineForbidden: readonly ForbiddenTerm[];
}): DraftNoteVerdict;
```

⚠️ **⛔ Ne JAMAIS écrire de matcher maison pour la détection d'injection.** Cicatrice du
dépôt : *« laitue » ≠ « lait », 12 faux positifs sur 12 mesurés.* La détection
`instruction_to_the_model` passe par une **liste fermée de constructions**, testée, sur le
modèle de `forbidden_matcher.ts:106-140` (qui documente pourquoi `not` ne couvre pas
« doesn't »). Si Lot C ne peut pas écrire cette liste avec un cas qui passe **et** un cas qui
mord dans les deux langues, il rend `instruction_to_the_model` **jamais** et le note comme
non livré — plutôt qu'une garde qui bloque tout.

### 4.4 · `frontend/src/keel/components/plan/PlanDraftDialog.tsx` — placeholder D, corps C

```tsx
export interface PlanDraftDialogProps {
  open: boolean;
  onClose: () => void;
  /** Le brouillon rendu par le serveur. `null` = rien à montrer. */
  draft: GeneratedMealResult | null;
  /** Les phrases de Lot A. `[]` = rien à expliquer, et ce n'est pas un manque. */
  rationale: readonly string[];
  /** Refait un brouillon avec la phrase. REQUIS, jamais optionnel. */
  onRemix: (note: string) => Promise<void>;
  /** Écrit le plan pour de bon. */
  onAdopt: () => Promise<void>;
  /** Une composition est en cours. */
  busy: boolean;
}
```

**Placeholder de D** : `export default function PlanDraftDialog(_: PlanDraftDialogProps) { return null; }`

### 4.5 · `frontend/src/keel/components/plan/MyShareCard.tsx` — placeholder D, corps E

```tsx
export interface MyShareCardProps {
  /** MA ligne de `member_portions`. `null` = rien à montrer, la carte se tait. */
  mine: MemberPortionView | null;
  /** Les plats du foyer, pour le contexte. `[]` = la carte n'en montre aucun. */
  householdDishes: readonly HouseholdDishView[];
  /** Ma bouche. REQUIS: sans elle, `mine` ne peut pas être vérifiée. */
  meMemberId: string | null;
  onApprove: () => Promise<void>;
  onRequestChange: (text: string) => Promise<void>;
  busy: boolean;
}
```

**Placeholder de D** : `export default function MyShareCard(_: MyShareCardProps) { return null; }`

⚠️ **Ce que cette carte n'affiche JAMAIS** : aucun objectif, aucun poids, aucune calorie,
aucun « pourquoi » de part. `portion_note` est une **instruction de service**, garantie sans
raison ni vocabulaire de corps par `sanitizePortionNote`
(`supabase/functions/_shared/keel/household_portions.ts:891`). C'est ce qui permet de
l'afficher : l'instruction est publique, le pourquoi ne l'est pas.

### 4.6 · `frontend/src/keel/api/planRouting.ts` — Lot D

**Où il vit, et pourquoi pas ailleurs.** Il ne peut **pas** vivre dans `api/onboarding.ts` :
celui-ci importe `../copy/allergens` (`:50`), qui porte 13 littéraux `allergen.*`, et
`/app/plan` ne déclare pas `allergen` (§3.1). Un fichier **neuf, sans aucun import
d'i18n**, n'atteint aucun namespace et est donc montable des deux côtés. Vérifié : aucun
module de `frontend/src/keel/api/` n'importe `i18n/t`.

```ts
/**
 * QUEL GÉNÉRATEUR, ET C'EST UN FAIT — PAS UNE BRANCHE RECOPIÉE.
 *
 * ── LA RÈGLE, EXTRAITE DE `SetupPage.tsx:799-801` ─────────────────────────
 * `generate-household-meal-v1` si le foyer a AU MOINS DEUX bouches ET que je
 * suis le maître; sinon `generate-meal-v1`.
 *
 * ⚠️ `isOwner` EST LA MOITIÉ DU ROUTAGE, pas une précaution.
 * `generate-household-meal-v1` rend 403 `not_owner` à un secondaire — et c'est
 * voulu: son plan à lui est PERSONNEL (D2 du modèle foyer). Router sur le seul
 * nombre de bouches enverrait toute personne ayant réclamé son profil droit
 * dans un refus que rien ne peut fermer.
 *
 * ⚠️ LE COMPTE DE BOUCHES INCLUT LE MAÎTRE. `SetupPage.tsx:799` écrit
 * `fresh.mouths.length + (fresh.householdId ? 1 : 0)`: la liste des bouches ne
 * contient pas la ligne du maître. Une re-implémentation qui l'oublierait
 * enverrait un foyer de deux personnes sur le générateur individuel.
 *
 * ⚠️ AUCUN PARAMÈTRE OPTIONNEL. Un appelant qui ne sait pas s'il est maître ne
 * doit pas hériter de `false`: `false` est une AFFIRMATION.
 *
 * PURE. Aucune I/O, aucune horloge, aucun `t()`, aucun import d'i18n — c'est ce
 * qui lui permet d'être importé par `/app/plan` ET par `/app/setup` sans créer
 * de couture (`i18n/pageSeams.int.test.ts`).
 */
export type PlanGenerator = "household" | "personal";

export function chooseGenerator(place: {
  /** Suis-je dans un foyer ? REQUIS. */
  inHousehold: boolean;
  /** Suis-je le maître ? REQUIS. `false` est une affirmation, pas un défaut. */
  isOwner: boolean;
  /**
   * Le nombre de bouches AUTRES que le maître. REQUIS.
   * `0` dit « personne d'autre »; ce n'est pas la même chose qu'un foyer non lu,
   * qui se dit par `inHousehold: false`.
   */
  otherMouths: number;
}): PlanGenerator;
```

**Contrat de test** (`planRouting.int.test.ts`) — les six cas, tous obligatoires :

| `inHousehold` | `isOwner` | `otherMouths` | attendu |
|---|---|---|---|
| `false` | `false` | `0` | `"personal"` |
| `true` | `true` | `0` | `"personal"` — foyer commencé, laissé à une bouche |
| `true` | `true` | `1` | `"household"` |
| `true` | `false` | `3` | `"personal"` — **le cas qui produirait `not_owner`** |
| `true` | `false` | `0` | `"personal"` |
| `false` | `true` | `5` | `"personal"` — état incohérent, direction sûre |

---

## §4bis — Ce que `ReferenceMemberCard` doit faire

### L'état actuel, vérifié

`HouseholdPage.tsx:984-1025`. La garde de vacuité existante, ligne **993** :

```ts
const eligible = household.members.filter((m) => m.ageState === "adult");
// UN SEUL ADULTE (ou aucun) ⇒ RIEN À TRANCHER.
if (eligible.length < 2) return null;
```

Elle compte des **adultes**. L'utilisateur ne comprend pas ce que la section fait là — et il a
raison : dans un foyer de deux adultes qui n'ont **rien déclaré**, ou qui ont déclaré la
**même** direction, la question « laquelle des deux façons de manger le plat commun suit »
n'a **aucun sujet**. La carte s'affiche quand même.

### L'intention

> La section ne s'affiche que si **au moins deux adultes portent des directions de service
> DIFFÉRENTES**.

### Ce que « direction de service » veut dire, exactement

Vérifié dans `supabase/functions/_shared/keel/household_portions.ts` :

- `SERVING_DIRECTION` (`:146-172`) — six chaînes anglaises, une par `MemberGoal`
- `NEUTRAL_DIRECTION = "balanced share of every component"` (`:184`) — l'assiette de qui n'a
  rien déclaré
- `CHILD_DIRECTION = "child-size share of the same dish"` (`:187`) — un mineur
- `servingDirectionFor(member)` (`:331-337`) — **la seule fonction qui choisit entre les
  trois** :
  ```ts
  if (member.ageState === "minor") return CHILD_DIRECTION;
  return goalApplies(member) && member.goal ? SERVING_DIRECTION[member.goal] : NEUTRAL_DIRECTION;
  ```
- `goalApplies` (`supabase/functions/_shared/keel/household.ts:150-159`) — `adult` ⇒ `true` ;
  `minor` ⇒ `true` sauf `MINOR_FORBIDDEN_GOALS = ["fat_loss","recomposition"]` (`:137-140`) ;
  **`unknown` ⇒ `false`**, et c'est le sens sûr

⚠️ **LE PIÈGE À NE PAS REFAIRE.** Comparer les **jetons d'objectif** au lieu des **chaînes**
est faux, et le dépôt l'a déjà payé : `NEUTRAL_DIRECTION` et `SERVING_DIRECTION.maintenance`
sont **la même chaîne** (`"balanced share of every component"`, `:171` et `:184`). Un foyer
`{maintenance, aucun objectif}` a **deux jetons différents** et **une seule direction**. La
carte s'afficherait sans sujet — exactement le défaut que R3 demande de fermer. Le fichier
porte lui-même la cicatrice jumelle : `health` a rendu **exactement** la chaîne de
`maintenance` pendant des semaines, et rien n'a échoué (`:155-160`).

### La condition exacte

```ts
/**
 * COMBIEN DE DIRECTIONS DE SERVICE DISTINCTES CE FOYER PORTE-T-IL ?
 *
 * ⚠️ ON COMPARE LES CHAÎNES, PAS LES JETONS. `NEUTRAL_DIRECTION` est
 * EXACTEMENT `SERVING_DIRECTION.maintenance`: deux objectifs différents
 * peuvent demander la MÊME assiette, et compter les jetons ferait afficher un
 * arbitrage qui n'a pas de sujet. Le module a déjà payé ce défaut dans l'autre
 * sens avec `health`.
 *
 * ⚠️ LES MINEURS SONT HORS DU COMPTE. `CHILD_DIRECTION` est une TAILLE, pas une
 * orientation: elle ne gouverne rien et ne peut pas gagner un arbitrage
 * (`household_composition.ts:174-177`, « un mineur n'est jamais référent »).
 * Un âge INCONNU en est hors aussi: `goalApplies` rend déjà `false` pour lui,
 * donc il porte `NEUTRAL_DIRECTION` — le compter reviendrait à faire d'une
 * ignorance une position.
 */
export function distinctServingDirections(
  members: readonly { ageState: MemberAgeState; goal: string | null }[],
): string[];
```

**Le prédicat de montage, côté écran :**

```ts
const directions = distinctServingDirections(
  household.members.filter((m) => m.ageState === "adult"),
);
if (!isOwner || directions.length < 2) return null;
```

### Où vit la condition, et pourquoi là

**`distinctServingDirections` vit dans `supabase/functions/_shared/keel/household_portions.ts`**,
avec les six chaînes qu'elle lit. Le front l'atteint par un **pont mince**
`frontend/src/keel/api/servingDivergence.ts`, sur le patron **déjà en production** de
`frontend/src/keel/api/groceryWaves.ts` — dont l'en-tête (`:6-26`) porte le raisonnement mot
pour mot :

> « Jusqu'au 2026-08-10 il RECOPIAIT l'algorithme […]. Deux définitions d'une même règle
> physique sont une divergence en attente […]. L'argument d'alors (« les modules Deno ne sont
> pas importables par Vite ») ne tenait pas à la vérification. […] **SI TU AJOUTES UNE RÈGLE
> ICI, TU AS RECRÉÉ LE JUMEAU.** »

Faisabilité vérifiée le 2026-08-13 :

- clôture d'imports de `household_portions.ts` : `./household.ts` (→ `./student_age.ts`),
  `./forbidden_matcher.ts` (aucun import), `./meal_body.ts` (→ `student_age.ts`,
  `student_body.ts`, `household.ts`)
- **zéro** spécificateur `jsr:` / `npm:` / `https:` et **zéro** `Deno.` dans toute la clôture
- `allowImportingTsExtensions: true` est actif (`frontend/tsconfig.app.json`)
- le front importe **déjà** `student_age.ts`, `student_body.ts`, `tokens.ts`,
  `grocery_waves.ts` (qui lui-même tire `meal_generation.ts`, 3 282 lignes)

⚠️ **DÉCISION PRISE CONTRE UNE NOTE EXISTANTE, EN CONNAISSANCE DE CAUSE.**
`frontend/src/keel/i18n/servingDirections.int.test.ts:16-20` affirme : *« L'importer depuis le
front ferait entrer tout `supabase/functions/` dans le graphe de vitest, pour trois
constantes. »* Cette phrase est **fausse pour ce module-ci** (clôture de 5 fichiers purs) et
elle est déjà contredite en production par `groceryWaves.ts`. Elle reste **vraie pour son
propre besoin** (ce test lit le fichier comme du TEXTE pour épingler les six chaînes sur deux
pages de vente, et il continue). **Lot D ne touche pas à ce test.**

### Ce que cette garde ne divulgue pas

⚠️ FF-043 R3 interdit un référent **DÉRIVÉ** d'une métrique ou d'un ordre d'objectifs, parce
que *« connaître le référent reviendrait à connaître l'objectif le plus bas de la maison »*
(`frontend/src/keel/api/household.ts:94-101`). Une garde de vacuité fondée sur les objectifs
fait de la **présence** de la carte un signal.

**Elle est sûre ici, et pour une raison précise : la carte est `isOwner`-only.** C'est le
maître qui a saisi les objectifs de chaque bouche (`keel_household_set_member_goal`). Il
n'apprend rien qu'il n'ait écrit. Aucun secondaire, aucun mineur ne voit cette carte — ni
avant ni après le lot. **Si un lot futur rend cette carte à quelqu'un d'autre, la garde de
vacuité doit tomber avec.**

---

## §5 — L'ordre d'exécution et les points de rendez-vous

### 5.1 · Le graphe

```
                    ┌──────────────────────────────────┐
   T0               │  LOT D · commit d'OUVERTURE      │
                    │  en.ts · fr.ts · catalog.ts      │
                    │  planRefusals.ts                 │
                    │  + 2 placeholders                │
                    └───────────────┬──────────────────┘
                                    │ signal S1
              ┌─────────────┬───────┴───────┬──────────────┐
   T1         ▼             ▼               ▼              ▼
         LOT A         LOT D (suite)     LOT C          LOT E
       (backend)        (l'écran)      (brouillon)    (la part)
              │             │               │              │
              └──────┬──────┴───────┬───────┴──────────────┘
                     │ signal S2    │ signal S3
   T2                ▼              ▼
              LOT C (câblage)  LOT E (câblage)
                     │              │
   T3                └──────┬───────┘
                            ▼
                        PHASE 3
```

### 5.2 · Les signaux, vérifiables en une commande

| Signal | Condition exacte | Commande de vérification |
|---|---|---|
| **S1** | Le commit d'ouverture de D est dans l'arbre : les 6 clés supprimées de §3.3 ont disparu des deux fichiers, et les ~35 clés créées de §3.4 y sont | `git grep -c '"plan.envy.title"' -- frontend/src/keel/i18n/ ` → **2** (en + fr)<br>`git grep -c '"plan.hand.owner_note"' -- frontend/src/keel/i18n/` → **0**<br>`git grep -l 'PlanDraftDialogProps'` → le fichier existe |
| **S2** | Lot A a livré la signature du brouillon **et** celle de la raison | `git grep -c 'export function explainPlanChoices' -- supabase/functions/_shared/keel/plan_rationale.ts` → **1**<br>`git grep -c '"draft"' -- supabase/functions/generate-meal-v1/index.ts supabase/functions/generate-household-meal-v1/index.ts` → **≥ 2** |
| **S3** | Lot D a livré le point de montage de la part | `git grep -c '<MyShareCard' -- frontend/src/keel/pages/StudentWeekPlanPage.tsx` → **1** |

### 5.3 · Ce qui tourne en parallèle, et ce qui ne le peut pas

| Peut tourner en même temps | Pourquoi |
|---|---|
| **A ‖ D (suite)** | zéro fichier commun après S1 |
| **A ‖ C (module pur)** | `plan_draft_note.ts` est neuf ; C n'ouvre aucun `index.ts` |
| **A ‖ E (api/myShare.ts)** | fichier neuf, imports en lecture seule |
| **D (suite) ‖ C ‖ E** | après S1, les trois fichiers de composants sont disjoints |

| Doit attendre | Signal | Pourquoi |
|---|---|---|
| **Tout le monde → S1** | S1 | `en.ts`/`fr.ts` sont le point de contention n°1 : quatre lots y écrivent, et le type de `fr.ts` fait échouer `tsc -b` au moindre décalage |
| **C (câblage de la fenêtre) → S2** | S2 | sans `intent: "draft"` côté serveur, C n'a rien à afficher et le bouton mentirait |
| **E (câblage) → S3** | S3 | `MyShareCard` doit être **monté** avant d'avoir un corps, sinon E livre un composant que personne ne rend — le mode d'échec n°1 du dépôt (`request_report.ts` : livré, vert, zéro appelant) |
| **Phase 3 → S2 ∧ S3** | les deux | un agent navigateur sur un écran à moitié câblé rapporte des défauts qui ne sont pas des défauts |

### 5.4 · La règle de collision inter-sessions

⚠️ Le dépôt est **partagé avec d'autres sessions**. `git status` au démarrage de ce chantier
montrait déjà 200+ fichiers modifiés par des lanes étrangères, dont `frontend/src/keel/i18n/en.ts`.

- **⛔ `git stash` est INTERDIT** — il emporte les 200+ fichiers des autres sessions.
- **⛔ `git checkout -- <fichier>` sur un fichier hors de ton lot** — même effet, en plus discret.
- Pour comparer avec l'état d'avant : `git show HEAD:<chemin>`, jamais `git stash`.
- Tout fichier écrit dans `scratchpad/` porte un **horodatage** dans son nom.

---

## §6 — Les pièges nommés

Chacun a été vérifié dans le dépôt. Aucun n'est inventé.

### 6.1 · `household_id is not null` ne veut PAS dire « plan du foyer »

`generate-meal-v1` estampe `household_id` sur un plan **PERSONNEL**, exprès, pour que la fusion
le retrouve. **Seul `plan_kind` dit la nature.**

Mesuré **deux fois** le 2026-08-12, dans deux lecteurs indépendants
(`supabase/functions/_shared/keel/household_plan_kind_readers_test.ts:1-25`) :
`household_turn_context.ts` décrivait au chat le plan personnel d'un membre comme le dîner de
la maison ; `frontend/src/keel/api/household.ts::loadHouseholdMeal` vidait la carte du foyer
dès qu'un secondaire générait un plan personnel commençant plus tard.

**Le test qui scanne** (`household_plan_kind_readers_test.ts:42-77`) parcourt une liste de
lecteurs et exige, pour **chaque** requête sur `student_generated_meals` qui filtre par
`household_id`, un `.eq("plan_kind", "household")` dans les 1 200 caractères suivants. La
liste est ouverte (`:31-40`) :

> **Si ton lot écrit un nouveau lecteur qui filtre par foyer, AJOUTE-LE à `READERS`.**

Le fichier porte aussi deux autres cas : `loadMemberPersonalPlan` doit garder son
`.eq("user_id")` **et** son `.eq("plan_kind","personal")` (`:80-110`), et
`generate-household-meal-v1/index.ts` doit continuer d'écrire `plan_kind: "household"`
(`:112-125`).

### 6.2 · `loadMealPlans` est scopé `user_id` — le secondaire ne voit RIEN

`frontend/src/keel/api/mealGeneration.ts:806-838`, ligne **817** : `.eq("user_id", userId)`.
Le plan du foyer est écrit sur le compte du **maître**. Un secondaire qui n'a pas pris la main
n'a aucune ligne à lui : `/app/plan` lui rend `meals.result.empty` alors qu'un plan existe et
qu'il est lisible par RLS.

**Ce n'est pas un bug à réparer dans `loadMealPlans`.** Le scope est correct — cicatrice du
dépôt : *« RLS ne remplace pas un `.eq(user_id)` »*, ce dépôt a déjà rendu la ligne d'un élève
à son coach faute de ce filtre. Lot E lit le plan du foyer par **une seconde requête**,
`loadHouseholdMeal` (`api/household.ts:1243`), qui filtre `plan_kind='household'`.

### 6.3 · `cookedPlans()` — s'il existe une ligne `household`, elle SEULE est rendue

`frontend/src/keel/api/mealGeneration.ts:777-781` :

```ts
const household = rows.filter((r) => r.planKind === "household");
return household.length > 0 ? household : rows.filter((r) => r.planKind !== "household");
```

C'est **D9** : *« le maître accède à tous les plans, mais sa surface de cuisine n'affiche que
le plan qu'il cuisine »*. Ce n'est pas défensif, c'est **nécessaire** : la contrainte
d'exclusion est scopée `(user_id, plan_kind)`, donc deux plans vivants peuvent couvrir les
**mêmes jours** (`:766-771`).

**Conséquence directe pour Lot D.** Le maître qui compose depuis `/app/plan` déclenchera
`generate-household-meal-v1` (via `chooseGenerator`), donc une ligne `household`. S'il
déclenchait `generate-meal-v1` par erreur de routage, il obtiendrait : trente secondes
d'attente, un appel modèle **payé**, un `replaces` qui ne retire rien, et **rien à l'écran** —
`cookedPlans` masquerait le plan personnel derrière la ligne `household`. C'est le
raisonnement complet du bloc de commentaire de `MealBuilder.tsx:578-595`, et c'est pourquoi la
constante `householdOwner` (`:596`) existait. **Elle ne peut tomber qu'avec le routage en
place.**

### 6.4 · Le recalage au lundi ISO est une DÉPENDANCE, pas une constante

`frontend/src/keel/pages/HouseholdPage.tsx` :

```ts
:227  const weekStart = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
:238  const envyWeek  = React.useMemo(() => weekStartFor(weekStart, "mon"), [weekStart]);
:309  }, [userId, weekStart, envyWeek]);
```

Le commentaire du dépôt (`:302-308`) est explicite : *« Une fermeture périmée ici referait le
même trou côté écran : le lundi capturé au montage survivrait au passage à la semaine
suivante, et la carte lirait la mauvaise ligne sans qu'aucune erreur ne se produise. »*

⚠️ **Et il reste un défaut RÉEL, non fermé, que le déménagement rend PLUS visible.**
`weekStart` est un `useMemo` de dépendances `[]` : il capture **aujourd'hui au montage**. Un
onglet laissé ouvert du dimanche au lundi lit encore l'ancre de la semaine passée.

⚠️ **Et un second, plus grave, que Lot D doit connaître.** Le front écrit l'envie sur
`weekStartFor(AUJOURD'HUI, "mon")` (`HouseholdPage.tsx:238`, `:453`), mais le générateur la
relit sur **`weekStartOf(startsOn)`** — le lundi ISO de la **date de départ du plan**
(`supabase/functions/generate-household-meal-v1/index.ts:1653-1659`, `weekStartOf` défini dans
`_shared/keel/weekly_flow_io.ts:23-28`). Tant que la fenêtre était codée en dur
(`until_sunday`, donc démarrant aujourd'hui), les deux ancres coïncidaient. **Dès que Lot D
donne au maître deux champs de date libres, un plan composé samedi pour une fenêtre démarrant
lundi lira une ancre d'envie que personne n'a écrite** — et l'envie disparaît en silence.

**Ce que Lot D doit faire :** ancrer l'écriture de l'envie sur **`weekStartFor(windowStart,
"mon")`**, la même date que le générateur relira, et pas sur aujourd'hui. Recalculer à chaque
changement du champ de date (dépendance de `useCallback`, pas constante de montage).

⚠️ **Observation, non traitée dans ce chantier** : `loadEnvyLine`
(`frontend/src/keel/api/household.ts:1098-1108`) n'a **pas** de `.eq("household_id", …)` — elle
s'en remet à RLS. Un compte n'appartient qu'à un foyer, donc c'est sans effet aujourd'hui.
`⚠️ NON VÉRIFIÉ` : je n'ai pas prouvé qu'aucun chemin ne permet à un compte d'être dans deux
foyers. Ne pas « réparer » en passant ; le signaler si un lot le rencontre.

### 6.5 · `frontend/tsconfig.json` ne vérifie RIEN

```json
{ "files": [], "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }] }
```

C'est un **fichier de solution**. La vraie configuration est `tsconfig.app.json`
(`include: ["src"]`, `strict: true`, `allowImportingTsExtensions: true`,
`verbatimModuleSyntax: true`, `erasableSyntaxOnly: true`).

**La commande est `npx tsc -b` depuis `frontend/`.** Un `tsc --noEmit` nu ne vérifie rien et
rend vert sur du code cassé.

⚠️ `tsconfig.app.json` **exclut** `**/*.test.*` et `**/*.spec.*`. Un type cassé dans un
`.int.test.ts` ne remonte pas au typecheck : il remonte à `vitest`.

### 6.6 · Un module livré, vert, à zéro appelant

`request_report.ts` (556 l.) et `request_report_gate.ts` (253 l.) sont **complets, testés et
verts**. Vérifié le 2026-08-13 par `grep` sur les quatre symboles exportés
(`reportOnRequest`, `gateRequestReport`, `extractRequestedTerms`, `absentTermsOf`) : **aucun
appelant en production**, uniquement leurs propres tests et deux scripts de rejeu dans
`scratchpad/`. `FF-061-RAPPORT.md:296` le dit lui-même : *« Aucun câblage de production. »*

C'est le mode d'échec n°1 du dépôt : **construire un lot et ne pas le brancher**. Lot A doit
le câbler, et Lot E doit s'assurer que `MyShareCard` est **monté** avant d'être écrit (§5.3).

### 6.7 · `Modal` rend `null` fermé — l'appelant garde son état

`frontend/src/keel/components/ui/Modal.tsx:82`. Il **ne démonte pas** ses enfants au sens de
l'état de l'appelant : celui-ci conserve son `useState`. C'est ce qui fait qu'un brouillon de
saisie survit à une fermeture accidentelle, et c'est pour ça que les modales sont montées **en
permanence** (`StudentWeekPlanPage.tsx:1742-1745`, `MealBuilder.tsx:1063-1065`,
`SetupPage.tsx:2411-2413`).

⚠️ **Le corollaire, payé deux fois.** Un formulaire dont l'état est figé par `useState(() =>
…)` au montage affiche du **vide qu'il n'a pas encore lu** — puis l'écrase au `Save`. Cicatrice
nommée dans `StudentWeekPlanPage.tsx:1645-1658` et corrigée dans `MealPickerGrid.tsx:73-96`
par une empreinte de resynchronisation (`savedPrint`). **Tout formulaire ajouté par ce
chantier a besoin d'une porte de chargement.**

### 6.8 · Une seule grille de présence

`MealPickerGrid` est montée par **trois** écrans : `/app/plan` (`MealBuilder.tsx:1067`),
`/app/household` (`HouseholdPage.tsx:1342`) et `/app/setup` (`SetupPage.tsx:2414`). Elle
**reprend les jours HORS fenêtre tels quels** au `save`, sinon marquer un week-end effacerait
« jeudi midi ». Une seconde implémentation *« aurait fini par en effacer la moitié »*
(`SetupPage.tsx:2384-2387`).

**⛔ Aucun lot n'écrit une seconde grille.** Le lot qui a besoin d'une grille par bouche monte
N fois celle-ci, comme `SetupPage.tsx:2400-2434`.

### 6.9 · Ne jamais fusionner `awayHousehold` et `awaySelf`

`frontend/src/keel/api/household.ts:58-73`. La grille **réécrit ce qu'on lui donne** : nourrie
de l'union, elle **recopierait** la déclaration de la personne dans la colonne du maître, où
elle survivrait à sa rétractation. L'absence resterait marquée alors que son auteur l'a
retirée, et personne ne comprendrait d'où elle vient.

### 6.10 · Le fuseau, et les deux sources qui ne sont pas les mêmes

| Fonction | Sources, dans l'ordre | Refus si vide |
|---|---|---|
| `generate-meal-v1` | `plan_versions.timezone` (`status='published'`, `:741-747`) **puis** `profiles.timezone` (`:749-757`) | `local_day_unresolved` (409, `:770-777`) |
| `generate-household-meal-v1` | `profiles.timezone` du **maître seul** (`:872-880`) | `local_day_unresolved` (409, `:881-888`) |

*« Le foyer n'a qu'un calendrier, celui de la personne qui compose »* (`:868-871`).
`local_date.ts` **jette** plutôt que de replier sur UTC (`:8-12`) : *« Mieux vaut un tour qui
échoue bruyamment qu'un dîner rangé la veille. »*

### 6.11 · Le runtime edge sert des `_shared` périmés

Un fichier **modifié** dans `supabase/functions/_shared/` n'est **pas** rechargé par la pile
locale. **Redémarrer le runtime avant tout run réel**, sinon Lot A mesurera l'ancien code en
croyant mesurer le nouveau.

### 6.12 · 401 « Invalid JWT » en local

⛔ **Ne touche à rien.** Un 401 sur une fonction edge pendant que PostgREST répond est
l'algorithme de signature de la pile locale, jamais un bug de l'écran qui échoue. Seul geste
autorisé : `./scripts/check-local-jwt-alg.sh`, puis lire `docs/keel/JWT-HS256.md`.
`supabase/signing_keys.local.json` **doit rester `[]`**.

### 6.13 · Les commandes à risque

⛔ **JAMAIS seul, par aucun lot** : `supabase secrets set/unset`, `supabase db reset`,
`supabase db push`, `supabase functions deploy`, `supabase config push`, `supabase link`,
et toute écriture de secrets via la Management API. Le hook
`.claude/hooks/block-risky-commands.sh` les bloque. Si un lot en a besoin : il **s'arrête**,
donne la commande exacte à copier-coller, et laisse l'humain l'exécuter.

⚠️ **`supabase migration up` est autorisé en local ; `db reset` est INTERDIT depuis le
2026-08-10, même en local.** Ce chantier ne prévoit **aucune migration**. Si un lot en écrit
une, c'est un signal d'arrêt : elle n'est pas dans ce contrat.

---

## §7 — Les commandes de vérification

### 7.0 · Le préambule, pour tout le monde

```bash
# ⚠️ L'ENVIRONNEMENT DOIT ÊTRE PURGÉ. Une variable SUPABASE_* héritée du shell fait
# basculer des dizaines de tests keel vers une vraie pile et rend 114 FAUX ROUGES.
for v in $(env | grep -o '^SUPABASE_[A-Z_]*'); do unset "$v"; done
```

### 7.1 · Lot A — backend

```bash
cd "/Users/ahmedamara/Dev/Sophia 2"

# 1. Les tests keel — TOUS. Le gate les lance, il ne les compte pas.
for v in $(env | grep -o '^SUPABASE_[A-Z_]*'); do unset "$v"; done
deno test --allow-read --allow-env supabase/functions/_shared/keel/

# 2. Le module neuf, seul, pendant l'itération
deno test --allow-read --allow-env supabase/functions/_shared/keel/plan_rationale_test.ts

# 3. La garde du plan_kind — elle scanne les DEUX generateurs
deno test --allow-read --allow-env supabase/functions/_shared/keel/household_plan_kind_readers_test.ts

# 4. Les deux entrées compilent
deno check supabase/functions/generate-meal-v1/index.ts
deno check supabase/functions/generate-household-meal-v1/index.ts

# 5. ⚠️ LA DÉRIVE DES REFUS — un jeton ajoute cote serveur fait rougir un test FRONT
cd frontend && npx vitest --config vitest.config.ts run src/keel/copy/planRefusals.int.test.ts
```

### 7.2 · Lot D — frontend (le plus large)

```bash
cd "/Users/ahmedamara/Dev/Sophia 2/frontend"

# 1. Le typecheck. ⚠️ `tsc -b`, PAS `tsc --noEmit`: tsconfig.json porte `files: []`.
npx tsc -b

# 2. Les trois gardes i18n, dans cet ordre
npx vitest --config vitest.config.ts run src/keel/i18n/parity.int.test.ts
npx vitest --config vitest.config.ts run src/keel/i18n/pageSeams.int.test.ts
npx vitest --config vitest.config.ts run src/keel/i18n/pageFrontier.int.test.ts

# 3. Toute la suite d'intégration front
npx vitest --config vitest.config.ts run

# 4. Le lint, SUR TES FICHIERS SEULEMENT
npx eslint src/keel/pages/StudentWeekPlanPage.tsx src/keel/components/MealBuilder.tsx

# 5. ⚠️ LE ROUGE QUI N'EST PAS LE TIEN — doit rendre EXACTEMENT 8 erreurs
npx eslint src/keel/i18n/en.ts

# 6. La condition de vacuite, cote serveur
cd .. && for v in $(env | grep -o '^SUPABASE_[A-Z_]*'); do unset "$v"; done
deno test --allow-read --allow-env supabase/functions/_shared/keel/household_portions_test.ts
```

### 7.3 · Lot C — le brouillon

```bash
cd "/Users/ahmedamara/Dev/Sophia 2"
for v in $(env | grep -o '^SUPABASE_[A-Z_]*'); do unset "$v"; done
deno test --allow-read --allow-env supabase/functions/_shared/keel/plan_draft_note_test.ts

cd frontend
npx tsc -b
npx vitest --config vitest.config.ts run src/keel/api/planDraft.int.test.ts
npx eslint src/keel/components/plan/PlanDraftDialog.tsx src/keel/api/planDraft.ts
```

### 7.4 · Lot E — la part du réclamé

```bash
cd "/Users/ahmedamara/Dev/Sophia 2/frontend"
npx tsc -b
npx vitest --config vitest.config.ts run src/keel/api/myShare.int.test.ts
npx eslint src/keel/components/plan/MyShareCard.tsx src/keel/api/myShare.ts

# ⚠️ La garde qui verifie que ton lecteur filtre bien plan_kind
cd .. && for v in $(env | grep -o '^SUPABASE_[A-Z_]*'); do unset "$v"; done
deno test --allow-read --allow-env supabase/functions/_shared/keel/household_plan_kind_readers_test.ts
```

### 7.5 · Le gate commun, avant de rendre la main

```bash
cd "/Users/ahmedamara/Dev/Sophia 2"
./scripts/agent-gate.sh
```

Il enchaîne, dans cet ordre (`scripts/agent-gate.sh`) :
1. `check-local-jwt-alg.sh --static` — l'alignement JWT local ne se défait pas
2. le compte de tests (baseline `scripts/.test-count-baseline`)
3. `deno test --allow-read --allow-env supabase/functions/_shared/keel/` avec l'environnement
   purgé (`:143-146`)
4. `cd frontend && npm exec -- tsc -b --noEmit` (`:152-154`)
5. `deno check` sur trois entrées de `sophia-brain` (`:157-161`)
6. `eslint` **sur les fichiers frontend modifiés** (`:169-173`)

⚠️ **Le point 6 va rendre les 8 erreurs d'`en.ts`** dès que Lot D le modifie. C'est attendu
(§3.5) : ce rouge appartient à une autre session. **Ne pas le réparer pour faire verdir le
gate.**

### 7.6 · Phase 3 — les agents navigateur

```bash
cd "/Users/ahmedamara/Dev/Sophia 2"
./scripts/local_extend_kong_functions_timeout.sh   # ⚠️ AVANT tout run long: Kong 502 = faux tours perdus
```

Les trois écrans à parcourir, dans les quatre états de §1 :
`/app/setup` → `/app/plan` → `/app/household`.
Fixture obligatoire : un plan **publié** — sans lui, aucun effet n'est observable.
⚠️ Le harnais QA plafonne à **3 sièges** : un 4e élève plante le run en cours.
⚠️ Un profil de navigateur partagé = **auth partagée** entre onglets de même origine ; utiliser
des profils distincts par persona.
Rapports : `scratchpad/RAPPORT-QA-PLAN-<AGENT>-20260813.md`, jamais un nom non horodaté.

---

## Annexe A — L'état des lieux, re-vérifié le 2026-08-13

Tout ce qui suit a été **relu dans le dépôt**, pas repris du brief.

### A.1 · `HouseholdPage.tsx` (2 057 l.) — ordre de montage réel

| # | Ligne | Composant (déf.) | Titre | Condition | Devenir |
|---|---|---|---|---|---|
| 0 | 370 | `CreateCard` (548) | `household.empty.title` | pas de foyer | reste |
| 1 | 375 | `PausedCard` (1799) | pause | `frozen` | reste |
| 2 | 381 | `MeCard` (690) | « Toi aussi, tu manges ici » | `me && ownerGoalRow!==null` | reste |
| 3 | 403 | `AddMouthCard` (782) | ajouter une bouche | `isOwner` | reste |
| 4 | 411 | `MembersCard` (855) | qui mange ici | toujours | reste |
| 5 | **440** | **`ReferenceMemberCard` (984)** | `household.reference.title` | `isOwner` | **→ `/app/plan`, + garde de vacuité** |
| 6 | **449** | **`EnvyCard` (1539)** | `household.envy.title` | montée « toujours », mais `:1554` fait `return null` si non-maître ⇒ **maître seul en pratique** | **→ dans le formulaire de `/app/plan`** |
| 7 | **455** | **`ComposeCard` (1863)** | `household.compose.title` | `canCompose` | **SUPPRIMÉE** |
| 8 | 462 | `HouseholdMergeCard` | fusion | `isOwner` | reste |
| 9 | **463** | **`TableCard` (2027)** | `household.portions.title` | `meal !== null` | **→ `/app/plan`** |
| 10 | 470 | `HouseholdPlanCard` | ce que le foyer cuisine | `meal !== null` | reste |
| 11 | 478 | `InviteCard` (1618) | invitation | toujours | reste |

⚠️ **Ce que `HouseholdPage` garde, et pourquoi.** Après le lot il reste **la page de qui mange
ici** : le roster, les corps, les allergies, les interdits, les invitations, la fusion. C'est
cohérent : le foyer décrit **les gens**, `/app/plan` fabrique **la semaine**.

### A.2 · Les trois formulaires de demande qui coexistent aujourd'hui

| Formulaire | Où | Ce qu'il demande | Ce qu'il appelle |
|---|---|---|---|
| **`MealBuilder`** (1 222 l.) | `/app/plan` (`StudentWeekPlanPage.tsx:2042`) | mode, 2 dates, `servings`, jours, temps, budget, garde-manger, préférences, contexte, grille d'absences | `generate-meal-v1` |
| **`ComposeCard`** | `/app/household:1863-2007` | **le budget SEUL** (`:1940-1956`). `cookDays` et `cookingTimeMin` relus (`:1878-1887`) et réécrits sans être demandés (`:1975`). Fenêtre **codée en dur** `{kind:"until_sunday"}` (`:1979`) | `generate-household-meal-v1` |
| **`SetupPage` étape « request »** | `/app/setup:2190-2440` | 2 dates exactes, jours, durée (liste fermée + valeur hors liste conservée), budget chiffré, **grille de présence par bouche** | routage `:799-801` |

**Le formulaire de référence est celui de `SetupPage`**, parce qu'il pose déjà les deux
questions que `ComposeCard` ne pose pas : les **dates** et la **présence par bouche**.

### A.3 · Le routage à extraire — `SetupPage.tsx:799-801`

```ts
const mouthCount = fresh.mouths.length + (fresh.householdId ? 1 : 0);
if (fresh.isOwner && mouthCount >= 2) { await generateHouseholdMeal({ … }) }
else { await generateMeal({ …, servings: 1, … }) }
```

Le commentaire du dépôt (`:793-798`) porte la moitié qui compte : *« `isOwner` EST LA MOITIÉ
DU ROUTAGE, pas une précaution. `generate-household-meal-v1` rend 403 `not_owner` à un
secondaire […]. Router sur le seul nombre de bouches enverrait toute personne ayant réclamé
son profil droit dans un refus que rien ne peut fermer. »*

### A.4 · Le contrat d'entrée des générateurs, vérifié

**`generate-meal-v1`** — aucune interface déclarée ; corps lu champ par champ depuis un
`Record<string, unknown>` (parsing `:310`).

| champ | type | requis | ligne |
|---|---|---|---|
| `mode` | `"from_pantry" \| "to_shop"` | **oui** | 317-324 → `mode_required` |
| `window` | `until_sunday` \| `days` \| `exact{starts_on,duration_days}` | **oui** | 334-342 → `window_required` |
| `intent` | `replace_current` \| `prepare_next` (défaut `replace_current`) | non | 346-352 → `unknown_intent` |
| `replaces` | uuid | **oui si `replace_current`** | 368-374 → `replaces_required` |
| `meal_slot` | un de `MEAL_SLOTS` | non | 483-487 — inconnu = **ignoré + `issues`**, pas refusé |
| `servings` | number, clampé `[1,12]` | non | 489 |
| `context`, `preferences` | string ≤ 2000 | non | 490, 494 |
| `pantry` | ≤ 60 items | **oui si `from_pantry`** | 495 → `pantry_required` (502) |

Budget, rythme, jours de cuisine, absences sont **relus en base**, jamais reçus (`:1644-1652`).
Écriture : RPC `write_student_meal_plan` (`:1590-1597`), `plan_kind: "personal"` dans
`p_payload` (`:1606`).

**`generate-household-meal-v1`** — parsing `:679`.

| champ | type | requis | ligne |
|---|---|---|---|
| `operation` | `compose` \| `merge` \| `unmerge` (défaut `compose`) | non | 790-799 |
| `merge_member_id` / `unmerge_member_id` | string | selon `operation` | 800-822 |
| `intent`, `replaces` | idem lane individuelle | **branche `compose` seulement** | 825-842 |
| `window` | mêmes 3 formes | **oui, branche `compose` seulement** | 1107-1114 |
| `context`, `preferences` | string ≤ 2000 | non | 2386-2387 |

Pas de `mode` (forcé `to_shop`, `:2957`), pas de `meal_slot` (`null`, `:2958`), pas de `pantry`
(`[]`, `:2962`), pas de `servings` client (déduit de la présence, `:2966`).
Écriture : RPC `write_student_meal_plan` (`:2944-2951`), `plan_kind: "household"` dans
`p_payload` (`:2973`).

⚠️ **`readWindowRequest` est DUPLIQUÉ, pas partagé** : `generate-meal-v1:234-250` et
`generate-household-meal-v1:261-278`. Sémantiquement identiques, écrits différemment. Seul le
type `MealWindowRequest` est partagé. **Lot A ne les unifie pas** (hors périmètre) mais doit
modifier **les deux** s'il touche au vocabulaire d'`intent`.

⚠️ **Aucun `draft` / `preview` / `dry_run` n'existe aujourd'hui.** Vérifié : zéro occurrence
dans les deux `index.ts`, `meal_generation.ts` et `household_meal_generation.ts`. Les seuls
chemins « n'écrit rien » sont des **abandons** (`generate-household-meal-v1:1816`, `:2514`,
`:2879`), jamais un mode.

### A.5 · Où la fenêtre se résout

`supabase/functions/_shared/keel/meal_plan_window.ts:235-261` (`resolveRequestedWindow`) :

- `until_sunday` (`:239-242`) — `startsOn = today`, durée = ce qu'il reste jusqu'à dimanche.
  Un dimanche ⇒ **1 jour**, rendu tel quel.
- `days` (`:243-249`) — borné par `MAX_WINDOW_DAYS = 7` (`:52`), sinon `throw`
- `exact` (`:250-260`) — durée `[1,7]`, format `YYYY-MM-DD`, **départ dans le passé refusé**

Appels : `generate-meal-v1:785` (→ 400 `bad_window` `:790`),
`generate-household-meal-v1:1117` (→ `:1122`).

### A.6 · La langue du contenu

`profiles.locale` → `resolveArtifactLocale` (`_shared/keel/locale.ts:172-179`) →
`built.contentLocale` (`generate-meal-v1:1201-1204`, `generate-household-meal-v1:1775`).

⚠️ **PAS `student_goals.content_locale`** : cette colonne dit dans quelle langue l'élève a
écrit **sa situation** (R3, troisième axe), et *« tous ses écrivains la sèment `'en-GB'` »*
(`generate-meal-v1:1195-1200`). Lot A doit lire **la même** valeur que le reste du message,
sinon le bloc d'explication sortira en anglais au milieu d'un plan français — la cicatrice
« langue de réponse ≠ voice.language » du dépôt.

---

## Annexe B — Check-list d'ouverture, par lot

Avant d'écrire une ligne, chaque lot coche :

- [ ] J'ai lu §2 et je connais **la liste exacte** des fichiers que j'ai le droit d'ouvrir.
- [ ] J'ai vérifié que **S1 est passé** (§5.2) si mon lot en dépend.
- [ ] Je n'ouvre **ni** `en.ts`, **ni** `fr.ts`, **ni** `catalog.ts`, **ni** `planRefusals.ts`
      (sauf si je suis Lot D, au commit d'ouverture).
- [ ] Aucune de mes signatures ne porte de **paramètre de garde optionnel** (§4.0).
- [ ] Aucune de mes gardes n'est **recopiée** d'un module existant (§4bis, §6.8).
- [ ] Chacun de mes tests a **au moins un cas qui PASSE**.
- [ ] Je n'ai lancé **aucun** `git stash`, `git checkout --`, `supabase db reset/push`,
      `supabase functions deploy`, `supabase secrets set`.
- [ ] `npx eslint src/keel/i18n/en.ts` rend **exactement 8 erreurs**
      `no-irregular-whitespace` et rien d'autre (§3.5).
- [ ] `./scripts/agent-gate.sh` passe, aux 8 erreurs près.
