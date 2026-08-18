# Rapport LOT 4B — vérification des grammes par personne et du protocole des boîtes (P4)

**Branche** `ff-001-quotidien-du-coach` · **Date** 2026-08-17, 22:00 · **Aucun `push`, aucun merge.**
**Master prompt** `scratchpad/2026-08-17-MASTER-PROMPT-PLAN-FOYER-PAR-JOUR.md` (§0-P4, §2, §2.4/C5, §LOT 4 / agent 4B)
**Rapport vérifié** `scratchpad/2026-08-17-2113-LOT4A-grammes-et-boites.md`
**Commits vérifiés** `968a9744`, `e0c3e01a` (serveur), `e5314d55` (écran). Le lot précédent s'arrête à `33d7b3d4`.
**Commit ajouté par cette vérification** `0285bb3d` (défaut trouvé, §7).

> ## Le verdict, en trois nombres
>
> **`boxes.declared` n'avait jamais été mesuré. Il l'est : sur QUATRE générations
> réelles, TREIZE préparations sur treize portent des boîtes — 100,0 %.
> Quarante-cinq boîtes, ZÉRO refusée. Soixante-sept reprises de plat citent une
> boîte, soixante-sept la résolvent, zéro refusée.** Le champ n'est pas désarmé :
> le modèle écrit, le parseur accueille, l'écran rend. La leçon de 3C a porté.
>
> **Et la divergence des grammages entre bouches est RÉELLE sur trois runs sur
> quatre** — Theo (`muscle_gain`) 700 g, Zoe (`health`) 650, Iris (`fat_loss`)
> 600, Paul/Marc 550, Lou 350, sur la même casserole. C'est exactement la demande
> de l'utilisateur, écrite par le modèle, lisible à l'écran.
>
> **Mais le contenu déclaré n'est vérifié sur AUCUNE des deux propriétés qui le
> rendent exécutable**, et les deux sont violées sur des plans réels :
> **treize bouches se retrouvent dans DEUX boîtes de la même casserole**, avec
> deux poids différents affichés côte à côte, et **une bouche sur trois
> préparations n'a aucune boîte**. Aucun compteur, aucune `issue`, rien.

| Épreuve | État |
|---|---|
| Suite Deno `_shared/keel/` rejouée | ✅ **3140 passés, 0 rouge** |
| `cd frontend && npx tsc -b` · vitest rejoués | ✅ exit 0 · **1121 passés, 3 rouges étrangers connus** (aucun quatrième) |
| Versions : tronc v10→**v11**, foyer v13→**v14**, un cran chacun, bon axe | ✅ prouvé, §2 |
| Byte-identité des populations non concernées | ✅ **prouvée au SHA256, par ma propre sonde**, §2 |
| Le diff du prompt tronc = la seule section neuve, rien d'autre | ✅ §2 |
| L'interdit du « pourquoi » = les 3 DERNIÈRES lignes du brief | ✅ **rejoué**, §3 |
| `FORBIDDEN_PORTION_TERMS` byte-identique à `33d7b3d4` | ✅ SHA256, §3 |
| Ceinture du flou : mord en 2 langues, cas passants | ✅ 8 morsures / 4 passages, §3 |
| **C5 en entier** : un plan qui viole chaque règle, puis un plan sain | ✅ **3 traces nommées / 0 `issue`**, §4 |
| Mutations rejouées (7, dont les 4 demandées) | ✅ **7/7 au rouge**, restaurées, SHA256 revérifié, §5 |
| Le durcissement des 2 fixtures de 4A (§10.5) tient | ✅ **M5 et M12 rejouées, rouges**, §5 |
| **RUN RÉEL — 4 générations foyer, dont 1 ÉCRITE** | ✅ **§6, tous les chiffres** |
| Aucune calorie, aucun chiffre de corps dans les sorties réelles | ✅ **0 sur 4 plans**, §6.6 |
| Navigateur : 2 surfaces de session, 2 langues, 320 **et** 1280 px | ✅ §8 |
| **Défaut trouvé et CORRIGÉ** | 🟠 1 — §7 (`/app/today` rendait des boîtes anonymes) |
| **Défauts trouvés, NON corrigés, correctif décrit** | 🔴 **3** — §9.1, §9.2, §9.3 |
| Les deux arbitrages de 4A, tranchés | §10 |
| Deux des huit requêtes SQL de 4A pour E sont **cassées** | 🟠 §11 |

---

## 1. Le socle, rejoué et pas cru

| Épreuve | Mesure |
|---|---|
| `deno test --allow-read --allow-env supabase/functions/_shared/keel/` | **3140 passés, 0 failed** (16 s) |
| `cd frontend && npx tsc -b` | **exit 0** |
| `npx vitest --config vitest.config.ts run` | **1119 passés, 3 failed** avant mon correctif ; **1121 / 3** après |
| `agent-gate` (`AGENT_GATE_STAGED_ONLY=1`) sur mon commit | **pass** |

**Les trois rouges sont ceux qui sont déjà prouvés antérieurs**, nominativement :
`src/edge/coverage-guard.int.test.ts` (×2) et `src/keel/copy/planRefusals.int.test.ts`
(×1, `household.error.*` non atteignables). **Aucun quatrième.** Les chiffres de 4A
(3140 Deno, 1119 vitest, exit 0) sont exacts.

**Aucun fichier du lot n'a dérivé entre `HEAD` et le disque** :
`git status --porcelain` sur les 14 chemins du lot rend **vide**. Tester HEAD, c'est
tester le disque.

---

## 2. LES VERSIONS ET LA BYTE-IDENTITÉ — ma propre sonde, pas la lecture de 4A

```
MEAL_PROMPT_VERSION       33d7b3d4 : meal.en.v10_same_day
                          HEAD     : meal.en.v11_weighed_or_counted     ← un cran, bon axe
HOUSEHOLD_PROMPT_VERSION  33d7b3d4 : v13_dedicated_dish_is_ordered
                          HEAD     : v14_weigh_once_into_boxes          ← un cran, bon axe
```

J'ai monté un **worktree détaché sur `33d7b3d4`** et appelé
`buildHouseholdPromptBlocks` des DEUX arbres avec **la même entrée**, puis comparé
les SHA256 des sorties :

```
1 bouche     userSuffix     33d7b3d4=53ae5192487db375  LOT4=53ae5192487db375  IDENTIQUE
1 bouche     systemSuffix   33d7b3d4=0c4afc57d8956a38  LOT4=0c4afc57d8956a38  IDENTIQUE
3 bouches    userSuffix     33d7b3d4=bdbac11838122a4f  LOT4=7a57062a21369723  DIFFERENT   ← attendu
3 bouches    systemSuffix   33d7b3d4=0c4afc57d8956a38  LOT4=a1855b5cc4e56f6b  DIFFERENT   ← attendu
```

Un foyer d'**une seule bouche** rend un prompt **byte-identique** sur les deux
moitiés — c'est un hash, pas une affirmation. Et la phrase des ids reste
`Exact ids to use in member_portions:` au caractère près ; `WEIGH IT ONCE` est
**absent** à une bouche.

**Le tronc a bougé, et j'ai lu ce qui a bougé** (`diff -u` des deux
`MEAL_SYSTEM_PROMPT`) : **exactement huit lignes**, la section
`== WHAT A DISH ADDS ON THE DAY IS WEIGHED OR COUNTED, NEVER VAGUE ==`, et
**rien d'autre**. Aucun effet de bord sur les autres sections.

⚠️ **Un constat, pas un défaut** : le bloc de langue du **message utilisateur**
rend `MEAL_TOKEN_FIELDS`, qui gagne
`preparations[].boxes[].id` et `dishes[].uses[].box_id`. La **lane individuelle**
apprend donc l'existence de deux clés que son prompt ne lui demande jamais (le
`boxSchemaBlock` est household-only, `boxMemberIds: []`). Si elle en écrivait,
elles seraient refusées et comptées — le compteur est là pour le dire. C'est le
prix assumé du choix « les boîtes sont réclamées par l'enveloppe foyer », et il
est cohérent avec le bump de `MEAL_PROMPT_VERSION`.

**Le bump atteint bien la ligne écrite** — mesuré sur le plan réel `45bc8a52` :
`prompt_version = meal.en.v11_weighed_or_counted+household.v14_weigh_once_into_boxes`.

---

## 3. LES CEINTURES — rejouées, dans les deux langues, avec leurs cas passants

### 3.1 L'interdit du « pourquoi » est bien les TROIS DERNIÈRES lignes

Rejoué par ma sonde (`buildPortionBrief` à 3 bouches, `split("\n").slice(-3)`) :

```json
["NEVER state a reason, a goal, a calorie count or anything about a person's",
 "body in these instructions. They are read aloud at the table by the whole",
 "household. Write what to serve, never why."]
```

Le bloc `WEIGH IT ONCE` s'insère **avant** elles (`household_portions.ts:1073`,
suivi de `:1080-1082`). La place est tenue.

### 3.2 `FORBIDDEN_PORTION_TERMS` est intacte

Le bloc entier extrait des deux versions et haché :
`33d7b3d4 = HEAD = 5c3428b1c6d8b468…` — **IDENTIQUE**. La ceinture de corps n'a
pas été touchée par le lot.

### 3.3 Les deux ceintures, exercées sur MES phrases

**La ceinture du flou (`vaguePortionMatches`) — elle compte, elle ne retire rien :**

| | phrase | verdict |
|---|---|---|
| EN passe | `Your box: 150 g of the chicken` | `[]` |
| FR passe | `Ta boîte : 150 g de poulet` | `[]` |
| FR passe | `Coupe les carottes en morceaux de 3 cm` | `[]` |
| EN passe | `Add a pinch of salt` | `[]` |
| EN mord | `Take a handful of rice` | `["handful"]` |
| FR mord | `Prends une poignée de riz` | `["poignee"]` |
| FR mord | `Sers-lui une grosse portion de poulet` | `["grosse portion"]` |
| EN mord | `Serve a generous portion of chicken` | `["generous portion"]` |
| FR mord | `Légumes à volonté` | `["a volonte"]` |
| EN mord | `as much as you like` | `["as much as you like"]` |
| FR mord | `une bonne quantité de riz` | `["une bonne quantite"]` |
| EN mord | `plenty of vegetables` | `["plenty of"]` |

**Quatre cas passants, huit morsures, les deux langues des deux côtés.** La garde
n'est pas cassée. (Sa PORTÉE, elle, est un défaut — §9.3.)

**La ceinture de corps (`sanitizePortionNote`) — les grammes d'aliment passent :**

```
"Your box: 150 g of the chicken"                -> note gardée, violations []
"Ta boîte Zoé : 150 g de poulet"                -> note gardée, violations []
"150 g parce que tu vises une perte de poids"   -> note NULL, ["perte de poids","poids"]
"150 g for your weight loss"                    -> note NULL, ["weight loss"]
"environ 600 kcal"                              -> note NULL, ["kcal"]
```

La frontière de P4 tient : **le gramme passe, le pourquoi meurt.**

---

## 4. C5 EN ENTIER — mes fixtures, pas celles de 4A

Une sonde indépendante (`probe_c5.ts`, mes ids, mes aliments, mes assertions).

### 4.1 Un plan qui VIOLE chaque règle une fois

Facteurs lus du référentiel : `meat_shrinks = 0,7`, `grain_absorbs = 2,6`.
1000 g de poulet cru ⇒ **700 g prêt** ; tolérance 1,1 ⇒ seuil **770 g**.
Trois boîtes de 300 g = **900 g**. Une boîte remplie **mercredi**, citée
**lundi**. Un `box_id` **inexistant**. Un ingrédient de plat **sans quantité**.

```
box_counts     {"preparations":2,"with_boxes":2,"boxes":4,"refused":0,
                "sum_checked":2,"sum_over":1,"sum_unverifiable":0}
box_use_counts {"uses":3,"cited":3,"resolved":1,"refused":2}
unquantified   {"ingredients":2,"unquantified":1}
plats gardés   2 | préparations gardées 2          ← RIEN N'EST REJETÉ

issues:
  - "Monday bowl" (mon) eats from "Late rice", cooked on wed -- after the meal
  - dishes[0].uses: box "bx_late" is filled on wed and cited on mon -- after the meal, dropped
  - dishes[0].uses: box "bx_ghost" does not exist, dropped
  - preparations[0]: boxes hold 900 g but "Sunday chicken" makes about 700 g ready
                     -- the boxes cannot all be filled
  - structured_quantity_missing: 1/2 ingredients

box_id résolus par plat : [[null,null],["bx_a"]]
```

**Chaque violation laisse sa trace nommée, le plan survit, et la précision
tombée n'emporte pas la reprise** (`preparation_id` reste vrai, seul `box_id`
passe à `null`). C'est la posture demandée.

### 4.2 Un plan SAIN — zéro `issue`

```
box_counts     {"preparations":1,"with_boxes":1,"boxes":3,"refused":0,
                "sum_checked":1,"sum_over":0,"sum_unverifiable":0}
box_use_counts {"uses":2,"cited":2,"resolved":2,"refused":0}
unquantified   {"ingredients":2,"unquantified":0}
issues         AUCUNE
```

⚠️ **Il a fallu resserrer la fenêtre à un jour pour l'obtenir** : ma première
version rendait `empty_slots: …`, qui n'est pas une `issue` de C5 mais qui aurait
masqué un zéro. **Une garde a besoin d'un cas qui passe, et le cas passant doit
être PROPRE.**

### 4.3 La persistance — les clés sont écrites

```
preparations[0].boxes : [{"id":"bx_ok_a","member_ids":["aaaa…"],"grams":200}, …]
dishes[0].uses        : [{"preparation_id":"prep_chicken","servings":1,"box_id":"bx_ok_a"}]
```

Et sur la **ligne réelle écrite** (`45bc8a52`), la contre-preuve §11.4 de 4A,
jouée telle quelle :

```
preps_in_jsonb 4 | key_written 4 | key_written_empty 0 | boxes_total 13
uses 7 | key_written 7 | cited 7
```

`box_counts` annonce `preparations: 4, with_boxes: 4, boxes: 13` et le `jsonb`
compté à la main dit **exactement la même chose**. **Le compteur ne ment pas.**

---

## 5. LES MUTATIONS — 7, toutes au rouge, toutes restaurées

Sauvegarde par copie (jamais `git checkout --`), restauration depuis la copie,
**SHA256 revérifié après chaque salve** et à la fin.

| # | Mutation | Cible | Résultat |
|---|---|---|---|
| M1 | **la somme désarmée** — seuil rendu inatteignable (`produced × 1000000`) | `meal_generation.ts` | **rouge — 2 ✗** |
| M2 | **le `box_id` orphelin ACCEPTÉ** — `!owner` résout au lieu de refuser | idem | **rouge — 2 ✗** |
| M3 | **la ceinture du flou rendue UNILINGUE** — toutes les formes FR retirées | `household_portions.ts` | **rouge — 2 ✗** |
| M4 | **la validation contre le ROSTER désarmée** — tout `member_id` passe | `meal_generation.ts` | **rouge — 3 ✗** |
| M5 | le **sixième tableau parallèle** ne suit plus le `splice` du plafond (= M12 de 4A) | idem | **rouge — 1 ✗** |
| M6 | la porte « **boîte sans id** » ne compte plus `refused` (= M5 de 4A) | idem | **rouge — 1 ✗** |
| M7 | **la boîte remplie APRÈS le repas** est acceptée | idem | **rouge — 1 ✗** |

**Les deux mutations que 4A a dû durcir (§10.5) mordent bel et bien** : M5 et M6
ci-dessus sont ses M12 et M5, rejouées sur ses fixtures durcies. **Le durcissement
tient.**

⚠️ **Une leçon de méthode, consignée** : mes trois premières rédactions de M1, M2
et M7 utilisaient `if (false)`. Elles rendaient un rouge — mais **le rouge du
typecheck**, pas celui d'un test. Une mutation qui ne compile pas ne prouve rien
sur la garde qu'elle vise. Les trois ont été refaites en variantes **qui
compilent** (seuil inatteignable, branche qui résout, comparaison sur elle-même),
et c'est seulement là qu'elles ont fait tomber les tests visés.

**Restauration finale, hachée :**
```
7672b1823e1c…  meal_generation.ts          = sauvegarde
b109ee3426d4…  household_portions.ts       = sauvegarde
2827656e0064…  household_meal_generation.ts = sauvegarde
```

---

## 6. LE RUN RÉEL — les chiffres, en toutes lettres

### 6.1 Le poste

- **Sondé avant tout geste** : `docker logs --tail 40 --timestamps
  supabase_edge_runtime_Sophia_2` ne montrait que des **crons réentrants**
  (`process-llm-retry-jobs`, `trigger-topic-compaction`, `process-checkins`,
  `keel-coach-broadcast-v1`, `trigger-synthesizer-batch`) — **aucune lane voisine
  en génération**, à deux sondes espacées de vingt minutes.
- **`docker restart supabase_edge_runtime_Sophia_2`, et rien d'autre.** Il était
  **obligatoire** : j'avais muté `_shared` sept fois pendant §5, et le runtime
  sert des modules périmés. Debout prouvé par **401 sans auth** sur les deux
  fonctions.
- `./scripts/local_extend_kong_functions_timeout.sh` joué (`read_timeout=600000`).
  `./scripts/check-local-jwt-alg.sh` : **alignement HS256 correct**.
- **Aucune commande à risque** : ni `supabase stop/start`, ni `db reset/push`, ni
  `functions deploy`, ni `secrets`, ni `config push`, ni `link`. **Aucune
  migration.**
- **Compte visé** : `laneb-master-178655556682681f876@test.dev` (foyer **Auber
  `42cf7a53`**, maître Paul), mot de passe `1234567` **vérifié avant de viser**.
  Secondaire : `laneb-theo-…@test.dev`, même mot de passe, même vérification.

**LA FRAÎCHEUR, PROUVÉE — pas supposée.** Deux preuves indépendantes :
1. la réponse d'aperçu porte `household.boxes`, `household.box_uses`,
   `household.vague_portions` et `preparations[].boxes[]` — **des clés que seul
   le code du LOT 4 produit** ;
2. la ligne écrite porte
   `prompt_version = meal.en.v11_weighed_or_counted+household.v14_weigh_once_into_boxes`
   — **les deux bumps**, sur la même ligne (patron 2B).

**Le foyer est celui qui donne du sens aux boîtes** : six bouches, **quatre
objectifs différents** — Iris `fat_loss`, Theo `muscle_gain`, Marc `maintenance`,
Zoe `health`, plus Paul (maître, sans objectif) et Lou (enfant).

### 6.2 Les quatre générations

| Run | Route | Fenêtre | HTTP | Durée | Écrit ? |
|---|---|---|---|---|---|
| ① `r1` | `generate-household-meal-v1`, `intent: draft` | 2026-08-17 + 7 j | 200 | **93 s** | non |
| ② `r2` | idem | idem | 200 | **94 s** | non |
| ③ `r3` | idem | idem | 200 | **25 s** | non |
| ④ `written` | idem, `intent: prepare_next` | idem | 200 | **88 s** | **oui — `45bc8a52-2d12-4f4c-9783-7fddcac143e8`** |

⚠️ La lane foyer **saute toujours `keelGenerationModel()`**
(`generate-household-meal-v1/index.ts:3299`, `:3419`) : ces durées sont celles de
`GLOBAL_AI_MODEL`, pas du modèle de génération. Nommé, mesuré par 3C, **pas
réparé** — comme le master l'exige.

### 6.3 `boxes.declared` — LE CHIFFRE QUI N'EXISTAIT PAS

| Run | préparations | **avec boîtes** | **boîtes** | refusées | `sum_checked` | `sum_over` | `sum_unverifiable` |
|---|---|---|---|---|---|---|---|
| ① r1 | 5 | **5** | **7** | 0 | 3 | 0 | 2 |
| ② r2 | 3 | **3** | **18** | 0 | 0 | 0 | 3 |
| ③ r3 | 1 | **1** | **7** | 0 | 0 | 0 | 1 |
| ④ écrit | 4 | **4** | **13** | 0 | 3 | 0 | 1 |
| **total** | **13** | **13 = 100,0 %** | **45** | **0** | **6** | **0** | **7** |

> **Cent pour cent des préparations portent des boîtes. Quarante-cinq boîtes,
> zéro refusée.** Le lot n'est **pas** désarmé, et la configuration de 3C
> (schéma + ordre collé à la promesse + le nombre + l'échappatoire nommée) a
> produit son effet dès le premier run.

**La propriété testée tient sur des octets réels** :
`sum_checked + sum_unverifiable = 6 + 7 = 13 = with_boxes`. ✔

**Les reprises de plat :**

| Run | `uses` | `cited` | `resolved` | `refused` |
|---|---|---|---|---|
| ① r1 | 17 | 17 | **17** | 0 |
| ② r2 | 43 | 37 | **37** | 0 |
| ③ r3 | 6 | 6 | **6** | 0 |
| ④ écrit | 7 | 7 | **7** | 0 |
| **total** | **73** | **67** | **67 = 100,0 % des citées** | **0** |

`cited = resolved + refused` : **67 = 67 + 0**. ✔ **Quand le modèle cite une
boîte, il ne se trompe jamais d'identifiant** — le même constat que 3C sur
`for_member_id`.

### 6.4 LA DIVERGENCE DES GRAMMAGES ENTRE BOUCHES — la question de l'utilisateur

**Le run ② est exactement ce que P4 demande** — six boîtes par casserole, une par
bouche, des poids qui suivent les objectifs :

```
« Roast chicken thighs with potatoes and vegetables »   (6 boîtes)
    700 g   Theo   (muscle_gain)
    650 g   Zoe    (health)
    600 g   Iris   (fat_loss)
    550 g   Paul   (—)
    550 g   Marc   (maintenance)
    350 g   Lou    (enfant)
    -> min 350, max 700, ÉCART 350 g, 5 valeurs distinctes sur 6

« Lentil bolognese »   500 / 450 ×4 / 300      ÉCART 200 g
« Chicken curry »      600 / 500 ×4 / 300      ÉCART 300 g
```

Et sur le **plan écrit** :
`Chicken traybake` 700 / 650 / 650 / 550 / 550 / 300 — **écart 400 g** ;
`Turkey meatballs` 600 / 500 / 500 / 500 / 250 — **écart 350 g**.

| Run | divergence réelle par bouche ? |
|---|---|
| ① r1 | 🔴 **NON** — 5 bouches sur 6 dans **une seule boîte** |
| ② r2 | ✅ **OUI**, sur les 3 casseroles |
| ③ r3 | ✅ oui (écart 750 g), mais avec une boîte partagée en surnombre |
| ④ écrit | ✅ oui sur 2 casseroles, boîte unique pour les 6 sur les 2 autres |

> **Trois runs sur quatre donnent des grammages différents par bouche.** Une
> boîte identique pour tout le monde aurait été l'échec silencieux : ce n'est
> pas ce qui est mesuré.

**Le run ① est le contre-exemple, et il est instructif.** Le modèle y a écrit une
« boîte famille » par casserole, chacune **au-delà du plafond** :

```
box_prep_roast_chicken_family   7500 g demandés -> écrêtés à 2000 g   [Paul, Zoe, Iris, Marc, Lou]
box_prep_rice_family            2400 g          -> 2000 g
box_prep_lentil_stew_family     3600 g          -> 2000 g
box_prep_veg_curry_family       3600 g          -> 2000 g
box_prep_soup_family            3600 g          -> 2000 g
box_prep_roast_chicken_theo      550 g          (Theo seul)
box_prep_rice_theo               260 g          (Theo seul)
```

Cinq boîtes sur sept sont **exactement à `BOX_MAX_GRAMS`** : le nombre affiché
n'est pas celui que le modèle a écrit. C'est nommé dans les `issues` — et
**compté nulle part** (§9.2).

### 6.5 Les autres compteurs

| Run | `unquantified_dish_ingredients` | taux | `vague_portions` | `dish_owners` |
|---|---|---|---|---|
| ① r1 | 11 / 67 | 16,4 % | **0 / 33** | `{asked:21, declared:3, attributed:3, refused:0}` |
| ② r2 | 1 / 92 | 1,1 % | **0 / 24** | `{asked:21, declared:1, attributed:1, refused:0}` |
| ③ r3 | 0 / 60 | 0,0 % | **0 / 12** | `{asked:21, declared:12, attributed:2, refused:10}` |
| ④ écrit | 2 / 79 | 2,5 % | **0 / 24** | `{asked:21, declared:0, attributed:0, refused:0}` |
| **total** | **14 / 298** | **4,7 %** | **0 / 93** | declared 16, attribués 6, refusés 10 |

`unquantified_dish_ingredients` à **4,7 %** : la section neuve du tronc a porté —
4A prévenait qu'un plan sain n'est jamais à zéro (aucune exception sel/poivre),
et le taux mesuré est bas et exploitable.

**`vague_portions` à 0 sur 93 notes n'est PAS une bonne nouvelle — c'est le
défaut §9.3.**

Le run ③ est aussi une donnée pour la paire 3 : `declared 12, attributed 2,
refused 10` — le compteur de 3C fait exactement ce pour quoi il a été écrit
(distinguer « jamais écrit » de « écrit puis refusé »), et il montre un run où le
modèle nomme dix bouches hors liste fermée. **Hors de mon périmètre, nommé.**

### 6.6 AUCUNE CALORIE, AUCUN CHIFFRE DE CORPS — grep sur les plans produits

Sur les quatre plans (`dishes`, `preparations`, `cooking_sessions`,
`shopping_list`, `member_portions`, `rationale`) :

```
r1 / r2 / r3 / écrit :
   kcal|calorie|calories|bmi|imc|body fat|masse grasse|perte de poids|weight loss|deficit
   -> AUCUN, sur les quatre.
```

Les seules occurrences de `kg` sont des **quantités d'aliment** — vérifiées une
par une : `dishes[].ingredients[].quantity`, `preparations[].ingredients[].quantity`,
`shopping_list[].quantity` (« 1,2 kg », « 2,4 kg »). **Zéro chiffre de corps.**
La frontière F7/F8 tient sur des sorties réelles.

---

## 7. 🟠 LE DÉFAUT TROUVÉ ET CORRIGÉ — `0285bb3d`

**`/app/today` rendait « Une boîte — 120 g », autant de fois qu'il y a de bouches.**

`CookingSessions` est née avec `portions?: readonly MemberPortionView[]` **et un
défaut `= []`** — la **seule** prop optionnelle ajoutée par tout le lot (vérifié :
`git show e5314d55 | grep '?:'` ne rend que cette ligne). Le montage de
`KitchenToday.tsx:281` ne la passait pas, et **le compilateur n'avait rien à
dire**. Conséquence rendue, mesurée par un test sur la valeur :

```
SessionPreparation( boxes: [box_zoe 120 g, box_nina 200 g], portions: [] )
   -> "One box — 120 g"   "One box — 200 g"   et AUCUN prénom
```

Trois grammages anonymes sous une même casserole ne sont pas une instruction de
pesée : personne ne sait quelle boîte sortir. **« Paramètre de garde optionnel =
garde désarmée »**, et le reste du lot applique déjà la règle (`boxMemberIds`
REQUIS, `preparations` REQUIS sur `groupDayBySlot`, `dedicatedDishesAsked`
REQUIS). C'est une inconsistance de discipline, à un seul endroit, et elle
coûtait un écran entier.

**Le correctif, deux gardes plutôt qu'une :**

1. `portions` devient **REQUISE** (`CookingSessions.tsx`) — le compilateur tient
   les montages ;
2. deux tests dans `planBoxes.int.test.ts` (fichier `.int.test.ts`, `createElement`,
   `react-dom/server` — le `.tsx` n'est pas collecté) : un sur la **valeur rendue**
   qui montre ce que le défaut produisait, et un qui **DÉCOUVRE** les sites de
   montage sur le disque (jamais une liste écrite à la main) et exige que chacun
   passe ses parts.
3. le montage de `/app/today` passe `meals.memberPortions ?? []`.
   **Aucune garde `isOwner` là-bas, et ce n'est pas un oubli** : `loadMealPlans`
   est scopé `.eq("user_id", …)` (`api/mealGeneration.ts:1124`), donc un
   secondaire n'a aucune ligne, `meals` est `null`, et l'écran ne rend rien.

**La mutation qui mord** (retirer `portions=` du montage) :

```
tsc  : src/keel/components/KitchenToday.tsx(281,8): error TS2741:
       Property 'portions' is missing … but required in type …
vitest: 1 failed — « src/keel/components/KitchenToday.tsx: un montage de
       CookingSessions sans `portions` »
```

Restauré, `tsc -b` exit 0, `planBoxes.int.test.ts` **25 passés** (23 avant),
vitest complet **1121 / 3 rouges étrangers**, `agent-gate` **pass**.

⚠️ **`KitchenToday.tsx` N'EST PAS SUIVI PAR GIT** (`?? frontend/src/keel/components/KitchenToday.tsx`),
alors que `TodayPage.tsx` — **suivi et présent dans `HEAD`** — l'importe
(`HEAD:frontend/src/keel/pages/TodayPage.tsx`, 2 occurrences). **Une copie fraîche
de cette branche ne compile donc pas.** C'est le travail non commité d'une autre
lane : je ne l'ai **pas** commité (mon commit ne porte que
`CookingSessions.tsx` et `planBoxes.int.test.ts`), j'ai seulement ajouté sur le
disque la ligne `portions=` qui rend leur fichier correct — **même convention que
les packs i18n**. C'est un point à remonter à la lane concernée, pas un défaut du
LOT 4.

---

## 8. LE NAVIGATEUR — sur le plan réel `45bc8a52`, pas sur une fixture

Serveur dédié `frontend-a4b` / port **5196** (ajouté à `.claude/launch.json`,
aucun port d'une autre lane touché). Jeton injecté en `localStorage`
(`sb-127-auth-token`, patron du harnais commité) — **aucun formulaire rempli**.

### 8.1 Maître (Paul), `/app/plan`

| Épreuve | Mesure |
|---|---|
| La table de pesée dans la fenêtre « tes sessions de cuisine » | ✅ **13 lignes `[data-box-id]`**, en-tête « Weigh it out » |
| La table de pesée dans le **bloc session du jour** (vue par jour) | ✅ **11 lignes** (les 2 préparations de lundi) — **les DEUX surfaces rendent** |
| « Boîte {prénom} — {g} g » sur la **reprise d'un plat** | ✅ **7 lignes**, sous « From {préparation} — cooked on {jour} » — et **7 = `box_uses.resolved`** |
| Les **grammes sur la part de chaque bouche** | 🔴 **ZÉRO ligne** — voir §9.1, ce n'est pas un défaut d'écran |
| « 1 servings » | ✅ **mort** : « — 12 portions », « — 9 portions », « — 6 portions » ×2 ; aucun « servings » en FR |
| Aucun identifiant de boîte affiché | ✅ `data-box-id` seulement, jamais de slug à l'écran |

Extraits littéraux du DOM (anglais) :

```
Box Paul, Zoe, Theo, Iris, Marc — 550 g      Box Zoe — 650 g
Box Theo — 700 g                             Box Iris — 650 g
Box Marc — 550 g                             Box Lou — 300 g
Box Paul, Zoe, Iris, Marc, Lou — 500 g       Box Theo — 600 g
Box Paul, Zoe, Theo, Iris, Marc, Lou — 430 g Box Paul, Zoe, Theo, Iris, Marc, Lou — 450 g
```

### 8.2 Les deux langues

`?lang=fr` (`document.documentElement.lang = "fr"`) :

```
« La pesée » ×5 (4 dans la fenêtre + 1 dans le bloc du jour), « Weigh it out » ×0
Boîte Paul, Zoe, Theo, Iris, Marc — 550 g · Boîte Zoe — 650 g · Boîte Theo — 700 g …
« — 12 portions » « — 9 portions » « — 6 portions » ×2 ; « servings » ×0
```

**Zéro libellé resté en anglais.** Console : aucune erreur (en DEV une clé i18n
absente lève).

### 8.3 Les débordements, mesurés et non regardés

| Largeur | `document.scrollWidth` | `clientWidth` | éléments en débordement | lignes de boîte en débordement |
|---|---|---|---|---|
| **1280** | 1280 | 1280 | **0** | 0 / 24 |
| **320** | **320** | **320** | **0** | **0 / 24** |

La plus longue ligne rendue est `Boîte Paul, Zoe, Theo, Iris, Marc, Lou — 430 g`,
et elle passe la ligne à 320 px sans faire défiler la page. Capture prise **à
scroll 0** : « LA PESÉE / Boîte Paul, Zoe, Theo, Iris, Marc — 550 g / Boîte Zoe —
650 g / Boîte Theo — 700 g » sous « Chicken traybake … — 12 portions ».

### 8.4 Secondaire (Theo, `muscle_gain`)

| Surface | Mesure |
|---|---|
| `/app/household` | **0 `[data-box-id]`, 0 « … g », 0 « La pesée »** |
| `/app/plan` → « Your share » | **0 gramme** |

Ce qu'il lit, littéralement :

> **Your share** — « Serve a larger protein and starch share with the same
> vegetable side as the table. » / « Larger protein share. » / « Larger starch
> share. » / « Same vegetable share as the table. »

Alors que **ses** boîtes existent dans le même plan : **700 g** sur le traybake,
**600 g** sur les boulettes. **Aucune boîte ne fuit vers un secondaire — et le
secondaire n'a pas non plus la sienne.** C'est l'arbitrage (a), mesuré (§10).

⚠️ Constat de passage, hors périmètre : `/app/plan` porte un bouton
**« Show calories »**. Il est **éteint par défaut** et n'a rendu aucun kcal sur
aucune des mesures ci-dessus ; il appartient au chantier « chiffre affiché » et à
la cicatrice « refus des calories renversé ». **Nommé, non touché.**

---

## 9. 🔴 CE QUI RESTE ROUGE — trois défauts, non corrigés, correctifs décrits

### 9.1 🔴 UNE BOUCHE PEUT ÊTRE DANS DEUX BOÎTES DE LA MÊME CASSEROLE, OU DANS AUCUNE

**C'est le défaut principal du lot, et il est mesuré sur des plans réels.**

Le parseur valide qu'une boîte a un **id unique**, des **bouches du roster** et
des **grammes > 0**. Il ne valide **jamais** la propriété que la consigne elle-même
énonce — *« chaque bouche est dans exactement une boîte de chaque préparation »* —
et **aucun compteur ne la mesure**.

Mesure sur les quatre générations (13 préparations, 45 boîtes) :

| Run | bouches **en 0 boîte** d'une casserole | bouches **en ≥ 2 boîtes** d'une casserole |
|---|---|---|
| ① r1 | **3** (Theo, sur lentilles / curry / soupe) | 0 |
| ② r2 | 0 | 0 |
| ③ r3 | 0 | **6** |
| ④ écrit | 0 | **7** |
| **total** | **3** | **13** |

Ce que ça donne à l'écran, sur le plan écrit, sous **une seule** casserole :

```
Boîte Paul, Zoe, Theo, Iris, Marc — 550 g
Boîte Zoe   — 650 g          ← Zoe lit DEUX poids pour la même casserole
Boîte Theo  — 700 g          ← Theo aussi
Boîte Iris  — 650 g          ← Iris aussi
Boîte Marc  — 550 g          ← Marc deux fois le même
Boîte Lou   — 300 g
```

C'est **la même famille de défaut** que celle contre laquelle la porte
d'unicité des ids a été écrite (« deux boîtes du même nom feraient servir 75 g à
la place de 150 ») — mais au niveau de l'**appartenance**, pas de l'identifiant.
Et le compteur `with_boxes` **lit 100 %** dessus.

⚠️ **Symétriquement, le sens de `grams` d'une boîte PARTAGÉE est indécidable.**
La consigne dit « ONE box may carry both their ids » **quand les deux ont le même
poids** — donc `grams` est le poids **par personne**. Le run ① l'a écrit comme le
**total du bac** (7500 g pour cinq). L'écran imprime le nombre à l'identique dans
les deux cas : « Boîte Paul, Zoe, Theo, Iris, Marc, Lou — 430 g » se lit « prends
430 g » et vaut peut-être 72 g.

**Le correctif que je propose (non appliqué — il change la forme de `box_counts`
que E et les requêtes SQL consomment, et cette décision appartient à
l'utilisateur / à E) :**

Dans `meal_generation.ts`, juste après la boucle des sommes
(`:4257-4277`), **compter sans jamais rejeter**, patron `gramsRaw` :

```ts
box_counts gagne trois champs, sur la population « préparation × bouche
                               des préparations QUI PORTENT au moins une boîte » :
  mouth_slots      = with_boxes × boxMemberIds.length      ← le dénominateur
  mouths_unboxed   = bouches dans ZÉRO boîte de cette préparation
  mouths_double    = bouches dans DEUX boîtes ou plus de cette préparation
issues:
  `preparations[i]: <prénom> has no box on "<titre>"`
  `preparations[i]: <prénom> is in N boxes of "<titre>" -- two weights for one pan`
```

`mouth_slots` est **le nombre que la consigne annonce** (`mouths` existe déjà au
trace) : `boxes / mouth_slots` devient le vrai taux de service. Sur mes quatre
runs il vaut **45 / 78 = 57,7 %**, là où `with_boxes / preparations` affiche
**100 %**.

⚠️ **Et le prompt a besoin d'une ligne, pas de dix** (la lane foyer frôle le mur
de temps du worker — 3C) : la phrase
`When two of them get the same weight, ONE box may carry both their ids` est
ambiguë sur ce que `grams` désigne. La forme la plus courte qui ferme les deux
trous d'un coup, **en remplacement** de cette phrase et non en ajout :

```
"grams" is what ONE person takes out, never the size of the tub. When two of
them take the same weight, one box may carry both ids. Every person is in
exactly one box of each preparation -- never two, never none.
```

**Zéro ligne ajoutée au prompt** (trois lignes pour deux).

### 9.2 🔴 L'ÉCRÊTAGE À 2000 g N'EST COMPTÉ NULLE PART, ET IL AFFICHE UN NOMBRE QUE PERSONNE N'A ÉCRIT

Sur le run ①, **cinq boîtes sur sept** ont été demandées au-delà de
`BOX_MAX_GRAMS` (7500, 3600, 3600, 3600, 2400 g) et **écrêtées à 2000 g**. Une
`issue` est produite (`… is over the 2000-gram ceiling … -- capped`), mais
**`box_counts.refused` reste à 0** et aucun autre champ ne le compte. Un tableau
de bord SQL sur `box_counts` lit ce run comme **parfait** ; l'écran affiche
« 2000 g » sur une casserole dont le modèle disait 7500.

C'est la cicatrice **« champ déclaré par le modèle = compteur obligatoire »**
appliquée à l'envers : la valeur **écrite en base et rendue à l'écran** n'est pas
celle que le modèle a déclarée, et rien ne le dit à qui lit le compteur.

**Correctif : un champ `capped` dans `box_counts`**, incrémenté exactement là où
l'`issue` est poussée (`meal_generation.ts:3106-3112`). Une ligne, aucun
changement de comportement. (Le plafond lui-même est sain : il empêche un
« 75000 g » d'entrer en base.)

### 9.3 🔴 `vague_portions = 0 / 93` EST UN FEU VERT FAUX

La ceinture de flou est **correctement construite** — elle mord dans les deux
langues, elle a ses cas passants, elle compte sans retirer (§3.3). **Mais son
vocabulaire n'est pas celui que le modèle emploie.** Sur **93 notes réelles**, elle
a compté **zéro** flou. Voici ce que ce zéro recouvre, mot pour mot :

```
« One standard table portion. »
« Balanced share of the shared dish. »
« Child-size share of the same dish. »
« Small portion of pasta and sauce. »
« Slightly more vegetables, standard pasta and sauce. »
« Take the family box portion with more vegetables and less starch. »
« Serve a larger protein and starch share with the same vegetable side. »
```

Et la mesure qui tranche : **ZÉRO note sur 93 ne porte un nombre de grammes** —
0/33, 0/24, 0/12, 0/24. La demande de l'utilisateur (« prendre une poignée, ça ne
veut rien dire ») n'est **pas** tenue sur la surface des notes ; elle est tenue
sur les **boîtes**, qui sont l'autre moitié du protocole.

⚠️ **Ce n'est PAS un appel à élargir la liste.** Ajouter « standard portion »,
« balanced share », « child-size » ferait exactement la ceinture qui mord sur tout
et qu'on désarme dans la semaine — et une consigne retirée laisse la bouche sans
rien, ce que 4A a raison de refuser.

**Le correctif juste est un compteur DÉTERMINISTE à côté, pas une liste plus
longue** — le patron `unquantified_dish_ingredients`, qui lit un champ structuré
et n'invente aucun matcher. Ici il n'y a pas de champ structuré, mais il y a un
fait vérifiable sans vocabulaire :

```
vague_portions gagne  quantified : nombre de notes qui portent AU MOINS un
                                   nombre suivi d'une unité de COMPOSITION_UNITS
                                   (g / ml / tbsp / tsp) ou un dénombrable.
```

Une expression régulière sur **nombre + unité connue** n'est pas un matcher
d'aliment : elle ne juge aucun mot, elle constate un chiffre. Le taux
`quantified / notes` dirait en un nombre ce que ce paragraphe met dix lignes à
dire, et il vaudrait **0 / 93** aujourd'hui.

**Décision de produit à trancher par l'utilisateur** (je ne la prends pas) : la
note de portion doit-elle porter le gramme, maintenant que la boîte le porte ?
Si oui, la consigne du brief doit le demander ; si non, il faut assumer que le
secondaire lit de la prose (§10-a).

### 9.4 🔴 UN QUATRIÈME TROU, EN AMONT DU LOT 4, QUI TUE SA TROISIÈME SURFACE

Sur le plan **écrit**, les six `member_portions` citent
`prep_chicken_roast`, `prep_rice_batch`, `prep_veg_tray` —
**aucune de ces trois préparations n'existe** (le plan porte
`prep_chicken_tray`, `prep_chicken_stirfry`, `prep_turkey_burgers`,
`prep_turkey_meatballs`). **18 `preparation_shares` sur 18 sont orphelines.**

`parseShares` (`household_portions.ts:1612-1647`) accepte **n'importe quelle
chaîne** comme `preparation_id` : aucune validation contre les préparations du
plan, aucune `issue`, aucun compteur. Conséquence en cascade :
`shareFor` ne joint rien → `DayShareLine.note` est `null` → la ligne est filtrée
→ **zéro part par bouche à l'écran** → **`boxGrams` n'est JAMAIS rendu**. La
troisième surface du LOT 4 (« les grammes sur la part de chaque bouche ») est
**morte sur données réelles**, et l'écran n'y est pour rien.

Mesure : **0/27, 0/18, 0/6 orphelines sur les trois aperçus, 18/18 sur le plan
écrit.** Le trou est intermittent, donc invisible aux tests.

**Correctif (hors périmètre strict du LOT 4 — c'est la chaîne du LOT 3, mais le
LOT 4 en dépend)** : `reconcilePortions` ne connaît que les membres ; il faut lui
passer les ids de préparations. Le patron existe mot pour mot — `boxMemberIds` :

```ts
reconcilePortions(members, raw, preparationIds: readonly string[])
   -> une part dont le preparation_id n'est pas dans la liste est JETÉE et
      COMPTÉE:  issue `share_for_unknown_preparation:<membre>:<id>`
      compteur  share_counts = { shares, unknown }
```

`preparationIds` **REQUIS**, jamais `?` — sans quoi les deux appelants ne
remonteraient pas au compilateur et la garde serait désarmée à la naissance.

### 9.5 Ce que je n'ai pas prouvé

1. **Le singulier « — 1 portion » n'a pas été vu sur données réelles** : aucune
   des 13 préparations produites n'a `servings_made = 1`. Il est prouvé par le
   test sur la valeur rendue (`planBoxes.int.test.ts`, `servings_made: 1` ⇒
   contient « — 1 serving », ne contient pas « — 1 servings ») et par les deux
   clés de seed. C'est un rouge de mesure, pas un doute.
2. **`sum_over` n'a jamais mordu en réel** : 0 sur 6 préparations vérifiables ;
   **7 sur 13 sont `unverifiable`** (un ingrédient hors référentiel suffit). La
   garde est donc muette sur **plus de la moitié** des casseroles — dont, au run
   ③, la seule qui portait un double-boîtage. C'est un constat sur la couverture
   du référentiel, pas sur le code.
3. **La lane individuelle n'a pas été mesurée en réel.** Structurellement elle
   passe `boxMemberIds: []` et n'a aucune boîte ; le point à mesurer est
   uniquement de savoir si le modèle, à qui `MEAL_TOKEN_FIELDS` nomme désormais
   deux clés de boîte, en écrit quand même (elles seraient refusées et comptées).
   **Laissé à E**, avec la requête : `generated_from->'boxes'` sur
   `plan_kind = 'personal'`.
4. **L'aperçu (`PlanDraftDialog`) n'a pas été ouvert au navigateur.** C8 est tenu
   au code (`PlanResult` monté deux fois, verrouillé par
   `pages/setupDraftWiring.int.test.ts:148-156`) et la table de pesée vit dans
   `PlanDayBlock`, commun aux deux montages — mais je ne l'ai pas vu.
5. **Le foyer à objectifs divergents mesuré est un seul foyer** (Auber, 6
   bouches). Le taux de boîtes par bouche peut dépendre de la taille du foyer,
   comme 3C le soupçonnait pour `for_member_id`.

---

## 10. LES DEUX ARBITRAGES DE 4A — tranchés, pas entérinés

### (a) `MyShareCard` ne cite aucune boîte — **le refus est JUSTE, la conséquence est un TROU PRODUIT**

**Je confirme le refus.** `loadHouseholdMeal` (`api/household.ts:1424`) fait un
`select` **depuis le navigateur du secondaire** ; ajouter `preparations` y
enverrait `boxes`, c'est-à-dire **les grammes de tout le monde**, dans le client
d'un secondaire. C'est bien l'élargissement de `HouseholdDishView` que le master
interdit, et le passer par prop ne changerait rien — le front ne peut pas filtrer
ce qu'il ne reçoit pas.

**Mais la question posée est la bonne, et la réponse mesurée est « oui, il en est
privé ».** Theo est la bouche `muscle_gain` de ce foyer ; ses boîtes existent
(700 g, 600 g) ; à l'écran il lit « Larger protein share » et **rien d'autre**
(§8.4). Il est la personne qui ouvre le frigo, et le protocole de P4 — « on pèse
une fois, ensuite on cite la boîte » — **ne l'atteint pas**. La note de portion
aurait pu compenser : elle ne porte **aucun gramme sur 93 notes** (§9.3).

**Le correctif, précisément** (non appliqué : c'est une décision de produit) —
`loadHouseholdMeal` ne peut pas filtrer côté client, donc :

```
Une RPC `keel_household_meal_view(today)` en SECURITY DEFINER, qui rend
`HouseholdMealView` augmenté de:
    myBoxes: [{ preparationTitle, grams }]
filtré sur `auth.uid()` -> son member_id -> les boîtes dont member_ids le
contient. Le secondaire reçoit SA ligne et rien d'autre; le maître garde la
table complète, qu'il a déjà.
```

Le titre de préparation suffit (« Poulet rôti — ta boîte : 700 g ») ; l'id de
boîte n'a rien à faire à l'écran, comme partout ailleurs dans ce lot.

### (b) « 120 g » deux fois — **ce n'est PAS une redondance, et il ne faut RIEN taire**

4A propose que l'une des deux surfaces se taise. **Non**, et pour une raison
structurelle qu'il n'a pas nommée : **les deux lignes ne peuvent pas se
correspondre en général.**

- `dish.uses[]` porte **UN** `box_id` par préparation. Un plat de table servi à
  six bouches depuis six boîtes ne peut en nommer **qu'une**. La ligne de
  `DishCard` est donc, dans le cas général, la boîte d'**une** personne — ou une
  boîte partagée.
- `DayShareLine.boxGrams` est **par bouche** et rend un tableau : c'est la seule
  surface qui peut dire les six.

Elles disent la même chose **uniquement** dans le cas dégénéré à une boîte. Faire
taire `DishCard` retirerait la seule mention de boîte sur le plat ; faire taire la
part retirerait les cinq autres bouches. **Aucune des deux ne doit se taire.**

⚠️ Et le vrai sujet est ailleurs : sur le plan réel, la ligne de part **ne s'est
jamais affichée** (§9.4). La « redondance » que 4A a vue en test n'existe pas
encore en production.

**Une seule chose à corriger, et elle est cosmétique** : quand les deux nombres
coïncident, ils se lisent à deux centimètres l'un de l'autre. Le geste juste,
quand §9.4 sera réparé, est de mesurer ce que ça donne à l'écran avant de
décider — pas de couper à l'aveugle.

⚠️ **Un écart de 4A à son propre rapport, mineur** : §8 dit « une seule jointure,
`lib/preparationBoxes.ts` ». En fait `planDaySlots.ts:217-224` refait la boucle
plat→boîte en ligne au lieu d'appeler `boxLineForUse`. Les deux joignent **par
id** (aucune lecture de titre, l'interdit est respecté), donc le risque est de
maintenance, pas de justesse. **Nommé, non corrigé** — le déplacer maintenant
toucherait un chemin que le run réel n'exerce pas encore (§9.4).

---

## 11. 🟠 DEUX DES HUIT REQUÊTES SQL DE 4A POUR E SONT CASSÉES

Jouées telles quelles sur la base locale :

| § | Résultat |
|---|---|
| 11.2, 11.3, 11.6, 11.7 | ✅ tournent |
| 11.4 (première) | ✅ tourne — **et c'est la contre-preuve, elle confirme le compteur** (§4.3) |
| **11.4 (seconde, les `uses`)** | 🔴 `ERROR: set-returning functions are not allowed in COALESCE` |
| **11.5 (les grammes par bouche)** | 🔴 `ERROR: column hm.id does not exist` — la clé de `household_members` est **`member_id`**, il n'y a pas de colonne `id` |
| 11.8 | ✅ conforme à ce que la réponse d'aperçu porte réellement |

**Les deux corrigées, vérifiées :**

```sql
-- 11.4bis — les uses, sans COALESCE autour d'une fonction à N lignes
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
from u group by 1 order by 1;
-- sur 45bc8a52 : uses 7 | key_written 7 | cited 7
```

```sql
-- 11.5bis — la jointure se fait sur hm.member_id
... left join household_members hm on hm.member_id = b.member_id::uuid ...
```

Et **la requête qui manquait**, celle de §9.1 — la seule qui distingue un lot qui
marche d'un lot qui en a l'air :

```sql
-- BOUCHES SANS BOÎTE, ET BOUCHES EN DOUBLE, PAR PRÉPARATION
with b as (
  select m.id, prep->>'title' as preparation,
         jsonb_array_elements_text(box->'member_ids') as member_id
  from student_generated_meals m,
       jsonb_array_elements(m.preparations) prep,
       jsonb_array_elements(coalesce(prep->'boxes','[]')) box
  where m.retired_at is null and m.plan_kind='household'
)
select left(id::text,8) as plan, preparation, member_id, count(*) as boxes
from b group by 1,2,3 having count(*) > 1 order by 1,2;
-- sur 45bc8a52 : 7 lignes -> 7 bouches dans deux boîtes de la même casserole
```

---

## 12. Ce que j'ai touché, et ce que je n'ai pas touché

**Un commit, `0285bb3d`, DEUX chemins explicites** relus par `git diff` avant stage :

```
frontend/src/keel/components/CookingSessions.tsx     (+23 −6)   portions REQUISE
frontend/src/keel/components/planBoxes.int.test.ts   (+87 −1)   2 tests + mountSitesOf
```

- **Jamais `git add -A`. Jamais `git stash`** (dépôt partagé, plus de 380 fichiers
  d'autres lanes en cours). Les deux fichiers ne portaient **aucun** hunk étranger.
- **`KitchenToday.tsx` modifié sur le disque, NON commité** — fichier **non suivi
  par git**, propriété d'une autre lane (§7). Même convention que les packs i18n.
- **Packs i18n non commités** : `en.ts` modifié par 4A (non commité),
  `fr.ts` **non suivi**. Aucune clé ajoutée par moi.
- **Aucun fichier serveur modifié** : les trois fichiers `_shared` mutés en §5
  sont revenus à leur SHA256 exact.
- **Aucun fichier étranger défait.**
- **Aucune migration.** **Aucune commande à risque.**
- `agent-gate` (`AGENT_GATE_STAGED_ONLY=1`) sur mon commit : **pass**
  (JWT, scan de motifs, compte de tests 6256, suite Deno 3140, typecheck front,
  `deno check`, eslint).
- **Écrit en base** : un plan foyer réel, `45bc8a52-2d12-4f4c-9783-7fddcac143e8`
  (Auber, 2026-08-17 → 23, `prompt_version` v11+v14, **13 boîtes**). **Laissé en
  place pour E** — c'est le premier plan du dépôt qui porte des boîtes, et E en a
  besoin pour la grille C1→C8 à l'écran.
- Ajouté `frontend-a4b` (port 5196) à `.claude/launch.json`, aucun port existant
  touché. Worktree de comparaison **retiré**.

---

## 13. Les décisions tranchées seul

| Décision | Option rejetée, et pourquoi |
|---|---|
| **Rendre `portions` REQUISE et corriger `/app/today`** | La laisser optionnelle et se contenter de le signaler : le défaut était livré, l'écran était faux, et le correctif est la discipline que tout le reste du lot applique déjà. Trois lignes, deux gardes, une mutation qui mord. |
| **NE PAS ajouter le compteur `mouths_unboxed` / `mouths_double` moi-même** | Le poser : il change la forme de `box_counts`, que les requêtes SQL de 4A et l'agent E consomment, quelques heures avant le run de bout en bout. Un vérificateur qui modifie le contrat du parseur juste avant E crée exactement la divergence qu'il est censé détecter. **Décrit au caractère près (§9.1), pas appliqué.** |
| **NE PAS élargir `VAGUE_PORTION_TERMS`** | Y mettre « standard portion », « balanced share », « child-size » : ce serait la ceinture qui mord sur tout, désarmée dans la semaine — et 4A a raison sur le fond (une note retirée laisse la bouche sans rien). Le manque est un COMPTEUR, pas du vocabulaire. |
| **NE PAS toucher `parseShares`** | C'est la chaîne du LOT 3, elle a son propre sujet, et son correctif change une signature partagée par deux lanes. **Nommé, mesuré (18/18), décrit (§9.4).** |
| **Écrire un plan réel plutôt que fabriquer une fixture** | Fabriquer le `jsonb` à la main (précédent 3B) : un plan fabriqué prouve l'écran, pas la chaîne. C'est en écrivant un plan réel que les deux défauts de §9.1 et §9.4 sont apparus — une fixture écrite par moi les aurait tous les deux évités par construction. |
| **Modifier `KitchenToday.tsx` sur le disque sans le commiter** | Le commiter : ce serait s'approprier le travail non commité d'une autre lane. Le laisser cassé : le disque ne compilerait plus une fois `portions` requise. Convention des packs i18n, appliquée telle quelle. |
| **Ne pas viser d'autre foyer** | Les autres foyers à ≥ 3 bouches et objectifs divergents (`Home` / `ff060_mouths@example.com`) n'ont pas de mot de passe vérifié. « Ne jamais viser un compte sans mot de passe connu » n'a pas d'exception. |

---

## 14. Le verdict

**Le LOT 4 est VERT sur tout ce que le master demande de vérifier**, et il est
**armé** — c'est le point qui n'était pas prouvé et qui l'est maintenant, avec un
chiffre : **100 % des préparations portent des boîtes sur quatre générations
réelles, 45 boîtes, zéro refusée, 67 citations résolues sur 67, et des grammages
qui divergent réellement entre bouches sur trois runs sur quatre.**

**Il n'est pas COMPLET.** Le lot valide qu'une boîte est bien formée ; il ne valide
pas qu'un jeu de boîtes est **exécutable**. Sur les quatre plans mesurés, treize
bouches se retrouvent dans deux boîtes de la même casserole avec deux poids
différents affichés côte à côte, trois se retrouvent sans aucune boîte, cinq
boîtes affichent un nombre écrêté que le modèle n'a pas écrit, et zéro note de
portion sur quatre-vingt-treize porte un gramme. Quatre trous, quatre correctifs
courts et décrits, **aucun n'est un rejet de plan** : ils sont tous du même
métier que le lot — compter, nommer, laisser l'humain décider.

**Ce qui doit être tranché avant E**, et qui appartient à l'utilisateur :
le compteur de couverture par bouche (§9.1) et la ligne de prompt qui lève
l'ambiguïté de `grams` sur une boîte partagée.
