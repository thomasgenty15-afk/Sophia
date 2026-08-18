# Rapport LOT 4C — les quatre correctifs des boîtes (P4)

**Branche** `ff-001-quotidien-du-coach` · **Date** 2026-08-17, 22:53 · **Aucun `push`, aucun merge.**
**Feuille de route** `scratchpad/2026-08-17-2200-LOT4B-verification-grammes-et-boites.md` (§9.1 → §9.4, §11)
**Lus aussi** `…-2113-LOT4A-grammes-et-boites.md`, `…-MASTER-PROMPT-PLAN-FOYER-PAR-JOUR.md` (§0-P4, §2, §2.4)
**Commit** `652195a6` — dix chemins, tous relus par `git diff` avant stage.
**Plan réel écrit** `483da69a-ff38-443d-8e07-8e3e455a9d7a` (foyer `80e9af4c`, v11+**v15**).

> ## Le verdict, en quatre nombres
>
> **① La part de chaque bouche atteint enfin l'écran.** Sur la ligne écrite,
> **11 parts sur 11 joignent leur préparation** (contre **18 sur 18 orphelines**
> sur le plan de 4B), et le navigateur rend, sur données réelles, la ligne que
> 4B avait mesurée à zéro : `Zoe — Use the Zoe box for the chicken portion. 220 g`.
>
> **② Les notes portent des grammes. Avant : ZÉRO sur 93 (4B) et zéro sur 24
> (ma propre mesure sur `45bc8a52`). Après : 35 notes sur 117 — 29,9 %**, et
> **34,3 %** sur les sept aperçus seuls. Le compteur `quantified` dit le chiffre
> que `vague: 0` cachait.
>
> **③ Le vrai taux de service existe.** `boxes / mouth_slots` = **78 / 98 =
> 79,6 %** là où `with_boxes / preparations` affiche **100 %**. Huit bouches
> sans boîte et **quinze bouches en double** ont été comptées et nommées sur
> huit générations — elles étaient invisibles hier.
>
> **④ L'écrêtage est compté** (`capped`). Zéro écrêtage sur mes huit runs : le
> champ est prouvé par test et par mutation, **pas encore vu en réel**.

| Épreuve | État |
|---|---|
| Suite Deno `_shared/keel/` | ✅ **3157 passés, 0 rouge** (3140 avant — **+17 tests**) |
| `cd frontend && npx tsc -b` | ✅ **exit 0** |
| vitest | ✅ **1121 passés, 3 rouges étrangers connus**, aucun quatrième |
| `agent-gate` (`AGENT_GATE_STAGED_ONLY=1`) | ✅ **pass** |
| Mutations | ✅ **10 au rouge sur 11** — la 11ᵉ est un **résultat**, §6 |
| Byte-identité de la population non concernée | ✅ **SHA256, ma sonde**, §5 |
| Diff du brief : ce qui bouge, et rien d'autre | ✅ **+8 / −2 lignes**, §5 |
| L'interdit du « pourquoi » = les 3 DERNIÈRES lignes | ✅ rejoué, §5 |
| Run réel — **8 générations, 3 foyers, dont 1 ÉCRITE** | ✅ §7 |
| Navigateur — la troisième surface, 1280 **et** 320 px | ✅ §8 |
| Ce qui reste rouge | 🔴 **5 points**, §9 |
| Requêtes SQL corrigées pour E | §10 — **trois** étaient cassées, pas deux |

---

## 1. ① — LE DIAGNOSTIC AVANT LE CORRECTIF

4B a mesuré le symptôme : `parseShares` (`household_portions.ts`) accepte
n'importe quelle chaîne comme `preparation_id`, et **18 parts sur 18** du plan
écrit `45bc8a52` citaient `prep_chicken_roast`, `prep_rice_batch`,
`prep_veg_tray` — trois préparations absentes de ce plan. Il a proposé de
resserrer `parseShares`. **Resserrer seul aurait transformé un écran muet en un
compteur à 100 % d'échec, sans réparer quoi que ce soit.** J'ai donc cherché la
cause avant de toucher la garde — patron de 3C.

### 1.1 Les trois hypothèses, écartées une par une

| Hypothèse | Épreuve | Verdict |
|---|---|---|
| Le modèle invente des ids | 51 parts sur trois aperçus de 4B : **0 orpheline** | ❌ pas la cause principale |
| Le parseur renomme les préparations | `preparations[].id` est écrit tel quel (`meal_generation.ts`, boucle des préparations) ; `dishes[].uses[].preparation_id` est validé **contre cette même liste** et résout à 100 % | ❌ |
| **Un ordre de passes** | 🔎 voir ci-dessous | ✅ **c'est ça** |

### 1.2 LA CAUSE, aux octets

`generate-household-meal-v1/index.ts` :

```
:3305   const result = await generateWithGemini(...)          ← réponse ①
:3377   meal = parseGeneratedMeal(result, parseArgs)
:3459   meal = retried;                                        ← RELANCE D'ANCRE: réponse ②
:3609   reconcilePortions(platedMembers, extractMemberPortions(result))
                                                               ↑ TOUJOURS la réponse ①
```

Quand la relance d'ancre protéique est **acceptée**, `meal` (donc
`preparations`) vient de la réponse ②, pendant que `member_portions` est relu
sur la réponse ①. Chaque `preparation_id` désigne alors une préparation qui
n'existe plus. C'est la cicatrice **« `current` périmé efface l'écriture
d'avant »**, sur deux lectures du même appel.

### 1.3 LA PREUVE — la corrélation, sur toute la base, et elle est HISTORIQUE

```sql
-- retry ⟷ parts orphelines, sur tous les plans foyer vivants
```

| plan | `protein_anchor_retry` | parts orphelines |
|---|---|---|
| `2ab8a495` (12-08) | false | **0 / 12** |
| `c4f36c5f` (12-08) | false | **12 / 18** ⚠️ |
| `ddfd02b4` (12-08) | **true** | **3 / 3** |
| `38f60307` (12-08) | **true** | **4 / 6** |
| `3cc7915d` (14-08) | false | **0 / 14** |
| `45bc8a52` (17-08, 4B) | **true** | **18 / 18** |
| **`483da69a` (17-08, LOT 4C)** | false | **0 / 11** |

**Tous les plans à relance acceptée ont des parts orphelines. Aucun n'y échappe.**
Le défaut n'est pas né avec le LOT 4 : il vit dans ce fichier depuis au moins le
12 août, et il a fait taire la ligne par personne à chaque fois.

⚠️ **`c4f36c5f` prouve qu'il y a une SECONDE cause** : sans relance, 12 parts
sur 18 sont quand même orphelines — là, le modèle a bel et bien inventé des ids.
**C'est pourquoi les DEUX correctifs sont nécessaires**, et pourquoi celui de 4B
seul n'aurait pas suffi.

### 1.4 LES DEUX CORRECTIFS

**(a) La cause** — `mealSourceText` suit `meal` :

```ts
let meal;
let mealSourceText = result;
…
  meal = retried;
  mealSourceText = retryResult;   // ⛔ les deux ensemble, un seul site
…
reconcilePortions(platedMembers, extractMemberPortions(mealSourceText), …)
```

**(b) La garde** — `reconcilePortions` prend une **liste fermée**,
`preparationIds`, **REQUISE** (patron `boxMemberIds`) :

```
part dont le preparation_id n'est pas dans meal.preparations
   → JETÉE (la ligne seule; ni le plat, ni la préparation, ni la bouche,
             ni la `portion_note` de cette personne)
   → issue  `share_for_unknown_preparation:<membre>:<id>`
   → compteur `share_counts = { shares, unknown }`, rendu sur l'APERÇU
     comme sur la ligne écrite (`generated_from.household.shares`)
```

⚠️ **La liste est celle des préparations GARDÉES** (`meal.preparations.map(p => p.id)`),
jamais celle que le modèle a déclarée : une part qui cite une préparation refusée
par le parseur ne joindrait rien non plus.

⚠️ **La validation passe AVANT les deux compteurs de note.** Une part qui ne sera
jamais rendue ne doit pas gonfler le dénominateur du flou — même discipline que
`sanitizePortionNote`, qui ne compte que ce qui sort.

---

## 2. ② — LE COMPTEUR HONNÊTE, ET LE GRAMME DANS LA NOTE

### 2.1 Rendre le compteur honnête

`vague_portions` gagne **`quantified`** : le nombre de notes portant **au moins
un nombre suivi d'une unité connue**.

```ts
const PORTION_QUANTITY_RE =
  /\d[\d.,]*\s*(g|gr|grammes?|grams?|kg|ml|cl|tbsp|tablespoons?|tsp|teaspoons?)\b/i;
```

⚠️ **Ce n'est pas un matcher d'aliment** : l'expression ne connaît aucun nom
d'aliment et ne peut pas confondre « laitue » et « lait ». C'est la forme exacte
de `ENERGY_UNIT_RE` (`meal_generation.ts:2656`), qui vit ici depuis FF-038. Les
symboles viennent de `COMPOSITION_UNITS` ; les formes en toutes lettres s'y
ajoutent parce que ce texte-là est de la **prose lue à voix haute**.

⚠️ **Ce qu'il ne compte pas, et c'est assumé** : les dénombrables (« half a
lemon ») — les reconnaître demanderait un savoir sur les aliments. Et « 3 cm »,
qui est une consigne de découpe, pas une part. Le taux est donc un **plancher**,
comme `unquantified_dish_ingredients` qui ne fait aucune exception pour le sel.

⛔ **Aucun terme n'a été ajouté à `VAGUE_PORTION_TERMS`.** L'arbitrage de 4B tient :
y mettre « standard portion », « balanced share », « child-size » ferait la
ceinture qui mord sur tout et qu'on désarme dans la semaine.

### 2.2 Amener le gramme dans la note — DEUX rédactions, deux mesures

**Rédaction n° 1** (collée à la promesse, avec le nombre et l'échappatoire) :

```
Every one of those instructions carries a number and a unit: 150 g of the
chicken, 80 g of dry pasta, 2 tbsp of the sauce. All {N} of them, not some.
"A standard portion", "a balanced share", "child-size" tell nobody how much
to put on a plate; they are the sentences this plan exists to replace.
```

**Mesure — run B, foyer `80e9af4c`, 4 bouches : `quantified 0 / 16`. ZÉRO.**
Et ce que le modèle a écrit à la place :

```
« Take one box for breakfast with the yoghurt and berries. »
« Take the Nina box with extra vegetables for lunch. »
« Take the Zoe box with extra chicken and rice for lunch. »
```

Il **nomme la boîte** au lieu de répéter son poids — parce que le bloc des
boîtes lui dit, à juste titre, que « écrire la consigne de service au lieu des
boîtes » est la faute. J'avais créé la tension moi-même.

**Rédaction n° 2** — l'échappatoire mesurée, nommée littéralement, et
l'objection pré-empêchée (deux lignes changées, aucune ajoutée) :

```
"A standard portion", "a balanced share", "take your box" tell nobody how
much to put on a plate: write the grams, even when a box already holds them.
```

**Mesure — sept aperçus + un plan écrit :**

| | notes | dont chiffrées | taux |
|---|---|---|---|
| **AVANT** (v14, 4B, 4 runs) | 93 | **0** | **0,0 %** |
| **AVANT** (v14, `45bc8a52`, ma propre mesure) | 24 | **0** | **0,0 %** |
| v15 rédaction n° 1 (run B) | 16 | **0** | **0,0 %** |
| **v15 rédaction n° 2** (runs C→I) | 102 | **35** | **34,3 %** |
| **v15 rédaction n° 2, plan écrit compris** | **117** | **35** | **29,9 %** |

Extraits littéraux du run C :

> « Take the shared dish portion and serve about **240 g** of the shared chicken
> box, **180 g** of the shared couscous box, and **260 g** of the shared
> chickpea-and-courgette box. »
> « Serve the own plate with about **180 g** chicken, **220 g** couscous, and
> **300 g** chickpea-and-courgette mix. »

⚠️ **L'obéissance est INTERMITTENTE, run par run** : 25 %, 50 %, 75 %, 0 %, 81 %,
60 %, 0 %, 0 %. C'est le même constat que 3C sur `for_member_id`, et c'est un
**résultat**, pas un maquillage. Le compteur est là pour que la prochaine
rédaction se mesure au lieu de se croire.

⚠️ **La frontière de sécurité n'a pas bougé** : `FORBIDDEN_PORTION_TERMS` est
intacte, l'interdit du « pourquoi » reste les **trois dernières lignes** du brief
(rejoué, §5), et aucun des huit plans produits ne porte de calorie ni de chiffre
de corps.

---

## 3. ③ — UNE BOUCHE A UNE PART, OU ELLE N'EN A PAS

`box_counts` gagne trois champs, comptés **après** la boucle des sommes :

```
mouth_slots     = (préparations À BOÎTES) × (roster)      ← le vrai dénominateur
mouths_unboxed  = bouches dans ZÉRO boîte d'une casserole dont elles mangent
mouths_double   = bouches dans DEUX boîtes ou plus de la MÊME casserole
issues:
  preparations[i]: "<member_id>" has no box on "<titre>"
  preparations[i]: "<member_id>" is in N boxes of "<titre>" -- two weights for one pan
```

⛔ **Rien n'est rejeté.** Choisir laquelle des deux boîtes de Zoé retirer, ou en
inventer une pour Théo, serait décider de la part de quelqu'un sur une devinette.

⚠️ **`mouth_slots` compte les préparations À BOÎTES, pas toutes** : une
préparation sans aucune boîte est déjà comptée par `with_boxes`, et l'inclure
ferait dire deux fois le même défaut par deux compteurs.

⚠️ **L'`issue` nomme la bouche par son IDENTIFIANT, pas par son prénom**, et 4B
proposait le prénom. Ce parseur ne reçoit que des ids (`boxMemberIds`) ; faire
descendre les prénoms coûterait un second paramètre requis et ses quarante-neuf
sites de test, pour une chaîne que personne ne lit à l'écran. Toutes les autres
`issues` de ce fichier nomment déjà les bouches par id. **La jointure vers
`household_members.first_name` se fait en SQL — la requête est en §10.**

**Et le prompt, en remplacement de deux lignes et pas en ajout :**

```
"grams" is what ONE person takes out, never the size of the tub. Two people
on the same weight share ONE box that lists both ids; when their shares
differ they get one box each. Every name above is in exactly ONE box of each
preparation -- never two, never none.
```

**Mesuré sur huit générations :**

| | boîtes | `mouth_slots` | taux de service | `unboxed` | `double` |
|---|---|---|---|---|---|
| v14 (4B, 4 runs) | 45 | 78 | **57,7 %** (annoncé 100 %) | 3 | 13 |
| **v15 (8 runs)** | **78** | **98** | **79,6 %** (annoncé 100 %) | **8** | **15** |

Le taux réel monte de vingt-deux points, **et surtout il est LISIBLE** : trois
runs sur huit rendent une couverture parfaite (`unboxed 0, double 0`), et les
cinq autres laissent une trace nommée par bouche et par casserole. Hier, les
huit lisaient « 100 % ».

---

## 4. ④ — L'ÉCRÊTAGE, COMPTÉ

`box_counts.capped` est incrémenté exactement là où l'`issue` du plafond est
poussée. **Ce n'est PAS un refus** : la boîte est gardée, écrêtée — la ranger
dans `refused` ferait mentir la propriété que le lot annonce.

Deux tests : une boîte à `BOX_MAX_GRAMS + 500` ⇒ `capped: 1`, `refused: 0`,
`boxes: 2`, `grams: 2000` ; une boîte **exactement** au plafond ⇒ `capped: 0`
(le compteur n'est pas bloqué à 1). Mutation : retirer `boxesCapped++` ⇒ rouge ;
le compter aussi dans `refused` ⇒ rouge.

🔴 **Zéro écrêtage sur mes huit runs réels** — le champ n'a jamais mordu en vrai.
Consigné, §9.

---

## 5. LES VERSIONS, LA BYTE-IDENTITÉ, ET LE DIFF DU BRIEF

```
MEAL_PROMPT_VERSION       meal.en.v11_weighed_or_counted   ← INCHANGÉ
HOUSEHOLD_PROMPT_VERSION  v14_weigh_once_into_boxes → v15_one_box_each_and_a_number
```

Un seul axe bouge, parce qu'aucun octet du tronc ne change dans ce passage. Les
trois compteurs ajoutés à `box_counts` sont des **mesures**, pas des consignes.

**La population non concernée, prouvée au SHA256 par ma propre sonde** (worktree
de `HEAD` extrait, les deux modules importés dans le même processus, la même
entrée) :

```
MEAL_PROMPT_VERSION           HEAD = DISQUE                       IDENTIQUE
MEAL_SYSTEM_PROMPT            08d46aea9eb5ee08 = 08d46aea9eb5ee08 IDENTIQUE
MEAL_TOKEN_FIELDS             d0b871f19ae18af8 = d0b871f19ae18af8 IDENTIQUE
MEAL_TRANSLATABLE_FIELDS                                          IDENTIQUE
lane INDIVIDUELLE systemPrompt 08d46aea9eb5ee08 = 08d46aea9eb5ee08 IDENTIQUE
lane INDIVIDUELLE userMessage  b2f3304fcbbad0b7 = b2f3304fcbbad0b7 IDENTIQUE
```

⚠️ **LA POPULATION S'ÉLARGIT PAR RAPPORT À v14, ET C'EST DÉLIBÉRÉ.** Le bloc ③
reste muet sous deux bouches (il parle d'ids à départager), mais le bloc ② vit
dans le brief **commun** : **un foyer d'UNE bouche voit désormais une consigne
différente**. « Des quantités précises pour chaque personne » ne s'arrête pas à
deux habitants. Un foyer d'une bouche n'est donc plus byte-identique à v13, et
le test qui l'affirmait a été mis à jour **en écrivant pourquoi**
(`household_merge_test.ts`, `household_meal_generation_test.ts`). La population
non concernée est la lane **individuelle**, tenue au SHA256 ci-dessus.

**Le diff du brief, ligne à ligne** (`buildPortionBrief`, 3 bouches) :

```
+ "Every one of those instructions carries a number and a unit: 150 g of the"
+ "chicken, 80 g of dry pasta, 2 tbsp of the sauce. All 3 of them, not some."
+ "\"A standard portion\", \"a balanced share\", \"take your box\" tell nobody how"
+ "much to put on a plate: write the grams, even when a box already holds them."
+ "\"grams\" is what ONE person takes out, never the size of the tub. Two people"
+ "on the same weight share ONE box that lists both ids; when their shares"
+ "differ they get one box each. Every name above is in exactly ONE box of each"
+ "preparation -- never two, never none."
- "When two of them get the same weight, ONE box may carry both their ids; when"
- "their shares differ, they get one box each, with different grams."
```

**+8 / −2 lignes, et rien d'autre** — 29 → 35 lignes. La lane foyer frôle le mur
de temps du worker (3C) : ③ est écrit **en remplacement**, et les durées mesurées
(§7) restent entre 22 s et 80 s.

**Les trois dernières lignes, rejouées** :

```json
["NEVER state a reason, a goal, a calorie count or anything about a person's",
 "body in these instructions. They are read aloud at the table by the whole",
 "household. Write what to serve, never why."]
```

---

## 6. LES MUTATIONS — 10 au rouge sur 11, et la 11ᵉ est un résultat

Sauvegarde par copie (jamais `git checkout --`), restauration depuis la copie,
**SHA256 revérifié après chaque salve**.

| # | Mutation | Cible | Résultat |
|---|---|---|---|
| M1 | `parseShares` **accepte** les ids inconnus | `household_portions.ts` | **rouge** |
| M2 | la lecture du chiffre **désarmée** (`portionCarriesAQuantity`) | idem | **rouge** |
| M3 | `quantified` n'est plus compté **sur les notes de PART** | idem | **rouge** |
| M4 | le NOMBRE de la consigne cesse de suivre le roster (littéral `2`) | idem | **rouge** |
| M5 | `mouths_double` n'est plus compté | `meal_generation.ts` | **rouge** |
| M6 | `mouth_slots` compte **toutes** les préparations | idem | **rouge** |
| M7 | `mouths_unboxed` n'est plus compté | idem | **rouge** |
| M8 | l'écrêtage n'est plus compté | idem | **rouge** |
| M9 | l'écrêtage est compté comme un **refus** | idem | **rouge (2 ✗)** |
| M10 | l'appelant ne passe plus la liste fermée | `generate-household-meal-v1` | **rouge — `TS2554 Expected 3 arguments`** |
| M11 | **la relance ne met plus `mealSourceText` à jour** | idem | 🔴 **VERT — aucun test ne mord** |

**M11 est un résultat, pas un oubli.** Rejouer une relance de modèle demande un
second appel réel : aucun test unitaire de ce dépôt ne peut le faire, et un test
de source sur cette ligne serait exactement le « test de source vert sur du code
mort » que deux vérificateurs ont trouvé cette semaine. **La protection de
régression est le compteur `share_counts.unknown`**, qui est armé, mesuré, et
qui criera en production si le défaut revient par un autre chemin. C'est écrit
dans le code, à l'endroit du `let`.

Restauration finale, hachée :

```
add5bbda165e74e64…  meal_generation.ts
f61ae997bef06a67…  household_portions.ts     (avant la 2ᵉ rédaction de ②)
9ef1b8dc13325781…  generate-household-meal-v1/index.ts
```

---

## 7. LE RUN RÉEL — 8 générations, 3 foyers

### 7.1 Le poste

- **Sondé avant tout geste** : `docker logs --tail 40 --timestamps
  supabase_edge_runtime_Sophia_2` — **uniquement des crons réentrants**
  (`process-llm-retry-jobs`, `trigger-topic-compaction`). Aucune lane voisine.
- **`docker restart supabase_edge_runtime_Sophia_2`, et rien d'autre.** Debout
  prouvé par **401 sans auth**.
- `./scripts/local_extend_kong_functions_timeout.sh` joué (`read_timeout=600000`).
  `./scripts/check-local-jwt-alg.sh` : **alignement HS256 correct**.
- **Aucune commande à risque**, **aucune migration**.
- Mots de passe `1234567` **vérifiés avant de viser**, sur chaque compte.

**LA FRAÎCHEUR, PROUVÉE — trois fois, sur les trois modules touchés :**

| module modifié | clé que lui seul produit | vue en réponse |
|---|---|---|
| `meal_generation.ts` | `boxes.mouth_slots`, `boxes.capped` | ✅ |
| `household_portions.ts` | `vague_portions.quantified` | ✅ |
| les deux + l'appelant | `household.shares` | ✅ |

et, sur la **ligne écrite** :
`prompt_version = meal.en.v11_weighed_or_counted+household.v15_one_box_each_and_a_number`.

### 7.2 Le terrain — et pourquoi ce n'est PAS le foyer Auber

⚠️ **Le foyer Auber `42cf7a53` (6 bouches, 4 objectifs) est INACCESSIBLE aux
aperçus depuis que 4B y a écrit `45bc8a52`.** Ce plan couvre 2026-08-17 → 23, et
`firstBlockingPlan` refuse toute fenêtre nommable de cette semaine
(`plan_overlaps_existing`, 409 ; au-delà de dimanche, `window_beyond_this_week`,
400). Le seul moyen d'y draft-er aurait été de **retirer le plan de 4B**, qu'il
a explicitement laissé pour E. **Je ne l'ai pas touché.**

Trois autres foyers, mots de passe vérifiés :

| foyer | bouches | objectifs déclarés | fenêtre libre |
|---|---|---|---|
| `80e9af4c` (`laneb-owner-…`) | 4 | health, muscle_gain | 2026-08-17 + 2 j |
| `4ba4c573` (`l4m-owner-…`) | 3 | muscle_gain | 2026-08-17 + 3 j |
| `be3fab42` (`ff060_house@…`) | 4 | muscle_gain | 7 j — **422, plan vide** (tous les moments en absence) |

**C'est aussi une réponse au point 5 de 4B** (« un seul foyer mesuré ») : trois
foyers, onze bouches, deux tailles de fenêtre.

### 7.3 Les huit générations

| run | foyer | HTTP | durée | préps | boîtes | `mouth_slots` | `unbox` | `double` | `cap` | notes | **chiffrées** | parts | **orphelines** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| B (v15 réd. 1) | 80e9af4c | 200 | 80 s | 3 | 12 | 12 | 0 | 0 | 0 | 16 | **0** | 12 | **0** |
| C | 80e9af4c | 200 | 24 s | 3 | 9 | 12 | 0 | 0 | 0 | 16 | **4** | 12 | **0** |
| D | 4ba4c573 | 200 | 50 s | 1 | 2 | 3 | 0 | 0 | 0 | 6 | **3** | 3 | **0** |
| E | 80e9af4c | 200 | 31 s | 3 | 20 | 12 | 3 | 9 | 0 | 12 | **9** | 9 | **0** |
| F | 4ba4c573 | 200 | 36 s | 6 | 13 | 18 | 3 | 0 | 0 | 18 | **0** | 15 | **0** |
| G | 80e9af4c | 200 | 75 s | 3 | 12 | 12 | 0 | 0 | 0 | 16 | **13** | 12 | **0** |
| H | 80e9af4c | 200 | 22 s | 2 | 8 | 8 | 2 | 2 | 0 | 10 | **6** | 6 | **0** |
| I | 4ba4c573 | 200 | 34 s | 7 | 7 | 21 | 0 | 0 | 0 | 24 | **0** | 21 | **0** |
| **W (écrit)** | 80e9af4c | 200 | 54 s | 3 | 7 | 12 | 0 | **4** | 0 | 15 | **0** | **11** | **0** |
| **total C→W** | | | | **28** | **78** | **98** | **8** | **15** | **0** | **117** | **35 = 29,9 %** | **89** | **0** |

⚠️ La lane foyer **saute toujours `keelGenerationModel()`** (nommé par 2A→4B,
non réparé) : ces durées sont celles de `GLOBAL_AI_MODEL`.

**Trois relances d'ancre ont été DÉCLENCHÉES, aucune ACCEPTÉE**
(`missing_before: 1, missing_after: 1, retried: false`). Le chemin exact du
défaut ① n'a donc **pas été rejoué en réel** — c'est un rouge de mesure, pas un
doute : la corrélation historique de §1.3 est complète (7 plans sur 7), la cause
est lisible au code, et la ligne écrite montre 11/11 qui joignent.

### 7.4 Aucune calorie, aucun chiffre de corps

Grep sur les huit plans produits (`dishes`, `preparations`, `member_portions`,
`shopping_list`, `rationale`) : `kcal|calorie|bmi|imc|body fat|masse grasse|
perte de poids|weight loss|deficit` ⇒ **aucun, sur les huit**.

---

## 8. LE NAVIGATEUR — la troisième surface, sur le plan réel `483da69a`

Serveur dédié `frontend-a4c` / port **5197** (ajouté à `.claude/launch.json`,
aucun port existant touché ; **non commité**). Jeton injecté en `localStorage`,
aucun formulaire rempli.

**LA LIGNE QUE 4B A MESURÉE À ZÉRO EXISTE.** DOM littéral, `/app/plan`,
mardi 18 :

```html
<li data-share-member-id="1c5f728d-…" class="break-words text-xs text-ink-soft">
  <span class="font-medium text-ink">Zoe</span>
   — Use the Zoe box for the chicken portion.
  <span class="ml-2 font-medium tabular-nums text-ink">220 g</span>
</li>
```

| Épreuve | Mesure |
|---|---|
| La part d'une bouche, avec **ses grammes** | ✅ **rendue** — 🔴 elle était à **0 ligne** chez 4B |
| La table de pesée dans le bloc du jour | ✅ **7 lignes `[data-box-id]`**, en-tête « WEIGH IT OUT » |
| « Boîte {prénoms} — {g} g » sur la reprise d'un plat | ✅ `Box Zoe — 220 g`, `Box Paul, Lea, Nina, Zoe — 900 g` |
| Aucun identifiant de boîte affiché | ✅ `data-box-id` seulement |
| **1280 px** : `scrollWidth` / `clientWidth` | ✅ **1280 / 1280**, la page ne défile pas |
| **320 px** : `scrollWidth` / `clientWidth` | ✅ **320 / 320**, **0 ligne de boîte en débordement** |
| Le débordement du tableau « qui mange quoi » | ✅ **dans son conteneur** (`min-w-[30rem]`), jamais la page |

⚠️ **Le séparateur existe** (`ml-2`) : le `innerText` colle « portion.220 g »,
le rendu ne le fait pas. Vérifié au DOM, ce n'est pas un défaut.

---

## 9. CE QUI RESTE ROUGE

### 9.1 🔴 Le gramme dans la note tient à 29,9 %, et l'obéissance est intermittente

Trois runs sur huit rendent **zéro** note chiffrée ; deux en rendent plus de
75 %. L'échappatoire restante est constante et lisible : le modèle écrit
« Use the Zoe-labelled chicken box. » dans les **notes de PART** pendant qu'il
chiffre la `portion_note`. La rédaction n° 2 a nommé « take your box » ; elle
n'a pas nommé « the Zoe-labelled box ». **Ne pas allonger la liste au hasard :
mesurer une rédaction n° 3 contre les 29,9 % d'aujourd'hui.**

### 9.2 🔴 UN IDENTIFIANT DE BOÎTE PEUT ENTRER DANS UNE NOTE LUE À TABLE

Trouvé au run C, littéralement : `« Use box_prep_chicken_shared. »`,
`« Shares box_chicken_me with the Kid. »` L'écran n'affiche jamais d'id de boîte
— sauf quand le **modèle** en met un dans une phrase, et là il passe tel quel.

**Le correctif est déterministe et sans matcher** (liste fermée : les ids de
boîte de CE plan sont connus) : compter, et éventuellement mettre la note à
`null` comme `sanitizePortionNote`. **Non appliqué** : ça change la forme d'un
compteur quelques heures avant E, et c'est le même arbitrage que 4B a pris pour
`mouths_unboxed`. Décrit, pas fait.

### 9.3 🔴 `capped` n'a jamais mordu en réel

Zéro écrêtage sur huit générations. Le champ est prouvé par deux tests et deux
mutations, **pas par des octets réels**. 4B en avait cinq sur un run : c'est
donc un cas atteignable, seulement pas rencontré ici.

### 9.4 🔴 Le chemin exact du défaut ① n'a pas été rejoué

Trois relances déclenchées, **aucune acceptée**. Voir §7.3 : la corrélation
historique est complète et le correctif est lisible, mais je n'ai pas vu de mes
yeux une relance acceptée produire 0 orpheline. **Pour E** : la requête §10.4
répond en une salve dès qu'un plan à `protein_anchor_retry = true` apparaît.

### 9.5 ⚠️ Constats hors périmètre, nommés et non réparés

1. **`household_members` n'a PAS de colonne `display_name`** — c'est
   `first_name`. La requête 11.5**bis** de 4B est donc **encore cassée** après sa
   correction. Rectifiée en §10.
2. **La ceinture du flou rate encore des tournures voisines de sa liste** :
   « a generous amount of vegetables » (run W) et « Generous vegetable share. »
   (`45bc8a52`) passent, alors que `generous share` est une forme de la liste —
   c'est la cicatrice « l'ordre des mots d'une explication ». **Ne pas la
   corriger par plus de vocabulaire** (arbitrage 4B, confirmé) ; `quantified` est
   la réponse.
3. La lane foyer **saute toujours `keelGenerationModel()`**
   (`generate-household-meal-v1/index.ts:3299`, `:3419`).
4. **`KitchenToday.tsx` n'est toujours pas suivi par git** alors que
   `TodayPage.tsx`, lui, est dans `HEAD` et l'importe (constat de 4B, §7).
   **Une copie fraîche de cette branche ne compile pas.** À remonter à la lane
   concernée.
5. Les **3 rouges vitest étrangers** restent à l'identique
   (`src/edge/coverage-guard.int.test.ts` ×2, `src/keel/copy/planRefusals.int.test.ts`).

---

## 10. LES REQUÊTES SQL POUR E — corrigées et rejouées

**Trois des requêtes de 4A/4B étaient cassées, pas deux.** Toutes celles qui
suivent ont été **jouées sur la base locale** et rendent des lignes.

### 10.1 ✅ 11.4bis — les `uses`, sans `COALESCE` autour d'une fonction à N lignes

```sql
with u as (
  select m.id, use
  from student_generated_meals m,
       jsonb_array_elements(m.dishes) d,
       jsonb_array_elements(coalesce(d->'uses','[]'::jsonb)) use
  where m.retired_at is null and jsonb_typeof(m.dishes) = 'array'
)
select left(id::text,8) as plan, count(*) as uses,
       count(*) filter (where use ? 'box_id')              as key_written,
       count(*) filter (where use->>'box_id' is not null)  as cited
from u group by 1 order by 1 desc;
```

### 10.2 ✅ 11.5ter — la jointure se fait sur `member_id` **ET** `first_name`

⛔ 4B avait corrigé `hm.id` → `hm.member_id`, mais `hm.display_name` **n'existe
pas non plus** : la colonne est `first_name`. Version qui tourne :

```sql
with b as (
  select m.id, prep->>'title' as preparation, box->>'id' as box_id,
         (box->>'grams')::int as grams,
         jsonb_array_elements_text(box->'member_ids') as member_id
  from student_generated_meals m,
       jsonb_array_elements(m.preparations) prep,
       jsonb_array_elements(coalesce(prep->'boxes','[]')) box
  where m.retired_at is null and m.plan_kind = 'household'
)
select left(b.id::text,8) as plan, b.preparation, b.grams,
       hm.first_name, hm.goal
from b left join household_members hm on hm.member_id = b.member_id::uuid
order by plan, preparation, grams desc;
```

### 10.3 ✅ NEUVE — les bouches EN DOUBLE, avec leur prénom

```sql
with b as (
  select m.id, prep->>'title' as preparation,
         jsonb_array_elements_text(box->'member_ids') as member_id
  from student_generated_meals m,
       jsonb_array_elements(m.preparations) prep,
       jsonb_array_elements(coalesce(prep->'boxes','[]')) box
  where m.retired_at is null and m.plan_kind='household'
)
select left(b.id::text,8) as plan, b.preparation,
       coalesce(hm.first_name, b.member_id) as who, count(*) as boxes
from b left join household_members hm on hm.member_id = b.member_id::uuid
group by 1,2,3 having count(*) > 1 order by 1 desc, 2;
-- sur 483da69a : 4 lignes | sur 45bc8a52 : 7 lignes
```

### 10.4 ✅ NEUVE — LES PARTS ORPHELINES, par plan (le défaut ①)

**C'est la requête qui distingue un lot qui marche d'un lot qui en a l'air.**

```sql
with s as (
  select m.id, mp->>'display_name' as who, sh->>'preparation_id' as cited
  from student_generated_meals m,
       jsonb_array_elements(m.member_portions) mp,
       jsonb_array_elements(coalesce(mp->'preparation_shares','[]')) sh
  where m.retired_at is null and m.plan_kind='household'
)
select left(s.id::text,8) as plan, count(*) as shares,
       count(*) filter (where not exists (
         select 1 from student_generated_meals m2,
                     jsonb_array_elements(m2.preparations) p2
         where m2.id = s.id and p2->>'id' = s.cited)) as orphan
from s group by 1 order by orphan desc, 1;
-- à croiser avec generated_from->>'protein_anchor_retry' (§1.3)
```

### 10.5 ✅ NEUVE — le tableau de bord du LOT 4C, par version de prompt

```sql
select generated_from->>'prompt_version' as prompt_version, count(*) as plans,
       sum((generated_from #>> '{household,boxes,boxes}')::int)            as boxes,
       sum((generated_from #>> '{household,boxes,mouth_slots}')::int)      as mouth_slots,
       sum((generated_from #>> '{household,boxes,mouths_unboxed}')::int)   as unboxed,
       sum((generated_from #>> '{household,boxes,mouths_double}')::int)    as doubled,
       sum((generated_from #>> '{household,boxes,capped}')::int)           as capped,
       sum((generated_from #>> '{household,vague_portions,notes}')::int)      as notes,
       sum((generated_from #>> '{household,vague_portions,quantified}')::int) as quantified,
       sum((generated_from #>> '{household,shares,shares}')::int)          as shares,
       sum((generated_from #>> '{household,shares,unknown}')::int)         as shares_unknown
from student_generated_meals
where plan_kind='household' and generated_from #> '{household,boxes}' is not null
group by 1 order by 1 desc;
```

⚠️ **Les colonnes neuves sont `null` sur les lignes d'avant le LOT 4C** — c'est
le fait, pas un bug : `45bc8a52` (v14) n'a ni `capped`, ni `mouth_slots`, ni
`shares`.

### 10.6 Ce qui reste valable tel quel de 4A

`11.2` (tableau de bord), `11.3` (taux par version), `11.4` (première moitié —
la contre-preuve sur `preparations`), `11.6` (`issues` par famille — y ajouter
`'%has no box on%' → mouths_unboxed`, `'%two weights for one pan%' →
mouths_double`, `'share_for_unknown_preparation:%' → share_orphan`), `11.7`,
`11.8` (auquel s'ajoutent `household.shares` et les six champs neufs de
`household.boxes`).

---

## 11. CE QUE J'AI TOUCHÉ

**Un commit, `652195a6`, dix chemins**, relus par `git diff` avant stage :

```
_shared/keel/meal_generation.ts                (+115  −0)  capped, mouth_slots, unboxed/double
_shared/keel/household_portions.ts             (+192  −8)  parseShares fermé, quantified, prompt ②③
_shared/keel/household_meal_generation.ts      (+31   −1)  v15
_shared/keel/meal_boxes_test.ts                (+409  −4)  17 tests neufs
generate-household-meal-v1/index.ts            (+53   −1)  mealSourceText, liste fermée, trace `shares`
+ 5 fichiers de tests mis à jour (versions, brief, 3ᵉ argument)
```

- **Jamais `git add -A`. Jamais `git stash`** (dépôt partagé, 380+ fichiers
  d'autres lanes). **Aucun hunk étranger** dans les dix chemins — vérifié par
  `git diff` complet avant stage.
- **Aucun fichier étranger défait.** **Aucun pack i18n touché** (aucune clé
  ajoutée par ce lot). **Aucune migration.** **Aucune commande à risque.**
- `agent-gate` (`AGENT_GATE_STAGED_ONLY=1`) : **pass** — nu, il fait tourner
  eslint sur les fichiers des autres lanes (même choix que 3A→4B).
- **Écrit en base** : `483da69a-ff38-443d-8e07-8e3e455a9d7a` (foyer `80e9af4c`,
  2026-08-17 → 18, v11+**v15**, 7 boîtes, **11 parts qui joignent sur 11**).
  **Laissé en place pour E**, à côté de `45bc8a52` de 4B — les deux ensemble
  sont l'avant/après du défaut ①. Le retirer est un `update … set retired_at`.
- Ajouté `frontend-a4c` (port 5197) à `.claude/launch.json`, **non commité**,
  aucun port existant touché.

---

## 12. LES DÉCISIONS TRANCHÉES SEUL

| Décision | Option rejetée, et pourquoi |
|---|---|
| **Diagnostiquer ① avant de resserrer `parseShares`** | Appliquer le correctif de 4B tel quel : la garde seule aurait rendu un compteur à 100 % d'échec sur les plans à relance, et personne n'aurait su que la cause était ailleurs. La corrélation de §1.3 n'existerait pas. |
| **Livrer les DEUX moitiés de ①** | N'en livrer qu'une : `c4f36c5f` (12 orphelines sur 18, **sans** relance) prouve qu'il y a deux causes. Réparer la relance seule aurait laissé le modèle inventer des ids en silence. |
| **L'`issue` de ③ nomme la bouche par son ID** | Le prénom, comme 4B le proposait : ce parseur ne reçoit que des ids, et les faire descendre coûterait un second paramètre requis et 49 sites de test pour une chaîne que personne ne lit à l'écran. La jointure est en SQL (§10.3). |
| **Mettre ② dans le brief COMMUN, pas dans le bloc des boîtes** | Le ranger sous `boxingOrderLines` (≥ 2 bouches) : un foyer d'une bouche aurait gardé une note floue, et « des quantités précises pour chaque personne » ne s'arrête pas à deux habitants. Le prix est la byte-identité de v13 à une bouche, payée sciemment et écrite dans les deux tests. |
| **Réécrire la consigne ② après l'avoir mesurée à 0/16** | Livrer la rédaction n° 1 et consigner « le modèle n'obéit pas » : la mesure disait autre chose — il obéissait à l'AUTRE consigne (« la note n'est pas une boîte »). Nommer l'échappatoire mesurée a fait 0 % → 34,3 %. |
| **NE PAS élargir `VAGUE_PORTION_TERMS`** | Y mettre « standard portion », « balanced share », « generous amount » : ceinture qui mord sur tout, désarmée dans la semaine. Le manque était un COMPTEUR (§2.1). |
| **NE PAS toucher au plan `45bc8a52` de 4B** | Le retirer pour libérer la fenêtre du foyer Auber : c'est la seule preuve du défaut ① en base, et 4B l'a laissé pour E. J'ai visé trois autres foyers (§7.2), ce qui répond en plus à son point 5. |
| **Écrire un plan plutôt que rester en aperçu** | N'écrire aucun plan : `prompt_version` n'existe que sur une ligne écrite, et la jointure des parts ne se prouve à l'écran que sur du persisté. C'est en écrivant que la troisième surface a été vue vivante. |
| **NE PAS traiter l'id de boîte dans une note (§9.2)** | Le corriger : ça change la forme d'un compteur quelques heures avant E — l'arbitrage exact que 4B a pris pour `mouths_unboxed`, appliqué à moi-même. |
