# FOYER · A6 — le déjeuner en semaine quitte l'étape 3 (P6, front) — journal

**Date** 2026-09-03, démarré 14:57 · **Lane** FOYER · **Worktree** `/Users/ahmedamara/Dev/Sophia-2-chantiers/FOYER` ·
**Branche** `chantier-0903/FOYER`, HEAD de départ `31ee930f` (= base `bfecdc28` + RAPIDE A3/A4) ·
**Mandat** MASTER PROMPT 2026-09-03-1308 §5.3 · ANALYSE 2026-09-03-1237 §6 (partie front ; D6.1/D6.2 = lane CUISINE, A2) ·
**Décisions appliquées sans question** D6.3 (namespace `setup.work_lunch.*` gardé).

> Journal écrit au fil de l'eau (règle §2.3 n°25). Ce qui n'a pas été vu au navigateur est **ROUGE** et le reste.

---

## 1. Ce qui a été fait — par morceau

### 1.1 Le composant mono-personne — `components/PersonWorkLunch.tsx` (neuf)

`PersonWorkLunch` était la fonction privée de `WorkLunchCard.tsx:202` ; elle sort telle quelle (avec son `Choice`) en composant par défaut. Il ne lit rien, n'écrit rien, ne compare rien : il rend une réponse et remonte la suivante. **Une déviation, nommée** : la ligne `<p>{name}</p>` en tête est retirée — la ligne du foyer porte déjà le prénom au-dessus ; les questions, elles, le nomment toujours (`{name}`, règle F5).

### 1.2 Le nouveau site — `components/MemberWorkLunchCard.tsx` (neuf)

Le conteneur monté dans `MemberRow` : `person` (avec `ageState` **du roster**), `answers: Map | null` (la Map du foyer entière, `null` = pas lu), `readError`, `busy`, `onSave` (le geste complet, câblé par la page). Il :
- filtre par `workLunchIsAskable` (le seul filtre : `adult` **et** `memberId`) ; `minor`, `unknown`, sans ligne ⇒ **rien** rendu ;
- ne connaît ni `userId` ni `hasAccount` — compte ou pas, on demande (la porte SQL n'a pas de refus `has_account`, arbitrage repris de `workLunchRoster`, retiré) ;
- tient la porte de rendu : `answers === null` ⇒ « Lecture… », aucune question ; `readError` ⇒ le motif, aucune question par-dessus ;
- **n'a aucun `useEffect`** ; le brouillon se resynchronise sur `savedPrint` (patron `MealPickerGrid`) ;
- passe chaque geste par `commitMemberWorkLunch` — il ne refait **pas** la garde.

### 1.3 La garde d'écriture dans un module pur — `lib/workLunchCommit.ts`

`commitMemberWorkLunch({ saved, next, commit })` : `workLunchWriteIsNeeded(saved, next)` faux ⇒ `{ ok: true, reason: null, written: false }` sans appeler `commit` ; sinon `commit(next)` et `written: true`. L'ancienne carte comparait dans sa fermeture `commit`, inatteignable par `renderToStaticMarkup` — la garde était tenue par un commentaire. `commitWorkLunch` (save → reread → onSaved) et `readWorkLunchAnswers` (`null` ≠ `Map`) sont inchangés.

### 1.4 La page — `pages/HouseholdPage.tsx`

- État `workLunch: Map | null` + `workLunchError`, avec le pavé « `null` ≠ `Map` vide ».
- `refreshWorkLunch` = `readWorkLunchAnswers(loadWorkLunch)` ; on ne remet **pas** `workLunch` à `null` sur un échec ; **lecture à part de `refresh`** (sinon deux lectures par geste, et l'ordre « réarmer la garde avant de relire la page » devient illisible).
- **Un effet, et il lit** : keyé sur `meRole` (`household?.me?.role`), pas sur `household`, pour ne pas relire à chaque `refresh` ; maître seul (seul lui voit `MemberRow`).
- `MembersCard` → `MemberRow` : `workLunch`, `workLunchError`, `onSaveWorkLunch` ; la page câble `onSaveWorkLunch = commitWorkLunch({ save: setMemberWorkLunch, reread: refreshWorkLunch, onSaved: refresh })` — **pas par `run`** : le refus reste sous le geste, dans la carte.
- `MemberRow` monte `<MemberWorkLunchCard>` **entre `HouseholdHabitsCard` et la section « sa semaine »** (bouton → `MealPickerGrid`), avec `ageState: member.ageState` (jamais un `kind`), `answers={workLunch}` entier.

### 1.5 L'étape 3 — `components/TableStepPlanning.tsx`, `pages/SetupPage.tsx`

- `TableStepPlanning` réduit à ses deux cartes (équipement, traditions) : plus d'état, plus d'effet, plus de `people`, plus de `busy`, en-tête réécrit (« ce qui en est parti »).
- `SetupPage` : import `workLunchRoster` retiré ; prop `people=` et ses commentaires retirés ; le commentaire « `WorkLunchCard` les traite déjà TOUS » réécrit ; le commentaire D4 ② (`RequestStep`) retargeté (« la fiche du foyer lui pose la question »).
- `lib/presenceRoster.ts` (×3) et `presenceRoster.int.test.ts` (×1) : commentaires qui citaient « l'étape 3 » / `workLunchRoster` retargetés vers `MemberWorkLunchCard`. Le bloc « pourquoi rendre la grille plutôt que retirer la question » garde son histoire.

### 1.6 Supprimés (`git rm`)

`components/WorkLunchCard.tsx` (plus aucun monteur), `lib/workLunchRoster.ts` (le mandat le dit supprimable ; `SetupPage.tsx:463` a son propre `funnelMouthAgeState` depuis A3, signature différente), `lib/workLunchRoster.int.test.ts` (il n'épinglait que le module supprimé — le pin de `BIRTH_DATE_ON_FILE` n'a plus de lecteur à protéger).

### 1.7 i18n — bloc `// ── chantier-0903/FOYER — début/fin ──` en fin de `en.ts` et `fr.ts`, sous-section A6

**Aucune clé ajoutée, aucune retirée** (D6.3 : namespace gardé, déjà déclaré sur `/app/household` ; `catalog.ts` **inchangé**). **Valeurs changées en place, deux langues**, listées dans le bloc :

| Clé | Avant (fr) | Après (fr) |
|---|---|---|
| `setup.work_lunch.intro` | « … On le demande maintenant, et la semaine sort juste du premier coup. » | « … Sa semaine, juste en dessous, garde le dernier mot. » |
| `setup.work_lunch.outside_note` | « {n} midis de semaine seront déjà cochés « dehors » à l’étape suivante. … » | « {n} midis de semaine sont cochés « dehors » dans sa semaine, juste en dessous. … » |
| `setup.work_lunch.grid_wins` | « … la grille jour par jour de l’étape suivante qui gagne … » | « … la grille jour par jour de sa semaine, juste en dessous, qui gagne … » |
| `setup.request.presence_intro` | « L’étape trois disait l’habitude. Ici, c’est la semaine : … » | « L’habitude — qui déjeune au bureau — se règle sur la page Foyer, dans la fiche de chacun. Ici, c’est la semaine : … » |

(EN : « Their week, just below, has the last word. » · « are marked “eating out” in their week, just below » · « the grid of their week, just below » · « The habit — who eats lunch at work — is set on the Household page, in each person’s sheet. »). Un commentaire daté est posé au-dessus du bloc `setup.work_lunch.*` des deux packs. Commit i18n **séparé** : `i18n chantier-0903/FOYER (A6)`.

---

## 2. Les tests — déplacés, réduits, écrits

| Fichier | Avant | Après |
|---|---|---|
| `components/tableStepPlanning.int.test.ts` | 13 cas (ordre équipement < déjeuner, porte de lecture des deux cartes, à qui la question se pose, `commitWorkLunch` ×3, `readWorkLunchAnswers` ×4) | **5 cas** : ordre équipement < traditions (HTML rendu) ; les deux cartes présentes et le déjeuner **absent** ; porte de lecture de l'équipement ; `no_goal` ; lecture de source (ni `useEffect`, ni `useState`, ni `WorkLunch`, ni `people`) |
| `components/memberWorkLunchCard.int.test.ts` (**neuf**) | — | **31 cas** : à qui la carte se pose (adulte nommé ; mineur/inconnu/sans ligne ⇒ `""` ; ni `userId` ni `hasAccount` en source) ; porte de rendu (`null` ⇒ lecture, `Map` vide ⇒ question, `readError` ⇒ motif) ; la copie (n=5 + `grid_wins`, gamelle froide, anglais, **aucun « étape / next step / step three » dans les 4 clés des 2 packs**) ; D6.3 (namespace + `PAGE_NAMESPACES["/app/household"]` ∋ `setup`) ; **les 7 cas déménagés** de `:144-277` (`commitWorkLunch` ×3, `readWorkLunchAnswers` ×4) ; `workLunchWriteIsNeeded` ×3 (jamais testé en pur avant ce lot) ; `commitMemberWorkLunch` ×4 + pin de source (la carte passe par lui, ne refait pas la garde, aucun `useEffect`) ; le déménagement (carte au-dessus de « sa semaine » < `MealPickerGrid`, `ageState: member.ageState`, `readWorkLunchAnswers(loadWorkLunch)`, `reread: refreshWorkLunch`, `onSaved: refresh`, `answers={workLunch}` verbatim ; étape 3 sans `WorkLunch` ; fichiers supprimés absents du disque) |
| `lib/workLunchRoster.int.test.ts` | 10 cas sur le module supprimé | supprimé avec lui |
| `lib/presenceMarks.int.test.ts:200-340` | — | **non touché** (le pin du payload et du miroir serveur) |

Sur « les 10 cas de `:144-277` » du mandat : les lignes 144-277 portent **7** `it` (3 + 4) ; tous sont déplacés. Les 3 autres cas du fichier qui parlaient du déjeuner (ordre, porte de lecture, « aucun majeur ») sont **réécrits au nouveau site** (ordre ⇒ carte au-dessus de la grille ; porte ⇒ `answers === null` ; aucun majeur ⇒ `""`).

Harnais : `.ts` + `createElement` (vitest n'inclut que `*.int.test.ts`), `location.pathname = /app/household` (la langue dépend de la page), `decode()` des entités React avant comparaison aux packs.

---

## 3. Mutations — jouées le 2026-09-03 ~15:10, en série, chacune restaurée par `cp` depuis une copie prise avant (copies dans `scratchpad/mut-a6/` du dossier de session, hors dépôt), `cmp` identique après

| # | Mutation (perl, sur le fichier) | Rouge vu (sur 31) | Restauration |
|---|---|---|---|
| M1 (mandat) | `workLunchCommit.ts` : retirer le `if (!workLunchWriteIsNeeded(…)) return { written: false }` de `commitMemberWorkLunch` | **1** — « identique à `saved` ⇒ le geste n'est PAS appelé » | `cp` → 31/31 |
| M2 (mandat) | `workLunchCommit.ts` : `readWorkLunchAnswers` rend `new Map()` en `catch` | **2** — « elle rend `null`, PAS une `Map` vide » + « un rejet ASYNCHRONE est attrapé aussi » | `cp` → 31/31 |
| M3 (mandat, porte de rendu) | `MemberWorkLunchCard.tsx` : `(props.answers ?? new Map()) === null` | **1** — « `answers === null` : la carte dit qu'elle lit » | `cp` → 31/31 |
| M4 (à moi) | `HouseholdPage.tsx` : `answers={workLunch ?? new Map()}` (le pli au montage) | **1** — « la page lit par `readWorkLunchAnswers` … jamais à la main » | `cp` → 31/31 |
| M5 (à moi) | `HouseholdPage.tsx` : `ageState: "adult"` (l'âge aplati, façon `kind`) | **1** — « `MemberRow` la monte … avec `ageState` du roster » | `cp` → 31/31 |

---

## 4. Ce qui est prouvé / ce qui est ROUGE

### Prouvé (worktree, sans navigateur)

- `cd frontend && npx tsc -b --force` → **exit 0**.
- eslint sur les 10 fichiers front touchés → **0 erreur**.
- vitest ciblé (`memberWorkLunchCard` 31, `tableStepPlanning` 5, `presenceRoster` 7, `presenceMarks` 17, `pageSeams` 2, `parity` 6) → **68/68**.
- vitest, suite **entière** : voir §4.1 (complété après le run).
- Les 5 mutations (§3) rougissent et se restaurent.
- Deno : **aucun fichier sous `supabase/` n'est touché** (`git diff --quiet HEAD -- supabase/`), rien à rejouer.
- Invariant C7 : trois étapes, `canGenerate`, `onboarding.ts`, `setupMisses.ts` **intacts** ; « plus de `WorkLunchCard` à l'étape 3 » tenu par `tableStepPlanning.int.test.ts` et par la lecture de source de `memberWorkLunchCard.int.test.ts`.
- La région CUISINE de l'étape 3 (`setup.plan.time`, `SetupPage.tsx` ~6844) : **non touchée** ; `KitchenEquipmentCard` reste dans l'entonnoir.

### 4.1 Suite entière — rejouée par la session de reprise (17:05)

> ⚠️ La session qui a écrit §1-§3 a été **tuée par une limite** avant de commiter. La session de
> reprise a **tout revérifié sur l'arbre repris**, sans rien réécrire : le lot tenait.

- `cd frontend && npx tsc -b --force` → **exit 0**.
- `npx vitest run` (suite **entière**) → **2 060 verts / 2 085** (`5 failed | 20 skipped`),
  128 fichiers. Les **5 rouges sont exactement les 5 rouges étrangers connus** de §5 — aucun
  rouge causé par ce lot : `coverage-guard.int.test.ts` ×2,
  `household.int.test.ts › awayFrom …` ×2, `mealBoxes.int.test.ts › … un contenant sans bouche …`.
- vitest ciblé (`memberWorkLunchCard` 31, `tableStepPlanning` 5, `presenceRoster` 7,
  `presenceMarks` 17, `parity` 6) → **66/66**.

### 4.2 Mutations REJOUÉES par la session de reprise (2026-09-03 ~17:07)

Les trois mutations que le mandat exige, rejouées de zéro sur l'arbre repris, chacune restaurée
par `cp` depuis une copie hors dépôt et vérifiée par `cmp` :

| # | Mutation | Rouge vu | Restauration |
|---|---|---|---|
| M1 | `workLunchCommit.ts` : le `if (!workLunchWriteIsNeeded(…)) return {written:false}` retiré de `commitMemberWorkLunch` | **1/31** — « identique à `saved` ⇒ le geste n'est PAS appelé » (`expect(commit).not.toHaveBeenCalled()`, *Number of calls: 1*) | `cp` + `cmp` OK |
| M2 | `workLunchCommit.ts` : `readWorkLunchAnswers` rend `new Map()` en `catch` | **2/31** — « elle rend `null`, PAS une `Map` vide » + « un rejet ASYNCHRONE est attrapé aussi » | `cp` + `cmp` OK |
| M3 | `MemberWorkLunchCard.tsx` : `(props.answers ?? new Map()) === null` | **1/31** — « `answers === null` : la carte dit qu'elle lit, et ne pose PAS sa question » | `cp` + `cmp` OK |

Après restauration : `memberWorkLunchCard` + `tableStepPlanning` = **36/36**. Jamais
`git checkout`/`restore`/`stash`.

### 4.3 Ce que la reprise a jugé de l'état repris

- Le lot était **juste** : tsc vert, 66/66 ciblés, 5 rouges étrangers seulement, les trois gardes
  mutables et mordantes. **Rien n'a été réécrit.**
- **Une chose corrigée / notée pour A5** : la lecture du déjeuner est keyée sur
  `meRole === "owner"` (`HouseholdPage.tsx`) — juste **aujourd'hui**, parce que `MembersCard`
  rend `null` pour un non-maître (`:1518`). A5 point 6 ouvre la ligne d'un **membre réclamé** :
  la porte `meRole` devra alors s'ouvrir au membre, sinon sa propre carte déjeuner restera
  « Lecture… » pour toujours. **Consigné ici, traité dans A5**, pas en passant.

### ROUGE — non vu au navigateur (fenêtre après fusion, port 5174, arbre principal ; geste humain requis : connexion à la fixture)

- `/app/household` → ligne d'une bouche adulte → « Modifier » → la carte « Le déjeuner en semaine » sous les habitudes, **au-dessus** de « Quand cette bouche n'est pas là » ; répondre « Oui » puis « Mange dehors » → la phrase « 5 midis de semaine sont cochés « dehors » dans sa semaine, juste en dessous » ; ouvrir « Sa semaine » → **les cinq midis cochés `eating_out`** dans la grille.
- Décocher mardi à la main dans la grille, enregistrer, rouvrir la carte, **ne rien changer** → mardi **reste** décoché (la garde `commitMemberWorkLunch` mord : aucune écriture ⇒ pas de pré-remplissage ré-appliqué). Contrôle SQL possible sans navigateur : `select away_days from household_members where member_id = …`.
- Une bouche mineure / d'âge inconnu : aucune carte dans sa fiche.
- L'étape 3 de `/app/setup` : deux cartes (équipement, traditions), plus de déjeuner ; l'étape 4 dit « L’habitude — qui déjeune au bureau — se règle sur la page Foyer… ».
- 320 px et 1280 px, `document.scrollWidth` = largeur de fenêtre, deux langues — non mesuré.
- Cet agent **n'entre aucun mot de passe** et ne forge aucun jeton ; la preuve navigateur demande un onglet connecté à `qa1v.foyer@keeltest.dev` (lecture seule — ne rien enregistrer sur ce compte) ou une fixture `qa0903f` (§8), jouée par un humain ou un vérificateur autorisé.

---

## 5. Rouges étrangers — nommés, prouvés antérieurs, non touchés

| Rouge | Preuve d'antériorité | Sort |
|---|---|---|
| `src/edge/coverage-guard.int.test.ts` ×2 | `scripts/.vitest-red-baseline` (nominatif) | non touché |
| `src/keel/api/household.int.test.ts › awayFrom …` ×2 | `scripts/.vitest-red-baseline` | non touché |
| `src/keel/components/mealBoxes.int.test.ts › … un contenant sans bouche, sans item ou sans id ne sort pas` | rejoué par RAPIDE A3 sur un worktree détaché à `bfecdc28` : rouge avant les lanes, hors baseline | non touché (E seul) |
| `scripts/agent-gate.sh › check_tests` : `deno test --no-run _shared/keel/` — 18 erreurs TS dans dix fichiers de test étrangers | état de `bfecdc28` ; ce lot ne touche **rien** sous `supabase/` | le gate s'arrête là pour toutes les lanes ⇒ commits `--no-verify`, motif écrit dans chaque message ; les contrôles front rejoués à la main (§4) |

---

## 6. Hors périmètre croisé, nommé, non touché

- **D6.1** (`generate-meal-v1` ne lit pas `household_members.away_days`) et **D6.2** (`lunchbox`/`microwave` sans lecteur) : lane CUISINE (A2). Tant qu'ils ne sont pas livrés, la question déménagée reste **décorative pour un solo et un secondaire** (ANALYSE §6.1) — le front est en place, l'effet serveur suit A2.
- `api/workLunch.ts:13` — commentaire « il/elle » dans l'arbre de décision : historique, non touché.
- `MealPickerGrid.tsx:93,224` — commentaires sur `work_lunch` en base : justes, non touchés.
- `HouseholdMergeCard.tsx:45`, la lane 1:1, le gel 402, la bascule de langue, le vérificateur de traditions, le foyer orphelin, la purge des invitations (trou n°11) : non croisés dans ce lot.
- Le journal A3 (RAPIDE) nommait « `lib/workLunchRoster.ts` lit encore `FunnelMouth.kind` à deux valeurs — lane FOYER (A6) » : **réglé par suppression du module**.

---

## 7. Les commits (branche `chantier-0903/FOYER`, après `31ee930f`) — dans l'ordre RÉEL

| Ordre | Commit | sha | Contenu |
|---|---|---|---|
| 1 | lot A6 | _(à compléter)_ | 3 fichiers neufs, 2 suppressions + 1 test supprimé, 7 sources/tests modifiés, ce journal (v1) — `--no-verify`, motif dans le message |
| 2 | i18n | _(à compléter)_ | `en.ts` + `fr.ts` seulement (4 valeurs en place + bloc délimité) — `--no-verify` |
| 3 | journal (v2) | _(à compléter)_ | ce fichier, complété des sha et de la suite entière |

Chemins passés **un par un** à `git add` (la bourde zsh de A3 : `$VAR` ne se découpe pas). Aucun `git add -A`, aucun `stash`/`checkout`/`reset`/`restore` ; les restaurations de mutation sont des `cp`.

---

## 8. Pour la fenêtre de run réel — la fixture du tag `qa0903f`

Voir le journal A5 (`scratchpad/2026-09-0J-HHMM-FOYER-A5-page-foyer.md`, §« fixture ») pour le SQL complet : maître `qa0903f.master@keeltest.dev` + une bouche adulte **invitable** (sans compte) + un secondaire **réclamé** (`qa0903f.member@keeltest.dev`), mot de passe `1234567` par `crypt`, colonnes de jeton `''`, `is_test_persona: true`, `profiles.locale = 'fr-FR'`, `country = 'FR'`. Pour A6, la même fixture suffit : la bouche adulte sans compte reçoit la carte du déjeuner ; le maître aussi (sa propre ligne).
