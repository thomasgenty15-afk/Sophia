# LOT A — sécurité alimentaire, trois défauts

**2026-08-19** · branche `ff-001-quotidien-du-coach`
Périmètre : `allergen_catalog.ts`, `allergen_surface_forms.ts`, `keel_output_locks.ts`,
`dietary_regime.ts` + le câblage minimal que chaque défaut exigeait.
**Runs réels consommés : 1** (sur 2 autorisés).

---

## En une page

Les trois défauts sont corrigés. Chaque garde a été **vue mordre** : mutée, rouge
constaté, remise en état, vert constaté. Aucune ceinture existante n'a été
desserrée, et le seul endroit où ce lot en avait le pouvoir — le groupe déclaré
par le modèle — porte un test dédié qui l'interdit.

Ce qui reste ouvert et que je ne tranche pas : **je n'ai pas pu mesurer si le
modèle obéit à la nouvelle consigne de groupe.** Le poste de travail est
inutilisable pour un run complet (le conteneur edge est recréé toutes les 30 à
60 secondes par la session voisine). J'ai en revanche prouvé sur les octets réels
que la consigne arrive bien dans le prompt envoyé, et les trois compteurs qui
répondront à la question sont en place.

---

## ① Le catalogue d'allergènes — **corrigé**

### Ce que j'ai changé

`allergen_surface_forms.ts` gagne **six clés**, toutes strictement additives —
aucune clé existante n'est touchée, donc un élève `peanut` reçoit octet pour
octet les mêmes aiguilles qu'avant :

| clé | formes de surface | pourquoi |
|---|---|---|
| `celery` | `celeriac`, `celeri`, `mirepoix` | `tokenPattern` n'attrape pas « celeriac » depuis « celery » |
| `celeriac` | `celery`, `celeri`, `mirepoix` | **la clé qui répare les lignes déjà en base** |
| `mustard` | `dijon`, `moutarde`, `remoulade` | une rémoulade est une mayonnaise moutardée |
| `sulphite` | `sulfite`, `sulphur dioxide`, `sulfur dioxide`, `anhydride sulfureux`, `e220`, `e223` | graphie UK au catalogue |
| `sulfite` | idem | la graphie US reste une saisie libre plausible |
| `lupin` | `lupine`, `lupini`, `lupinus` | le suffixe toléré est `(?:e?s)?`, jamais « e » seul |

`allergen_catalog.ts` gagne **quatre entrées**, ajoutées **en queue** :
`celery`, `mustard`, `sulphite`, `lupin`. En queue et pas insérées par
fréquence : le miroir navigateur compare les deux listes **position par
position** (`toEqual`), et les intercaler aurait déplacé douze cases sous les
doigts des élèves existants.

Miroirs mis à jour : `frontend/src/keel/copy/allergens.ts`
(`ALLERGEN_OPTIONS` +4, `WIDE_COVERAGE_SLUGS` +6), `i18n/en.ts` et `i18n/fr.ts`
(+4 clés chacune), et `i18n/parity.int.test.ts` (« Lupin » s'écrit pareil dans
les deux langues — même cas que « Gluten »).

### L'effet vérifié sur les trois surfaces demandées

- **Les écrans.** `/app/health` (liste + saisie libre) et le pop-up de bouche
  (`MouthFormDialog`) lisent tous deux `ALLERGEN_OPTIONS` : les quatre cases
  apparaissent sans autre geste. La carte coach (`StudentConstraintsCard`) lit
  `hasWideCoverage` : elle annonce désormais la couverture large sur les six
  nouveaux slugs, et le test de dérive casse dans les **deux** sens.
- **Les lignes déjà en base.** Trois contraintes locales réelles portent
  `celeriac` et une porte `mustard`, saisies en texte libre bien avant ce lot.
  L'ajout de `celery` au catalogue ne les aurait **pas** touchées —
  `surfaceFormsFor` lit par clé **exacte**. C'est la clé `celeriac` qui les
  répare, et c'est elle que la mutation ci-dessous épingle.
- **La ceinture.** `findMedicalConstraintViolations` alimente ses
  `surfaceForms` depuis cette table : les six clés y arrivent sans changement de
  code. `safety_constraint_floor.ts` construit son index inverse depuis la même
  table, donc la détection conversationnelle s'étend aussi, gratuitement.

### La mutation qui a fait tomber le test

Retrait de la seule ligne `celeriac: ["celery", "celeri", "mirepoix"],` :

```
une ligne DÉJÀ EN BASE en texte libre gagne la couverture — le run mesuré ... FAILED
AssertionError: le plan écrit « Celery », la contrainte dit « celeriac » —
la ceinture doit mordre; c'est le défaut mesuré du 2026-08-19
FAILED | 9 passed | 1 failed
```

Remise en état : `10 passed | 0 failed`. Puis, avec les consommateurs voisins
(`household_safety_test`, `safety_constraint_floor_test`,
`declare_safety_constraint_test`) : **61 passed | 0 failed**.

Le même test tient aussi la **négation** : « Salad without celery » ne mord pas.

---

## ② La phrase lue à table — **corrigé**

### Ce que j'ai changé

`applyKeelOutputLocks` ne recevait que les plats et les courses. Le texte qui
lui est soumis (`meal_generation.ts`, garantie 4) porte maintenant en plus :

- **les préparations** — titre, **méthode** et termes d'ingrédients ;
- **`member_portions[].portion_note`** ;
- **`member_portions[].preparation_shares[].note`**.

Deux décisions à signaler, parce qu'elles élargissent ce que le prompt
demandait littéralement :

1. **La méthode et les ingrédients d'une préparation, pas seulement son titre.**
   Le prompt système interdit au plat de répéter la recette d'un lot : la
   méthode de préparation est donc **la seule** surface où « l'autre moitié du
   plateau » peut s'écrire. Ne ceinturer que le titre aurait rejoué la cicatrice
   « garde posée sur un seul des deux champs », un étage plus bas.
2. **Les notes de part.** Une ligne sous `portion_note`, et c'est exactement la
   surface du contact croisé mesuré (« prends dans le plateau à… »).

`member_portions` est lu **sur la racine du JSON en cours d'analyse**, pas passé
par l'appelant : c'est la même clé de premier niveau qu'`extractMemberPortions`
relit plus tard sur `mealSourceText`. La lire là lie structurellement la note au
plan qu'on verrouille — un paramètre aurait laissé l'appelant libre de passer
les notes d'une **autre** réponse, ce qui est le défaut du `current` périmé déjà
payé sur cette lane (18 parts orphelines sur 18, après une relance d'ancre).

### Le piège, et comment il est porté

La négation **n'a pas été réécrite**. Le texte part dans le même
`applyKeelOutputLocks`, donc dans le même `findForbiddenMatches` avec
`allowNegatedMentions` par défaut : la tolérance vient du moteur commun
(condition de désarmement n°3 de la doctrine P9), celle-là même qui laisse déjà
passer « avoid nut butter » sur un plat. Deux formulations de la même règle à
deux fichiers d'écart sont un générateur de divergence, et ce dépôt l'a déjà
écrit.

### Les deux mutations

**A — retirer les deux surfaces neuves du texte verrouillé :**

```
un allergène médical dans un TITRE DE PRÉPARATION ne part pas ....... FAILED
un allergène médical dans la MÉTHODE d'une préparation ne part pas ... FAILED
un allergène médical dans une PORTION_NOTE ne part pas .............. FAILED
un allergène médical dans une NOTE DE PART ne part pas non plus ..... FAILED
FAILED | 51 passed | 4 failed
```

**B — désarmer la tolérance de négation** (`allowNegatedMentions: false` sur la
moitié médicale du verrou) :

```
⛔ LA NÉGATION SURVIT: « Ensure no sesame is present » ne tue pas la semaine ... FAILED
FAILED | 54 passed | 1 failed
```

C'est la preuve que le piège annoncé est réel et qu'il est gardé : sans la
tolérance, la phrase **correcte** — la consigne de contact croisé sur l'assiette
de la personne allergique — viderait le plan.

Remise en état : **84 passed | 0 failed** (`meal_generation_test` +
`keel_output_locks_test`). Un septième test tient l'innocuité : une préparation
propre et des notes propres rendent `clean` et le plan d'avant.

---

## ③ Le compteur de régime — **corrigé, mesure d'obéissance non faite**

### La correction honnête, telle qu'elle est câblée

Le modèle **déclare** le groupe de chaque ingrédient ; on le valide contre la
liste fermée `FOOD_GROUP_REFS` (30 entrées, déjà existante). **Aucune chaîne
n'est interrogée pour en décider.**

- **Prompt** — `dietaryRegimePromptLine` porte un bloc neuf qui contient la
  **clé exacte** (`"group"`), **où la mettre** (plats *et* préparations), le
  **nombre attendu** (« every single one. Count them before you answer. »), le
  **vocabulaire fermé écrit en entier**, et l'**échappatoire nommée** (« write
  null. Do NOT guess a near-miss »). Les trois moitiés sont là parce qu'un champ
  dont la promesse et la clé de schéma ne se touchent pas sort à 0 % — mesuré
  deux fois dans ce dépôt.
- **Schéma** — `DishIngredient.group: FoodGroupRef | null`, **requis** (pas
  `T?`), parsé par `readDeclaredGroup` qui ne lève **jamais** :
  `parseFoodGroupRef` est un parseur « fail loudly » et le laisser remonter
  ferait tomber le plan entier pour un mot mal orthographié dans un champ
  annexe.
- **Ceinture** — `scanDietaryRegime` accepte `items: {term, group}[]`.
  `terms` reste, et vaut exactement `items` avec `group: null` : un appelant qui
  ne déclare rien obtient le comportement d'avant, et un test compare les deux
  canaux terme à terme.

Trois verdicts, `regimeGroupVerdict` :

| verdict | effet | exemple |
|---|---|---|
| `excluded` | brèche **sans lire un caractère de prose** | « coq au vin » déclaré `poultry` — qu'**aucune** forme de surface n'attrapait |
| `plant_only` | la morsure de chaîne est un faux, rangée dans l'autre colonne | `butter beans` → `legumes` ; `Vegan sausage` → `tofu_tempeh` |
| `undecided` | repli sur le comportement d'avant | `lean_protein`, ou rien de déclaré |

### Ce qui empêche ce lot de desserrer la ceinture

`PLANT_ONLY_GROUPS` n'est **pas** le complément de `EXCLUDED_GROUPS`. En faire
le complément aurait rendu `lean_protein` « végétal » — donc désarmé la ceinture
sur le poulet. Sont **exclus** de la liste, chacun avec sa raison écrite :
`lean_protein` (poulet ou tofu), `sauce_dressing` (nuoc-mâm), `other_added_fat`
(beurre, saindoux), `sugar_sweets` (le miel), `fried_food`, `alcohol`,
`coffee_tea` (un latte), `sweetened_beverage`, `water`.

### Version de prompt

`MEAL_PROMPT_VERSION` : `meal.en.v15_the_plan_never_names_it` →
**`meal.en.v16_the_model_declares_the_group`**. Les quatre épreuves qui la
pinnent sont mises à jour avec l'entrée d'historique.

### Byte-identité de la population non concernée — **prouvée deux fois**

En test : le bloc vit dans `dietaryRegimePromptLine`, **pas** dans
`MEAL_SYSTEM_PROMPT`. Le test v16 vérifie que le prompt système ne contient
aucun des marqueurs, qu'un élève sans régime ne les voit ni côté système ni côté
message, et que les deux prompts systèmes (avec et sans régime) sont égaux.

Et **sur les octets réels** (run du 2026-08-19, `request_id a1…0002`) :

```
dump/prompt-user.txt   : ligne 260  == ONE EXTRA KEY ON EVERY INGREDIENT ==
dump/prompt-system.txt : 0 occurrence
```

Un second test tient le piège de l'instrument : le mot « json » survit à la
réécriture, avec et sans bloc de régime. Sans lui, le mode JSON réécrirait le
prompt après la capture et l'archive se mettrait à diverger de l'envoi, en
silence.

### Les deux mutations

**A — faire entrer `lean_protein` dans `PLANT_ONLY_GROUPS` :**

```
⛔ LE GROUPE NE DESSERRE RIEN: `lean_protein` ne blanchit pas le poulet ... FAILED
FAILED | 18 passed | 1 failed
```

**B — neutraliser `regimeGroupVerdict` (tout en `undecided`) :**

```
HOMONYME — « butter beans » déclaré `legumes` ... ................. FAILED
MARQUEUR VÉGÉTAL — « Vegan sausage » déclaré `tofu_tempeh` ........ FAILED
LE GROUPE AJOUTE DE LA COUVERTURE: « coq au vin » déclaré `poultry` FAILED
FAILED | 16 passed | 3 failed
```

Remise en état : `19 passed | 0 failed`.

### Les six compteurs

Sur `regime_belt` (lane foyer) et dans la trace `keel.meal.dietary_regime`
(lane solo) :

- `groups_declared` / `groups_valid` / `groups_refused` — le modèle obéit-il ?
  (« déclaré puis refusé » ne se confond pas avec « jamais déclaré ») ;
- `group_excluded` / `group_plant_only` / `group_undecided` — sa déclaration
  a-t-elle changé quelque chose ?

`group_undecided` est celui qu'il faut lire **en premier** : tant qu'il reste
haut, les deux autres ne veulent rien dire.

---

## Les runs réels

**1 consommé sur 2.**

| # | request_id | résultat |
|---|---|---|
| — | `a1…0001` | 400 `window_beyond_this_week`, **aucun appel modèle** — fenêtre mal datée |
| **1** | `a1…0002` | **appel modèle parti** (`gpt-5.6-luna`, `attempt_start`, prompt 16 026 + 19 791 car.), 502 Kong à 40 s, réponse jamais revenue |
| — | `a1…0003/0004` | 503 `name resolution failed` en 0 s, **aucun appel modèle** |
| — | `a1…0005` | 502 en 1 s, **aucun appel modèle** |

Cause, et elle est dans le briefing commun (piège n°1 du poste partagé) :
`supabase_edge_runtime_Sophia_2` est **recréé toutes les 30 à 60 secondes** par
le `functions serve` d'une session voisine — constaté trois fois de suite à
`Up 6 seconds`, `Up 11 seconds`, `Up 6 seconds`. Kong est patché à 600 s et sain
(healthy, 46 h). Ce n'est ni le produit ni Kong.

Ce que le run n°1 a quand même donné, parce que **la capture précède l'appel
HTTP** : les trois fichiers, et la preuve sur les octets que le bloc de groupe
arrive bien dans le message utilisateur et **pas** dans le prompt système.

Artefacts : `scratchpad/qa-generation/2026-08-19-lot-A-securite/run-1/`.

---

## Ce que je remonte sans le trancher

1. **`normalizeAllergenRef` SUPPRIME les diacritiques au lieu de les replier.**
   « céleri » devient le slug `cleri`, pas `celeri`. Le test du dépôt le pinne
   déjà sans le nommer (`"café au lait"` → `caf_au_lait`). Conséquence : un
   élève francophone qui tape un allergène accentué crée un slug hors catalogue
   et perd la couverture large. Je n'y touche pas — corriger la règle changerait
   les slugs de lignes existantes **et** exigerait de bouger la copie navigateur
   (`api/allergenSlug.ts`) dans le même geste. C'est une décision de migration,
   pas un correctif.

2. **`fruits_de_mer` : deux lignes réelles en base, aucune couverture.** C'est du
   texte libre français, reconnu sous son seul mot, là où `shellfish` en couvre
   neuf. L'ajouter comme clé est trivial et strictement additif — mais
   `allergens.int.test.ts` s'en sert nommément comme **exemplaire** de la saisie
   libre non couverte (`hasWideCoverage("fruits_de_mer") === false`). Le geste
   demande donc de réécrire l'intention d'un test voisin, ce qui n'est pas à moi.

3. **L'écran `/app/household` collecte les allergies d'une bouche en texte libre
   PUR** — aucun catalogue, aucune case. Le pop-up de bouche
   (`MouthFormDialog`), lui, ne propose **que** la liste fermée et n'a aucune
   saisie libre. Deux portes vers la même donnée, avec deux politiques opposées.

4. **`allergen_bridge.ts :: ALLERGEN_FOOD_GROUPS` ignore les six nouveaux
   slugs.** Ce n'est pas une panne — l'absence y rend `null`, c'est-à-dire une
   abstention — mais la substitution d'aliment ne saura pas qu'un céleri
   appartient à `non_starchy_veg`. Table indépendante, question indépendante.

5. **Le groupe déclaré peut mentir.** Si le modèle déclare `legumes` sur du
   poulet, la morsure de chaîne est blanchie. C'est le même pouvoir
   qu'`isPlantAnalogue` exerce déjà sur un terme entier, sourcé d'une
   déclaration au lieu d'une liste de chaînes — donc pas un desserrage nouveau —
   mais c'est une surface d'attaque réelle, et c'est `groups_valid` +
   `group_plant_only` qui la rendront visible. **Faut-il, à terme, refuser le
   blanchiment quand le terme porte par ailleurs un mot animal sans ambiguïté ?**
   Je ne le tranche pas : décider avant de mesurer est ce qui a produit les
   refus polis de ce dépôt.

6. **L'obéissance du modèle à la consigne de groupe n'est pas mesurée.** C'est le
   seul trou de ce lot. Un run complet sur le foyer `qa5a` (Lubna, végane) suffit :
   lire `groups_declared` / `groups_valid` / `group_undecided`. Si
   `group_undecided` reste égal au nombre d'ingrédients, la consigne ne porte
   pas — et c'est un **résultat**, pas un échec, à consigner tel quel.

---

## Contrôles

| gate | résultat |
|---|---|
| `deno check` sur les 8 modules touchés | **vert** |
| `deno test` sur les tests du lot | **148 passed / 0 failed** |
| `deno test` sur tout `_shared/keel/` + `skills/_shared/` | 3 816 passed / **8 failed — tous étrangers** |
| `npx tsc -b --force tsconfig.app.json` | **vert** |
| `npx vitest run` (front) | **4 échecs / 1666 passés / 20 ignorés** — les 4 de référence |
| `docker restart supabase_edge_runtime_Sophia_2` | fait, redémarrage confirmé (`StartedAt` = 10:03:13 UTC) |

**Les 8 rouges Deno sont ceux d'un agent voisin**, tous sur
`HOUSEHOLD_PROMPT_VERSION v19_a_why_names_no_ones_rule` (pinné à `v17`),
`ruleHolders` manquant dans `HouseholdPromptInput`, et le plafond de plats de
`household_merge_test`. J'ai vérifié chaque diff un par un : aucun ne cite mes
symboles. Au passage, les 5 erreurs de typage que **mon** champ `group` avait
créées dans `meal_boxes_test.ts` sont réparées (`group: null` sur cinq fixtures).

**Les 4 rouges front sont ceux nommés par le briefing** : `coverage-guard`
(2, 55 fonctions edge contre 52 déclarées) et `household.int.test.ts:323`
(2, `awayFrom`). Le compte de passés monte de 1 639 à 1 666.

---

## Fichiers touchés

**Moteur**
`supabase/functions/_shared/keel/allergen_surface_forms.ts`
`supabase/functions/_shared/keel/allergen_catalog.ts`
`supabase/functions/_shared/keel/dietary_regime.ts`
`supabase/functions/_shared/keel/meal_generation.ts`
`supabase/functions/generate-meal-v1/index.ts`

**Tests**
`supabase/functions/_shared/keel/allergen_catalog_test.ts`
`supabase/functions/_shared/keel/dietary_regime_test.ts`
`supabase/functions/_shared/keel/dietary_regime_solo_lane_test.ts`
`supabase/functions/_shared/keel/meal_generation_test.ts`
`supabase/functions/_shared/keel/household_regime_belt_test.ts`
`supabase/functions/_shared/keel/meal_boxes_test.ts` *(5 fixtures + pin v16)*
`supabase/functions/_shared/keel/meal_same_day_test.ts` *(pin v16)*
`supabase/functions/_shared/keel/meal_precedence_test.ts` *(pin v16)*
`supabase/functions/_shared/keel/household_merge_test.ts` *(pin v16)*

**Front**
`frontend/src/keel/copy/allergens.ts`
`frontend/src/keel/i18n/en.ts`, `frontend/src/keel/i18n/fr.ts`
`frontend/src/keel/i18n/parity.int.test.ts`

`keel_output_locks.ts` n'a **pas** été modifié : le défaut ② était dans ce qu'on
lui **donnait**, pas dans ce qu'il fait. Le corriger dedans aurait été une
seconde règle de négation à côté de la première.
