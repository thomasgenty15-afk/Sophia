# RAPIDE · A3 — la 4e option d'objectif (P3) — journal

**Date** 2026-09-03, démarré 13:45 · **Lane** RAPIDE · **Worktree** `/Users/ahmedamara/Dev/Sophia-2-chantiers/RAPIDE` ·
**Branche** `chantier-0903/RAPIDE`, base `bfecdc28` · **Mandat** MASTER PROMPT 2026-09-03-1308 §5.1 · ANALYSE 2026-09-03-1237 §3 ·
**Décisions appliquées sans question** D3.1 (l'option vide est la cible), D3.2 (« Manger normalement »), D3.3 (`null` en base reste valide, l'écran ne le produit plus).

> Journal écrit au fil de l'eau (règle §2.3 n°25). Ce qui n'a pas été vu au navigateur est **ROUGE** et le reste.

---

## 1. Ce qui a été fait — par morceau

### 1.1 La règle, en un seul endroit — `frontend/src/keel/api/household.ts`

- `goalsForAge(kind: "adult" | "child")` (paramètre non lu, `void kind`, « la même liste pour tout le monde » depuis le 18/08) → **`goalsForAge(ageState: MemberAgeState)`** qui **filtre** : `minor` → `["maintenance"]`, `adult` et `unknown` → les trois. La liste d'un mineur est **dérivée** (ce que `scaleDirectionOf` dit faire bouger la balance), pas recopiée.
- **`goalForAge(goal, ageState)`** (neuf) — ce que l'écran montre et écrit : une direction que l'âge ne peut pas porter devient `maintenance` ; `""` reste `""`. Deux surcharges de type (un `MemberGoal` entre, un `MemberGoal` sort).
- **`isDirectionalGoal(goal: string | null)`** (neuf) — la seule définition de « directionnel », celle de `weight_pace.ts` (`scaleDirectionOf`), la même que le CHECK `household_members_target_needs_direction_check` et que la garde SQL de `20260822041500` (arbitrage ①).
- Commentaire `goal: string | null` « Six jetons » → « Trois jetons ».

### 1.2 Le pli en lecture — `frontend/src/keel/lib/mouthForm.ts`

- **`ageStateOfTypedDate(typedBirthDate, fromRoster, today)`** (neuf) — la date tapée gagne sur le roster ; `ageStateOfDraft` devient un cas particulier (`fromRoster = "unknown"`).
- **`foldMinorGoal(draft, today)`** (neuf) → `{ draft, switchedFrom }` : plie `goal` par `goalForAge`, vide la cible et le rythme quand la direction change, **nomme** la direction remplacée. Le brouillon garde ce qui a été tapé (« on refuse, on n'efface pas », arbitrage ② transposé).
- **`mouthToPersist`** plie avant de traduire : ce qui part en base est ce que la fiche montre.

### 1.3 Le composant partagé — `frontend/src/keel/components/GoalTiles.tsx` (neuf)

Trois tuiles radio, **aucune pré-sélection**, **aucune option vide**, `goalsForAge(ageState)` filtre la liste (un mineur : une tuile « Manger normalement » + `household.goal.minor_only`), `goalForAge` décide de la coche, la phrase `household.goal.minor_switched` nomme la direction remplacée dans les mots de la page (`labelOf` vient de l'appelant). Monté sur les **six** sites.

### 1.4 Les six sites

| Site | Avant | Après |
|---|---|---|
| `MouthFormDialog.tsx` — `MouthCoreFields` (fiche, `/app/household` + entonnoir) | radiogroup à trois, pas de filtre d'âge, lecture du brouillon brut | tout ce que la fiche **lit** passe par `foldMinorGoal` (tuiles, curseur, ce qui retient le bouton, `aria-required`) ; `GoalTiles` reçoit le brouillon **brut** pour nommer la bascule |
| `SetupPage.tsx:4358` — carte du titulaire | `<select>` + `<option value="">—</option>` | `GoalTiles id="setup-goal"` ; `saveSelf` écrit `goalForAge(...)` ; `TargetAndPaceFields` reçoit le brouillon plié |
| `SetupPage.tsx:4925` — fiche d'ajout | `<select>` + « Aucune direction particulière » | `GoalTiles id="setup-mouth-goal"`, `ageStateOfDraft` ; `addMouth` envoie `goalForAge(...)` à `keel_household_add_member` et une cible pliée |
| `SetupPage.tsx:5137` — résumé d'une ligne | « Aucune direction particulière » | `—` |
| `SetupPage.tsx:5602` — ligne d'une bouche inscrite | `<select>` + option vide, `goalsForAge(m.kind)` ignoré | `GoalTiles`, âge = `funnelMouthAgeState(m, date tapée)` (trois valeurs, jamais deux) ; `onGoal: (goal: MemberGoal)` ; cible pliée |
| `HouseholdPage.tsx:983, 993` — `MouthFields` (maître en ligne + `MemberRow`) | `<select>` + « Aucune direction particulière » ; lecture « Aucune direction particulière » | `GoalTiles` (`ageState` et `radioName` **requis**), lecture `—` ; `MeCard` et `MemberRow` reçoivent `todayLocalIso` (= `weekStart`), calculent `meAge`/`rowAge` par `ageStateOfTypedDate`, et enregistrent `goalForAge(...)` |

### 1.5 L'ordre d'écriture — trois écrivains, une règle

La migration `20260822041500` pose deux refus symétriques : `set_member_birth_date(minor)` refuse quand la ligne porte `fat_loss`/`muscle_gain` ; `set_member_goal(fat_loss)` refuse quand la ligne est datée mineure. Un ordre fixe échoue toujours d'un côté. Règle : **une direction qui ne bouge pas s'écrit avant la date ; une direction qui bouge s'écrit après** (`isDirectionalGoal`).

- `api/mouthProfile.ts` — `persistMouth`, marche 1 bis.
- `pages/HouseholdPage.tsx` — `saveMember` (même règle ; l'en-tête « la date d'abord, l'objectif ensuite » est réécrit).
- `pages/SetupPage.tsx` — **`writeMouthBirthDate`** (neuf), seul écrivain de la date d'une bouche inscrite (`saveMouthBirthDate` + `saveMouthCard`) : si la date rend mineure une ligne directionnelle, `setMemberGoal(maintenance)` d'abord.

### 1.6 Les refus traduits — `frontend/src/keel/copy/planRefusals.ts`

`goal_not_for_minor` → `household.error.goal_not_for_minor`, `target_not_for_minor` → `household.error.target_not_for_minor` (en littéral, comme leurs voisins).

### 1.7 i18n (bloc délimité `// ── chantier-0903/RAPIDE — début/fin ──` en fin de `en.ts` et `fr.ts`)

**Ajoutées (5, namespace `household`, déclaré sur `/app/setup` et `/app/household`)** :
`household.goal.minor_maintenance` (« Eat normally » / « Manger normalement ») ·
`household.goal.minor_only` ·
`household.goal.minor_switched` (`{from}`) ·
`household.error.goal_not_for_minor` ·
`household.error.target_not_for_minor`.

**Retirées en place (4, listées dans le bloc)** : `household.member.goal_none` (en + fr), `setup.mouths.goal_none` (en + fr).

`catalog.ts` : **inchangé** (aucun namespace neuf).

### 1.8 Docs alignées sur `20260822041500`

- `docs/fonctionnalites/le-foyer/README.md` — crans d'intake (« parmi six » → trois, un seul pour un mineur) ; le bullet `:164` « ✅ Un mineur porte les trois objectifs » → « ⛔ Un mineur ne porte AUCUN objectif de poids », avec l'histoire 13/08 → 18/08 → 22/08 → 03/09.
- `docs/fonctionnalites/le-foyer/FF-045-decrire-son-foyer.md` — §5 (trois RPC réécrites par S4), §6 R10 (neuve), §7 (« six jetons » → trois ; deux lignes de refus).
- `docs/fonctionnalites/le-foyer/FF-044-la-bouche-sans-compte.md` — « six jetons » ×2 (en passant, même domaine).
- `docs/keel/PIVOT-FOYER.md` §8.4 — un second encadré « re-tranché deux fois ».

### 1.9 Réparation en passant, nommée

`MouthFormDialog.tsx` — `TargetAndPaceFields` destructurait `voice` et `who` sans les lire depuis le 2026-09-01 (les deux `hint` sont partis) : eslint `no-unused-vars` **antérieur à ce lot**, prouvé par `eslint --stdin` sur la copie `HEAD` du fichier (2 erreurs, lignes 1671). Le gate ne le voyait pas (il ne linte que les fichiers modifiés) ; comme ce lot modifie le fichier, il le verrait. Réparé a minima : les deux props restent dans le contrat, elles ne sont plus destructurées.

---

## 2. Les tests — retournés, écrits, et pourquoi

| Fichier | Ce qu'il affirmait | Ce qu'il affirme |
|---|---|---|
| `api/household.int.test.ts:355-380` | « propose EXACTEMENT la même liste à un adulte et à un enfant » | `minor` → `["maintenance"]` ; `adult` et `unknown` → les trois **en littéral** ; **ce qui est retiré à un mineur = ce que la garde SQL de `20260822041500` nomme** (lue sur le disque, jamais recopiée) ; `goalForAge` et `isDirectionalGoal` ; « la base a LEVÉ le 18/08 sur deux portes, puis REPOSÉ le 22/08 sur quatre » (3 `goal_not_for_minor` + 1 `target_not_for_minor`) |
| `api/household.int.test.ts:438-486` | `goalsForAge("child")` | `goalsForAge("unknown")` — **reste vert**, littéraux inchangés |
| `pages/setupMouthsStep.int.test.ts:170` | « les 3 directions sont proposées à un mineur » ; « une direction déjà choisie reste choisie (option selected) » | un mineur : une tuile « Eat normally », pas le mot d'adulte ; un majeur : les trois, **aucune pré-cochée** ; un âge inconnu : les trois ; **plus de `<select>`, aucune valeur `""`** ; direction héritée sur date de mineur : pliée, cochée, **dite**, rien ne se déplie |
| `components/mouthFormDialog.int.test.ts:1126-1160` (KID) | « les TROIS directions lui sont proposées » ; plafond pédiatrique mesuré sur le `max` du curseur | une tuile ; pli coché + phrase + ni curseur ni cible ; le plafond pédiatrique **reste mesuré dans le module** (`paceControlFor`) puisque l'écran ne peut plus le rendre |
| `api/mouthProfile.int.test.ts` | ordre fixe `setBirthDate` → `setGoal` (le cas `fat_loss` reste vrai, annoté) | + direction qui ne bouge pas (`maintenance`, `null`) → `setGoal` **avant** `setBirthDate` ; direction qui bouge → après ; le refus de la première porte arrête la chaîne dans les deux ordres ; + le pli (`foldMinorGoal`/`mouthToPersist`) : `maintenance` sans cible, brouillon gardé, âge inconnu ne plie rien |
| `copy/planRefusals.int.test.ts` | — | les motifs des quatre portes de `20260822041500` (lus sur le disque) arrivent tous en mots ; les deux nommés |
| `components/goalTiles.int.test.ts` (neuf) | — | combien de tuiles et pour qui ; laquelle est cochée ; la phrase ; `disabled` ; `id`/`role` ; le français |
| `pages/meCardSheet.int.test.ts` | — | harnais : la prop `todayLocalIso` (requise) |

Piège rencontré et écrit dans les trois harnais : **React SSR émet `checked=""` avant `value="…"`** quel que soit l'ordre des props — les regex qui supposaient l'inverse étaient vertes sur « rien de coché ». Les helpers lisent la balise entière.

---

## 3. Mutations — jouées le 2026-09-03 ~14:15, en série, chacune restaurée par `cp` depuis une copie prise juste avant

| # | Mutation (commande) | Test(s) joué(s) | Rouge vu | Restauration |
|---|---|---|---|---|
| M1 (mandat) | `GoalTiles.tsx` : réintroduire une tuile `value=""` « Aucune direction particulière » en tête de `offered.map` | `goalTiles`, `setupMouthsStep`, `mouthFormDialog` | **15 rouges / 139** (3 fichiers) | `cp` → 12/12 verts |
| M2 (mandat) | `api/household.ts` : `goalsForAge` — `ageState === "minor" \|\| ageState === "unknown"` (l'inconnu lu comme un mineur) | `household`, `goalTiles`, `setupMouthsStep`, `mouthFormDialog` | **10 rouges / 167** (4 fichiers) | `cp` → 26 verts + les 2 `awayFrom` de la baseline |
| M3 (à moi) | `api/mouthProfile.ts` : `persistMouth` — ordre fixe `[writeDate, writeGoal]` (l'ordre d'avant) | `mouthProfile` | **2 rouges / 51** (« une direction qui NE bouge PAS s'écrit AVANT la date » ; « le refus de la porte écrite en premier arrête la chaîne ») | `cp` → 51/51 |
| M4 (à moi) | `lib/mouthForm.ts` : `mouthToPersist` — `const draft = typed;` (le pli retiré) | `mouthProfile` | **1 rouge / 51** (« une direction refusée à cet âge part en `maintenance`, SANS cible ») | `cp` → 51/51 |

`git diff --stat` sur les quatre fichiers après restauration : identique à avant les mutations (les copies vivent dans `scratchpad/mut/` du dossier de session, hors dépôt).

---

## 4. Ce qui est prouvé / ce qui est ROUGE

### Prouvé (worktree, sans navigateur)

- `cd frontend && npx tsc -b --force` → **exit 0**.
- eslint sur les 15 fichiers touchés → **0 erreur** (après la réparation §1.9).
- vitest, suite **entière** : **2066 tests, 2041 verts, 20 sautés, 5 rouges** — les 5 sont étrangers (§« Rouges étrangers » ci-dessous), aucun n'est dans un fichier de ce lot.
- vitest, les 12 fichiers du lot ou voisins : 327 verts + les 2 `awayFrom` de la baseline.
- Typecheck des fichiers de test (`tsc -p tsconfig.test.json`) : `goalTiles` 0, `planRefusals` 0, `household` 2 (= liste), `mouthFormDialog` 2 (= liste), `mouthProfile` 6 (= liste), `setupMouthsStep` 0 (< 6 listés), `meCardSheet` 10 — voir « Rouges étrangers » : le 10e est antérieur.
- Les 4 mutations (§3) rougissent et se restaurent.
- Deno : **aucun fichier sous `supabase/` n'est touché** (`git diff --quiet HEAD -- supabase/`), donc rien à rejouer pour ce lot.

### ROUGE — non vu au navigateur (attendu : la fenêtre s'ouvre après fusion, port 5174, arbre principal)

- `/app/household` : une bouche mineure avec `fat_loss` en base → « Manger normalement » **coché** + la phrase de bascule ; le Save **passe** (direction avant date).
- `/app/setup` étape 2 : la fiche d'ajout avec une date de mineur → une seule tuile ; la ligne d'une bouche inscrite → idem ; la carte du titulaire → trois tuiles, aucune pré-cochée.
- 320 px et 1280 px : les tuiles (une par ligne, `flex-col`) ne font pas déborder `document.scrollWidth` — non mesuré.
- Les deux langues à l'écran (FR : « Manger normalement », « Avant 18 ans, … ») — vues en test SSR (`goalTiles.int.test.ts`, cas français), **pas** au navigateur.
- Le refus `goal_not_for_minor` traduit n'a pas été provoqué en HTTP réel (il n'est plus atteignable depuis l'écran nominal ; il resterait atteignable par une course entre deux onglets).

### Invariant C7 (entonnoir) — ce que ce lot n'a pas touché

Trois étapes, `canGenerate` seule source du bouton : aucune ligne de `canGenerate`, d'`onboarding.ts` ou de `setupMisses.ts` n'est modifiée ; les catalogues de questions ne bougent pas. Le sélecteur de direction change de forme (tuiles), pas de sémantique (`own_goal` reste requis, un `""` retient comme avant).

---

## 6. Rouges étrangers — nommés, prouvés antérieurs, non touchés

| Rouge | Preuve d'antériorité | Sort |
|---|---|---|
| `src/keel/components/mealBoxes.int.test.ts › readDishes lit les contenants du repas › un contenant sans bouche, sans item ou sans id ne sort pas` | rejoué sur un `git worktree add --detach` à **`bfecdc28`** (node_modules liés) : **1 failed / 44 passed** — rouge **avant** ce lot, et **absent** de `scripts/.vitest-red-baseline` | nommé ; ni le test ni la baseline ne sont touchés (E seul) |
| `scripts/agent-gate.sh › check_tests` : `deno test supabase/functions/_shared/keel/` **ne compile plus** — 18 erreurs TS dans `daily_pulse_test.ts` (10), `draft_note_classify_test.ts` (5), `daily_pulse_locale_test.ts` (5), `pot_demand_test.ts` (2), `written_instruction_check_test.ts`, `weight_pace_test.ts`, `weight_divergence*_test.ts` (1 chacun) | `git diff --quiet HEAD -- supabase/` : **rien sous `supabase/` n'est modifié** par ce lot ; l'état est celui de `bfecdc28` (l'instantané de l'arbre de la nuit) | le gate s'arrête là **pour toutes les lanes** avant ses contrôles front ; les contrôles front sont rejoués à la main (§4) |
| `tsc -p tsconfig.test.json` : erreurs hors liste dans `groceryWaves.int.test.ts`, `householdHabits.int.test.ts`, `planWeekCarriedDays.int.test.ts`, `shoppingAisles.int.test.ts` ; `meCardSheet.int.test.ts` à 10 (liste : 9) | mesuré sur le worktree détaché à **`bfecdc28`** : `meCardSheet` **déjà à 10**, les **mêmes quatre** fichiers hors liste, **93 erreurs au total — 93 après ce lot** (ce lot n'en ajoute aucune ; `setupMouthsStep` était déjà à 0, la liste dit 6) | non touchés |

Conséquence : les commits de ce lot passent en **`--no-verify`**, motif écrit dans chaque message. Ce que le gate aurait vérifié est rejoué à la main et consigné en §4.

---

## 5. Hors périmètre croisé, nommé, non touché

- `lib/workLunchRoster.ts` lit encore `FunnelMouth.kind` à deux valeurs (`unknown` → `adult`, exprès) — lane FOYER (A6).
- `api/onboarding.ts:1754` : `kind: m.ageState === "minor" ? "child" : "adult"` — non touché ; `funnelMouthAgeState` reconstruit l'état à trois valeurs depuis `kind` + `birthDate === null`, sans ajouter de champ à `FunnelPerson` (un champ requis de plus aurait fait monter le compte d'erreurs de type des harnais étrangers qui construisent des `FunnelMouth` en littéral).
- `HouseholdMergeCard.tsx:45`, la lane 1:1, le gel 402, la bascule de langue, le foyer orphelin : non croisés.
- A4 (`/app/meals`) : rien.

---

## 7. Les commits (branche `chantier-0903/RAPIDE`, base `bfecdc28`) — dans l'ordre RÉEL

| Ordre | Commit | sha | Contenu |
|---|---|---|---|
| 1 | i18n | `7739857a` | `en.ts` + `fr.ts` seulement (bloc délimité + 4 retraits en place) — `--no-verify` |
| 2 | journal (v1, **sha du lot faux**) | `bfceefa6` | ce fichier, première version — sa table §7 disait « lot = bfecdc28 », ce qui est la BASE, pas le lot |
| 3 | lot A3 | `f1c2ea37` | 8 fichiers source, 7 fichiers de test, 4 docs — `--no-verify`, motif dans le message |
| 4 | journal (v2) | _(le commit qui suit)_ | ce fichier, corrigé |

⚠️ **La bourde, nommée** : le script de commit posait les vingt chemins du lot dans une variable et faisait `git add -- $LOT_FILES` ; **zsh ne découpe pas une variable en mots**, `git add` a reçu UN chemin inexistant, le commit du lot n'a rien commité, et les deux commits suivants (i18n, journal) sont partis avant lui. Rien n'a été défait (aucun `reset`, aucun `restore`) : le lot est commité en troisième avec ses chemins écrits un par un, et ce journal est recommité. Les trois contenus sont exactement ceux prévus ; seul l'ordre diffère de celui annoncé.

`git status --short` vide après le quatrième commit. Aucun `git add -A`, aucun `stash`/`checkout`/`reset`/`restore` ; les restaurations de mutation sont des `cp`.
