# Rapport LOT 1B — vérification de l'affichage du plan par jour (P1)

**Branche** `ff-001-quotidien-du-coach` · **Date** 2026-08-17, 16:20 · **Aucun `push`, aucun merge.**
**Master prompt** `scratchpad/2026-08-17-MASTER-PROMPT-PLAN-FOYER-PAR-JOUR.md`, §LOT 1 / agent 1B.
**Rapport vérifié** `scratchpad/2026-08-17-1542-LOT1A-affichage-par-jour.md`.
**Commits du lot** `32cc10f4`, `5929c63b`, `c1fec3c4`, `6a4563cf` (avant le lot : `22b16bce`).
**Commit ajouté par cette vérification** `7542812a` (correctif d'un défaut trouvé, §5).

> **Verdict : LOT 1 vert, après un correctif.** Le rapport de 1A est exact sur tout ce que
> j'ai rejoué — sauf une phrase : « même corps de plan sur les deux surfaces (C8), et un
> test le tient ». Le test tenait le **câblage**, pas la **valeur** : le lecteur du
> brouillon jetait la liste de courses, et la carte « les courses du jour » ne pouvait
> structurellement pas apparaître à l'aperçu. Mesuré au navigateur, corrigé, remesuré.

| Épreuve | État |
|---|---|
| Statique (diff, `tsc -b`, vitest, antériorité des rouges) | ✅ prouvé, rejoué |
| Mutations (7 des 15 annoncées, les plus porteuses) | ✅ 7/7 au rouge, restaurées |
| Navigateur — `/app/plan` vue jour, rail, grille cliquable, « toute la semaine » | ✅ prouvé, 320 px **et** 1280 px |
| Navigateur — l'aperçu | ✅ prouvé (2 runs réels de brouillon) |
| Navigateur — `/app/household` en **secondaire** | ✅ prouvé |
| Cohérence C1, C2, C6, C8 | ✅ prouvé sur les plans des fixtures (deux réserves nommées §6) |
| i18n (20 clés dans les deux packs, namespaces, pas de `t()` module) | ✅ prouvé |
| **Défaut trouvé et corrigé** | 🟠 1 — l'aperçu sans ses courses (§5) |
| **Défaut trouvé et CONSIGNÉ, non corrigé** | 🔴 1 — un jour sans plat disparaît de la vue semaine (§7) |

---

## 1. Statique — rejoué, pas cru

### 1.1 Aucun fichier serveur touché

```
$ git diff 22b16bce..HEAD --name-only | grep -c '^supabase/'   → 0
$ git diff 22b16bce..HEAD --name-only | grep -c '_shared/'      → 0
```

Les 16 fichiers du lot sont **tous** sous `frontend/src/keel/`. Confirmé.

### 1.2 Typecheck

`cd frontend && npx tsc -b` → **exit 0**. Rejoué avec **`--force`** (le `tsc -b` seul est
incrémental et peut ne rien vérifier du tout) → **exit 0**. Rejoué encore après mon
correctif → **exit 0**.

### 1.3 Vitest complet

`npx vitest --config vitest.config.ts run` sur HEAD du lot :
**1029 passés, 20 skipped, 3 rouges**. Après mon correctif : **1030 passés** (+1, le mien),
**mêmes 3 rouges**.

### 1.4 L'antériorité des 3 rouges — prouvée par moi, autrement que 1A

1A a prouvé l'antériorité par un worktree détaché sur `22b16bce`. Je l'ai fait aussi, et
**ce worktree seul ne prouve pas grand-chose** : il rend **88 rouges**, parce que le travail
NON COMMITÉ de la lane i18n (`fr.ts`, `format.ts`, `plural.ts`… — voir `git status`) n'y
existe pas. Comparer 3 à 88 n'est pas une comparaison.

J'ai donc construit la comparaison qui isole vraiment le lot — **le disque d'aujourd'hui,
moins le lot** :

1. worktree détaché sur `22b16bce` ;
2. `frontend/src` **entier** recopié depuis l'arbre de travail (lanes étrangères comprises) ;
3. puis **seuls les 16 fichiers du lot** ramenés à leur contenu de `22b16bce`
   (les 6 fichiers créés par le lot : supprimés).

Résultat :

```
Test Files  3 failed | 63 passed | 5 skipped (71)
     Tests  4 failed | 991 passed | 20 skipped (1015)

× coverage guard … all Edge Functions (supabase/functions/*/index.ts) are in the known list
× coverage guard … all DB triggers are in the known list
× la liste fermée des refus de foyer > ne perd aucun motif au passage de `HouseholdPage`…
× plus aucun écrivain de la référence … > la RPC et la colonne, elles, sont toujours là
```

Les **trois** rouges de HEAD sont là **sans une ligne du lot**. Antériorité prouvée.
Le **quatrième** est un artefact de mon montage, et je le nomme plutôt que de le taire :
`ENOENT … supabase/migrations/20260812220000_household_member_body_and_reference.sql` — je
n'avais recopié que `frontend/src`, pas `supabase/`, et cette migration n'est pas dans
`22b16bce`. Elle existe sur le disque ; le test est vert sur l'arbre réel.

Renfort statique : ni `src/edge/coverage-guard.int.test.ts` ni
`src/keel/copy/planRefusals.int.test.ts` ne sont dans le diff du lot, et ni l'un ni l'autre
ne lit un fichier que le lot touche.

### 1.5 Suite Deno

Inchangée **par construction** (zéro fichier serveur), et verte : `agent-gate` la fait
tourner à chaque commit, y compris le mien — `agent-gate: pass`.

---

## 2. Les mutations — 7 rejouées, les plus porteuses

Chacune appliquée sur l'arbre propre, test lancé, puis `git checkout --` (les 16 fichiers
du lot étaient **propres** sur le disque avant : vérifié, donc la restauration est exacte).
Arbre revérifié propre après la dernière.

| # | Mutation | Fichier | Résultat |
|---|---|---|---|
| M1 | la jointure de vague ne compare plus la date (`waves[0]` pour tous) | `lib/planDayView.ts` | **rouge — 2 ✗** |
| M2 | le groupe `day: null` est filtré par la vue jour | `plan/PlanResult.tsx` | **rouge — 1 ✗** |
| M3 | la grille est débranchée de la sélection (`onSelectDay` retiré) | `plan/PlanResult.tsx` | **rouge — 1 ✗** |
| M4 | le mot `ingredients` entre dans `DishListByDay` (ceinture d'enrichissement) | `plan/DishListByDay.tsx` | **rouge — 1 ✗** |
| M5 | le mot `goal` entre dans `dishListByDay.ts` (ceinture lexicale étendue) | `lib/dishListByDay.ts` | **rouge — 1 ✗** |
| M6 | l'ordre des listes plates redevient le **calendrier** | `lib/dishListByDay.ts` | **rouge — 2 ✗** |
| M7 | la session du jour est débranchée (`sessions = []`) | `plan/PlanDayBlock.tsx` | **rouge — 1 ✗** |

**M6 est celle que je voulais voir.** 1A rapporte que sa première fixture (`wed` + `fri`)
**ne mordait pas** — l'ordre du plan et l'ordre du calendrier y coïncidaient — et qu'il l'a
renforcée avec un plat du `mon` de la semaine suivante. J'ai relu la fixture
(`dishListByDay.int.test.ts:18-32`) et rejoué la mutation : **rouge**. La correction de 1A
tient.

**§2.3 n°18 vérifié aussi** (« aucun test paramétré par sa propre constante ») :
`planDayView.int.test.ts` dérive ses entrées de `windowDayOrder`/`windowDates` mais assère
des **jetons littéraux** (`"fri"`, `"wed"`, `"sat"`, `"thu"`) et des **dates littérales**
(`"2026-08-15"`). Les deux côtés sont indépendants.

---

## 3. Le navigateur — la part que 1A n'avait pas faite

**Poste** : pile locale vivante (PostgREST 200, dix conteneurs `supabase_*_Sophia_2`),
runtime edge **vivant** (`generate-household-meal-v1` → **401**, pas 500/503 — donc ni
éteint ni à redémarrer ; aucun geste humain n'a été nécessaire).
JWT en **HS256**, mesuré sur le jeton rendu par GoTrue.
**Serveur de dev** : `preview_start` sur `frontend-a21` / port **5191** — une entrée que
personne n'utilisait (les 14 ports de `.claude/launch.json` sondés, tous libres), jamais
lancé par Bash.
**Sessions** : jeton injecté en `localStorage` (`sb-127-auth-token`), patron du harnais
commité — aucun formulaire rempli. Les **quatre** comptes visés répondent `OK` à
`signInWithPassword` avec `1234567` (mesuré avant de viser quoi que ce soit).

### 3.1 Les fixtures, et pourquoi celles-là

| Plan | Foyer | Fenêtre | Ce qu'elle prouve |
|---|---|---|---|
| `2ab8a495` | **Vidal**, maître `l2p-owner-…` | **lun 2026-08-17** + 3 j | aujourd'hui **dans** la fenêtre ⇒ le marqueur « aujourd'hui » |
| brouillon | Vidal, `intent: "draft"` | **jeu 2026-08-20** + 7 j | fenêtre **commencée en milieu de semaine**, 7 jours ⇒ C1 et le rail à 320 px |
| `2ab8a495` | Vidal, secondaire `l2p-nina-…` | idem | `/app/household` en secondaire |

Le plan de Vidal est **écrit** (« publié » au sens du chantier : `retired_at is null`,
`ends_on >= today`, `plan_kind = household`), 9 plats, 2 sessions, 43 articles.

### 3.2 `/app/plan` — la vue jour (1280 px)

Mesuré dans le DOM, pas regardé :

- **le défaut tombe sur aujourd'hui** : rail `["The whole week","Mon|17","Tue|18","Wed|19"]`,
  `aria-pressed="true"` sur **`Mon|17`**, titre de bloc « **Monday · Today** » ;
- **le jour porte ses trois choses** : carte « Cooking session · about 55 min » +
  « Roast chicken thighs · Tray of roast summer vegetables · Plain couscous », puis
  « **Groceries for this day — 43 items** », puis les plats du lundi ;
- **le rail filtre** : clic sur `Tue` ⇒ un seul bloc de jour, `Tuesday`, avec **SA** session
  (« about 45 min · Tomato lentils · Cooked rice ») et **aucune** carte de courses ;
- **la grille est le même sélecteur** : clic sur le `<th>` `Wed` de `PlanGrid` ⇒ bloc
  `Wednesday`, **et** le rail passe à `aria-pressed="true"` sur `Wed|19`. **Un seul état**,
  pas deux rails concurrents ;
- **« The whole week » restaure** : les trois blocs `Monday`, `Tuesday`, `Wednesday`
  reviennent, chacun avec sa session (55 / 45 / aucune) et la vague sur le seul lundi.

**« Aujourd'hui » est dit par la FORME, et je l'ai isolé.** Le cas piégeux est
« aujourd'hui ≠ jour sélectionné » : après le clic sur `Tue`,

| bouton | `aria-pressed` | `font-weight` | `color` |
|---|---|---|---|
| `Mon 17` (**aujourd'hui**, non choisi) | `false` | **600** | `rgb(35,25,31)` (encre pleine) |
| `Tue 18` (choisi) | `true` | 600 | `rgb(35,25,31)` |
| `Wed 19` (ni l'un ni l'autre) | `false` | 400 | `rgb(106,90,100)` (encre douce) |

Graisse et encre — **aucune couleur d'état**. Conforme.

### 3.3 Les mesures de débordement

| Surface | largeur | `document.scrollWidth` | `innerWidth` | verdict |
|---|---|---|---|---|
| `/app/plan` vue jour | 1280 | 1280 | 1280 | pas de débordement |
| `/app/plan` vue jour | **320** | **320** | **320** | pas de débordement |
| aperçu, 7 jours | 1280 | 1280 | 1280 | pas de débordement |
| aperçu, 7 jours | **320** | **320** | **320** | pas de débordement |
| `/app/household` secondaire | 320 | 320 | 320 | pas de débordement |

**Le rail défile DANS son conteneur, et je l'ai vu déborder.** À 3 jours il tient
(`scrollWidth 288 = clientWidth 288`) — ce cas ne prouve rien. Sur l'aperçu à **7 jours**,
à **320 px** : `railBox.scrollWidth = 468` contre `clientWidth = 288`, `overflow-x: auto`,
et la **page** reste à 320. C'est le conteneur qui défile, pas la page.

Les seuls éléments qui dépassent 320 px sont ceux de `PlanGrid` (`min-w-[30rem]`), qui
défile dans son propre conteneur — comportement **antérieur au lot**, visible à la
capture.

**Captures à scroll 0**, corps décalé par marge négative (le pane ne repeint qu'à scroll 0) :
vue jour à 320 px avec rail + « Monday · Today » + session + courses ; aperçu à 320 px avec
le rail débordant et `Sat 22` choisi ; `/app/household` secondaire à 320 px.

### 3.4 L'aperçu (`PlanDraftDialog`) — deux runs réels

`intent: "draft"` = **zéro écriture** en base (branche `isDraft`,
`generate-household-meal-v1/index.ts:3792-3812`). Le compteur de tours est
`React.useState(1)` **côté client** (`PlanDraftDialog.tsx:114`) : aucune fixture n'a été
avancée. Deux compositions, la seconde après mon correctif.

- **l'aperçu ouvre en semaine** : `aria-pressed="true"` sur « The whole week ». `defaultView="week"` fait ce qu'il dit.
- **les 7 jours, dans l'ordre du PLAN** : `Thursday, Friday, Saturday, Sunday, Monday,
  Tuesday, Wednesday` — la fenêtre commence **jeudi 2026-08-20**, et lundi sort **en
  cinquième**, pas en tête. Chaque jour **exactement une fois**. Le rail dit la même chose
  dans le même ordre. **C'est la preuve C1 au navigateur.**
- **le rail filtre l'aperçu aussi** : clic sur `Sat` ⇒ un seul bloc, `Saturday`.
- **chaque session sur SON jour** : `Friday` (45 min) et `Monday` (45 min) au 1er run ;
  `Thursday` (70 min) et `Sunday` (35 min) au 2nd.
- ⚠️ `PlanGrid` **ne se rend pas** dans l'aperçu (`0 <th>`) : le brouillon n'a pas de
  `rhythm`, donc `buildPlanGrid` ne rend aucune ligne et la grille s'efface. Comportement
  **antérieur au lot** ; conséquence : dans l'aperçu, le sélecteur est le rail seul. Pas un
  défaut, mais à savoir.

### 3.5 `/app/household` en secondaire (`l2p-nina-…`)

« WHAT THE HOUSEHOLD IS COOKING » **est devenu une lecture par jour** :

```
MONDAY     Breakfast — Yogurt, oats and plum breakfast bowls
           Lunch — Chicken, tomato and cucumber couscous bowls
           Dinner — Chicken with roast vegetables and green salad
TUESDAY    …
WEDNESDAY  …
```

Jours dans l'ordre du plan, moments dans l'ordre d'`EATING_OCCASIONS`.
**Et rien de plus — mesuré dans le DOM de la carte**, pas supposé :

| ce qu'on a cherché | présent ? |
|---|---|
| ingrédients / grammages | **non** |
| `why` (le pourquoi du plat) | **non** |
| `How:` / `Before serving:` (la méthode) | **non** |
| session de cuisine, durée | **non** |
| courses du jour | **non** |
| case à cocher | **0** |

La garde produit tient : un secondaire lit des titres, pas le plan du maître.

### 3.6 Aucune erreur de console

`read_console_messages` (erreurs seules, puis filtre `missing|i18n|throw|key`) sur les trois
surfaces : **aucun message**. En DEV, une clé hors namespace **lève** — donc aucune ne l'est
sur `/app/plan`, `/app/household` ni dans l'aperçu.

---

## 4. La cohérence (§2.4)

### C1 — la fenêtre ✅ (une réserve)

- Chaque jour **exactement une fois**, dans l'**ordre du plan** : prouvé au navigateur sur
  une fenêtre de 7 jours commencée **jeudi** (§3.4), et sur une fenêtre de 3 jours.
- Le groupe `day: null` : ⚠️ **prouvé au test et à la mutation seulement** (M2 : le filtrer
  rend un test rouge ; `PlanResult.tsx:190-197` le rend dans les deux vues). **Aucune des
  fixtures de la base ne porte de plat sans jour** — vérifié en SQL sur les cinq plans
  vivants : `plats_sans_jour = 0` partout. Je ne l'ai donc **pas vu à l'écran**, et je ne
  l'ai pas fabriqué : écrire dans un plan d'une base partagée par d'autres lanes coûte plus
  que ça ne prouve. **Consigné rouge à l'écran, vert au test.**

### C2 — la jointure cuisine ✅

En SQL sur le plan `2ab8a495`, les **10** entrées `dish.uses[]` :

| plat mangé | préparation | cuite le | verdict |
|---|---|---|---|
| mon ×5 | chicken, roast_veg, couscous | mon | cuit ≤ mangé |
| tue ×3 | lentils, rice, roast_veg | tue, tue, **mon** | cuit ≤ mangé |
| wed ×2 | chicken (**mon**), rice (**tue**) | mon, tue | cuit ≤ mangé |

**Zéro orphelin, zéro préparation cuite après usage.** Et l'écran dit la même chose que la
base : session `mon` = 55 min / 3 préparations, session `tue` = 45 min / 2 préparations,
`wed` = aucune — identique à `cooking_sessions` en base. **Chaque session est sur SON jour.**

### C6 — les courses ✅

J'ai fait calculer les vagues par le **module serveur lui-même**, en Deno, hors du navigateur
(`planGroceryWaves` + `windowDates` importés depuis `supabase/functions/_shared/keel/`) :

```
windowDates = {"mon":"2026-08-17","tue":"2026-08-18","wed":"2026-08-19"}
vague buyOn = 2026-08-17   items = 43
```

L'écran rend **exactement** ça : 43 articles sur le **lundi**, rien le mardi, rien le
mercredi. La jointure jeton→date passe bien par `windowDates`, et elle **discrimine** — si
elle rendait « la première vague pour tout le monde », mardi et mercredi afficheraient 43
aussi. Ils n'affichent rien.

`api/groceryWaves.ts` est un **pur réexport** du module serveur (relu ligne à ligne), et un
test interdit `MAX_FRIDGE_DAYS`/`PERISHABLE` dans les fichiers du lot. Aucun jumeau.

⚠️ **Réserve** : **aucun plan de la base n'a plus d'UNE vague** (vérifié sur `2ab8a495` et
`38f60307`). Le cas « deux vagues, chacune sur SA date » est donc prouvé par le test unitaire
— qui utilise bien **deux** vagues (`planDayView.int.test.ts:102-121`) et exige que le samedi
prenne la seconde et le mercredi la première — et par la mutation M1 (2 tests rouges), **pas
à l'écran**.

### C8 — les deux surfaces ✅ **après correctif**

C'est ici que le lot n'était pas vert. Voir §5.
Après correctif, l'aperçu et le plan adopté rendent le **même corps** : rail des jours,
bloc par jour, session du jour, **carte des courses du jour**, plats.
`setupDraftWiring.int.test.ts:148-156` (« `PlanResult` monté deux fois ») est intact — je ne
l'ai pas dé-verrouillé.

---

## 5. 🟠 LE DÉFAUT TROUVÉ ET CORRIGÉ — l'aperçu passait ses courses à un lecteur qui les jetait

### Ce que j'ai vu

Au navigateur, sur le **premier** aperçu (7 jours) : **aucun des sept jours** ne portait la
carte « Groceries for this day ». Le plan adopté, lui, la portait. Les deux surfaces ne
rendaient pas le même corps de plan.

### La cause

`api/planDraft.ts`, `readDraftPlan` :

```ts
// Le brouillon ne montre pas de courses: `PlanResult` n'en rend pas, et la
// liste se lit sur le plan adopté. Vide plutôt qu'un lecteur inutilisé.
shoppingList: [],
```

**Le commentaire a survécu à sa cause.** Il était vrai avant le LOT 1 ; il est faux depuis,
puisque c'est précisément ce que le lot a ajouté. Le serveur, lui, **rend** `shopping_list`
sur `intent: "draft"` depuis toujours (`generate-household-meal-v1/index.ts:3805`, dans la
branche `isDraft`) — seul le lecteur la jetait.

### Pourquoi le lot ne l'a pas vu

`1A` a écrit, à raison sur le câblage : « `PlanDraftDialog` passe `draft.shoppingList` —
même corps de plan sur les deux surfaces (C8), et **un test le tient** ». Le test
(`planDayView.int.test.ts:293-295`) assère le **littéral de source**
`shoppingList={draft.shoppingList}`. Il reste **vert** quand cette valeur est un `[]` en dur.
Prop requise, garde désarmée : le motif exact que 1A voulait éviter en refusant le `?`, mais
un cran plus loin dans la chaîne.

### Le correctif — `7542812a`

- `readShopping` s'**exporte** (`api/mealGeneration.ts:652`), comme `readFixedIntakes` et
  `readPreparations` avant lui — pour que l'aperçu et le plan adopté relisent la **même**
  ligne, pas deux ;
- `readDraftPlan` la lit : `shoppingList: readShopping(payload.shopping_list)`, commentaire
  réécrit avec la date et la cause ;
- **un test qui mord sur la VALEUR**, pas sur un littéral
  (`planDayView.int.test.ts` — « l'aperçu porte VRAIMENT ses courses »), avec son **cas
  passant** (pas de liste ⇒ `[]`, jamais un article vide).

**Mutation du correctif** : remettre `shoppingList: []` ⇒ **1 ✗**, et c'est le test neuf qui
tombe. Restauré, 26/26 verts.

**Remesure au navigateur**, second aperçu, après correctif :

```
Thursday   session 70 min   Groceries for this day — 66 items
Friday     —                —
Saturday   —                —
Sunday     session 35 min   —
Monday/Tuesday/Wednesday —  —
```

La carte est là, sur le premier jour, avec ses 66 articles. Capture jointe à la session.

`agent-gate` sur ce commit : **pass** (JWT, scan de motifs, compte de tests, suite Deno,
typecheck front, `deno check`, eslint).

---

## 6. Ce qui reste rouge, ou non prouvé

1. 🔴 **Le groupe `day: null` n'a pas été vu à l'écran** — aucune fixture n'en porte
   (`plats_sans_jour = 0` sur les cinq plans vivants). Prouvé au test + mutation M2
   seulement. Pour E : le fabriquer, ou le voir sur un run réel qui en produit.
2. 🔴 **Le cas « deux vagues » n'a pas été vu à l'écran** — aucun plan de la base n'a plus
   d'une vague. Prouvé au test (deux vagues, chacune sur sa date) + mutation M1.
3. ⚠️ **Les 3 rouges vitest étrangers restent rouges** (coverage-guard ×2, planRefusals ×1).
   Antériorité prouvée §1.4. Ils appartiennent à la lane i18n / au coverage-guard.
4. ⚠️ **Aucune génération de plan ADOPTÉ** n'a été faite : je lis des plans existants, et
   « Adopter » écrit. Hors de mon mandat, et c'est le parcours de E.
5. ⚠️ **La lane foyer saute toujours `keelGenerationModel()`** (`index.ts:3299`, `:3419`) —
   nommé, pas touché (§3.1 du master prompt). Mes deux brouillons sont donc composés par
   `GLOBAL_AI_MODEL` : aucune latence mesurée ici n'est une mesure du modèle KEEL.
6. ⚠️ Le pluriel des libellés de courses reste fait par deux clés (`_one`/`_many`) et non par
   `i18n/plural.ts` (module NON SUIVI d'une autre lane). Dette de la lane i18n, comme 1A l'a
   écrit.

---

## 7. 🔴 LE DÉFAUT CONSIGNÉ, NON CORRIGÉ — un jour sans plat disparaît de la vue semaine

**Ce n'est pas une hypothèse, c'est deux lignes de code.**

`lib/mealBuilderModel.ts:107-110` — `groupByDay` n'émet un groupe que si le jour a des plats :

```ts
for (const token of order) {
  const list = groups.get(token);
  if (list && list.length > 0) out.push({ day: token, dishes: list });
}
```

`plan/PlanResult.tsx:191` — la vue **semaine** rend `groups` tel quel :

```ts
const shownGroups = shown === "all" ? groups : [ … ];
```

**Conséquence** : un jour de la fenêtre **sans plat** n'a pas de bloc en vue semaine, donc
**sa session de cuisine et sa vague de courses y sont invisibles**. C'est exactement contre
la promesse du lot (« chaque jour porte SA session, SA vague »).

**Ce n'est pas complètement ouvert** : 1A a traité le cas en vue **jour** — le jour choisi se
rend « même sans plat » (`PlanResult.tsx:194-196`), avec un commentaire qui dit pourquoi. Et
la fenêtre de courses globale porte toujours toutes les vagues. Le trou est la vue semaine.

**Atteignable ?** Oui : une vague tombe un jour ≤ premier jour d'usage (`MAX_FRIDGE_DAYS`),
et rien n'oblige ce jour-là à porter un plat — un jour d'absence déclarée, typiquement.

**Pourquoi je ne l'ai pas corrigé** : la réparation évidente — faire rendre à la vue semaine
tous les jours de `windowDayOrder` — **change la forme de la vue semaine pour tous les
plans** (des blocs de jour vides apparaissent) et croise la décision « les motifs des moments
vides ne se rendent qu'en vue jour ». C'est un arbitrage produit, pas un correctif trivial,
et le master prompt me demande de ne pas réparer en passant ce qui déborde du périmètre.

**La correction attendue**, pour 1A ou pour E :
en vue semaine, construire les blocs sur l'**union** des jours de `groups` et des jours qui
portent une session ou une vague — pas sur `windowDayOrder` entier (qui ajouterait des jours
vraiment vides), et sans toucher à `moments={[]}`. Un test : un plan dont un jour de la
fenêtre n'a **aucun** plat mais **une** vague ⇒ la vue semaine rend son bloc.

---

## 8. i18n — vérifié sur le disque

**Les 10 clés `meals.result.day_*` existent dans les DEUX packs** (comptées : 10 dans
`en.ts`, 10 dans `fr.ts`), aux mêmes noms, avec le même `{n}` sur `day_groceries_many`.
Les packs restent **NON COMMITÉS** (convention des lanes) : `en.ts` est modifié, `fr.ts` est
non suivi. Rien dans mes commits ne les touche.

**Namespace** : toutes sous `meals.*`. `i18n/catalog.ts` déclare `meals` pour les **trois**
pages qui montent ces rendus — `/app/plan`, `/app/household` et `/app/setup`. Aucune clé hors
namespace de page : `pageFrontier.int.test.ts` (13) et `pageSeams.int.test.ts` (2) sont verts,
et **aucun throw DEV n'est survenu** sur les trois surfaces visitées (§3.6).
Parité verte dans la suite complète.

**Aucun `t(...)` au niveau module** : balayage des 16 fichiers du lot pour une affectation de
module appelant `t`/`mealCopy`/`planCopy` → **zéro**.

Mon correctif n'ajoute **aucune clé**.

---

## 9. Ce que j'ai touché, et ce que je n'ai pas touché

- **Commit ajouté** : `7542812a`, trois chemins explicites
  (`api/mealGeneration.ts`, `api/planDraft.ts`, `lib/planDayView.int.test.ts`).
  Jamais `git add -A`, jamais `git stash`.
- **Aucun fichier étranger défait.** Les trois fichiers que j'ai modifiés étaient **propres**
  avant (vérifié : `git status --porcelain` vide sur eux) ; le `git diff` ne contient que mes
  lignes.
- **Aucune commande à risque** : ni `db push/reset`, ni `functions deploy`, ni `secrets`, ni
  `link`, ni `config push`. Aucune écriture en base : mes deux brouillons sont
  `intent: "draft"` (zéro écriture, branche `isDraft`) et le compteur de tours est
  client-side.
- **Aucun redémarrage de pile** : le runtime edge était vivant (401, pas 503), donc aucun
  geste humain n'a été demandé.
- **Worktree de vérification supprimé** (`git worktree remove`), arbre du lot revérifié
  propre après les 7 mutations.
- **Serveur de dev** sur `frontend-a21` / 5191, lancé par les outils de preview, jamais par
  Bash.
