# Rapport LOT 2A — le commentaire de préparation du jour J (P2)

**Branche** `ff-001-quotidien-du-coach` · **Date** 2026-08-17, 16:56 · **Aucun `push`, aucun merge.**
**Master prompt** `scratchpad/2026-08-17-MASTER-PROMPT-PLAN-FOYER-PAR-JOUR.md`, §LOT 2 / agent 2A.
**Rapports lus avant d'écrire** `…-1542-LOT1A-affichage-par-jour.md`, `…-1620-LOT1B-verification-affichage-par-jour.md`.

**Deux commits** : `bccf6291` (moteur) et `f3d4009c` (écran).
`git add -A` **jamais** utilisé, `git stash` **jamais** utilisé, chaque commit liste ses chemins.
`agent-gate` **pass** sur chacun (en `AGENT_GATE_STAGED_ONLY=1` — voir §7 pour pourquoi).

| Livrable | État | En une ligne |
|---|---|---|
| Schéma `same_day` + parseur (liste fermée, jamais de rejet) | ✅ livré | Patron `for_member_id` mot pour mot ; aucune lecture de `method`. |
| Compteur `same_day` dans `generated_from`, **deux lanes** | ✅ livré | 4 nombres, même population, à la RACINE des deux lignes. |
| Persistance **même à `null`** | ✅ livré | Posture `member_id` ; colonne `jsonb`, **aucune migration**. |
| Prompt : consigne + schéma + bump `MEAL_PROMPT_VERSION` | ✅ livré | v9 → `v10_same_day`. `HOUSEHOLD_PROMPT_VERSION` **immobile**, prouvé à l'octet. |
| `"uses"` déclaré deux fois — corrigé | ✅ livré | Test dédié : une seule déclaration dans le bloc du plat. |
| Rendu `DishCard` (+ vue jour du LOT 1) | ✅ livré | Bandeau en tête de carte, libellé issu du JETON. |
| Garde anti-durées-de-session **toujours mordante** | ✅ prouvé | Précisée, pas desserrée ; **cas passant ajouté**. |
| Tests Deno (19 neufs) + vitest (16 neufs) | ✅ verts | 3059 Deno · 1041 vitest (3 rouges étrangers, §6). |
| Mutations | ✅ **22/22 au rouge** | 11 serveur + 11 écran, toutes restaurées. |
| Navigateur / run réel | ⛔ **non fait, par consigne** | Appartient à 2B. Recette et requêtes SQL en §8-§9. |

---

## 1. Le schéma, et les quatre décisions qu'il porte

```ts
// supabase/functions/_shared/keel/meal_generation.ts
export const SAME_DAY_KINDS = ["none", "reheat_only", "assemble", "cook_fresh"] as const;
export const SAME_DAY_MAX_MINUTES = 120;
export interface DishSameDay { kind: SameDayKind; minutes: number | null }
// GeneratedDish gagne: sameDay: DishSameDay | null
```

**① Le jeton est déclaré, validé fermé, jamais déduit.** Le validateur est calqué sur
`for_member_id` : `cleanText(sd.kind).toLowerCase()` puis appartenance à `SAME_DAY_KINDS`.
Un test interdit `method.includes` / `method.toLowerCase` / `method.match` dans `DishCard`,
**et** les mots « reheat » / « réchauff » écrits en dur. Un test serveur passe deux plats dont
la `method` dit « reheat » trois fois — l'un en anglais, l'autre en français — et exige
`sameDay === null` sur les deux : sans déclaration, il n'y a pas de geste.

**② Un `same_day` refusé ne rejette JAMAIS le plat.** C'est la garde qui se paie en repas :
un dîner retiré parce qu'un modèle a écrit `warm_up` serait un champ informatif payé au prix
d'une assiette. Mutation S1 (`continue` sur le refus) ⇒ **2 tests rouges**.

**③ `minutes` est `number | null`, et le master prompt disait `number`.**
Décision prise seul, motivée : le jeton est la moitié qui manquait au produit (« à réchauffer »),
la durée est celle qui le rend décidable. Perdre le premier parce que le second est illisible
échangerait la moitié qui compte contre la moitié qui aide. Et `0` par défaut est exclu par le
précédent de `MealPreparation.activeMinutes` : *« pas de zéro par défaut, qui se lirait c'est
instantané »*. Le cas est **compté à part** (`minutes_missing`), donc il n'est pas maquillé.

**④ Un plafond de 120 min, nommé.** Au-delà, ce n'est plus le geste du soir mais une session
mal rangée, et l'écran annoncerait « à assembler — 240 min ». On **écrête et on nomme** ;
le jeton, lui, reste juste. Le test utilise des **littéraux** (999 → 120) : muter la constante
le fait tomber.

**⑤ Cohérence douce, comptée et nommée, jamais rejetée** : `reheat_only` sans `uses`
(« nothing to reheat »), `none` avec des `uses` (« at least the box comes out »). Ce sont des
`issues`, du même rang que `protein_anchor_missing` — on ne sait pas laquelle des deux moitiés
a tort.

## 2. Le compteur — quatre nombres, une seule population

```
generated_from.same_day = { dishes, declared, invalid, minutes_missing }
```

- **`minutes_missing` est un quatrième nombre, en plus des trois demandés.** `minutes` est un
  champ **déclaré par le modèle** : sans compteur, un lot où le geste arrive toujours sans sa
  durée ressemblerait à un lot qui marche. Les trois clés demandées par le master prompt sont
  là, aux mêmes noms ; la quatrième est additive et ne casse aucune requête de E.
- **À la RACINE de `generated_from`, sur les DEUX lanes**, pas sous `household`. Le champ vient
  du tronc et est lu par le parseur partagé : rangé sous `household` d'un côté et à la racine de
  l'autre, aucune requête ne le lirait sur les deux populations à la fois — et « la part de plats
  qui portent leur geste » n'a de sens que sur toute la population. `dish_owners` reste sous
  `household`, lui, parce que `for_member_id` n'est demandé que par l'enveloppe foyer.
  Un test de position le tient (mutation S10 ⇒ rouge).
- **Les quatre comptent sur la MÊME population — les plats gardés.** `declared` se lit sur la
  sortie ; `invalid`/`minutes_missing` sur un **quatrième tableau parallèle**
  (`keptSameDayFaults`) qui suit le `splice` du plafond de plats. Sans lui, un plat évincé
  continuerait de peser sur `invalid` pendant que `declared` l'oublierait — le défaut exact déjà
  payé sur `withheld`/`over_cap`, « gonflé et dégonflé en sens inverses ».
  ⚠️ **La fixture de ce test a dû être construite pour que le `splice` ait vraiment lieu** :
  avec quatre moments distincts, c'est le QUATRIÈME plat qui tombe (mesuré) et aucun `splice`
  ne se produit — le test serait resté vert sans rien prouver. La fixture double donc la case du
  petit-déjeuner, ce qui fait de « B » le plus jetable des gardés. Mutation S3 ⇒ rouge.
- **Gardé sur `clean`** : quand le verrou de sortie vide le plan, les quatre nombres tombent à
  zéro. Annoncer « 1 plat, 1 déclaré » sur un plan sans aucun plat serait un chiffre faux sur
  une ligne réelle.

## 3. Le prompt — un bump, deux populations vérifiées

- Section neuve `== WHAT TODAY ACTUALLY TAKES, ON EVERY DISH ==`, posée **juste après**
  `== HOW LONG THINGS TAKE ==` : c'est là que les deux temps se séparent, et la phrase qui les
  sépare est testée littéralement (`"minutes" IS NOT THE TIME OF THE COOKING SESSION`).
- `same_day` ajouté au bloc `== OUTPUT JSON SCHEMA ==`, **collé à `uses`** — le champ commente
  exactement ce que `uses` déclare.
- **`MEAL_PROMPT_VERSION` : `meal.en.v9_cooking_shape` → `meal.en.v10_same_day`.** Le bon axe :
  la consigne change pour **toutes** les populations (individuelle, foyer ordinaire, fusion,
  secondaire). Il n'existe aucune population qui verrait encore le prompt de v9, donc laisser le
  numéro immobile ferait servir par le cache un prompt qui ne demande pas le champ que le parseur
  compte. Le commentaire d'en-tête de la constante et celui de
  `household_merge_test.ts:2650` disent tous deux pourquoi — ce dernier expliquait jusqu'ici
  pourquoi on ne bumpait PAS ; il porte maintenant les deux raisonnements côte à côte.
- **`HOUSEHOLD_PROMPT_VERSION` ne bouge pas — prouvé à l'octet, pas affirmé.** Deux preuves :
  ① la suite `household_meal_generation_test.ts` (égalités de chaîne sur l'enveloppe) est verte
  sans une ligne modifiée ; ② un test neuf lit `household_meal_generation.ts` et exige que le mot
  `same_day` **n'y apparaisse pas** — le jour où quelqu'un l'y écrira, ce test tombera **avant**
  que la population foyer ne voie une consigne différente sous un numéro inchangé.
  Mutation S9 (écrire `same_day` dans l'enveloppe) ⇒ rouge.
- **`MEAL_TOKEN_FIELDS`** gagne `dishes[].same_day.kind (one of: none, reheat_only, assemble,
  cook_fresh)`. C'est le piège de `preparation_id` sur un autre champ : en français le modèle
  écrirait « réchauffage », la validation tomberait, et le bandeau disparaîtrait dans toutes les
  langues sauf l'anglais. Un test vérifie aussi qu'aucune entrée de `MEAL_TRANSLATABLE_FIELDS`
  ne contient `same_day`.
- **Le `"uses"` déclaré deux fois est corrigé** (`:1312` et `:1314` d'avant le lot). Un objet
  JSON à clé répétée est légal et **la seconde écrase la première** : le modèle lisait un exemple
  contradictoire sur le champ qui porte toute la jointure des lots. Corrigé ici plutôt qu'en lot
  à part — le bloc changeait de toute façon, et un second bump pour une accolade serait un cache
  invalidé pour rien. Mutation S7 ⇒ rouge.

## 4. Le rendu

`DishCard.tsx` : le bandeau se lit **sous le titre, avant le pourquoi, avant les ingrédients**
— une position, donc prouvée sur la source (`banner < why < ingredients`). Une **ligne** à filet
vertical, pas une carte de plus : le planning se lit d'un coup d'œil.

Libellé du jeton + durée en deux clés distinctes, jointes par le pack : bâtir la phrase en code
imposerait l'ordre anglais à toutes les langues.

**Le bandeau atteint la vue jour du LOT 1 sans une ligne de plus** : `PlanDayBlock` monte
`DishCard`, et un test dit que c'est bien par là qu'il passe.

### ⚠️ La garde des durées de session : précisée, jamais desserrée

`lib/dishSession.int.test.ts` interdit toujours les **trois** littéraux `active_minutes`,
`total_minutes`, `totalMinutes` dans `dishSession.ts` + `DishCard.tsx` — **pas un octet retiré**.
L'en-tête de la règle porte maintenant la distinction, en trois lignes :

```
· preparations[].active_minutes / .total_minutes → sessions de cuisine
· cooking_sessions[].total_minutes               → sessions de cuisine
· dishes[].same_day.minutes                      → LA CARTE DU PLAT
```

Et **un test neuf donne à cette garde son cas passant** : sans lui, on ne distinguerait pas
« la carte n'affiche aucune durée de session » de « la carte n'affiche aucune durée du tout »,
et le LOT 2 aurait pu être livré désarmé en restant vert. Mutation F5 (faire dépendre le rendu
de `session?.total_minutes`) ⇒ rouge : la garde mord toujours.

### Ce que le bandeau ne fait PAS

- **Rien ne s'affiche quand `same_day` est `null`.** Décision prise seul : `null` n'est pas
  « rien à préparer » — `none` dit ça, et c'est une affirmation du moteur. Afficher un bandeau
  par défaut écrirait un fait que personne n'a écrit ; ce dépôt a déjà tranché ce cas exact
  contre la coche automatique (« faits faux indémentables »). La mesure de ce silence est le
  compteur, pas l'écran. **Conséquence directe et assumée : la promesse P2 « un plat sans
  commentaire n'existe pas » est tenue par le PROMPT et mesurée par le COMPTEUR, pas garantie
  par l'écran.** C'est le premier chiffre à lire au run réel de 2B.
- **`same_day` rejoint les mots interdits dans `DishListByDay`** (la liste plate du
  secondaire) : le bandeau est une instruction de cuisine — ce que fait le maître, pas ce que
  lit une bouche venue voir ce que la maison mange. Mutation F6 ⇒ rouge.
- **`HouseholdDishView` reste une liste blanche** (`api/household.ts:1493-1521`) : `same_day`
  n'y entre pas, par construction. Aucun affichage neuf côté secondaire.

## 5. Les preuves

| Épreuve | Résultat |
|---|---|
| `deno test --allow-read --allow-env supabase/functions/_shared/keel/` | **3059 passés, 0 rouge** |
| `deno check` sur les deux fonctions edge modifiées | **ok** |
| `cd frontend && npx tsc -b --force` | **exit 0** (rejoué après chaque étape) |
| `npx vitest --config vitest.config.ts run` (complet) | **1041 passés**, 20 skipped · **3 rouges antérieurs et étrangers** (§6) |
| Mes tests neufs | **35** — 19 Deno (`meal_same_day_test.ts`) + 16 vitest (5 dans `dishSameDay.int.test.ts`, 4 dans `mealGeneration.int.test.ts`, 2 dans `dishSession.int.test.ts`, + assertions étendues) |
| Mutations | **22/22 au rouge**, toutes restaurées, tout vert ensuite |
| `agent-gate` (staged-only) sur chacun des 2 commits | **pass** |
| Requêtes SQL du compteur | **7 exécutées sans erreur** sur la base locale, et **prouvées sur une ligne synthétique** (§9) |

### Les 22 mutations, une par une

**Serveur** (fichier remis par `git checkout --` après chaque, arbre revérifié propre) :

| # | Mutation | Résultat |
|---|---|---|
| S1 | un `same_day` invalide **rejette** le plat | **rouge — 2 ✗** |
| S2 | le compteur est débranché (toujours zéro) | **rouge — 6 ✗** |
| S3 | le tableau parallèle ne suit plus le `splice` du plafond | **rouge — 1 ✗** |
| S4 | la liste fermée est ouverte (n'importe quel jeton passe) | **rouge — 1 ✗** |
| S5 | les minutes retombent à `0` au lieu de `null` | **rouge — 1 ✗** |
| S6 | la clé `same_day` n'est plus écrite quand elle vaut `null` | **rouge — 1 ✗** |
| S7 | `"uses"` est de nouveau déclaré deux fois | **rouge — 1 ✗** |
| S8 | le tronc ne bumpe plus (retour à v9) | **rouge — 1 ✗** |
| S9 | l'enveloppe foyer parle de `same_day` sans bumper | **rouge — 1 ✗** |
| S10 | le compteur foyer glisse sous `household` | **rouge — 1 ✗** |
| S11 | la lane individuelle n'archive plus le compteur | **rouge — 1 ✗** |

**Écran** (fichiers remis depuis une copie de sauvegarde — `git checkout` aurait aussi rendu
`en.ts`/`fr.ts` au travail d'une lane voisine) :

| # | Mutation | Résultat |
|---|---|---|
| F1 | le bandeau est retiré de la carte | **rouge — 2 ✗** |
| F2 | le bandeau passe **sous** les ingrédients (vrai déplacement) | **rouge — 1 ✗** |
| F3 | le lecteur accepte n'importe quel jeton | **rouge — 1 ✗** |
| F4 | les minutes retombent à `0` | **rouge — 1 ✗** |
| F5 | une durée de **session** remonte sur la carte | **rouge — 1 ✗** |
| F6 | `same_day` entre dans la liste plate du secondaire | **rouge — 1 ✗** |
| F7 | la liste fermée du front diverge du moteur | **rouge — 2 ✗** |
| F8 | un libellé manque au pack français | **rouge — 3 ✗** |
| F9 | un libellé gagne une raison corporelle (EN) | **rouge — 1 ✗** |
| F9b | le même, côté **français seulement** | **rouge — 1 ✗** |
| F10 | le geste est deviné dans `method` (matcher) | **rouge — 3 ✗** |

⚠️ **F2 n'a pas mordu du premier coup, et c'est consigné.** Ma première formulation supprimait
la ligne du bandeau au lieu de la déplacer — c'est-à-dire F1 déguisée en F2. Rejouée en
déplaçant vraiment le bloc sous `</ul>`, elle rend **rouge** le seul test de position. Une
mutation qu'on n'a pas vue mordre pour la bonne raison ne prouve pas la garde qu'elle vise.

⚠️ **F9/F9b sont la ceinture testée dans les DEUX langues** (cicatrice « garde testée dans une
seule langue ») : la version française seule suffit à faire rouge, et le test porte son **cas
passant** (« Just reheat » / « À réchauffer » passent la liste des mots interdits — sans quoi
elle bloquerait tout en ayant l'air de marcher).

## 6. Ce qui reste rouge, et ce qui n'est pas prouvé

1. ⛔ **Aucune vérification navigateur.** Par consigne : c'est 2B. Et le poste ne permettrait
   de toute façon rien de sérieux — **aucun plan de la base ne porte `same_day`**
   (mesuré : `157` plans, `0` avec la clé `generated_from.same_day`). Il n'y a donc littéralement
   rien à voir avant un run réel. Recette en §8.
2. ⛔ **Aucun run modèle.** Le runtime edge est **vivant** sur ce poste, mais il sert des
   `_shared` **périmés** : `meal_generation.ts` est modifié, donc **non rechargé**. Je n'ai rien
   redémarré (consigne explicite) et je n'ai fait aucun appel de génération. **Le taux
   `declared/dishes` est donc totalement inconnu** — c'est le premier chiffre du lot, et il
   n'existe pas encore.
3. ⚠️ **Les 3 rouges vitest étrangers restent rouges** : `src/edge/coverage-guard.int.test.ts`
   (×2) et `src/keel/copy/planRefusals.int.test.ts` (×1). Antériorité **déjà prouvée par 1B**
   (§1.4 de son rapport, par reconstruction « le disque d'aujourd'hui moins le lot ») ; aucun de
   ces fichiers n'est dans mon diff, et aucun ne lit un fichier que je touche.
4. ⚠️ **La lane foyer saute toujours `keelGenerationModel()`** (`generate-household-meal-v1
   /index.ts:3299`, `:3419`) — nommé, pas touché (§3.1 du master prompt). Toute mesure de qualité
   ou de latence d'une génération foyer se lit avec ça en tête, y compris celle de `same_day`.
5. ⚠️ **`SAME_DAY_MAX_MINUTES = 120` est un choix, pas une mesure.** Personne n'a mesuré la
   distribution réelle des durées de geste — elle n'existait pas. Si le run réel de 2B montre des
   écrêtages fréquents, c'est le plafond qu'il faut relever, pas le modèle qu'il faut resserrer.
6. ⚠️ **`meal_pdf_locale_test.ts` est un fichier NON SUIVI d'une autre lane, et je l'ai modifié
   sur le disque** (4 lignes : `sameDay: null` dans sa fixture, sans quoi `deno check` refuse le
   fichier et toute la suite est rouge). **Il n'est dans aucun de mes commits.** Rien d'autre n'y
   a été touché.

## 7. Les décisions tranchées seul

| Décision | Option rejetée, et pourquoi |
|---|---|
| **`minutes: number \| null`** au lieu du `number` du master prompt | Rendre `same_day` invalide quand la durée manque : on perdrait le JETON — la moitié qui manquait au produit — à cause de la moitié qui ne fait qu'aider. `0` par défaut : « c'est instantané » est une affirmation que personne n'a faite. |
| **Un 4e nombre, `minutes_missing`** | Les trois demandés seuls : `minutes` est aussi un champ déclaré par le modèle, et sans compteur un lot où la durée n'arrive jamais ressemblerait à un lot qui marche. Additif — les trois clés du master prompt sont intactes. |
| **Le compteur à la RACINE de `generated_from`, pas sous `household`** | Le ranger comme `dish_owners` : celui-ci est sous `household` parce que `for_member_id` n'est demandé QUE par l'enveloppe foyer. `same_day` vient du tronc — une seule requête doit lire les deux populations. |
| **Aucun bandeau quand `same_day` est `null`** | Rendre « Rien à préparer » par défaut : ce serait affirmer un fait que le moteur n'a pas écrit, sur la surface exacte où « faits faux indémentables » a déjà été payé. Le silence se mesure au compteur. |
| **Plafond de 120 min, écrêté et nommé** | Jeter le `same_day` au-delà : on perdrait un jeton juste pour un nombre invraisemblable. Ne rien plafonner : « à assembler — 240 min » sur une carte de plat. |
| **`same_day` interdit dans `DishListByDay`** | Le laisser passer : c'est une instruction de cuisine, donc un enrichissement de la surface d'un secondaire — par une porte neuve, exactement comme `method` l'aurait fait. |
| **Fichier de tests Deno à part (`meal_same_day_test.ts`)** | Ajouter à `meal_generation_test.ts` (634 lignes, dont l'en-tête énumère ce qu'il protège) : le lot a ses propres invariants, et les noyer les rendrait illisibles. |
| **`agent-gate` lancé en `AGENT_GATE_STAGED_ONLY=1`** | Le lancer nu : par défaut il compare `HEAD` à **tout l'arbre de travail** et fait tourner eslint sur les fichiers des autres lanes — **25 erreurs eslint étrangères** (`i18n/en.ts`, `JoinHouseholdPage.tsx`, `TemplatesPage.tsx`, `lib/localization.ts`, `pages/Auth.tsx`), donc `exit 1` sans une ligne de moi. En staged-only il gate **mon** commit, et il passe. |
| **`parity.int.test.ts` COMMITÉ, packs non commités** | Le laisser sur le disque : c'est un test, pas un pack ; il était propre à HEAD ; et son exception est inerte tant que la clé n'existe pas (aucune garde d'« exception inutilisée » dans ce fichier — vérifié). |

## 8. Pour 2B — la recette exacte

**Le poste, tel que je l'ai laissé** : pile locale vivante, `supabase_db_Sophia_2` répond ;
runtime edge vivant (401 sur une fonction sans auth) **mais servant des `_shared` périmés**.
**Un run réel exige un redémarrage — geste humain, à faire valider** (§2.2 n°11) :

```bash
supabase stop && supabase start     # puis se DÉCONNECTER/RECONNECTER dans l'app
./scripts/local_extend_kong_functions_timeout.sh   # avant tout run long
```

Ce qu'il faut mesurer, dans l'ordre :

1. **`declared / dishes`** — le taux de service. C'est le chiffre du lot. Un modèle qui ignore
   la consigne est un **résultat**, pas un échec : consigne les octets et propose-moi le
   resserrage.
2. **`invalid`** — s'il est non nul, le modèle invente des jetons : lire lesquels dans les
   `issues` (requête ⑦) avant de toucher au prompt.
3. **`minutes_missing`** — le geste nommé sans sa durée.
4. **Les silences** (requête ⑥) — les plats où la clé est écrite à `null`. C'est la mesure de la
   promesse P2 « toujours », celle que l'écran ne peut pas tenir seul.
5. **Une génération foyer ET une individuelle** : le champ vient du tronc, les deux doivent
   déclarer. Un écart entre les deux lanes serait le signal que l'enveloppe foyer noie la
   consigne.
6. **C8** : le corps du brouillon et celui du plan écrit passent par le **même**
   `mealDishesPayload` (household : `index.ts:3560` → `lock.dishes` → `dishes`, utilisé dans la
   branche `isDraft` **et** dans la RPC). `applyHouseRuleLock` fait `{ ...dish, why: null }`,
   donc `same_day` traverse intact — **vérifié à la lecture, pas au run**.
7. **Au navigateur** : les quatre états sur la carte, 320 px **et** 1280 px, mesures
   `document.scrollWidth`, captures à scroll 0. Le texte du bandeau vient du modèle par le
   libellé du pack seulement — mais `break-words` est posé, à vérifier avec un titre long.

## 9. La requête SQL du compteur — prête à jouer

Fichier prêt : `scratchpad/same_day_counters.sql` (copié aussi ci-dessous).
**Les sept requêtes ont été exécutées telles quelles** contre la base locale
(`docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres`) : **aucune erreur**,
`0 ligne` partout — normal, aucun plan n'a encore traversé v10.
Et parce que « 0 ligne partout » ne distingue pas *« aucun plan v10 »* de *« la requête ne
trouve jamais rien »*, ①③④⑤ ont été **rejouées sur une ligne fabriquée en mémoire** (une CTE
`with student_generated_meals as (values …)`, **aucune écriture**) — elles rendent bien
`3 plats / 3 clés écrites / 1 écrite à null / 2 avec geste`, la distribution des jetons, et les
deux contradictions douces.

```sql
-- ① LE COMPTEUR ARCHIVÉ, PLAN PAR PLAN
select m.id, m.plan_kind, m.created_at,
       m.generated_from->>'prompt_version'                     as prompt_version,
       (m.generated_from->'same_day'->>'dishes')::int          as dishes,
       (m.generated_from->'same_day'->>'declared')::int        as declared,
       (m.generated_from->'same_day'->>'invalid')::int         as invalid,
       (m.generated_from->'same_day'->>'minutes_missing')::int as minutes_missing
from student_generated_meals m
where m.generated_from ? 'same_day'
order by m.created_at desc
limit 20;

-- ② LE TAUX DE SERVICE, PAR LANE — le chiffre du lot
select m.plan_kind,
       count(*)                                              as plans,
       sum((m.generated_from->'same_day'->>'dishes')::int)   as dishes,
       sum((m.generated_from->'same_day'->>'declared')::int) as declared,
       round(100.0 * sum((m.generated_from->'same_day'->>'declared')::int)
             / nullif(sum((m.generated_from->'same_day'->>'dishes')::int), 0), 1)
                                                             as pct_declared,
       sum((m.generated_from->'same_day'->>'invalid')::int)         as invalid,
       sum((m.generated_from->'same_day'->>'minutes_missing')::int) as minutes_missing
from student_generated_meals m
where m.generated_from ? 'same_day'
group by m.plan_kind
order by m.plan_kind;

-- ③ LA CONTRE-ÉPREUVE SUR LES PLATS — le compteur peut mentir, les plats non.
--    `key_written` doit valoir `dishes_in_jsonb`: la clé s'écrit MÊME à null.
select m.id, m.plan_kind,
       count(*)                                                       as dishes_in_jsonb,
       count(*) filter (where d ? 'same_day')                         as key_written,
       count(*) filter (where d->'same_day' = 'null'::jsonb)          as key_written_null,
       count(*) filter (where jsonb_typeof(d->'same_day') = 'object') as with_gesture,
       count(*) filter (where jsonb_typeof(d->'same_day') = 'object'
                          and d->'same_day'->>'minutes' is null)      as gesture_without_minutes
from student_generated_meals m,
     lateral jsonb_array_elements(coalesce(m.dishes, '[]'::jsonb)) as d
where m.generated_from ? 'same_day'
group by m.id, m.plan_kind
order by m.id;

-- ④ LA DISTRIBUTION DES QUATRE JETONS, ET LES DURÉES RÉELLES
select d->'same_day'->>'kind' as kind, count(*) as dishes,
       round(avg((d->'same_day'->>'minutes')::numeric), 1) as avg_minutes
from student_generated_meals m,
     lateral jsonb_array_elements(coalesce(m.dishes, '[]'::jsonb)) as d
where jsonb_typeof(d->'same_day') = 'object'
group by 1 order by 2 desc;

-- ⑤ C3 — LA COHÉRENCE DOUCE, PLAT PAR PLAT
select m.id, d->>'day' as day, d->>'title' as dish,
       d->'same_day'->>'kind' as kind,
       jsonb_array_length(coalesce(d->'uses', '[]'::jsonb)) as uses
from student_generated_meals m,
     lateral jsonb_array_elements(coalesce(m.dishes, '[]'::jsonb)) as d
where (d->'same_day'->>'kind' = 'reheat_only'
        and jsonb_array_length(coalesce(d->'uses', '[]'::jsonb)) = 0)
   or (d->'same_day'->>'kind' = 'none'
        and jsonb_array_length(coalesce(d->'uses', '[]'::jsonb)) > 0)
order by m.id;

-- ⑥ C3 — LE SILENCE DU MODÈLE: les plats sans aucun geste déclaré.
--    C'est la mesure de la promesse P2 « toujours ».
select m.id, m.plan_kind,
       count(*) filter (where d->'same_day' is null
                           or d->'same_day' = 'null'::jsonb) as silent_dishes,
       count(*)                                              as dishes
from student_generated_meals m,
     lateral jsonb_array_elements(coalesce(m.dishes, '[]'::jsonb)) as d
where m.generated_from ? 'same_day'
group by m.id, m.plan_kind
having count(*) filter (where d->'same_day' is null
                           or d->'same_day' = 'null'::jsonb) > 0
order by m.id;

-- ⑦ LES ISSUES DU LOT, TELLES QU'ARCHIVÉES — à lire AVANT de toucher au prompt
select m.id, i as issue
from student_generated_meals m,
     lateral jsonb_array_elements_text(
       coalesce(m.generated_from->'issues', '[]'::jsonb)) as i
where i like '%same_day%'
order by m.id;
```

## 10. Les clés i18n — sur le disque, NON commitées

`en.ts` (suivi, tenu par la lane i18n) et `fr.ts` (non suivi) sont modifiés sur le disque et
**absents de mes commits**, par la convention des lanes (§2.15). **5 clés, dans les deux packs**,
parité verte.

| Clé | en | fr |
|---|---|---|
| `meals.same_day.none` | Nothing to prepare | Rien à préparer |
| `meals.same_day.reheat_only` | Just reheat | À réchauffer |
| `meals.same_day.assemble` | Assemble on the plate | À assembler |
| `meals.same_day.cook_fresh` | Cook it fresh | Cuisine minute |
| `meals.same_day.minutes` | {n} min | {n} min |

Namespace `meals.*`, déjà déclaré par `i18n/catalog.ts` pour `/app/plan`, `/app/household` et
`/app/setup`. Aucun `t(...)` au niveau module. `meals.same_day.minutes` est **identique dans les
deux langues** et a donc son exception dans `parity.int.test.ts`, à côté de `meals.energy.dish`
(« {n} kcal ») : « min » est le symbole international de la minute. Les quatre libellés voisins,
eux, sont bien rédigés — ce qui est la preuve que le bloc n'est pas recopié.

⚠️ Conséquence connue et assumée, la même qu'aux LOTS 1 et des 14-15/08 : mes commits
référencent des clés qui ne vivent que dans les packs du disque, et
`api/dishSameDay.int.test.ts` **importe `../i18n/fr`**, fichier non suivi. Une copie fraîche sans
le lot i18n ne compile pas. La dette est celle de la lane i18n
(`i18n-layer-is-uncommitted-foreign-work`) ; le précédent en HEAD est `parity.int.test.ts`, qui
importe déjà `./fr`.

## 11. Fichiers touchés, et ce qui ne l'a pas été

**Commit `bccf6291` — le moteur** (5 chemins) :
`_shared/keel/meal_generation.ts`, `_shared/keel/meal_same_day_test.ts` (neuf),
`_shared/keel/household_merge_test.ts`, `generate-meal-v1/index.ts`,
`generate-household-meal-v1/index.ts`.

**Commit `f3d4009c` — l'écran** (7 chemins) :
`api/mealGeneration.ts`, `api/dishSameDay.int.test.ts` (neuf), `api/mealGeneration.int.test.ts`,
`components/DishCard.tsx`, `lib/dishSession.int.test.ts`, `lib/dishListByDay.int.test.ts`,
`i18n/parity.int.test.ts`.

**Aucune migration.** `dishes` et `generated_from` sont des colonnes `jsonb` ; les plans écrits
avant ce lot n'ont simplement pas la clé, et les deux lecteurs (serveur et front) traitent son
absence comme `null`.

**Aucune commande à risque** : ni `db push/reset`, ni `functions deploy`, ni `secrets`, ni
`config push`, ni `link`. **Aucune écriture en base** — les seules requêtes jouées sont des
`select` (et une CTE en mémoire, sans table). **Aucun redémarrage de pile.**

**Aucun fichier étranger défait.** Les 12 fichiers commités étaient **propres à HEAD** (vérifié
par `git diff`, hunk par hunk : toutes les suppressions sont les miennes). Les seuls fichiers
étrangers que j'ai touchés sur le disque sont `en.ts`, `fr.ts` (packs, convention) et
`meal_pdf_locale_test.ts` (§6.6) — **aucun n'est commité**.
