# FOYER · A6 — vérification après fusion (le déjeuner en semaine quitte l'étape 3)

**Date** 2026-09-03, démarré 17:13 · **Vérificateur** (je ne crois aucun rapport : je rejoue)
**Worktree** `/Users/ahmedamara/Dev/Sophia-2-chantiers/VERIF`, détaché sur **`4d3aabc8`** (fusion A6)
**Base du diff** `ecf57adc` · **Base d'antériorité** `31ee930f`
**Mandat vérifié** MASTER PROMPT 2026-09-03-1308 §5.3, §5.13, §2, §2.4 (C7) · ANALYSE §6
**Journal du bâtisseur** `scratchpad/2026-09-03-1457-FOYER-A6-dejeuner-en-semaine.md`

> Écrit au fil de l'eau dès la première mesure (règle §2.3 n°25).

---

## 1. Statique

### 1.1 Périmètre du diff — **PROUVÉ**

`git diff ecf57adc..4d3aabc8 --name-only` → **16 fichiers**, tous au mandat :

| Fichier | Statut |
|---|---|
| `frontend/src/keel/components/MemberWorkLunchCard.tsx` | neuf (nouveau site, §5.3) |
| `frontend/src/keel/components/PersonWorkLunch.tsx` | neuf (extraction de `WorkLunchCard.tsx:202`) |
| `frontend/src/keel/components/WorkLunchCard.tsx` | supprimé |
| `frontend/src/keel/components/TableStepPlanning.tsx` | carte retirée |
| `frontend/src/keel/components/tableStepPlanning.int.test.ts` | réduit |
| `frontend/src/keel/components/memberWorkLunchCard.int.test.ts` | neuf |
| `frontend/src/keel/lib/workLunchCommit.ts` | garde en module pur (`workLunchCommit.ts:48-52` cité au mandat) |
| `frontend/src/keel/lib/workLunchRoster.ts` + `.int.test.ts` | supprimés (mandat : « devient supprimable ») |
| `frontend/src/keel/lib/presenceRoster.ts` + `.int.test.ts` | commentaires reciblés — **à vérifier : commentaires seuls** |
| `frontend/src/keel/pages/HouseholdPage.tsx` | montage du nouveau site |
| `frontend/src/keel/pages/SetupPage.tsx` | `:3194-3202` |
| `frontend/src/keel/i18n/en.ts`, `fr.ts` | libellés « à l'étape suivante » (mandat §5.3) |
| `scratchpad/2026-09-03-1457-FOYER-A6-dejeuner-en-semaine.md` | journal |

**Rien sous `supabase/`** : `git diff ecf57adc..4d3aabc8 --name-only -- supabase/` → **0 ligne**.
L'affirmation du bâtisseur (§4 « Deno : aucun fichier sous `supabase/` ») est **vraie**.

### 1.2 `tsc -b --force` — **PROUVÉ**

`cd frontend && npx tsc -b --force` → **exit 0**, aucune sortie.

### 1.3 vitest, suite entière — **PROUVÉ, le compte du bâtisseur est exact**

`cd frontend && npx vitest run` (17:13:46, 14,97 s) :

```
Test Files  3 failed | 120 passed | 5 skipped (128)
     Tests  5 failed | 2060 passed | 20 skipped (2085)
```

**2 060 verts / 2 085, 5 rouges** — exactement ce que le journal annonce (§4.1). Les 5 rouges
sont **exactement les 5 rouges étrangers connus**, aucun autre :

| Rouge | Antériorité |
|---|---|
| `src/edge/coverage-guard.int.test.ts › … Edge Functions … known list` | **nominatif** dans `scripts/.vitest-red-baseline` |
| `src/edge/coverage-guard.int.test.ts › … DB triggers … known list` | **nominatif** dans la baseline |
| `src/keel/api/household.int.test.ts › awayFrom … ne rend que la source demandée` | **nominatif** dans la baseline |
| `src/keel/api/household.int.test.ts › awayFrom … un jour inconnu tombe …` | **nominatif** dans la baseline |
| `src/keel/components/mealBoxes.int.test.ts › … un contenant sans bouche … ne sort pas` | hors baseline ; **aucun fichier du diff n'est lu par ce test** (il n'est pas touché, et `mealBoxes*` n'apparaît pas dans le diff) ; déclaré rouge étranger connu par l'orchestrateur |

Fichiers du lot dans le run entier, **tous verts** :
`pageSeams` 2 · `parity` 6 · `presenceMarks` 17 · `presenceRoster` 7 ·
`tableStepPlanning` **5** · `memberWorkLunchCard` **31**.

### 1.4 Les affirmations i18n — **PROUVÉES, une par une**

| Affirmation du bâtisseur | Rejouée | Verdict |
|---|---|---|
| Aucune clé ajoutée ni retirée | jeu de clés extrait de `en.ts`/`fr.ts` à `ecf57adc` et à `4d3aabc8`, trié, `diff` → **identique** dans les deux packs | **vraie** |
| 4 valeurs changées en place | `git diff` des deux packs : **exactement** `setup.work_lunch.intro`, `.outside_note`, `.grid_wins`, `setup.request.presence_intro` — rien d'autre que des commentaires | **vraie** |
| Namespace `setup.work_lunch.*` gardé (D6.3) | aucune clé renommée dans le diff | **vraie** |
| `catalog.ts` intact | `git diff … -- '*catalog.ts'` → **0 fichier** | **vraie** |
| Plus de « à l'étape suivante » / « at the next step » | voir §1.5 | **vraie** |

Pas de mojibake : le diff rend `l’étape`, `déjeuners`, `« dehors »`, `“eating out”` en UTF-8 propre,
et `parity.int.test.ts` (6 cas) est vert.

### 1.5 Les libellés qui mentaient, dans les deux langues — **PROUVÉ**

| Clé | FR après | EN après |
|---|---|---|
| `setup.work_lunch.intro` | « Sa semaine, juste en dessous, garde le dernier mot. » | « Their week, just below, has the last word. » |
| `setup.work_lunch.outside_note` | « … sont cochés « dehors » dans sa semaine, juste en dessous. » | « … are marked “eating out” in their week, just below. » |
| `setup.work_lunch.grid_wins` | « … la grille jour par jour de sa semaine, juste en dessous, qui gagne … » | « … the grid of their week, just below, wins … » |
| `setup.request.presence_intro` | « L'habitude — qui déjeune au bureau — se règle sur la page Foyer, dans la fiche de chacun. » | « The habit — who eats lunch at work — is set on the Household page, in each person's sheet. » |

Aucune des quatre clés ne dit plus « étape suivante », « étape trois », « next step », « step three »
— et `memberWorkLunchCard.int.test.ts:178` l'épingle **dans les deux packs**.

### 1.6 Un écart de règle, nommé (pas un défaut de ce lot)

La règle transverse §2.2 n°19 dit qu'une lane **ne commite pas** `en.ts`/`fr.ts`/`catalog.ts` —
elle liste ses clés au rapport, E fusionne. Le bâtisseur a commité `en.ts`+`fr.ts` (commit
`47c2316c`, **séparé**, bloc délimité `// ── chantier-0903/FOYER — début/fin ──` dans les deux
packs). Mon mandat de vérification autorise explicitement « les fichiers du mandat §5.3 **+ i18n** »,
et §5.3 exige la réécriture des libellés dans les deux langues : je le **nomme** pour E, je ne le
compte pas comme défaut.

---

## 2. Les fichiers hors liste littérale du mandat — **PROUVÉ inoffensifs**

`lib/presenceRoster.ts` et `lib/presenceRoster.int.test.ts` ne sont pas cités par §5.3.
`git diff ecf57adc..4d3aabc8` sur ces deux fichiers : **toutes les lignes ajoutées ou retirées
commencent par `//`** — quatre pavés de commentaire qui citaient « l'étape 3 » ou `workLunchRoster`
et pointent maintenant `MemberWorkLunchCard`. **Aucune ligne de code.** C'est exactement la
discipline « une contrainte documentée survit à sa cause » ; pas un défaut.

`lib/workLunchCommit.ts` est cité par le mandat (`workLunchCommit.ts:48-52`) : dans le périmètre.

**`presenceMarks.int.test.ts` : `git diff ecf57adc..4d3aabc8 -- '*presenceMarks*'` → VIDE.**
L'interdit du mandat est tenu.

---

## 3. Les trois gardes au nouveau site — **PROUVÉES par lecture de source**

### ① `workLunchWriteIsNeeded` comparé au `saved` **serveur**

`frontend/src/keel/lib/workLunchCommit.ts:112-124` — module **pur**, aucun réseau :

```ts
if (!workLunchWriteIsNeeded(args.saved, args.next)) {
  return { ok: true, reason: null, written: false }
}
```

`MemberWorkLunchCard.tsx:88` : `const saved = props.answers?.get(memberId ?? "") ?? null` — `saved`
vient de la **Map lue par la page** (`readWorkLunchAnswers(loadWorkLunch)`), pas du brouillon.
`MemberWorkLunchCard.tsx:121-125` passe ce `saved` à `commitMemberWorkLunch` et **ne refait pas la
comparaison**. La garde est donc au seul endroit mesurable — c'est le correctif que le mandat
demandait (l'ancienne carte comparait dans sa fermeture `commit`, inatteignable par
`renderToStaticMarkup`).

### ② Relecture **avant** `onSaved`

`workLunchCommit.ts:49-53` :

```ts
const result = await args.save(args.memberId, args.answer)
if (!result.ok) return result
await args.reread()      // réarme la garde
await args.onSaved()     // relit la page
```

Câblage réel `HouseholdPage.tsx` (bloc `onSaveWorkLunch`) : `reread: refreshWorkLunch`,
`onSaved: refresh`. Et `refreshWorkLunch` est une lecture **à part** de `refresh` — l'ordre reste
lisible. Épinglé par « la relecture a lieu, et AVANT la relecture de la page ».

### ③ `answers === null` ≠ `Map` vide, dans un module **pur**

`workLunchCommit.ts:80-91` : `catch` → `{ answers: null, error: … }`. Jamais `new Map()`.
`HouseholdPage.tsx` (`refreshWorkLunch`) : `if (read.answers !== null) setWorkLunch(read.answers)` —
**aucun `catch` local**, aucun repli à la main, et `workLunch` n'est pas remis à `null` sur un échec.
Porte de rendu `MemberWorkLunchCard.tsx:148-161` : `readError !== null` ⇒ le motif ;
`answers === null` ⇒ « lecture… », **aucune question** ; sinon la question.

### ④ Aucun `useEffect` qui écrit — **PROUVÉ**

`grep -n useEffect` sur `MemberWorkLunchCard.tsx`, `PersonWorkLunch.tsx`, `TableStepPlanning.tsx` :
**une seule occurrence, dans un commentaire** (`MemberWorkLunchCard.tsx:42`). Zéro effet.
Le brouillon se resynchronise par comparaison de `savedPrint` **pendant le rendu**
(`MemberWorkLunchCard.tsx:98-108`), patron `MealPickerGrid`.
Le seul `useEffect` neuf est dans `HouseholdPage.tsx` et il **lit** (`refreshWorkLunch`).

---

## 4. Les 10 cas déplacés — **PROUVÉS, aucun perdu**

Le mandat dit « les 10 cas de `tableStepPlanning.int.test.ts:144-277` ». **Les lignes 144-277 ne
portent que 7 `it`** (3 + 4, dans deux `describe`) : le mandat compte les 10 cas *du déjeuner* du
fichier, soit ces 7 **plus** les 3 cas antérieurs (`:74`, `:98`, `:121`). Le bâtisseur le dit, et il
a raison. Voici le sort de chacun des **13** cas de l'ancien fichier.

| # | Ancien intitulé (`ecf57adc`) | Nouveau site | Verdict |
|---|---|---|---|
| 1 | `⛔ LES MOYENS DE CUISSON PASSENT AVANT LE DÉJEUNER` (`:74`) | `tableStepPlanning:70` « … AVANT LES TRADITIONS » **+** `memberWorkLunchCard:425` « `MemberRow` la monte AU-DESSUS de la grille de présence » | **réécrit, sens tenu** (l'ordre voulu n'est plus « avant la carte déjeuner » mais « la carte au-dessus de la grille ») |
| 2 | `les deux cartes sont là, et rien d'autre ne s'est glissé entre elles` (`:88`) | `tableStepPlanning:83` « les deux cartes sont là — et le déjeuner n'y est PLUS (A6) » | **renforcé** |
| 3 | `le déjeuner dit qu'il lit, et ne pose pas encore sa question` (`:98`) | `memberWorkLunchCard:126` « `answers === null` : la carte dit qu'elle lit, et ne pose PAS sa question » | **déplacé, sens identique** |
| 4 | `l'équipement dit qu'il lit tant que la colonne n'est pas arrivée` (`:111`) | `tableStepPlanning:97`, identique | **resté** |
| 5 | `aucun majeur ⇒ aucune carte de déjeuner, mais l'équipement RESTE` (`:121`) | scindé : `memberWorkLunchCard:97/103/107` (mineur / âge inconnu / sans ligne ⇒ **rien**) **+** `tableStepPlanning:83` (l'équipement reste) | **déplacé et élargi** (1 cas → 4) |
| 6 | `sans ligne d'objectif, l'équipement le DIT au lieu de se taire` (`:136`) | `tableStepPlanning:107`, identique | **resté** |
| 7-9 | `la relecture a lieu, et AVANT la relecture de la page` · `un refus ne relit RIEN …` · `la réponse part telle quelle …` | `memberWorkLunchCard:216 / 250 / 265` | **déplacés** |
| 10-13 | `elle rend `null`, PAS une `Map` vide` · `un rejet ASYNCHRONE …` · `une lecture RÉUSSIE …` · `une Map VIDE lue pour de vrai …` | `memberWorkLunchCard:298 / 311 / 322 / 331` | **déplacés** |

**Aucun cas disparu. Aucune assertion affaiblie** : `diff -u` du bloc `:144-277` de l'ancien contre
le bloc `:215-341` du nouveau ne montre **que** des commentaires retaillés et le renommage de la
constante locale `ANSWER` en `OUTSIDE`
(`{ atWork: true, mode: "outside", microwave: null }` — **valeur identique**, vérifiée
`memberWorkLunchCard.int.test.ts:44`). Toutes les lignes `expect(…)` sont intactes.

`tableStepPlanning.int.test.ts` tombe de **13 à 5 cas** : ordre des deux cartes restantes, les deux
présentes + déjeuner absent, porte de lecture de l'équipement, `no_goal`, et une lecture de source
(« plus ni état ni effet »). C'est bien « réduit à l'ordre des deux cartes restantes », avec ce
qui n'a jamais parlé du déjeuner en plus.

`presenceMarks.int.test.ts:200-340` : **non touché** (§2).

---

## 5. Les appelants survivants — **PROUVÉ, aucun**

- `grep -rn workLunchRoster frontend/src` → 7 occurrences, **toutes** en commentaire ou en
  assertion `.not.toContain(…)` / `existsSync(…) === false`. **Aucun `import`, aucun appel.**
- `grep -rn WorkLunchCard frontend/src` (hors `MemberWorkLunchCard`) → 7 occurrences, mêmes
  natures. **Aucun monteur.**
- `frontend/src/keel/components/WorkLunchCard.tsx` et `frontend/src/keel/lib/workLunchRoster.ts` :
  **absents du disque**.

## 6. L'extraction de `PersonWorkLunch` — **PROUVÉE fidèle**

`diff -u` entre `WorkLunchCard.tsx:202-295` (à `ecf57adc`) et `PersonWorkLunch.tsx:76-167` :
**deux hunks, et rien d'autre**

1. `function PersonWorkLunch` → `export default function PersonWorkLunch` ;
2. la ligne `<p className="text-sm font-medium text-ink">{name}</p>` retirée.

C'est **exactement** l'unique déviation que le bâtisseur nomme (§1.1 de son journal), et elle tient :
`MemberRow` rend déjà `member.displayName` au-dessus (`HouseholdPage.tsx:1936`), et chaque question
**nomme** encore la personne (`t("setup.work_lunch.at_work", { name })`, règle F5). `Choice` a suivi
dans le même fichier (`PersonWorkLunch.tsx:45`), non exporté.

Le titulaire n'est **pas** perdu au passage : `me` est retrouvé **dans** `members`
(`api/household.ts:158,569`), donc le maître a lui aussi une `MemberRow`, donc sa carte.
C'était l'arbitrage de `workLunchRoster` (« le titulaire, premier et pareil ») — il survit.

Interdit du mandat tenu : la carte est une **sœur** dans `MemberRow`, **pas** dans le brouillon de
`MouthPreferencesFields` ; `mouthFormDialog.int.test.ts` n'est pas touché et reste vert dans la
suite entière. Le namespace n'est pas renommé.

---

## 7. Mutations — **les trois du rapport rejouées, plus DEUX à moi**

Copies prises par `cp` avant chaque mutation, hors dépôt
(`…/scratchpad/mut-verif/*.orig`), restauration par `cp`, **identité prouvée par `cmp`**.
Jamais `git checkout` / `restore` / `stash` / `reset`.
Base : `memberWorkLunchCard` + `tableStepPlanning` = **36/36 verts**.

| # | Mutation (commande) | Rouge vu | Restauration |
|---|---|---|---|
| **M1** (mandat) | `perl -0pi -e 's/  if \(!workLunchWriteIsNeeded\(args\.saved, args\.next\)\) \{\n    return \{ ok: true, reason: null, written: false \};\n  \}\n//' lib/workLunchCommit.ts` | **1/36** — `⛔ commitMemberWorkLunch … > identique à saved ⇒ le geste n'est PAS appelé, et ce n'est pas un échec` | `cp` + `cmp` **identique** |
| **M2** (mandat) | `readWorkLunchAnswers` : `catch` → `{ answers: new Map<string, WorkLunch \| null>(), … }` | **2/36** — `elle rend null, PAS une Map vide` + `un rejet ASYNCHRONE est attrapé aussi …` | `cp` + `cmp` **identique** |
| **M3** (mandat) | `MemberWorkLunchCard.tsx` : `: props.answers === null` → `: (props.answers ?? new Map()) === null` | **1/36** — `⛔ le premier rendu … > answers === null : la carte dit qu'elle lit, et ne pose PAS sa question` | `cp` + `cmp` **identique** |
| **M4** (à moi) | `MemberWorkLunchCard.tsx:142` : le filtre `age_state` désarmé — `if (false && !workLunchIsAskable(props.person)) return null;` | **3/36** — `un mineur : RIEN, pas même un titre` + `⛔ un âge INCONNU n'est pas interrogé …` + `sans ligne en base, nulle part où écrire ⇒ rien` | `cp` + `cmp` **identique** |
| **M5** (à moi) | `HouseholdPage.tsx` : le bloc `<MemberWorkLunchCard …/>` **déplacé SOUS** `<MealPickerGrid …/>` (11 lignes, déplacement par script Python) | **1/36** — `le déménagement (A6) … > MemberRow la monte AU-DESSUS de la grille de présence, avec ageState du roster` | `cp` + `cmp` **identique** |

Après la dernière restauration : `git status --short` **vide**, `git diff --stat` **vide**, et
`memberWorkLunchCard` + `tableStepPlanning` = **36/36**.

Les trois mutations du mandat rougissent **exactement** au compte annoncé par le bâtisseur
(1 / 2 / 1) et sur les **mêmes** intitulés. Les deux miennes montrent que le filtre d'âge et la
**place** de la carte sont eux aussi tenus par un test, pas par un commentaire.

---

## 8. Pourquoi la garde d'écriture est porteuse — **PROUVÉ en SQL (lecture)**

La garde `workLunchWriteIsNeeded` n'a de sens que si la porte SQL **ré-applique** son
pré-remplissage à chaque écriture. Lu directement en base (aucun run, aucune écriture) :

`keel_away_with_work_lunch(p_away, p_mode)` **retire d'abord** toutes les marques
`kind='eating_out'`, `day ∈ (mon,tue,wed,thu,fri)`, `slots=["lunch"]`, **puis réécrit** les cinq
quand `p_mode = 'outside'`. Une écriture **identique** ressuscite donc le mardi décoché à la main.
La garde est bien la seule chose qui empêche la carte d'effacer la grille juste en dessous.

Et les refus de `keel_household_set_member_work_lunch` sont : `not_authenticated`,
`bad_work_lunch`, `not_a_member`, `not_your_line`, `not_adult`, `too_many_away`.
**Aucun refus `has_account`** ⇒ l'arbitrage repris de `workLunchRoster` (« la carte ne connaît ni
`userId` ni `hasAccount`, compte ou pas on demande ») est **conforme à la porte**. Le filtre
`not_adult` est `keel_household_member_age`, la même autorité que `member.ageState` du roster.

---

## 9. Cohérence — invariant **C7** (§2.4)

| Point de C7 touché par ce lot | Mesure | Verdict |
|---|---|---|
| Trois étapes | `api/onboarding.ts:1066` — `STEP_ORDER = ["situate", "people", "request"]`, fichier **non touché** par le lot | **tenu** |
| `canGenerate` seule source du bouton | `SetupPage.tsx:210` (le pavé), `:1282`, `:2971` — aucune ligne `canGenerate` dans le diff | **tenu** |
| Plus aucune `WorkLunchCard` à l'étape 3 | `TableStepPlanning.tsx` ne contient plus le mot `WorkLunch` hors commentaire ; `SetupPage.tsx` n'importe plus `workLunchRoster` et n'a plus de prop `people=` ; épinglé par `memberWorkLunchCard:451` | **tenu** |
| L'étape 3 rend **deux** cartes | `TableStepPlanning.tsx:50-70` : `<KitchenEquipmentCard>` puis `<HouseholdTraditionsCard>`, et **rien d'autre** ; le composant n'a plus ni état, ni effet, ni `people`, ni `busy` | **tenu** |
| `lib/workLunchRoster.ts` supprimé sans appelant | §5 ci-dessus | **tenu** |

Rien d'autre de §2.4 n'est touché par ce lot (aucun serveur, aucun prompt, aucune version de prompt :
`git diff … -- supabase/` est vide, donc ni `MEAL_PROMPT_VERSION` ni `HOUSEHOLD_PROMPT_VERSION`
n'ont bougé — et c'est **juste**, ce lot ne change rien à ce que le modèle reçoit).

---

## 10. Navigateur — **ROUGE (geste humain requis)**

Serveur `frontend-verif` sur **http://localhost:5209**, servant bien **ce** worktree — prouvé :

- `/src/keel/i18n/fr.ts` servi par Vite **contient** « Sa semaine, juste en dessous, garde le
  dernier mot » et **ne contient plus** « la semaine sort juste du premier coup » ;
- `/src/keel/components/MemberWorkLunchCard.tsx` et `PersonWorkLunch.tsx` sont servis, transformés,
  **200** ;
- `/src/keel/components/WorkLunchCard.tsx` et `/src/keel/lib/workLunchRoster.ts` retombent sur le
  **repli SPA** (`<!doctype html>`) ⇒ ils n'existent plus dans l'arbre servi.

**Session : AUCUNE.** `Object.keys(localStorage)` sur `http://localhost:5209` = `["sophia.ui_locale"]` —
**pas de `sb-*-auth-token`**. Un seul onglet ouvert. `/app/household` redirige vers
`/auth?redirect=%2Fapp%2Fhousehold`.

Conformément à la règle non négociable : **je n'entre aucun mot de passe, je ne forge aucun jeton,
je ne touche pas `auth.sessions`, je n'appelle pas l'API admin.** Tout ce qui est derrière la garde
reste donc **ROUGE**, et le voici, **scénario exact à jouer par un humain** (recopié du rapport du
bâtisseur, complété) :

> **Compte** : une fixture du tag `qa0903f` (maître + une bouche adulte sans compte + un secondaire
> réclamé), mot de passe `1234567`, `profiles.locale='fr-FR'`, `country='FR'` — SQL dans le journal
> A5, §« fixture ». Sinon `qa1v.foyer@keeltest.dev` en **lecture seule**.
>
> 1. `/app/household` → la ligne d'une bouche **adulte** → « Modifier ».
>    ⇒ La carte « **Le déjeuner en semaine** » apparaît **sous** les habitudes et **au-dessus** de
>    « Quand cette bouche n'est pas là ».
> 2. Répondre « Oui » puis « **Mange dehors** ».
>    ⇒ La phrase « **5 midis de semaine sont cochés « dehors » dans sa semaine, juste en dessous** »
>    (et **pas** « à l'étape suivante »).
> 3. Ouvrir « **Sa semaine** » ⇒ les **cinq midis** cochés `eating_out` dans la grille.
> 4. **Décocher mardi** à la main, enregistrer, **rouvrir la carte, ne rien changer**, refermer.
>    ⇒ **Mardi reste décoché.** (C'est M1 qui le tient ; contrôle sans navigateur possible :
>    `select away_days from household_members where member_id = …`.)
> 5. Une bouche **mineure** ou d'**âge inconnu** ⇒ **aucune carte** dans sa fiche.
> 6. `/app/setup` étape 3 ⇒ **deux cartes** (équipement, traditions), **plus de déjeuner** ;
>    étape 4 ⇒ « L'habitude — qui déjeune au bureau — se règle sur la page Foyer, dans la fiche de
>    chacun. »
> 7. **320 px et 1280 px**, captures à scroll 0, `document.scrollWidth` = largeur de fenêtre
>    (aucun débordement horizontal), **en FR et en EN** (bascule `?lang=en`).

**Non mesuré, donc non prouvé** : les points 1 à 7 ci-dessus, y compris les deux largeurs et les
deux langues. Ce qui est prouvé **sans** session : la copie des deux packs (test `:159/:169/:178`),
la place de la carte dans la source (test `:425`, mutée en M5), le filtre d'âge (tests `:97/:103/:107`,
mutés en M4), et la mécanique SQL qui rend l'étape 4 nécessaire (§8).

---

## 11. La dette nommée pour **A5** — confirmée « juste aujourd'hui »

`HouseholdPage.tsx` : la lecture des réponses est keyée sur le rôle —

```ts
const meRole = household?.me?.role ?? null
React.useEffect(() => { if (meRole !== "owner") return; void refreshWorkLunch() }, [meRole, refreshWorkLunch])
```

**Vérifié : c'est bien juste aujourd'hui.** `MembersCard` (`HouseholdPage.tsx:1513-1518`) fait
`const isOwner = me?.role === "owner"` et, pour un non-maître, rend une liste de
`<MemberBadges>` — **aucune `MemberRow`**. Un non-maître ne voit donc **aucune** fiche, donc aucune
carte déjeuner : ne pas lire ses réponses ne lui coûte rien.

**Ce qui deviendra faux, et quand** : A5 point 6 ouvre la ligne d'un **membre réclamé**. Dès que ce
membre aura une `MemberRow`, sa carte déjeuner restera bloquée sur « Lecture… » **pour toujours**,
parce que l'effet ne partira jamais. La porte SQL, elle, l'autorise déjà (`not_your_line` ne refuse
que la ligne **d'autrui** — un membre réclamé peut écrire la sienne).

**Geste pour A5** : ouvrir la porte de lecture au membre (par ex. `meRole !== null`), et ajouter un
cas au test du déménagement qui monte `MemberWorkLunchCard` pour un `meRole === "member"`.
**Consigné comme dette de A5, pas comme défaut de A6.**

---

## 12. Hors périmètre croisé, nommé, non touché

- **D6.1** (`generate-meal-v1` ne lit pas `household_members.away_days`) et **D6.2** (`lunchbox` /
  `microwave` sans lecteur) : lane **CUISINE (A2)**, hors mandat A6. Tant qu'ils ne sont pas livrés,
  la question déménagée reste **décorative pour un solo et pour un secondaire** — le front est en
  place, l'effet serveur suit. Le bâtisseur le nomme ; je le confirme (aucun fichier `supabase/`
  dans le diff).
- Écart de règle §2.2 n°19 (i18n commité par la lane) : §1.6 — **nommé pour E**, pas un défaut ici.
- `HouseholdMergeCard.tsx:45`, la lane 1:1, le gel 402, la bascule de langue, le vérificateur de
  traditions, le foyer orphelin : non croisés.

---

## 13. Défauts

**Aucun.** Rien à corriger côté bâtisseur.

Deux points **nommés**, ni l'un ni l'autre imputable à A6 :

1. `en.ts`/`fr.ts` commités par la lane alors que §2.2 n°19 les réserve à E — mais §5.3 exigeait la
   réécriture des libellés, et mon mandat de vérification les inclut au périmètre. **Pour E.**
2. La porte de lecture `meRole === "owner"` (§11). **Pour A5.**

---

## 14. Récapitulatif

### Prouvé (rejoué, avec la mesure)

- Diff **16 fichiers**, tous au mandat ; **rien sous `supabase/`** ; `presenceMarks.int.test.ts`
  **intact** ; `presenceRoster.*` = **commentaires seuls**.
- `tsc -b --force` **exit 0**.
- vitest entière **2 060 / 2 085**, **5 rouges = les 5 étrangers connus** (4 nominatifs dans
  `scripts/.vitest-red-baseline`, le 5e hors baseline mais hors diff). `pageSeams` 2 ✓, `parity` 6 ✓.
- i18n : **aucune clé ajoutée ni retirée** (jeux de clés `diff`-identiques dans les deux packs),
  **4 valeurs** changées en place et rien d'autre, namespace gardé, `catalog.ts` **intact**,
  plus aucun « étape suivante / next step » dans les 4 clés, **deux langues**.
- Les **3 gardes** au nouveau site, lues dans le code : `workLunchWriteIsNeeded` contre le `saved`
  serveur dans un module pur ; `reread` **avant** `onSaved` ; `null` ≠ `Map` vide dans
  `readWorkLunchAnswers` **et** dans la porte de rendu. **Zéro `useEffect`** dans la carte.
- **5 mutations** rougissent (1 / 2 / 1 / 3 / 1) et se restaurent, `cmp` identique à chaque fois ;
  arbre propre après.
- Les **10 cas** du déjeuner : 7 déplacés avec **toutes** leurs assertions (`diff -u` : seuls des
  commentaires et le renommage `ANSWER`→`OUTSIDE`, valeur identique), 3 réécrits au nouveau site.
  **Aucun perdu.** `tableStepPlanning` réduit de 13 à **5** cas.
- `workLunchRoster` / `WorkLunchCard` : **aucun appelant survivant** (les 14 occurrences restantes
  sont des commentaires ou des assertions d'absence) ; les deux fichiers absents du disque **et** du
  serveur Vite.
- **C7** : trois étapes, `canGenerate` intact, deux cartes à l'étape 3, plus de déjeuner.
- Extraction de `PersonWorkLunch` **fidèle** (2 hunks, l'unique déviation nommée par le bâtisseur).
- SQL (lecture) : la porte **retire puis réécrit** les cinq midis à chaque écriture ⇒ la garde M1
  est porteuse ; **aucun refus `has_account`** ⇒ ne pas filtrer sur le compte est conforme.

### Non prouvé — **ROUGE, session requise**

- **Tout le navigateur** (§10) : les 7 points du scénario, 320 px et 1280 px, FR et EN.
  Motif : **aucune session** sur `localhost:5209` et interdiction absolue d'en fabriquer une.

### Défauts

**Aucun.**

---

# VERDICT : **VERT**

*(les seuls ROUGE sont « session requise » ; aucun défaut de lot, aucune affirmation du bâtisseur
prise en défaut, les cinq mutations mordent, aucun cas perdu au déménagement)*

