# Rapport LOT 3A — la séparation par personne dans la vue jour (P3)

**Branche** `ff-001-quotidien-du-coach` · **Date** 2026-08-17, 18:25 · **Aucun `push`, aucun merge.**
**Master prompt** `scratchpad/2026-08-17-MASTER-PROMPT-PLAN-FOYER-PAR-JOUR.md`, §LOT 3 / agent 3A.
**Rapports lus avant d'écrire** `…-1542-LOT1A`, `…-1620-LOT1B`, `…-1656-LOT2A`, `…-1738-LOT2B`,
`PLAN-PAR-PERSONNE-RAPPORT.md` (2026-08-14).

**Trois commits** : `64f48e6a` (la donnée), `6b08bb7f` (l'écran), `33b28320` (C4).
`git add -A` **jamais** utilisé, `git stash` **jamais** utilisé, chaque commit liste ses chemins.
`agent-gate` **pass** sur chacun, en `AGENT_GATE_STAGED_ONLY=1` (§8).
**Aucun fichier `supabase/` ni `_shared/` touché** — le lot est front pur.

| Livrable | État | En une ligne |
|---|---|---|
| `dish.member_id` arrive jusqu'à l'écran | ✅ livré | Le champ existait en base depuis le lot C ; le lecteur du front le jetait. |
| `member_portions` : un seul lecteur, trois surfaces | ✅ livré | Déménagé chez la table qui le porte ; les parts voyagent avec LEUR plan. |
| Séparation « Pour la table » / « Pour {prénom} » | ✅ livré | Par moment, dans le bloc jour, bandeau du jour J compris. |
| Les parts sous le plat qu'elles servent | ✅ livré | `shareFor` appelée, jamais recopiée. Plancher de deux bouches. |
| Gardes étendues (lexicale, matcher, `isOwner`, C8) | ✅ livré | + 3 défauts trouvés en chemin, tous corrigés (§4). |
| Tests neufs | ✅ **36** | 8 + 14 + 14 (dont 6 de câblage/langues), sur la VALEUR rendue. |
| Mutations | ✅ **16/16 au rouge** | dont **une qui n'a pas mordu du premier coup** (§6). |
| Navigateur / run modèle | ⛔ **non faits, par consigne** | Appartiennent à 3B. Ce qu'il faut savoir avant : §7. |

---

## 1. Le trou qu'il a fallu combler avant de dessiner quoi que ce soit

Le master prompt annonce les fondations comme acquises : *« Les fondations existent :
`dish.member_id` (lot C du 15/08), `member_portions[].preparation_shares`… »*

**Elles existent en base. Elles n'arrivaient pas à l'écran du plan.** Mesuré, pas supposé :

| Champ | Serveur | Front |
|---|---|---|
| `dishes[].member_id` | écrit **même à `null`** (`meal_generation.ts:3812`) | ⛔ **absent de `GeneratedDish`, jeté par `readDishes`** |
| `member_portions` | écrit, et **rendu aussi sur `intent:"draft"`** (`index.ts:3806`) | lu **uniquement** par `loadHouseholdMeal` (`/app/household`) |

Le rendu du plan (`PlanResult`, les deux surfaces) ne pouvait donc **structurellement pas**
savoir que deux plats d'un même moment ne sont pas pour les mêmes bouches. C'est la
famille de défaut que 1B a mesurée sur `shoppingList: []` — un champ que le serveur rend,
qu'un lecteur jette, sous un câblage vert.

### Ce que ça a décidé du dessin

**Une seule prop neuve sur `PlanResult` : `portions`.** Elle porte les deux choses dont la
séparation a besoin, parce qu'elles viennent de la même ligne : le **prénom** d'une bouche
(`display_name`, que le moteur recopie de la **ligne membre** au moment de composer —
F5, `household_portions.ts:1376`) et sa **part** (`preparation_shares`).

⚠️ **Et elles viennent de la ligne du plan RENDU, pas de `loadHouseholdMeal`.**
Celui-ci ne rend que le plan **courant** du foyer ; l'écran, lui, montre l'onglet qu'on
regarde — courant **ou suivant**. Les brancher l'un sur l'autre aurait posé les parts d'un
plan sous les plats d'un autre, sans que rien à l'écran ne le dise. `member_portions`
rejoint donc `MEAL_COLUMNS`, et le brouillon la lit dans son propre payload.

**Le type et son lecteur ont déménagé** de `api/household.ts` vers `api/mealGeneration.ts` :
`member_portions` est une colonne de `student_generated_meals`, au même titre que `dishes`.
Il était chez le foyer par accident d'histoire (une seule surface la lisait). `household.ts`
**réexporte** le type — aucun de ses importateurs ne change. Une seconde lecture du même
JSON aurait divergé au premier champ ajouté ; c'est déjà arrivé à `uses`.

---

## 2. Le dessin livré

### 2.1 Le modèle, pur — `lib/planDaySlots.ts`

`groupDayBySlot({ dishes, portions })` rend, **par moment** :

```
{ slot, table: [entrée], people: [{memberId, name, entries}], unnamed: [entrée], separated }
```

- **L'attribution vient de `dish.member_id`, et de rien d'autre.** Aucune lecture de titre
  nulle part sur ce chemin, et un test l'interdit littéralement.
- **L'ordre des moments est celui de la JOURNÉE** (`EATING_OCCASIONS`), pas celui où le
  modèle a écrit ses plats : c'est déjà l'ordre des deux listes plates du foyer
  (`dishListByDay`) et celui de la vue « qui mange quoi ». Un moment inconnu (`snack`,
  qui n'est plus proposé mais existe en base) passe en queue ; un plat sans moment ferme
  la marche. **Rien ne se perd**, et un test compte les entrées.
- **Les parts** sont jointes par `shareFor` (`planByPersonModel.ts`) — la fonction de la
  vue de comparaison, **appelée**, pas recopiée. Elle prend des `preparation_id` nus ; les
  plats du plan les portent sous `uses[{preparation_id, servings}]`. On lui donne les ids,
  on ne réécrit pas sa règle.

### 2.2 Le rendu — `plan/DayPersonSplit.tsx`

**Ce composant PLACE, il ne LIT pas.** Le rendu de la carte lui est passé (`renderDish`), et
le câblage (préparations, session, coche, chiffres) reste dans `PlanDayBlock` où il était.
Ce n'est pas une élégance : c'est la ceinture. Un objectif, un poids ou une calorie ne peut
pas entrer dans un composant qui ne lit **aucun champ** d'un plat.

```
POUR LA TABLE
│ ┌─────────────────────────────────────────┐
│ │ Yogurt, oats and plum bowls  [Breakfast]│
│ │ │ À assembler — 10 min                  │   ← le bandeau du LOT 2, intact
│ │ …                                        │
│ └─────────────────────────────────────────┘
│   Zoé — 2 portions de poulet                 ← la part, sous le plat qu'elle sert
│   Kid — 1 petite portion de poulet
POUR ZOÉ
│ ┌─────────────────────────────────────────┐
│ │ Greek yogurt bowls           [Breakfast]│
│ └─────────────────────────────────────────┘
```

- **Le cas majoritaire ne paie rien** : un moment sans plat dédié se rend **exactement**
  comme avant ce lot — les cartes à la suite, sans en-tête et sans filet. Poser « Pour la
  table » sur un dîner que tout le monde mange serait du bruit sur le chemin le plus
  fréquent du produit (l'entrée est à une bouche).
- **Un plat commun ne se répète JAMAIS sous une bouche** (option rejetée n°3 du 14/08). Un
  test compte les occurrences de titre : deux plats entrent, deux titres sortent.
- **`data-member-id`** sur la voie : la jointure est auditable dans le DOM sans relire le
  code — même geste que `data-preparation-id`. Le slug ne s'affiche pas ; un test vérifie
  les deux moitiés.

---

## 3. Les gardes, et ce qu'elles couvrent

| Garde | Comment elle tient | Mutation |
|---|---|---|
| **Jamais de matcher** | Les fixtures portent des titres **identiques**, dont un qui nomme « Zoe », et la bouche de la fixture s'appelle **« Zoe » sans accent** (§6). Un matcher attribuerait les deux. | N6 → rouge |
| **Plancher de deux bouches** | `SHARES_MIN_MOUTHS = 2`, appliqué **dans le modèle**. Même plancher que `PlanByPerson` : deux surfaces qui répondent à la même question ne peuvent pas partir de deux seuils. Test **non paramétré par la constante** (1 bouche, puis 2, en littéral). | N4 → rouge |
| **`isOwner`, la part d'un autre** | Écrite dans `MealBuilder` (`place?.isOwner === true ? … : []`). **Elle est aussi structurelle** : `member_portions` n'existe que sur un plan de foyer, `generate-meal-v1` n'en écrit aucune, et `loadMealPlans` filtre `user_id` — un secondaire ne peut pas en charger un. Mais une garde laissée au hasard d'une requête n'est pas une garde. | N8 → rouge |
| **Ceinture lexicale étendue** | `planDaySlots.ts` et `DayPersonSplit.tsx` rejoignent la liste `goal\|kcal\|calorie\|weightKg\|heightCm\|energy` de `planByPersonModel.int.test.ts`, **commentaires retirés**. | N13 → rouge |
| **Les deux langues** | Les deux libellés existent dans les deux packs, portent tous deux le trou `{name}`, **diffèrent** (pas de recopie), et une liste bilingue de motifs corporels (`goal/objectif/kcal/calorie/weight/poids/perte/loss`) mord sur chacun — **avec son cas passant** (les libellés réels la traversent). | N10 → rouge |
| **C8, l'aperçu** | `readDraftPlan` lit `member_portions` du payload de brouillon, et `PlanDraftDialog` la passe. Prouvé **à la valeur**, pas au littéral. | N9 → rouge |
| **`portions` REQUISE** | Pas de `?` sur `PlanResult` ni sur `PlanDayBlock`. « Paramètre de garde optionnel = garde désarmée ». | N7 → rouge (après §6) |
| **`PlanByPerson` intacte** | Ses quatre gardes (`isOwner` requis et fermant, < 2 bouches muet, aucun `HouseholdMemberView` en props, montage qui passe la garde) sont **inchangées** et vertes. | — |

---

## 4. ⛔ TROIS DÉFAUTS TROUVÉS EN CHEMIN, TOUS CORRIGÉS

### 4.1 `groupByDay` mangeait le plat dédié — trouvé en écrivant le test de chaîne

**Le plus grave, et il est en amont de tout ce lot.** `lib/mealBuilderModel.ts` identifiait un
plat par `titre|moment` pour ne pas afficher trois fois un plat de lot :

```ts
const identity = (dish) => `${dish.title.trim().toLowerCase()}|${dish.slot ?? ""}`;
```

Deux plats de **même titre** au même moment n'en faisaient donc qu'**un**. Le plat dédié de
Zoé — quand le modèle lui donne le même titre qu'à la table, ce qui est le cas naturel
puisque la divergence est dans la **part** — était **jeté avant tout écran**. Le foyer
perdait une assiette sur la seule case où deux bouches ne mangent pas la même chose.

⚠️ **Je ne l'ai pas trouvé en lisant le code : je l'ai trouvé parce qu'un test de valeur
rendait un plat au lieu de deux.** La fixture aux titres identiques, écrite contre un
matcher, a cogné dans une déduplication qui n'était pas prévue pour deux propriétaires.

**Corrigé** : l'attribution fait partie de l'identité (`titre|moment|member_id`).
**Le cas passant est testé** : le même plat de la même bouche, émis deux fois, reste une
seule carte — la déduplication des lots mord toujours (N14 → rouge sur les deux).

### 4.2 `buildPersonWeek` donnait deux petits-déjeuners à la même bouche — C4

Deux fonctions **voisines du même module** répondaient différemment à la même question :

| Fonction | Au moment où elle a son plat |
|---|---|
| `buildPlanByPerson` (la grille) | `own ?? shared` — **son plat remplace** celui de la table |
| `buildPersonWeek` (sa semaine) | **les deux** |

C4 dit : *« au moment M, chaque bouche a soit le plat commun, soit son plat dédié — jamais
zéro, jamais deux »*. La semaine individuelle de Christèle affichait donc deux
petits-déjeuners au même vendredi.

**Corrigé** dans `buildPersonWeek`, sur la seule lecture de `member_id`. ⚠️ **Un test
existant exigeait le contraire** (« la semaine de SA bouche porte les deux ») : il avait
tort, et il portait le **cas passant** d'une autre garde. Il a été **corrigé, pas
contourné** — le cas passant est réécrit sur le dîner, où il dit ce qu'il voulait dire (au
moment où elle n'a pas de plat à elle, le plat de la table reste le sien).

### 4.3 L'aperçu ne pouvait pas nommer une bouche — C8

Même famille que le défaut trouvé par 1B, sur un autre champ : le serveur **rend**
`member_portions` sur `intent: "draft"` alors qu'il n'en **écrit** aucune, et
`readDraftPlan` ne la lisait pas. Sans ça, la séparation par personne aurait existé sur le
plan adopté et pas à l'aperçu. **Corrigé et testé à la valeur** (le brouillon ressort du
lecteur avec ses parts et ses attributions), avec son cas passant (la lane individuelle
n'en rend aucune ⇒ `[]`, jamais une bouche inventée).

---

## 5. Les preuves

| Épreuve | Résultat |
|---|---|
| `cd frontend && npx tsc -b --force` | **exit 0** (rejoué après chaque étape et chaque restauration) |
| `npx vitest --config vitest.config.ts run` (complet) | **1091 passés**, 20 skipped · **3 rouges antérieurs et étrangers** (§7.3) |
| Suite Deno | **inchangée par construction** — zéro fichier `_shared/` touché ; `agent-gate` la fait tourner à chaque commit |
| `agent-gate` sur chacun des 3 commits | **pass** |
| Mes tests neufs | **36** — 8 (`api/planDishMember`) + 14 (`lib/planDaySlots`) + 14 (`components/planDaySeparation`, dont 4 de câblage et 4 de langues) ; + 2 tests existants réécrits |
| Mutations | **16/16 au rouge**, toutes restaurées, tout vert ensuite |
| Fichiers serveur touchés | **0** |

### Les 16 mutations, une par une

| # | Mutation | Cible | Résultat |
|---|---|---|---|
| A | `readDishes` jette `member_id` | `api/mealGeneration.ts` | **rouge — 4 ✗** |
| B | `MEAL_COLUMNS` perd `member_portions` | `api/mealGeneration.ts` | **rouge — 1 ✗** |
| C | `readDraftPlan` jette les parts du brouillon | `api/planDraft.ts` | **rouge — 1 ✗** |
| D | `readMemberPortions` garde les parts sans texte | `api/mealGeneration.ts` | **rouge — 1 ✗** |
| N1 | `member_id` est ignoré (tout va à la table) | `lib/planDaySlots.ts` | **rouge — 11 ✗** |
| N2 | `separated` toujours faux (aucun en-tête) | `lib/planDaySlots.ts` | **rouge — 7 ✗** |
| N3 | le plat commun est recopié sous chaque bouche | `lib/planDaySlots.ts` | **rouge — 3 ✗** |
| N4 | le plancher de deux bouches tombe | `lib/planDaySlots.ts` | **rouge — 2 ✗** |
| N5 | une bouche inconnue devient « la table » | `lib/planDaySlots.ts` | **rouge — 2 ✗** |
| N6 | **le prénom est deviné dans le TITRE** (matcher maison) | `lib/planDaySlots.ts` | **rouge — 2 ✗** |
| N7 | `PlanResult` cesse de descendre les parts | `plan/PlanResult.tsx` | **rouge — 1 ✗** ⚠️ §6 |
| N8 | `MealBuilder` perd la garde du maître | `MealBuilder.tsx` | **rouge — 1 ✗** |
| N9 | l'aperçu jette ses parts | `plan/PlanDraftDialog.tsx` | **rouge — 1 ✗** |
| N10 | le pack **français** perd un libellé | `i18n/fr.ts` | **rouge — 3 ✗** |
| N11 | `data-member-id` retiré du DOM | `plan/DayPersonSplit.tsx` | **rouge — 1 ✗** |
| N13 | le mot `goal` entre dans `planDaySlots.ts` | `lib/planDaySlots.ts` | **rouge — 1 ✗** |
| N14 | l'identité d'un plat oublie son attribution | `lib/mealBuilderModel.ts` | **rouge — 2 ✗** |
| N15 | le plat de la table reste dans son assiette (C4) | `lib/planByPersonModel.ts` | **rouge — 2 ✗** |
| N16 | le filtre C4 mord sur **tous** les moments | `lib/planByPersonModel.ts` | **rouge — 1 ✗** (le cas passant) |

---

## 6. ⚠️ DEUX MUTATIONS QUI N'ONT PAS MORDU DU PREMIER COUP — consignées

### N7 — le maillon `PlanResult → PlanDayBlock` n'était pas tenu

Remplacer `portions={props.portions}` par un `[]` **en dur** dans `PlanResult` laissait
**55 tests verts**. Mes tests de valeur montaient `PlanDayBlock` **directement** : ils
prouvaient le rendu du bloc, pas que le rendu du plan lui donne quoi que ce soit. C'est la
cicatrice du LOT 1 à l'identique, un composant plus haut — et l'assertion de source que
j'avais écrite portait sur `portions: props.portions` **dans `PlanDayBlock`**, pas sur le
passage.

**Réparé par un test qui monte `PlanResult`** — c'est-à-dire ce que les deux surfaces
montent réellement — avec deux plats dont un dédié, et qui exige « For Zoé » dans le HTML.
Mutation rejouée : **rouge**. C'est ce test qui a aussi fait tomber §4.1.

### N6 — le matcher ne mordait pas sur une fixture accentuée

La fixture nommait la bouche « **Zoé** » pendant que le titre disait « … for **Zoe** ». Un
matcher de titre n'y trouvait rien : le test serait resté vert **en ne prouvant rien**. La
fixture du test de matcher porte maintenant le prénom **écrit comme dans le titre**, et le
commentaire dit pourquoi. Mutation rejouée : **rouge**.

> Une garde qu'on n'a jamais vue mordre n'est pas une garde ; celle-ci ne mordait pas.

---

## 7. Ce qui reste rouge, ou non prouvé — pour 3B

1. ⛔ **Aucune vérification navigateur, aucun run modèle.** Par consigne. Rien de ce qui
   suit n'est « vu » : les deux largeurs, le débordement, la capture à scroll 0, la
   modale d'aperçu.
2. ⛔ **AUCUN PLAN DE LA BASE NE PORTE UN PLAT ATTRIBUÉ — mesuré, et c'est le fait le plus
   important pour 3B.**

   ```sql
   select count(*) from student_generated_meals m,
     lateral jsonb_array_elements(coalesce(m.dishes,'[]'::jsonb)) d
   where d->>'member_id' is not null;              -- → 0, sur TOUS les plans
   ```

   Sur les **six plans vivants**, un seul (`6620682c`, la fixture de 2B) écrit la clé
   `member_id` — **sur 24 plats, tous à `null`**. La séparation est donc **invisible sur
   toute la base** : 3B devra **fabriquer** un plat dédié en jsonb (c'est du jsonb, le
   master prompt l'autorise et demande de le nommer) ou obtenir un run réel qui produit
   un `parallel_dishes` par l'échelle de fusion.

   ⚠️ **Les PARTS, elles, sont visibles tout de suite** sur `6620682c` : 4 bouches
   (Paul 5 parts, Lea 3, Tom 3, Nina 5) et **5 plats sur 24 portent des `uses`** — donc
   jusqu'à cinq plats y montreront leurs lignes de part. C'est la moitié du lot qui se
   vérifie sans rien fabriquer.

   ```sql
   -- LES DEUX MOITIÉS, PLAN PAR PLAN
   select m.id, m.plan_kind,
          count(*)                                                as dishes,
          count(*) filter (where d ? 'member_id')                  as key_written,
          count(*) filter (where d->>'member_id' is not null)      as attributed,
          count(*) filter (where jsonb_array_length(coalesce(d->'uses','[]'::jsonb))>0) as with_uses,
          jsonb_array_length(coalesce(m.member_portions,'[]'::jsonb))                   as mouths
   from student_generated_meals m,
        lateral jsonb_array_elements(coalesce(m.dishes,'[]'::jsonb)) as d
   where m.retired_at is null and m.ends_on >= current_date
   group by m.id, m.plan_kind, m.member_portions
   order by m.id;

   -- C4 EN SQL — deux plats au même (jour, moment) pour la même bouche
   select m.id, d->>'day' as day, d->>'slot' as slot,
          coalesce(d->>'member_id','(table)') as mouth, count(*)
   from student_generated_meals m,
        lateral jsonb_array_elements(coalesce(m.dishes,'[]'::jsonb)) as d
   where m.retired_at is null and m.ends_on >= current_date
   group by 1,2,3,4 having count(*) > 1;
   ```
3. ⚠️ **Les 3 rouges vitest étrangers restent rouges** : `src/edge/coverage-guard.int.test.ts`
   (×2) et `src/keel/copy/planRefusals.int.test.ts` (×1). Antériorité **déjà prouvée par
   1B** (§1.4 de son rapport, par reconstruction « le disque d'aujourd'hui moins le lot »),
   reconfirmée par 2B ; aucun de ces fichiers n'est dans mon diff, et aucun ne lit un
   fichier que je touche. Le compte passe de **1055 à 1091** (+36), les rouges de 3 à 3.
4. ⚠️ **Le plafond de plats de `scope: "day"` vaut 3** (cicatrice notée par 2A et 2B) : une
   fixture de vérification qui empile un plat de table + deux plats dédiés au même jour
   peut mesurer le plafond en croyant mesurer la séparation.
5. ⚠️ **La lane foyer saute toujours `keelGenerationModel()`** (`generate-household-meal-v1
   /index.ts:3299`, `:3419`) — nommé, pas touché. Toute mesure de `dish_owners = {asked,
   attributed}` sur un run foyer se lit avec ça en tête.
6. ⚠️ **`dish_owners` n'a pas été mesuré**, et pour la même raison que le point 2 : aucun
   plan de la base n'a d'attribution, donc le compteur n'a rien à dire aujourd'hui. C'est
   le premier chiffre du lot, et il n'existe pas encore — comme `same_day` avant le run
   de 2B.
7. ⚠️ **`/app/plan` reste hors du périmètre traduit** (`catalog.ts` : `uiLocaleForPath`
   rend `DEFAULT_UI_LOCALE` pour toute l'app connectée). Les libellés français sont
   écrits et testés, mais l'écran connecté se rend en anglais — frontière connue depuis le
   14/08, pas un oubli de ce lot. 2B a néanmoins obtenu le français par `?lang=fr` ; la
   recette est dans son §4.3.

---

## 8. Les décisions tranchées seul

| Décision | Option rejetée, et pourquoi |
|---|---|
| **Une seule prop `portions`**, qui porte le prénom ET la part | Deux props (`people` + `portions`) : `member_portions[].display_name` **est** le prénom de la ligne membre, recopié par le moteur (F5). Une seconde source pour le même prénom aurait divergé du jour où un membre se renomme après composition — et il en faudrait une troisième pour l'aperçu, que `SetupPage` ne charge pas. |
| **Les parts viennent de la ligne du plan RENDU** (`MEAL_COLUMNS` gagne `member_portions`) | Les faire descendre depuis `householdMeal` de `StudentWeekPlanPage` : il ne rend que le plan **courant**, donc l'onglet « suivant » aurait affiché les parts d'un autre plan sous ses plats. C'est **la** fixture de 2B (`6620682c` est un plan `prepare_next`). |
| **Le type et le lecteur de `member_portions` déménagent** dans `api/mealGeneration.ts` | Un second lecteur dans `mealGeneration.ts` : deux lectures du même jsonb divergent au premier champ ajouté. `household.ts` réexporte le type ; **zéro importateur touché**. Un nouveau module neutre aurait été un fichier de plus pour la même chose. |
| **Aucune prop `isOwner` sur `PlanDraftDialog`** | En ajouter une : elle aurait obligé à modifier `SetupPage.tsx`, **fichier d'une autre lane** (248 insertions non commitées) — donc soit à commiter le travail d'autrui, soit à livrer un commit qui ne compile pas. Et elle n'aurait rien acheté : `chooseGenerator` route tout non-maître sur la lane individuelle, qui ne rend **aucune** `member_portions`. La garde est structurelle **et** nommée sur place. |
| **`separated = people.length > 0`** (une bouche seule suffit) | Exiger un plat de table en face : un plat attribué **seul** à un moment est rare mais possible, et le nommer est vrai. Ne pas le nommer laisserait une carte anonyme là où le moteur a écrit un propriétaire. |
| **Une bouche que le plan ne nomme plus ne devient PAS « la table »** | La ranger sous « Pour la table » : ce serait dire d'elle une chose fausse. Lui inventer un prénom serait pire. Elle se rend telle quelle, **hors** des voies étiquetées — le silence est la seule réponse juste. |
| **L'ordre des moments est celui de la journée**, pas celui du modèle | Garder l'ordre du plan : `dishListByDay` et `buildPlanByPerson` trient déjà par `EATING_OCCASIONS`. Trois surfaces qui montrent le même jour dans trois ordres seraient trois jours. Conséquence assumée : sur un plan dont le modèle a écrit le dîner avant le petit-déjeuner, la vue jour réordonne. |
| **Les parts sont rendues sous CHAQUE plat**, séparé ou non | Ne les rendre que dans les blocs séparés : la question « combien j'en mets » se pose surtout sur le plat **commun**, qui est le cas majoritaire. Les réserver au cas rare aurait livré la moitié inutile. |
| **Le prénom et la part sont deux fragments, pas un gabarit** (`{name} — {note}`) | Une clé `meals.day_person.share` : elle serait **identique** dans les deux langues et aurait exigé une exception de parité (comme `meals.same_day.minutes`). Il n'y a aucune grammaire ici — c'est une colonne aplatie, exactement comme la liste des moments sans plat de `PlanDayBlock` (« {moment} — {motif} »), deux blocs plus haut dans le même fichier. |
| **`groupByDay` corrigé ici**, pas signalé pour plus tard | Le laisser : il **jetait le plat dédié**, c'est-à-dire l'objet même de ce lot. Un lot qui livre une séparation que la donnée n'atteint jamais est un lot désarmé qui ressemble à un lot qui marche. |
| **C4 corrigé dans `buildPersonWeek`** (3e commit) | Le consigner pour E : il est dans le sujet exact de ce lot (« les personnes »), son seul appelant est `PlanByPerson.OnePerson` (vue `isOwner`-only, périmètre borné), et laisser deux fonctions voisines répondre différemment à la même question est ce qui produit les incidents de ce dépôt. |
| **`agent-gate` en `AGENT_GATE_STAGED_ONLY=1`** | Le lancer nu : par défaut il compare `HEAD` à **tout l'arbre de travail** et fait tourner eslint sur les fichiers des autres lanes — mêmes erreurs étrangères que celles mesurées par 2A. En staged-only il gate **mes** commits, et il passe (2 warnings `react-hooks/exhaustive-deps` sur `MealBuilder`, **antérieurs**, 0 erreur). |

---

## 9. Les clés i18n — sur le disque, NON commitées

Convention des lanes (§2.15) : `en.ts` (suivi, tenu par la lane i18n) et `fr.ts` (**non
suivi**) sont modifiés sur le disque et **absents de mes commits**.
**2 clés, dans les deux packs**, parité verte (`i18n` : 12 fichiers, 123 tests verts).

| Clé | en | fr |
|---|---|---|
| `meals.day_person.table` | For the table | Pour la table |
| `meals.day_person.member` | For {name} | Pour {name} |

Namespace `meals.*`, déjà déclaré par `i18n/catalog.ts` pour `/app/plan`, `/app/household`
et `/app/setup`. **Aucun `t(...)` au niveau module.** Le prénom est un **trou** `{name}`,
jamais un mot du gabarit : le construire en code imposerait l'ordre anglais à toutes les
langues, et un prénom **ne se traduit jamais**.

⚠️ Conséquence connue et assumée, la même qu'aux LOTS 1 et 2 : mes commits référencent des
clés qui ne vivent que dans les packs du disque, et `planDaySeparation.int.test.ts`
**importe `../i18n/fr`**, fichier non suivi. Une copie fraîche sans le lot i18n ne compile
pas. La dette est celle de la lane i18n (`i18n-layer-is-uncommitted-foreign-work`) ; les
précédents en HEAD sont `parity.int.test.ts` et `api/dishSameDay.int.test.ts`.

---

## 10. Fichiers touchés, et ce qui ne l'a pas été

**Commit `64f48e6a` — la donnée** (4 chemins) :
`api/mealGeneration.ts`, `api/household.ts`, `api/planDraft.ts`,
`api/planDishMember.int.test.ts` (neuf).

**Commit `6b08bb7f` — l'écran** (10 chemins) :
`lib/planDaySlots.ts` (neuf), `lib/planDaySlots.int.test.ts` (neuf),
`lib/mealBuilderModel.ts`, `lib/planByPersonModel.int.test.ts`,
`components/plan/DayPersonSplit.tsx` (neuf), `components/plan/PlanDayBlock.tsx`,
`components/plan/PlanResult.tsx`, `components/plan/PlanDraftDialog.tsx`,
`components/MealBuilder.tsx`, `components/planDaySeparation.int.test.ts` (neuf).

**Commit `33b28320` — C4** (2 chemins) :
`lib/planByPersonModel.ts`, `lib/planByPersonModel.int.test.ts`.

**Aucune migration.** `dishes` et `member_portions` sont des colonnes `jsonb` déjà écrites ;
le lot est **entièrement front**.

**Aucune commande à risque** : ni `db push/reset`, ni `functions deploy`, ni `secrets`, ni
`config push`, ni `link`. **Aucune écriture en base** — les seules requêtes jouées sont des
`select`. **Aucun redémarrage de pile, aucun appel modèle.**

**Aucun fichier étranger défait.** Les 16 fichiers commités étaient **propres à HEAD**
(vérifié par `git diff`, hunk par hunk). Les seuls fichiers étrangers que j'ai touchés sur
le disque sont `i18n/en.ts` et `i18n/fr.ts` (packs, convention) — **aucun n'est commité**.
`pages/SetupPage.tsx` (248 insertions d'une autre lane) et `pages/StudentWeekPlanPage.tsx`
ont été **lus, jamais modifiés** : le dessin a été choisi pour ne pas avoir à les toucher
(§8).
