# VÉRIFICATION — CUISINE A2 (style de cuisine, nombre de courses, D6.1, D6.2)

**Vérificateur** : agent de vérification, worktree `/Users/ahmedamara/Dev/Sophia-2-chantiers/VERIF`,
détaché sur **`7b8b8a49`** (pointe de `chantier-0903/CUISINE`, **non fusionnée**).
**Base d'antériorité** : `31ee930f`. **Périmètre** : `2b57bfa9` (exclu) → `7b8b8a49` (inclus).
**Port navigateur** : 5209. Journal écrit **au fil de l'eau**.

> ⚠️ **Vérification PRÉ-FUSION.** Voir §Z pour ce que ça interdit de juger.

---

## Journal de mesure (au fil de l'eau)

- [en cours] mise en place du poste, lancement des suites.

### Mesures faites (horodatage de session)

**Suites, rejouées sur `7b8b8a49`**
- `cd frontend && npx tsc -b --force` → **exit 0**, zéro ligne de sortie.
- `npx vitest run` → **2 050 passés / 2 075**, **5 échecs** : `coverage-guard` ×2,
  `awayFrom` ×2, **`mealBoxes.int.test.ts › un contenant sans bouche… ne sort pas`**.
  ⚠️ Le 5ᵉ n'est PAS dans la liste de rouges attendus qu'on m'a donnée. Antériorité à prouver.
- `deno test --allow-env --allow-read --allow-net _shared/keel/` (répertoire entier) →
  **exit 1, AUCUN test lancé** : `Found 18 errors. Type checking failed.` sur
  `daily_pulse.ts`, `daily_pulse_test.ts`, `daily_pulse_locale_test.ts`,
  `draft_note_classify.ts`, `draft_note_classify_io.ts`, `draft_note_classify_test.ts`,
  `pot_demand_test.ts`.
- `deno test` sur **240 fichiers** (245 moins les 5 nommés en baseline) →
  **`ok | 4876 passed | 0 failed | 1 ignored (38s)`**. Le chiffre du bâtisseur est exact.

**Versions de prompt**
- `MEAL_PROMPT_VERSION` : `meal.en.v24_raw_keeping_reaches_the_model` (à `31ee930f`) →
  `…v25_the_day_before_is_derived` (à `2b57bfa9`, A1) → **`meal.en.v26_the_cooking_style_sets_the_sessions`**. Un cran pour A2. ✅
- `HOUSEHOLD_PROMPT_VERSION` : `v22_precedence_in_tail` (à `31ee930f` **et** `2b57bfa9`) →
  **`v23_the_lunchbox_travels`**. Un cran pour A2. ✅

**Épinglages** — comptés à la main sur `_shared/keel/*_test.ts` :
8 `assertEquals(MEAL_PROMPT_VERSION, "meal.en.v26_…")` (cook_the_day_before:255,
household_merge:3022, meal_boxes:1119, meal_frozen_portion:327, meal_precedence:134,
one_cooking_session:378, meal_same_day:575, raw_keeping:289) et
5 `assertEquals(HOUSEHOLD_PROMPT_VERSION, "v23_…")` (cook_the_day_before:268,
household_meal_generation:1830, household_merge:3095, meal_boxes:1133, meal_same_day:604).
**13 épinglages vivants, tous à jour, aucun périmé.** Les seules occurrences restantes de
`v22_precedence_in_tail` sont l'**empreinte historique** `precedence_binding.ts:64` et ses
tests de fonction pure — ce ne sont pas des épinglages du millésime courant.
(Le chiffre « 18 » du prompt d'orchestration = 11 A2 + 7 A1 ; sur l'arbre je compte **13**
assertions vivantes. Aucune n'est périmée, ce qui est la question qui compte.)

---

## ❌ DÉFAUT n°1 — le motif de la déviation (a) est FAUX, et je l'ai mesuré

Le journal (`§Déviations assumées`, point 1) écrit :

> « `recipe_difficulty` et `variety` ne sont PAS dérivés du style. **Aucune des deux n'a de
> lecteur dans les deux générateurs** (`readCookingCapacity` les calcule, personne ne les lit ;
> le seul lecteur vivant est `keel-plan-feedback-v1`, qui lit la colonne). »

Et `cooking_plan.ts:428-433` répète l'affirmation dans le code, en gras, avec « vérifié le
2026-09-03 ».

**C'est faux.** Les deux champs ont un lecteur vivant, dans **les deux** générateurs :

- `supabase/functions/_shared/keel/meal_generation.ts:4073-4076`, dans **`buildMealPrompt`** :
  ```ts
  ...(args.recipeDifficulty
    ? [`recipe level they want: ${args.recipeDifficulty}`]
    : []),
  ...(args.variety ? [`repetition they accept: ${args.variety}`] : []),
  ```
- `generate-meal-v1/index.ts:2227` : `...capacity,` dans l'objet passé à `buildMealPrompt`.
- `generate-household-meal-v1/index.ts:4409` : `...capacity,` dans l'objet du
  `const built = buildMealPrompt({…})` de cette lane.
- `readCookingCapacity` remplit bien les deux clés des deux côtés
  (`generate-meal-v1/index.ts:520-521`, `generate-household-meal-v1/index.ts:589-590`), et
  `resolveCookingCapacity` les laisse traverser par `...input.declared`.

**Sonde jetable** (fichier `_shared/keel/zz_verif_probe_test.ts`, écrit, exécuté, **supprimé**,
`git status` vérifié vide après) — appel réel de `buildMealPrompt` avec le `PROMPT_BASE` de
`cook_the_day_before_test.ts` :

```
SANS contient 'recipe level':                     false
AVEC contient 'recipe level they want: keen':     true
AVEC contient 'repetition they accept: varied':   true
DELTA octets:                                     60
```

**60 octets de consigne modèle** entrent dans le `userMessage` quand les deux champs sont
posés. La chaîne est donc VIVANTE et sert le modèle.

**Ce que ça change** : la déviation (a) n'est pas « on ne dérive pas ce que personne ne lit »
(argument légitime), c'est « on ne dérive pas ce que le modèle lit ». Conséquence directe et
mesurable : un compte qui répond « J'aime cuisiner » à P2 reçoit `sessionMinutes = 120` mais
garde `recipe_difficulty` et `variety` **à ce qu'ils valaient avant** — c'est-à-dire, pour
tout compte neuf, `null` : le prompt de v26 ne dit **rien** du niveau de recette ni de la
répétition acceptée, alors que la personne vient exactement de répondre à cette question.
`COOKING_STYLE_PROFILE` porte `difficulty` et `variety` (`cooking_plan.ts:87-89`) et **rien
ne les consomme**.

**Ce que le bâtisseur doit faire** : soit dériver les deux dans `resolveCookingCapacity`
(deux lignes), soit réécrire le motif — mais alors sans l'affirmation d'absence, qui est
démentie par la mesure ci-dessus. Et corriger le commentaire `cooking_plan.ts:428-433`, qui
inscrit l'affirmation fausse **dans le code**, où elle survivra au journal.

---

## ❌ DÉFAUT n°2 — le compteur de la gamelle N'ATTEINT AUCUNE LIGNE. La compensation de la déviation (c) n'existe pas.

C'est le défaut le plus coûteux du lot, et il tue **la première des deux compensations**
que le bâtisseur oppose au champ optionnel.

**Ce que le journal promet** (§Déviations, point 3, et sa RÉSERVE encadrée) :

> « **Ce que le compteur montre alors, et c'est ce qui le sauve :**
> `generated_from.household.work_lunch = {mouths: 0, cold: 0}` est écrit **sur chaque ligne**,
> y compris au cas nominal. Un lot débranché se lit donc en une requête […] »

**Il n'est écrit sur aucune ligne.** Le compteur est calculé, puis jeté.

**Mesure — la chaîne complète, grep exhaustif sur `supabase/functions` hors tests :**

```
$ grep -rn "\.workLunch\|workLunch\." supabase/functions --include="*.ts" | grep -v _test
_shared/keel/household_meal_generation.ts:1707:  if (workLunch.length === 0) return nothing;
_shared/keel/household_meal_generation.ts:1885:  const workLunch = workLunchBlock(input.members, input.workLunch ?? []);
_shared/keel/household_meal_generation.ts:1961:    workLunch.block,
_shared/keel/household_meal_generation.ts:2113:    workLunch: { mouths: workLunch.mouths, cold: workLunch.cold },
```

`:2113` est la **dernière** ligne de la chaîne : elle pose le compteur dans l'objet rendu par
`buildHouseholdPromptBlocks`, et **personne ne le relit**.

```
$ grep -n "workLunch"  generate-household-meal-v1/index.ts
4505:    const workLunchRows: Array<{      ← la LECTURE de la colonne
4523:        workLunchRows.push({          ← la LECTURE
4538:      workLunch: workLunchRows,       ← l'ENTRÉE passée au constructeur
$ grep -n "work_lunch" generate-household-meal-v1/index.ts
4496 (commentaire) · 4513 .select("id, work_lunch") · 4521 parseWorkLunch · 4531 issue
```

**Aucune occurrence en sortie.** Et `promptTrace` (`generate-household-meal-v1/index.ts:7258`),
qui est **le** véhicule des compteurs vers `generated_from.household` (`…:7386 ...promptTrace`),
porte bien `eating_out: household.eatingOut` (`:7266`) — **mais pas de `work_lunch`.**
Le voisin dont D6.2 devait être le jumeau a son compteur ; la gamelle n'en a pas.

**MUTATION (la preuve, pas la lecture).** J'ai remplacé
`household_meal_generation.ts:2113` par `workLunch: { mouths: 0, cold: 0 },` — un compteur
qui ment toujours, de la façon exacte que la réserve dit vouloir détecter :

```
ok | 4876 passed | 0 failed | 1 ignored (29s)
```

**Zéro rouge sur 4 876 tests.** Restauré par `cp` depuis la copie de scratch, `cmp` vert,
`git status --short` vide.

**Ce que ça coûte, en reprenant les mots de la réserve elle-même** : la requête de contrôle
que le bâtisseur a écrite dans son journal —
`generated_from->'household'->'work_lunch'->>'mouths'` — rendra **`NULL` sur 100 % des lignes,
pour toujours**, c'est-à-dire exactement le signal qu'il a défini comme « le câblage est parti ».
Le filet conçu pour rattraper un `workLunch` oublié est lui-même absent. Il ne reste donc, en
face du `?`, **qu'une seule** compensation : le test de câblage par lecture de source.

**Et ce test-là ne couvre pas la sortie.** `work_lunch_reaches_the_plan_test.ts:141`
(« la lane FOYER passe le champ, **et compte ce qu'il a donné** ») n'assère que quatre chaînes,
toutes en **entrée** : `workLunch: workLunchRows,`, `parseWorkLunch(row.work_lunch)`,
`.select("id, work_lunch")`, `work_lunch_unreadable`. **Le nom du test affirme le compteur ;
ses assertions ne le touchent pas.** C'est la forme exacte du faux vert que le journal §6.4
dit chasser.

Et le mandat §5.6 nomme la chose explicitement : « **D6.2** : bloc de prompt […] à côté de
`eatingOutBlock`, **compteur**. » Le bloc est là, le compteur est mort-né.

**Ce que le bâtisseur doit faire** : ajouter `work_lunch: household.workLunch,` dans
`promptTrace` (`generate-household-meal-v1/index.ts:7258-7266`, à côté de `eating_out`), puis
étendre `work_lunch_reaches_the_plan_test.ts:141` d'une assertion sur cette chaîne de sortie —
et vérifier qu'elle rougit quand on la retire.

---

## ❌ DÉFAUT n°3 — l'explication attribue à la personne des jours qu'ELLE N'A PAS CHOISIS (rang 2 retourné)

Le mandat §5.6 et la règle de rang 2 (MASTER §2.1 n°9) exigent que **les `cookDays` dérivés et
le nombre de sessions soient DITS**, et que « une phrase qui affirme le contraire de ce que la
garde a fait » n'existe pas. Le lot fait **l'inverse** au cas nominal.

**La chaîne, ligne à ligne :**

1. `cooking_plan.ts:465` — `resolveCookingCapacity` **remplace** `cookDays` par la dérivation :
   `cookDays: [...plan.cookDays],`.
2. `generate-meal-v1/index.ts:3694` (et `generate-household-meal-v1/index.ts:6031`) passent cette
   valeur au champ de faits nommé **`declaredCookDays`** :
   `declaredCookDays: (capacity.cookDays ?? []) as never,`.
3. `plan_rationale.ts:114` documente ce champ ainsi : « **Les jours que l'élève a COCHÉS.**
   `[]` = il n'en a coché aucun. »
4. `plan_rationale.ts:1141` : `lines.push(copy.cookDeclaredKept(renderDays(declared, …)))`.
5. `plan_rationale.ts:477` / `:728` :
   FR « **Tu cuisines** ${days}, et **c'est ce qui a été gardé**. » ·
   EN « **You cook on** ${days}, and **that is what was kept**. »

**SONDE JETABLE** (`_shared/keel/zz_verif_probe2_test.ts`, écrite, exécutée, **supprimée**,
`git status` vide après) — le cas **nominal** de la table de l'ANALYSE §2.2, « un juste milieu »
+ 2 courses, 7 jours mangés, personne n'a coché **aucun** jour :

```
plan.sessions = 2 · plan.cookDays = ["mon","thu"] · plan.notes = []
--- fr ---
   • Ce plan couvre 7 jours, à partir d'aujourd'hui.
   • Tu cuisines lundi et jeudi, et c'est ce qui a été gardé.
--- en ---
   • This plan covers 7 days, starting today.
   • You cook on Monday and Thursday, and that is what was kept.
```

**Deux faussetés dans une phrase, dans les deux langues** : « tu cuisines lundi et jeudi » est
une **attribution** (elle n'a rien dit), et « c'est ce qui a été gardé » sous-entend qu'on a
retenu **sa** réponse. C'est très précisément le défaut que ce même fichier raconte avoir payé
le 2026-09-01 (`plan_rationale.ts:120-125`), rouvert par l'autre bout : on ne fait plus dire à
l'explication l'inverse du **filtre**, on lui fait dire l'inverse de **l'origine**.

**Et le nombre de sessions n'est PAS dit au cas nominal.** `plan.notes` est vide, donc ni
`styleCapsSessions` ni `daysCapSessions` ne partent. Deux sessions sont posées, deux vagues de
courses en découlent, **aucune ligne ne le dit**. Les deux phrases A2 ne s'allument que sur un
plafond (`style_caps_sessions` n'est d'ailleurs atteignable que par `minimal` + 3 courses —
`sessionCap` vaut 3 pour `balanced` et `keen`, et `runs ≤ 3`). Le mandat demandait que le
nombre de sessions soit dit ; il l'est **uniquement quand il a été rogné**.

**Ce que le bâtisseur doit faire** : (i) séparer le fait dérivé du fait déclaré — passer les
jours dérivés sous un champ à eux, ou porter dans `PlanRationaleFacts` l'origine (`declared`
vs `derived`), et écrire une phrase qui dit « le plan pose ses sessions lundi et jeudi » ;
(ii) ajouter la ligne du **cas nominal** qui nomme le nombre de sessions. Aujourd'hui la
sortie est byte-identique à celle d'un compte qui aurait vraiment coché lundi et jeudi.

---

## ✅ Rouges étrangers — antériorité PROUVÉE, et la liste qu'on m'a donnée était incomplète

- **vitest**, 5 rouges : `coverage-guard` ×2, `awayFrom` ×2 **et**
  `mealBoxes.int.test.ts › readDishes … un contenant sans bouche … ne sort pas`.
  Ce 5ᵉ n'était pas dans ma liste d'attendus. **Rejoué sur worktree détaché à `31ee930f`**
  (la base d'antériorité, avant A1 et avant A2) :
  `Tests 1 failed | 44 passed (45)` — **le même**. Il est **antérieur**, A2 n'y est pour rien
  (`readDishes` vit dans `frontend/src/keel/api/mealGeneration.ts`, hors du diff A2).
  ⚠️ La liste de rouges attendus du chantier devrait en compter **cinq**, pas quatre.
- **Deno type-check**, rejoué **à `31ee930f`** : `Found 18 errors`, portés par
  `daily_pulse.ts`, `daily_pulse_test.ts`, `daily_pulse_locale_test.ts`,
  `draft_note_classify.ts`, `draft_note_classify_io.ts`, `draft_note_classify_test.ts`,
  `pot_demand_test.ts`. **Exactement le même jeu, le même compte qu'à `7b8b8a49`.**
  A2 n'ajoute **aucun** rouge de type-check.
  (Note : `written_instruction_check_test.ts`, nommé dans la baseline qu'on m'a donnée, ne
  porte **aucune** erreur — ni à la base ni à la pointe.)

---

## ✅ Mutations rejouées — les trois du mandat, plus deux de mon choix

| # | Mutation | Attendu | Vu |
|---|---|---|---|
| M1 | `readCookingStyle` : clé absente ⇒ `"minimal"` | rouge | **rouge — 7 échecs** (`A2 — clé absente = JAMAIS DEMANDÉ…`, 3 cas D2.5, `⛔ on ne descend pas sous le plancher…`, `LOT 4C — noBaseline…`, `« non » allège la session…`, `« en partie » coûte moins cher…`) · `4869 passed / 7 failed` |
| M2 | plafonds de session retirés (style + dur) | rouge | **rouge — 1 échec** : `A2 — « le moins possible » PLAFONNE les sessions à deux, jamais les courses` · `4875 / 1` |
| M3 | D6.1 débranché (`...rosterAway` retiré de l'union) | rouge | **rouge — 1 échec** : `D6.1 — la lane SOLO lit household_members.away_days, en union` · `4875 / 1` |
| **M2b** *(la mienne)* | **SEUL** `if (wanted > MAX_COOKING_SESSIONS)` retiré | ? | **VERT — `4876 / 0`**. Le plafond dur à 3 est **inatteignable** (`runs ≤ 3` par `GROCERY_RUNS`, `sessionCap ≤ 3`). Ce n'est pas un défaut (comportement identique), mais la formule « `min(runs, 3, cap)` » a un terme mort : c'est le **cap du style** qui mord, jamais le 3. |
| **M4** *(la mienne)* | une migration **plus récente** portant la boucle, avec une autre liste fermée (`29990101000000_ZZ_SONDE…sql`, créée puis supprimée) | rouge si le test suit la **dernière** | **rouge** : `⛔ la liste fermée du SQL est celle du TypeScript … FAILED`, `17 passed / 1 failed`. Après suppression : `18 passed / 0 failed`. **La réparation du nom de fichier en dur tient.** |

Toutes restaurées par `cp` depuis copies de scratch, `cmp` vert, `git status --short` vide
après chacune. Jamais `git checkout <fichier>`, jamais `git stash`.

---

## ❌ DÉFAUT n°4 — « équipement AVANT style, mesuré sur le HTML rendu » n'est ni tenu sur `/app/plan`, ni mesuré nulle part

Le mandat §5.6 l'écrit noir sur blanc : « **équipement avant style, mesuré sur le HTML rendu** ».
L'ANALYSE §2.2 en donne le motif : « **le congélateur gate « 1 course »** ».

**(a) L'ordre est INVERSÉ sur `/app/plan`.** Mesuré à la ligne :

```
frontend/src/keel/components/MealBuilder.tsx
  1181  <CookingStyleField
  1188  <GroceryRunsField      ← « combien de courses ? », la question gatée
  1195  <OneCookingSessionField
  1366  <KitchenEquipmentCard  ← le congélateur, 178 lignes PLUS BAS
```

Sur `/app/plan`, on demande donc « combien de courses ? » — et on accepte « une seule » —
**avant** d'avoir demandé s'il y a un congélateur. C'est exactement l'enchaînement que le motif
du mandat interdit : la réponse « 1 » se transforme en 2 sessions
(`runs_1_needs_freezer`, `cooking_plan.ts:266-269`) à cause d'une question posée plus bas dans
la même page. Dans l'entonnoir, l'ordre est bon (`SetupPage.tsx:3267` `TableStepPlanning`, qui
porte `KitchenEquipmentCard`, est rendu avant `RequestStep`/`:6953` sur la même étape
`request`) — mais **une des deux surfaces sur deux** respecte la règle, et les deux montent les
mêmes composants.

**(b) Aucun test ne le mesure, et surtout pas sur le HTML rendu.** Le seul test d'ordre du lot
est `oneCookingSessionField.int.test.ts:366` (« ⛔ le STYLE vient AVANT la cadence ») :
il compare `src.indexOf("<CookingStyleField")` à `src.indexOf("<GroceryRunsField")` — donc
**style vs courses**, pas **équipement vs style**, et sur le **texte source**, pas sur le HTML
rendu. `tableStepPlanning.int.test.ts` rend bien du HTML (`renderToStaticMarkup`) mais compare
`setup.equipment.tool_oven` à `setup.work_lunch.title` — il ne connaît pas le style. Le diff A2
n'ajoute **aucun** `renderToStaticMarkup` (`git diff … | grep -c renderToStaticMarkup` → `0`).

**Ce que le bâtisseur doit faire** : remonter `KitchenEquipmentCard` au-dessus de
`CookingStyleField` dans `MealBuilder.tsx`, et écrire le test d'ordre **sur le HTML rendu** que
le mandat demandait, couvrant équipement → style → courses sur les deux surfaces.

---

## 🟠 SIGNALEMENT BLOQUANT (pré-fusion, cross-lane) — la migration d'A2 est passée SOUS la tête du registre, une seconde fois

Lecture seule, base locale partagée :

```
$ …psql -At -c "select version from supabase_migrations.schema_migrations order by 1 desc limit 5;"
20260903180000
20260903172000
20260903170000     ← A1, appliquée
20260903150000
20260903120000
```

`20260903171000` (A2) **n'est pas appliquée** — et je l'ai vérifié par l'effet, pas par le
registre : le port ne contient pas `grocery_runs`
(`pg_proc.prosrc like '%grocery_runs%'` → `0`), et le commentaire de
`student_goals.practical_constraints` ne mentionne pas `cooking_style` → `NON`.
**La base est intacte : la méthode « copie de scratch sans `begin;`/`commit;` » du bâtisseur a
bien tenu, et rien n'a fui.** C'est à porter à son crédit.

**Mais deux migrations d'autres lanes se sont posées au-dessus depuis** :
`20260903172000_la_boite_du_membre_est_un_fait_par_bouche.sql` et
`20260903180000_un_interdit_de_maison_ne_vise_quun_mineur.sql`, toutes deux **appliquées**.
`20260903171000 < 20260903172000` : au moment de la fusion, `supabase migration up` la trouvera
**hors ordre** et la **sautera en silence** (cicatrice connue de ce dépôt, MASTER §2.2 n°12).

**Et rien ne le verrait.** `field_change_test.ts` compare le TypeScript au **fichier** de
migration — il reste vert que la migration ait tourné ou non. Le seul contrôle qui mordrait est
le bloc `do $$` **de la migration elle-même**, qui ne s'exécute pas si elle est sautée. Le
symptôme en production serait : `WRITABLE_FIELDS` ouvert côté TypeScript, port SQL qui refuse
`cooking_style` par `forbidden_field`, et l'effet D2.5 (« pas eu le temps ») qui échoue sans
message.

Le journal note que ce numéro était **déjà** un renumérotage (`…141000` était passé sous la
tête). **C'est la deuxième fois.** Geste humain requis à la fusion : **renuméroter au-dessus de
`20260903180000`**, relire le registre juste avant, puis `supabase migration up` et vérifier
`[A2] contrôle: 4/4`.

---

## ✅ Ce qui est PROUVÉ

**Statique**
- Le diff `2b57bfa9..7b8b8a49` (10 commits : 8 d'A2 + 2 correctifs A1 `7863c897`, `82d49b60`)
  touche **39 fichiers**, tous dans le périmètre §5.6 + i18n + journal. Seul ajout non nommé au
  mandat : `_shared/keel/precedence_binding.ts` (+6) — l'empreinte d'arbitrage `v23`,
  conséquence obligée du bump foyer. **Aucun fichier hors mandat.**
- `tsc -b --force` **exit 0**. Deno **4 876 / 0 échec**. Vitest **2 050 / 2 075**, 5 rouges tous
  prouvés antérieurs à `31ee930f`.
- **Bumps** : `v25 → v26` (tronc), `v22 → v23` (foyer). **Un cran chacun, un seul lot.**
  **13 épinglages vivants**, tous à jour, **aucun périmé** — le défaut d'A1 n'est pas répété.

**Le module pur `cooking_plan.ts`**
- `sessions = min(runs, MAX_COOKING_SESSIONS, cap(style), joursMangés)` — lu ligne à ligne
  (`:265-287`), et **muté** (M1, M2 rouges).
- **Il PLAFONNE, il ne pousse pas** : aucune branche n'augmente `wanted`, sauf
  `runs_1_needs_freezer` (1→2) qui est un **refus nommé**. L'interdit « forcer une session non
  demandée » est tenu.
- « 1 course » ⇒ `impliesOneSession: input.runs === 1` (`:472`), calculé sur la **demande** et
  non sur la sortie ; la porte du congélateur reste `askedOneCookingSession && hasFreezerDeclared`
  chez l'appelant — **aucune quatrième définition**.
- `freezer: null` refuse comme `false` (`:266`, `!== true`). Vérifié.
- Rang 0 = la veille (`:294-295`, `i === 0 ? 0 : …`).

**Les interdits du mandat**
- ✅ **Aucun champ « jours de cuisine » à l'écran** : `oneCookingSessionField.int.test.ts:86-95`
  interdit `plan.cooking.days_label`, `setup.plan.cook_days` **et** le littéral `cookDays` dans
  `MealBuilder` **et** `SetupPage`.
- ✅ **Une seule définition de `hasFreezerDeclared`** : `_shared/keel/kitchen_equipment.ts:208`
  (serveur) + son miroir **préexistant** `frontend/src/keel/api/kitchenEquipment.ts:129`, tenu par
  `freezerMirror.int.test.ts`. A2 n'en crée **aucune troisième**.
- ✅ **Aucun `CHECK` SQL sur la valeur** : la migration l'écrit et le motive (`:23`, `:105`) ;
  `grep -i check` ne rend que des commentaires et le CHECK **préexistant** de `goal`.
- ✅ **`readCookingCapacity` modifiée des deux côtés, et le test qui les compare EXISTE** :
  `work_lunch_reaches_the_plan_test.ts:177` (« A2 — les deux lanes lisent la MÊME cuisine »),
  qui compare les **clés lues** (pas les octets) et refuse en plus qu'un `index.ts` recopie
  `sessionCap`. C'est ce que le mandat exigeait.
- ✅ **Entonnoir** : `cooking_style`/`grocery_runs` en `weight: "wrong"`
  (`onboarding.ts:621`, `:629`), `cooking_time_min` en `"better"` (`:605`) ;
  `setup.plan.time` et `COOKING_SESSION_MINUTES` **absents** de `SetupPage`, garde à
  `oneCookingSessionField.int.test.ts:384-393`.

**Déviation (b) — motif VÉRIFIÉ, il est vrai**
`LOGISTICS_FIELDS` (`retained_item.ts:280-286`) = `cook_days`, `cooking_time_min`,
`recipe_difficulty`, `variety`, `budget_amount` — **les deux clés de P2 n'y sont pas**.
Et cette liste est bien **énumérée au modèle** : `draft_note_classify.ts:294`
``` `  { "field": one of ${LOGISTICS_FIELDS.join(" | ")}, "value": ... }` ```.
`field_change.ts:107-108` les ajoute **après** le spread, et `field_change_test.ts:77-82` garde
explicitement qu'elles n'entrent pas dans `LOGISTICS_FIELDS` « par la bande ». **Motif exact.**

**Déviation (d) — motif VÉRIFIÉ**
`daysToEat` est bien la fenêtre **mangée** et non la présence : `deriveCookingPlan` ne reçoit
aucune liste d'absences, et `eaten = max(1, round(daysToEat))` (`:257`). Les absences ne
resserrent donc pas la cadence. Le raisonnement (« qui déjeune dehors mardi est chez lui lundi
soir ») est cohérent avec le code.

**D6.1 — VÉRIFIÉ**
`generate-meal-v1/index.ts:1578-1603` : lecture de `household_members.away_days`
(`.select("away_days")`), panne **nommée** (`roster_away_days_unreadable`, `:1592`), et
**union** avec `practical_constraints.away_days` (`...rosterAway,` à `:1603`, à côté de la
source profil `:1598-1601`). Test de câblage **sur source privée de ses commentaires**
(`work_lunch_reaches_the_plan_test.ts:41-47`) — la discipline anti-faux-vivant est respectée.
**Muté (M3) → rouge.**

**D6.2 — bloc VÉRIFIÉ, compteur MORT (défaut n°2)**
`workLunchBlock` (`household_meal_generation.ts:1698`) est bien à côté d'`eatingOutBlock`, et
sa sortie entre dans le `userSuffix` à `:1961`, juste après le bloc voisin. Six cas Deno le
couvrent, dont « sans gamelle, **PAS UN OCTET** ». **Mais son compteur ne sort nulle part** —
voir défaut n°2.

**La migration `20260903171000` — lue**
Liste fermée étendue (`:172`, `'cooking_style', 'grocery_runs'`) **et** `WRITABLE_FIELDS`
côté TypeScript (`field_change.ts:107-108`) : les deux côtés. Contrôle `do $$` à 4 points,
**avec** le garde-fou contre le contrôle qui se saute (`:235-245` : `goal`/`content_locale`
`not null`, `goal` sous CHECK). Le test de parité **suit désormais la dernière migration** et
**je l'ai muté** (M4) : rouge attendu, vu, restauré.

**Les deux champs, sur le HTML RENDU** (sonde vitest jetable, `renderToStaticMarkup`, écrite,
exécutée, supprimée) :
```
<label for="p-style" …>How do you want to cook?</label>
<select id="p-style" class="block w-full min-w-0 rounded-card …">
  <option value="" selected>Not answered yet</option>
  <option value="minimal">As little as possible — I reheat</option>
  <option value="balanced">A middle ground</option>
  <option value="keen">I like cooking, bring it on</option>
</select>
<label for="p-runs" …>How many food shops?</label>
<select id="p-runs" …><option value="">Not answered yet</option>
  <option value="1">Once</option><option value="2">Twice</option><option value="3">Three times</option>
```
- `<select>` natifs porteurs de `w-full **min-w-0**` : **sûrs à 320 px par construction**
  (la cicatrice `flex-1`/`min-width:auto` ne s'applique pas).
- **Aucune clé i18n brute** ne fuit dans le HTML (`expect(html).not.toMatch(/plan\.cooking\./)`).
- `<label for>` correctement apparié à `<select id>` sur les deux champs.
- **14 clés** ajoutées dans les **deux** packs, dans un bloc délimité ; la parité est tenue par
  `i18n/parity.int.test.ts`, verte dans le run entier.
  ⚠️ Le lot **commite** `en.ts`/`fr.ts` alors que MASTER §2.2 n°19 dit de ne pas les commiter et
  de laisser E fusionner. Mon mandat de vérification les autorise explicitement ; je le **nomme**
  parce que c'est un point de conflit probable à la fusion.

---

## Les quatre déviations : motif vérifié ou démenti

| # | Déviation | Motif annoncé | Verdict |
|---|---|---|---|
| **(a)** | `recipe_difficulty` et `variety` non dérivés | « aucune des deux n'a de lecteur dans les deux générateurs » | ❌ **DÉMENTI, mesuré.** `buildMealPrompt` (`meal_generation.ts:4073-4076`) les émet ; **les deux** lanes le nourrissent par `...capacity` (solo `:2227`, foyer `:4409`). Sonde : **+60 octets** de consigne modèle. Voir défaut n°1. |
| **(b)** | `WRITABLE_FIELDS` oui, `LOGISTICS_FIELDS` non | « cette liste est énumérée au modèle par `draft_note_classify` » | ✅ **VÉRIFIÉ.** `draft_note_classify.ts:294` l'énumère littéralement ; les deux clés sont absentes de `LOGISTICS_FIELDS` (`retained_item.ts:280-286`) et une garde le tient (`field_change_test.ts:77-82`). |
| **(c)** | `HouseholdPromptInput.workLunch` optionnel, **deux** compensations | ① un compteur sur chaque ligne ② un test de câblage par lecture de source | ❌ **À MOITIÉ FAUX.** ② existe (`work_lunch_reaches_the_plan_test.ts:141`). ① **n'existe pas** : le compteur n'atteint jamais `generated_from` ; muté en `{0,0}`, **4 876 tests restent verts**. La réserve écrite par le bâtisseur décrit avec précision un risque **dont il a lui-même désarmé le détecteur**. Voir défaut n°2. |
| **(d)** | Les absences ne resserrent pas la cadence | « `daysToEat` est la fenêtre mangée, pas la présence » | ✅ **VÉRIFIÉ.** `deriveCookingPlan` ne reçoit aucune absence ; `eaten = max(1, round(daysToEat))` (`cooking_plan.ts:257`). |

---

## Invariants §2.4, dans la mesure du jugeable

- **C1 — la fenêtre** : hors A2 (c'est A1). Non rejouable sans run réel. **ROUGE (run)**.
- **C2 — la jointure cuisine** : « le nombre de sessions = celui que `deriveCookingPlan` a
  demandé, **et la rationale le dit** ». La première moitié est vraie par construction
  (`resolveCookingCapacity` est l'unique source, muté → rouge). **La seconde est FAUSSE au cas
  nominal** : sans note de plafond, aucune ligne ne nomme le nombre de sessions (défaut n°3).
  ❌ **C2 partiellement violé.**
- **C3 — les courses** : « nombre de vagues = sessions ; la première vague tombe sur le rang 0 ».
  Demande un plan réel. **ROUGE (run)**.
- **C7 — l'entonnoir** : `canGenerate` seule source du bouton, plus de case « durée de session »
  (garde à `oneCookingSessionField.int.test.ts:384-393`, vérifiée). ✅ sur ce que A2 touche ;
  le rendu à trois étapes demande une session. **Partiellement ROUGE (session)**.

---

## NON PROUVÉ / ROUGE — et le geste humain exact

| # | Ce qui n'est pas vu | Pourquoi | Geste humain |
|---|---|---|---|
| R1 | Les 6 runs réels (a)…(f) du §4 du journal | Fenêtre modèle + runtime edge, hors de mon poste | Restart `docker restart supabase_edge_runtime_Sophia_2`, `TIMEOUT_MS=900000 ./scripts/local_extend_kong_functions_timeout.sh`, fixture `qa0903c` par SQL, puis le script du §4 du journal. **Attendus écrits avant le run** : (a) 1/1, (b) 2/2, (c) 3/3, (d) `sessions=2` + **une seule** phrase de congélateur, (e) 5 midis absents, (f) `work_lunch` `mouths ≥ 1` — ⚠️ **(f) ne peut PAS passer aujourd'hui** : la clé n'est jamais écrite (défaut n°2). |
| R2 | Les deux champs **dans la page**, à 320 et 1280 px, deux langues | `/app/plan` et `/app/setup` sont derrière une garde ; **aucun mot de passe n'a été saisi, aucun jeton forgé, `auth.sessions` jamais touché** | Ouvrir une session `qa0903c` à la main sur un vite lancé **depuis le worktree CUISINE** (le serveur 5209 de cette machine sert l'**arbre principal**, où A2 n'existe pas), puis mesurer `document.scrollWidth` à 320 px. *(J'ai rendu les deux composants isolément en HTML statique — voir §PROUVÉ ; ce qui manque est leur voisinage dans la page.)* |
| R3 | Le rendu FR des deux champs | La sonde `renderToStaticMarkup` sans DOM retombe sur le pack EN | Même geste que R2. Les 14 clés FR sont **lues** dans `fr.ts` et la parité est verte. |
| R4 | `migration up` réel des deux migrations | Commande à risque **et** numéro hors ordre (voir signalement) | Renuméroter A2 **au-dessus de `20260903180000`**, relire le registre, `supabase migration up`, exiger `[A2] contrôle: 4/4`. |
| R5 | L'ordre équipement→style **sur le HTML rendu** | Aucun test ne le mesure, et la page demande une session | Écrire le test manquant (défaut n°4), puis le vérifier à l'écran. |

---

## Ce que cette vérification PRÉ-FUSION ne peut pas juger

`7b8b8a49` n'est **pas** dans l'arbre principal ; six fichiers partagés sont tenus par une
session voisine. Je n'ai donc **rien** pu dire de :

1. **Les interactions avec A5 et A8.x**, fusionnés entre-temps. Deux points de contact que je
   vois venir : `SetupPage.tsx` (A2 réécrit `RequestStep:6927-6971` ; A5/A6 touchent la même
   page et A6 **retire** `WorkLunchCard` de l'étape 3) et `MealBuilder.tsx` (A2 insère quatre
   composants entre `:1181` et `:1195`).
2. **`plan_feedback_retained.ts`** — le bâtisseur le dit lui-même (§7 de son journal) : son
   effet D2.5 est écrit contre **sa** base et **doit être replacé** sur le lot B de la session
   voisine, qui réécrit ce module. **Conflit annoncé.**
3. **`household_merge_notice_io.ts`** et la région fusion, touchés au minimum par A1 et croisés
   par la lane FOYER.
4. **`en.ts` / `fr.ts` / `catalog.ts`**, commités par A2 contre la consigne MASTER §2.2 n°19
   (« E fusionne ») : trois lanes écrivant dans les mêmes packs, c'est le conflit le plus
   probable de la fusion.
5. **La numérotation de migration** : elle est **déjà** invalidée par ce qui a été fusionné
   pendant que je vérifiais (voir signalement bloquant).
6. **Le compte de rouges vitest attendus** a bougé : il en faut **cinq**, pas quatre
   (`mealBoxes` prouvé antérieur à `31ee930f`).

---

## Récapitulatif des défauts

| # | Fichier:ligne | Ce qui est faux | Ce que le bâtisseur doit faire |
|---|---|---|---|
| **1** | `_shared/keel/cooking_plan.ts:428-433` + journal §Déviations 1 | « aucun lecteur dans les deux générateurs » pour `recipe_difficulty`/`variety` — **démenti** : `meal_generation.ts:4073-4076` les émet dans le prompt, alimenté par `...capacity` des deux lanes (+60 octets mesurés) | Dériver les deux dans `resolveCookingCapacity` (deux lignes, `COOKING_STYLE_PROFILE` les porte déjà), **ou** réécrire le motif sans l'affirmation d'absence. Corriger le commentaire, qui inscrit le faux dans le code. |
| **2** | `generate-household-meal-v1/index.ts:7258-7266` (`promptTrace`) | `generated_from.household.work_lunch` **n'est jamais écrit** — le compteur de D6.2 est calculé (`household_meal_generation.ts:2113`) puis jeté. Muté en `{0,0}` : **4 876 tests verts** | Ajouter `work_lunch: household.workLunch,` dans `promptTrace`, à côté d'`eating_out` ; étendre `work_lunch_reaches_the_plan_test.ts:141` d'une assertion **sur la sortie**, et la muter. |
| **3** | `generate-meal-v1/index.ts:3694` + `generate-household-meal-v1/index.ts:6031` → `plan_rationale.ts:1141` | Les jours **dérivés** partent sous le fait `declaredCookDays` (« les jours que l'élève a COCHÉS ») ⇒ « **Tu cuisines lundi et jeudi, et c'est ce qui a été gardé** » / « You cook on Monday and Thursday, and that is what was kept » à quelqu'un qui n'a rien coché. Et **le nombre de sessions n'est pas dit** au cas nominal | Séparer dérivé et déclaré dans `PlanRationaleFacts` ; écrire la phrase « le plan pose ses sessions … » ; ajouter la ligne nominale qui nomme le nombre de sessions (rang 2). |
| **4** | `frontend/src/keel/components/MealBuilder.tsx:1181` vs `:1366` | Sur `/app/plan`, « combien de courses ? » est posé **avant** la question du congélateur qui la gate — l'inverse du mandat. Et **aucun** test ne mesure l'ordre équipement→style, ni sur source ni sur HTML rendu | Remonter `KitchenEquipmentCard` au-dessus de `CookingStyleField` ; écrire le test d'ordre **sur `renderToStaticMarkup`**, sur les deux surfaces. |
| **🟠** | `supabase/migrations/20260903171000_…sql` | Numéro passé **sous** la tête du registre (`…172000`, `…180000` déjà appliquées) ⇒ `migration up` la **saute en silence**, et le test de parité reste vert car il lit le **fichier** | Renuméroter au-dessus de `20260903180000`, relire le registre juste avant, appliquer, exiger `[A2] contrôle: 4/4`. **Deuxième renumérotage** — le journal en signale déjà un. |

Aucun défaut n'est un rouge de suite : **les suites sont vertes**. Les quatre se cachent
exactement là où une suite verte ne regarde pas — une affirmation d'absence, un compteur sans
lecteur, une phrase qui ment sans casser, un ordre d'écran que personne ne mesure.

---

## Discipline de poste

- Worktree `VERIF` détaché sur `7b8b8a49`, `git status --short` **vide** au début, après
  **chacune** des 6 mutations, et à la fin. Deux allers-retours `git checkout --detach`
  (`31ee930f` puis retour) pour l'antériorité — jamais `git checkout <fichier>`.
- **Aucun** `git stash`, `reset`, `restore`, `add`, `commit`, `push`. Toute mutation défaite par
  `cp` depuis une copie de scratch, **prouvée par `cmp`**.
- **Aucune migration appliquée.** Aucun `do $$` rejoué. Base lue en `-At` seulement ; état
  vérifié **avant et après** (port sans `grocery_runs`, commentaire sans `cooking_style`,
  registre inchangé à `20260903180000`).
- **Aucun mot de passe saisi, aucun jeton forgé, `auth.sessions` jamais touché**, aucune API
  admin d'auth, aucun secret de conteneur lu.
- **Aucun worktree ouvert** (disque à 3,2 Go). Antériorité par `git checkout --detach` sur le
  worktree existant.
- 4 sondes jetables écrites, exécutées, **supprimées** ; `.claude/launch.json` modifié pour le
  serveur puis **remis à l'octet près** (`git status` vide).
- Le serveur 5209 de cette machine sert `/Users/ahmedamara/Dev/Sophia 2` (**l'arbre principal**)
  et non le worktree — je ne l'ai **pas** arrêté (il appartient à une autre lane). J'ai lancé mon
  propre vite depuis le worktree sur **5219**.

---

# ROUGE

**Quatre défauts** (dont **un motif de déviation démenti par la mesure**, ce qui suffit seul au
ROUGE selon la règle du mandat), **plus un signalement bloquant de numérotation de migration**.
Les suites, les bumps, les épinglages, les mutations, les interdits et deux des quatre motifs
sont **verts**. Le lot est bon dans sa charpente ; il est faux dans trois de ses affirmations et
dans un ordre d'écran.
