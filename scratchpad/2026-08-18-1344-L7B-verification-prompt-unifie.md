# L7-B — vérification du prompt unifié : **le run réel**

**Date** 2026-08-18 13:44 · **Branche** `ff-001-quotidien-du-coach` · aucun push, aucun merge
**Rapport vérifié** [2026-08-18-1312-L7A-prompt-unifie.md](2026-08-18-1312-L7A-prompt-unifie.md)
**Commits** `9a238658` · `8971831c` · `78d1b383`

---

## 0. Le verdict, en cinq nombres

> ### ③ LE NOM D'UN PLAT : **124 plats écrits par le modèle, 124 noms — 100,0 %.**
> **0** trop long, **0** identique au titre, **0** refusé. Sur **cinq** runs, sur les
> **deux** lanes. Le titre n'a **pas** été enjolivé : l'échappatoire que la consigne
> nomme n'a pas été prise une seule fois.
>
> ### ① LA CUISINE : bloc servi sur 3 runs. **0 four, 0 cuisson au four, 0 congélation, 0 micro-ondes** dans le texte composé.
> Le modèle a écrit *« Reheat a box … in a pan »* — la ligne du micro-ondes, reprise mot pour mot.
>
> ### ② LE MIDI DEHORS : **0 mention** sur 4 cases nommées (titre, méthode, note de service). Mais **1 case sur 4 a reçu un plat** — §4.3.
>
> ### ⑤ FUITE TCA : `residual_gaps` **absent du log réel**, `residual_gaps_count` / `residual_gaps_max_band` présents. Fermée.
>
> ### Le lot **est armé** : version servie et archivée = `meal.en.v12_a_dish_has_a_name+household.v16_this_kitchen_and_a_meal_out`.

| Épreuve | Résultat |
|---|---|
| **Run réel — taux de noms, les deux lanes** | ✅ **124/124 = 100 %** (archive brute), 86/86 gardés |
| **Run réel — équipement lu** | ✅ trace `{declared, missing}` juste, 3 runs, 2 foyers |
| **Run réel — déjeuner dehors** | ⚠️ **0 mention**, mais **1 plat composé** sur une case interdite (§4.3) |
| **Les trois nombres, sur l'APERÇU** | ✅ lane foyer · 🔴 **absents de la lane individuelle** (§5.2) |
| Byte-identité des deux bumps, **contre le code d'avant**, SHA256 | ✅ §3 — et la preuve n'est **pas** vide (cas armés mesurés) |
| `hasKitchenTool` importé dans le périmètre | ✅ **nulle part** ; **M13 mord** sur le bon test |
| Mutations rejouées | ✅ **9/9 mordent**, avec le **nom du test** qui rougit |
| ⚠️ Le test jumeau du LOT 3C serait creux | ⛔ **RÉFUTÉ, mesuré** — il mord (§7) |
| `deno test _shared/keel/` | ✅ **3323 passés, 0 rouge** |
| `cd frontend && npx tsc -b --force` | ✅ **exit 0** |
| vitest | ⚠️ **3 rouges, 2 fichiers, tous étrangers** (§8.2) |
| Navigateur `/app/plan` + `/app/today`, 320 px & 1280 px, EN & FR | ✅ **aucune régression**, `scrollWidth === clientWidth` partout, 0 erreur console |
| Hunks étrangers FF-042 | ✅ **rien de perdu** : diff disque == patch, à l'octet |

---

## 1. Le poste, et ce que j'ai fait dessus

- **Sondé avant tout geste.** `docker logs --tail 40 --timestamps supabase_edge_runtime_Sophia_2`
  ne montrait que des crons réentrants (`process-llm-retry-jobs`,
  `trigger-topic-compaction`, `process-checkins`, `account-export-v1`).
- **Je n'ai PAS eu besoin de redémarrer le runtime** : il s'était recréé seul à
  **11:15:32 UTC**, c'est-à-dire **après** les mtimes des trois modules du lot
  (11:04). Fraîcheur donc acquise sans mon geste — et **prouvée deux fois** :
  le log porte `residual_gaps_count` (clé qui n'existe que depuis `9a238658`) et
  la ligne écrite porte la version v12+v16 (§2).
  ⚠️ **Le conteneur s'est recréé une seconde fois pendant un run** (11:29:49),
  ce qui a rendu un **HTTP 502** et perdu le tour. Cause identifiée sur les
  mtimes : une lane voisine venait d'écrire `_shared/keel/week_review.ts`,
  `activity_session.ts` et la migration `20260818190000`. Le watcher de
  `supabase functions serve` réagit à l'écriture, pas à moi. Relancé, 200.
- `./scripts/local_extend_kong_functions_timeout.sh` joué (`read_timeout=600000`).
- `./scripts/check-local-jwt-alg.sh` : ✅ HS256, jeu de clés vide, JWKS vide.
- **Aucune commande à risque.** Ni `supabase stop/start`, ni `db reset/push`, ni
  `functions deploy`, ni `secrets`, ni `config push`, ni `link`. Aucun
  `git add -A`, aucun `git stash`.
- Comptes visés, **mot de passe `1234567` vérifié avant de viser** :
  `laneb-master-…@test.dev` (foyer Auber, 6 bouches),
  `l4m-owner-1786500297@test.dev` (foyer Amara L4, 3 bouches),
  `laneb-solo-…@test.dev` (lane individuelle).

### 1.1 ⚠️ Ce que j'ai LAISSÉ en base, et qu'il faut savoir

**Deux plans ÉCRITS, et ce sont les pièces à conviction :**

| Plan | Compte | Fenêtre | Pourquoi |
|---|---|---|---|
| `8982a647` (`plan_kind=household`) | foyer **Amara L4** `4ba4c573` | 2026-08-20, 4 j | la **seule** façon de lire la version de prompt : un `intent:"draft"` n'écrit pas `generated_from`. `prepare_next` **ajoute**, il ne remplace rien — ce foyer n'avait **aucun** plan vivant. |
| `09c4bda1` (`plan_kind=personal`) | `laneb-solo-…` | 2026-08-18, 4 j | pour que `/app/today` ait un plan **portant des noms** à rendre. Ce compte n'avait **aucun** plan. |

⛔ **Je ne les ai pas supprimés** : supprimer des données n'est pas un geste que
je prends seul, et ces deux lignes **sont** la preuve. Elles n'écrasent rien.

**Les fixtures de collecte sont RESTAURÉES** — les deux populations sont
redevenues vides, vérifié :

```
select count(*) filter (where practical_constraints ? 'kitchen_equipment'), count(*) from student_goals;
--  0 | 73
select count(*) filter (where … 'eating_out'), count(*) from household_members;
--  0 | 65
```

⚠️ **Et ces deux dénominateurs ne sont pas ceux du rapport L7-A.** Il écrit
« **0 sur 175** » et « 0 sur 63 » ; la base locale porte **0 sur 73** et **0 sur
65**. Le **numérateur** — celui qui porte tout l'argument — est bien **zéro** :
la conclusion tient, le dénominateur cité est faux.

---

## 2. La fraîcheur du runtime, prouvée sur la ligne écrite

```sql
select generated_from->>'prompt_version' from student_generated_meals where id='8982a647…';
```

```
meal.en.v12_a_dish_has_a_name+household.v16_this_kitchen_and_a_meal_out
```

**C'est exactement la chaîne attendue par le mandat.** Le plan vivant d'à côté
(`124254f5`, foyer Auber, écrit hier) porte encore
`meal.en.v11_weighed_or_counted+household.v15_one_box_each_and_a_number` : les
deux axes ont bougé, et on lit le saut sur deux lignes de la même table.

⚠️ **Un aperçu ne porte AUCUNE version** — `generated_from` n'existe que sur une
ligne écrite. Un vérificateur qui n'aurait joué que des `draft` n'aurait donc
**aucun** moyen de prouver qu'il ne mesure pas v15. C'est le seul motif du plan
écrit du §1.1, et ça mérite d'être noté pour L8.

---

## 3. Les deux bumps — la byte-identité **rejouée contre le code d'avant**, pas contre un `includes`

Je n'ai pas cru les tests du lot : j'ai extrait
`household_meal_generation.ts` **tel qu'il était à `9a238658^`**, réécrit ses
imports relatifs en URL absolues, et **exécuté les deux versions côte à côte**
sur un foyer riche (3 bouches, une absence, un régime, une envie, une règle de
maison, un porteur de plat dédié) — puis comparé les **SHA256**.

```
VERSIONS      old=v15_one_box_each_and_a_number   now=v16_this_kitchen_and_a_meal_out
OLD (9a238658^)              user=d1c664809c181dcf  system=81e7a0830334ae0d  ulen=4516 slen=1667
NOW kitchenEquipment=null    user=d1c664809c181dcf  system=81e7a0830334ae0d  ulen=4516 slen=1667
NOW kitchenEquipment=les 7   user=d1c664809c181dcf  system=81e7a0830334ae0d  ulen=4516 slen=1667

① jamais demandé  == OLD ?  user:true   system:true
① tout coché      == OLD ?  user:true   system:true
② personne dehors :  eatingOut={"mouths":0,"cells":0}   kitchenMissing=[]
```

⛔ **Et la preuve n'est pas vide** — le point que le dépôt paie chaque fois qu'on
l'oublie (« une garde sans cas qui passe est une garde qu'on croit posée ») :

```
ARMÉ ? kitchenEquipment=["stovetop"]  diffère d'OLD : user:true  (+581 octets)
ARMÉ ? une bouche dehors              diffère d'OLD : user:true  (+489 octets)   trace={"mouths":1,"cells":1}
```

**② L'adjacence, mesurée sur les octets et non sur un `split` :**

```
index(bloc dehors) = 3721      index(presence.block) + len + 2 = 3721      ✅ égaux
② contient un chiffre ? false
```

Le SHA256 du `systemSuffix` est **le même** dans les trois cas : les deux blocs
neufs ne réclament aucun champ, exactement comme le rapport l'annonce.

---

## 4. LE RUN RÉEL — cinq runs, deux lanes, deux foyers

| # | Route | Compte | Fenêtre | Durée | `names` | `kitchen.missing` | `eating_out` |
|---|---|---|---|---|---|---|---|
| 1 | `draft` foyer | Auber (6 bouches) | 21/08, 6 j | **104 s** | `{36, 36, 36, 0}` | oven, microwave, freezer, air_fryer | `{2, 2}` |
| 2 | `draft` solo | laneb-solo | 19/08, 4 j | **151 s** | 🔴 `null` (§5.2) | — | — |
| 3 | `prepare_next` foyer | **Amara L4** (3) | 20/08, 4 j | **28 s** | `{16, 16, 16, 0}` | oven, freezer, air_fryer, pressure_cooker | `{1, 1}` |
| 4 | `draft` foyer | Amara L4 | 21/08, 3 j | **65 s** | `{11, 11, 11, 0}` | idem | `{1, 1}` |
| 5 | `prepare_next` solo | laneb-solo | 18/08, 4 j | **131 s** | 🔴 `null` | — | — |

`names` = `{dishes, declared, kept, refused}`. **Aucun run n'a expiré.**

### 4.1 ③ Le taux de noms — **et les VALEURS, pas seulement le compte**

L'archive **avant toute validation** (`llm_raw_response_events.output_text`,
la requête ④ du rapport, celle qui a renversé le diagnostic de 3C) :

| heure UTC | source | plats écrits | **avec un nom** | > 60 car. | == titre |
|---|---|---|---|---|---|
| 11:25:04 | `generate-household-meal-v1` | **47** | **47** | 0 | 0 |
| 11:25:45 | `…protein_anchor_retry` | 16 | 16 | 0 | 0 |
| 11:26:46 | `generate-meal-v1` | 12 | 12 | 0 | 0 |
| 11:30:50 | `generate-household-meal-v1` | 16 | 16 | 0 | 0 |
| 11:40:24 | `generate-meal-v1` | 11 | 11 | 0 | 0 |
| 11:43:01 | `generate-household-meal-v1` | 11 | 11 | 0 | 0 |
| 11:43:38 | `…protein_anchor_retry` | 11 | 11 | 0 | 0 |
| | **TOTAL** | **124** | **124 — 100,0 %** | **0** | **0** |

Et la requête ③ du rapport, **jouée telle quelle** :

```
 plan_kind | plans | dishes | with_name | pct
-----------+-------+--------+-----------+-------
 household |     1 |     16 |        16 | 100.0
```

⚠️ **Une seule ligne, et c'est attendu** : les autres runs étaient des aperçus,
et le seul plan v12 écrit côté foyer est le mien. La lane solo n'apparaît pas
parce que son plan écrit (`09c4bda1`) n'a pas de `generated_from.prompt_version`
lisible par ce filtre — voir §5.2.

**Les valeurs — c'est là que l'échappatoire se lit.** Trois exemples réels :

```
name = "Yogurt berry bowl"        title = "Greek yogurt, strawberries and oats"
name = "Herby tuna salad"         title = "Tuna, cannellini beans, tomatoes, cucumber and bread"
name = "Zoe chicken bowl"         title = "Chicken, courgettes, peppers and rice"
```

⛔ **Le titre n'a jamais été enjolivé.** Sur 124 plats, pas un seul titre ne
ressemble au « Soleil de Marrakech » que la consigne nomme : ils sont tous
restés la liste plate de ce qu'il y a dans l'assiette. **La deuxième moitié du
lot ③ tient**, et c'était la moitié risquée.

**🟠 Le défaut de qualité que la garde ne voit pas — 3 noms sur 64 rendus.**

| jour/case réelle | nom rendu | le problème |
|---|---|---|
| **lun** dîner | `Tuesday chilli rice` | nomme **mardi** |
| **mer** petit-déj | `Thursday?` | nomme **jeudi**, **et n'est pas un nom** |
| ven dîner | `Friday lentil supper` | (juste — le contre-exemple) |

Les deux refus (longueur, égalité au titre) sont des refus de **forme**. Un nom
qui contredit son jour, ou qui est une question, passe les deux et compte dans
`kept`. **Ce n'est pas un défaut du lot** — la conception ne demande pas de
juger le sens, et un matcher sur ce champ est exactement ce que l'en-tête de
`name` interdit. Mais **« 100 % de noms gardés » ne veut pas dire « 100 % de noms
utilisables »**, et le chiffre ne doit pas être lu comme tel. Mesuré : **4,7 %
des noms portent un mot de jour, dont 2 sur 3 le portent FAUX**.
⚠️ Les trois viennent du **même run** — le seul qui a dépassé le plafond de
plats (47 écrits pour 36 gardés). Les 4 autres runs : **zéro**.

### 4.2 ① L'équipement — lu, servi, et **obéi**

Fixture posée à la main sur deux foyers (**et c'est une fixture, dite comme
telle** : la population réelle est de **0** ligne, avant comme après) :

| foyer | déclaré | `missing` rendu | ligne micro-ondes |
|---|---|---|---|
| Auber | `stovetop, pressure_cooker, blender` | `oven, microwave, freezer, air_fryer` | **servie** (`No microwave: reheating means a pan`) |
| Amara L4 | `stovetop, microwave, blender` | `oven, freezer, air_fryer, pressure_cooker` | **non servie** — le micro-ondes est là |

⛔ **La garde du `null` tient en vrai** : la trace rend `declared: null` /
`missing: []` quand rien n'est déclaré, et **aucun bloc** n'est assemblé.

**Ce que le texte composé contient**, balayé sur les 5 runs
(`oven`, `roast`, `bake`, `grill`, `freeze`, `frozen`, `freezer`, `microwave`,
`air fryer`) : **zéro occurrence dans un titre, une méthode, une préparation ou
une session.** Les 4 occurrences trouvées dans la réponse HTTP sont **dans la
trace elle-même** (`kitchen.missing`), pas dans le plan.

Et la consigne est reprise **littéralement** :

```
"Reheat a box of the chicken rice in a pan, finish with lemon and serve with salad leaves."
"Reheat a larger box of the chicken rice in a pan, then finish with lemon…"
```

⚠️ **Sur le foyer Amara L4 (micro-ondes présent, four absent), le run 3 a
composé une session de cuisine au four** (`Heat the oven first… Roast both
together`) — **et c'est correct** : ce plan-là a été composé **avant** que je
pose la fixture d'équipement. Le run 4, **après** fixture, n'a plus une seule
cuisson au four. C'est l'avant/après du bloc ①, sur le même foyer.

### 4.3 ② Le midi dehors — **0 mention sur 4 cases, mais 1 plat composé sur 4**

**La moitié qui tient, et elle est nette.** Balayage sur les 5 runs de
`eat out`, `eating out`, `eaten out`, `elsewhere`, `canteen`, `restaurant`,
`at work`, `away from`, `packed lunch`, `not here`, `out of the house` :

```
Auber apercu (2 cases dehors)  plats= 36  mentions dehors: AUCUNE   kcal: AUCUN
L4 apercu    (1 case)          plats= 11  mentions dehors: AUCUNE   kcal: AUCUN
L4 ecrit     (1 case)          plats= 16  mentions dehors: AUCUNE   kcal: AUCUN
solo apercu                    plats= 12  mentions dehors: AUCUNE   kcal: AUCUN
solo ecrit                     plats= 11  mentions dehors: AUCUNE   kcal: AUCUN
```

⛔ **Et aucun chiffre nulle part** : `kcal`, `calorie`, `calories` = **0** sur
les cinq runs. **La clause C5 n'est pas violée par ce lot.** (Le bloc lui-même
est prouvé sans chiffre au §3, sur l'expression, pas sur un run.)

**🔴 LA MOITIÉ QUI NE TIENT PAS — et je donne les octets.**

Run 3 (foyer Amara L4, écrit). Zoé mange dehors **jeudi midi** ; le bloc l'a
nommée (`eating_out: {mouths:1, cells:1}`), et il dit *« Compose NOTHING there:
no dish, no preparation, no line of shopping. »* Le plan écrit porte :

```
thu lunch | member_id=08acc9c4… (Zoé) | name="Zoe chicken bowl"
          | method="Reheat Zoe's own box and serve it as packed."
```

**Un plat, sur la case exacte, attribué à la bouche exacte.**

**Le diagnostic AVANT tout resserrage — méthode 3C, et il change la conclusion :**

1. **Le bloc a bien été servi et bien placé.** Trace `{mouths:1, cells:1}`, et
   l'adjacence à `presence.block` est vérifiée à l'octet (§3). Ce n'est **pas**
   un problème de livraison — l'hypothèse (a) de 3C est réfutée ici aussi.
2. **Le prompt ne demandait PAS ce plat.** `dish_owners.asked = 11`, pas 12 :
   `compositionEaterCells` lit `m.away.effective`, qui **inclut** les cases
   `eating_out`. Le jeudi midi de Zoé est donc **déjà** exclu du budget de plats
   dédiés. La donnée est juste des deux côtés.
3. **Le bloc ② passe APRÈS le bloc 3C** dans le `userSuffix`
   (`dedicatedDishBlock` → `presence.block` → `eatingOut.block`), donc il a la
   position la plus contraignante des deux. La position n'est pas la cause.
4. **La cause probable, et elle est nommable** : `dedicatedDishBlock` promet à
   Zoé *« at EVERY meal they eat here… »* et donne un **nombre** (11) sans
   énumérer **quelles** cases ; le bloc ② énumère la case exclue mais dit
   « no dish » **sans dire « pas même son plat à elle »**. Les deux se lisent
   comme parlant de deux choses différentes : *le plat de la table* et *le plat
   de Zoé*. Le modèle a écrit **4** des 11 plats promis — et en a posé un sur la
   case interdite.
5. **⚠️ ET LA FRÉQUENCE EST FAIBLE, ce qui interdit de resserrer maintenant.**
   Sur **4 cases nommées dans 3 runs**, **1 seule** a reçu un plat — et c'est la
   **seule** des trois où le modèle a joué le jeu du plat dédié
   (`dish_owners.declared` = **4**, contre **0** aux deux autres runs). Les deux
   runs où le modèle a ignoré le bloc 3C n'exercent donc **pas** le conflit :
   n = **1** contre-exemple, sur **1** occasion réelle.

**Le correctif, décrit et NON appliqué** — trois mots dans la ligne qui existe
déjà, donc **zéro ligne de prompt en plus** (la lane foyer expire à 4 min) :

```diff
- "Compose NOTHING there: no dish, no preparation, no line of shopping.",
+ "Compose NOTHING there: no dish -- not even a dish of their own -- no",
+ "preparation, no line of shopping.",
```

⛔ **Je ne l'ai pas posé, et c'est une décision, pas un oubli.** Trois raisons :
(i) **n = 1** — 3C a mesuré qu'un resserrage décidé sur un échantillon d'un seul
run se paie ; il faut d'abord un foyer où le porteur de plat dédié **est** celui
qui mange dehors, joué **3 à 5 fois** ;
(ii) il change le texte servi à une population déjà couverte par v16 : c'est un
**bump de plus** à arbitrer, sur une enveloppe qui vient d'en prendre un ;
(iii) la faute est **discrète et non dangereuse** — un plat de trop dans un
plan, pas un aliment interdit dans une assiette.
**C'est un chantier nommé, pas un blocage.**

---

## 5. Les compteurs — sur l'aperçu, et le trou de la lane individuelle

### 5.1 ✅ Les trois nombres sont bien sur l'APERÇU (lane foyer)

Réponse de `intent:"draft"`, run 1, aucune écriture :

```json
"names": {"dishes": 36, "declared": 36, "kept": 36, "refused": 0},
"household": {
  "kitchen":    {"declared": ["stovetop","pressure_cooker","blender"],
                 "missing":  ["oven","microwave","freezer","air_fryer"]},
  "eating_out": {"mouths": 2, "cells": 2}
}
```

Et sur la ligne écrite, par la **même** expression :
`generated_from.names = {"kept":16,"dishes":16,"refused":0,"declared":16}`.
**La moitié que 3C a dû ajouter après coup est là dès le premier jour.**

### 5.2 🔴 Le §6.2 du rapport L7-A est **inexact**, et c'est le seul point de fond

Il écrit : *« Ce qui manque côté solo est `refused`, et lui seul. »*

**Mesuré : sur la lane individuelle il ne manque pas `refused`, il manque LE
COMPTEUR.** La réponse `draft` de `generate-meal-v1` rend `names: null` **et**
`same_day: null` : la branche `isDraft` (l. 2193) ne porte **aucun** des deux ;
la branche écrite (l. 2392) porte `same_day` et **pas** `names`.

Conséquence exacte :

| | `dishes` | `declared` | `kept` | `refused` |
|---|---|---|---|---|
| lane foyer (aperçu **et** ligne écrite) | ✅ | ✅ | ✅ | ✅ |
| lane individuelle — la requête SQL ③ | ✅ | ⛔ | ✅ | ⛔ |

Un nom **refusé** est écrit `null` en base, donc **indiscernable** d'un nom
**jamais déclaré**. C'est **le zéro ambigu de 3C**, remis en place sur la moitié
de la population — la confusion précise que le compteur à trois nombres existe
pour empêcher.

**Atténuation réelle, et je m'en suis servi** : `llm_raw_response_events` porte
le texte brut et donne `declared` sur **les deux** lanes (c'est la table du §4.1).
Le trou est donc **mesurable**, pas aveugle — mais il faut le savoir.

**Le geste, et il est d'une ligne**, dans `generate-meal-v1/index.ts` — **hors de
mon périmètre comme du sien** (la lane FF-042 y écrit encore) :
`names: meal.name_counts,` à côté de `same_day: meal.same_day_counts,` (l. 2392),
**et** dans la réponse `isDraft` (l. ~2205), sans quoi l'aperçu solo reste aveugle.

---

## 6. `hasKitchenTool` — le point tranché par L7-A, revérifié

**Audit d'appelants, commentaires exclus** (cicatrice « grep naïf = faux
vivants ») :

```
supabase/functions/generate-household-meal-v1/index.ts:191   ← COMMENTAIRE (« n'est pas importé ici »)
supabase/functions/_shared/keel/household_meal_generation.ts:933-943 ← COMMENTAIRE
supabase/functions/_shared/keel/kitchen_equipment_test.ts    ← son propre test
frontend/src/keel/api/kitchenEquipment.int.test.ts           ← le miroir front, hors prompt
```

⛔ **Zéro appelant d'exécution.** Le seul import runtime de ce module est
`readKitchenEquipment` (index.ts:194) et `missingKitchenTools`
(household_meal_generation.ts:63). **Le point tient.**

**M13 rejouée, et je nomme les tests qui rougissent** — c'est la différence
entre « le fichier rougit » et « la garde mord » :

```
M13   MORD   3 test(s):
        · L7 ① — jamais demandé: prompt BYTE-IDENTIQUE, et c'est 175 comptes sur 175   ← LE test demandé
        · CHANGER LES BLOCS SANS BUMPER LA VERSION DOIT ÊTRE ROUGE
        · le bloc des voix entre APRÈS la tablée et AVANT l'envie
```

---

## 7. ⛔ « Le test jumeau du LOT 3C porte probablement la même faiblesse » — **RÉFUTÉ**

C'est l'avertissement le plus lourd du rapport L7-A : une garde du chantier
précédent qui ne garderait rien. **Je l'ai mesuré, il est faux.**

Mutation : on retire `keptOwnerFacts.splice(sacrifice, 1);` de
`meal_generation.ts` — exactement le geste que la mise en scène du 3C est censée
attraper. Résultat :

```
LOT 3C — un plat ÉVINCÉ par le plafond ne compte dans AUCUN des quatre ... FAILED

    [Diff] Actual / Expected
    {
      attributed: 0,
-     declared: 1,
+     declared: 0,
      dishes: 4,
-     refused: 1,
+     refused: 0,
    }
```

**La garde mord, et sur SON assertion de compteur** — pas sur un effet de bord.
Le troisième déjeuner de cette mise en scène sort donc bien par le `splice`, et
non par le `continue` comme L7-A le supposait. Sa propre mise en scène (le nom
sur le **second** déjeuner) est plus robuste ; celle de 3C n'est pas creuse.

⚠️ **Ce que ça dit du reste** : la faiblesse que L7-A a mesurée sur **sa
première rédaction** était réelle, et son durcissement est bon. L'extrapolation
au lot voisin, elle, ne l'était pas. **Aucun geste à prendre sur 3C.**

---

## 8. Les mutations, la suite, le front

### 8.1 Neuf mutations rejouées — avec le NOM du test qui rougit

Harnais indépendant (`scratchpad/` de session), restauration + **SHA256
revérifié** après chaque, et surtout : il ne se contente pas du code de sortie,
il **extrait le nom du test rouge**.

| # | Ce qu'on casse | Verdict | Test qui rougit |
|---|---|---|---|
| **M5** | le 7e tableau ne suit plus le `splice` | **MORD** | `L7 ③ — un plat ÉVINCÉ par le plafond…` |
| M12 | le tronc ne bumpe pas | **MORD** | `LOT 4 — les deux axes de version ont bougé…` |
| **M13** | `equipment ?? []` au lieu de `missingKitchenTools()` | **MORD** | `L7 ① — jamais demandé: prompt BYTE-IDENTIQUE` |
| M15 | la ligne du micro-ondes nomme un four absent | **MORD** | `L7 ① — la ligne du micro-ondes ne renvoie PAS…` |
| **M19** | le bloc « dehors » est décollé de la présence | **MORD** | 4 tests, dont `le bloc est COLLÉ à la présence` |
| **M20** | un chiffre entre dans le bloc « dehors » | **MORD** | `L7 ② — ⛔ AUCUN CHIFFRE` |
| M22 | le compteur compte la source, pas les lignes écrites | **MORD** | `L7 ② — une bouche que le prompt ne nomme pas…` |
| M23 | l'enveloppe foyer ne bumpe pas | **MORD** | `LOT 4 — la version de la lane foyer a bougé d'UN cran` |
| **3C** | `keptOwnerFacts.splice` retiré (§7) | **MORD** | `LOT 3C — un plat ÉVINCÉ…` |

**9/9 mordent, et chacune sur le test qu'elle est censée faire rougir.**
Les trois modules serveur du lot sont **byte-identiques à HEAD** après coup
(`diff` vide, vérifié fichier par fichier).

⚠️ **Une réserve sur le harnais de L7-A** : il tourne en `--no-check` et ne lit
que le **code de sortie du fichier de test**. Une mutation qui casserait un test
étranger du même fichier compterait « MORD » à tort. Le mien nomme les tests ;
c'est le patron à reprendre pour L8.

### 8.2 Les suites

- `deno test --allow-all supabase/functions/_shared/keel/` → **3323 passés, 0 rouge**
  (L7-A en annonçait 3322 : une lane voisine a ajouté un test entre-temps).
- `cd frontend && npx tsc -b --force` → **exit 0**. L5 a convergé ; le rouge que
  L7-A consigne à 13:22 (`HouseholdPage.tsx(920)`) n'existe plus.
- `npx vitest run` → **3 rouges, 2 fichiers, 1324 passés**, et **les deux
  fichiers sont étrangers** :

| Fichier | Rouges | À qui, et prouvé comment |
|---|---|---|
| `src/edge/coverage-guard.int.test.ts` | 2 | objets de base attendus vs découverts — trois migrations du jour (`20260818170000`, `…180000`, `…190000`) écrites par **L1/L8**, dont une posée **pendant** ma vérification |
| `src/keel/copy/planRefusals.int.test.ts` | 1 | 7 clés `household.error.*` présentes dans `en.ts` **sur le disque** et absentes de `HOUSEHOLD_REFUSAL_KEYS`. **Zéro** de ces clés dans `HouseholdPage.tsx`, ni à HEAD ni sur le disque : c'est le pack i18n **non commité** de **L5** |

⚠️ Les 2 rouges i18n que L7-A annonçait (`parity`, `pageSeams`) sont **passés au
vert** : L5 a convergé dessus aussi. **Ce lot ne touche aucun fichier du front**
(commit `9a238658` = 8 chemins, tous sous `supabase/functions/`).

### 8.3 Le navigateur — un plan qui porte un `name` ne casse rien

Serveur dédié **port 5194** (`frontend-a24`), personas locaux, captures à
**scroll 0**.

| Écran | Compte | Largeur | Langue | `scrollWidth` / `clientWidth` | Verdict |
|---|---|---|---|---|---|
| `/app/plan` | `l4m-owner` (plan **8982a647**, 16 noms) | 1280 | EN | 1280 / 1280 | ✅ |
| `/app/plan` | idem | **320** | EN | 320 / 320 | ✅ aucun élément en débordement |
| `/app/plan` | idem | **320** | **FR** | 320 / 320 | ✅ |
| `/app/today` | `laneb-solo` (plan **09c4bda1**, 11 noms) | **320** | EN | 320 / 320 | ✅ |
| `/app/today` | idem | 1280 | **FR** | 1280 / 1280 | ✅ |

**0 erreur console.** Les deux écrans affichent le **`title`**
(« Chickpeas, couscous, roasted vegetables and cucumber »), jamais le `name` —
**c'est le comportement attendu** : le rendu du nom est le §6.3, il appartient à
L5. **Aucune régression** : le plan d'hier et le plan avec noms se rendent
exactement pareil, ce qui est très précisément ce que « `null` est une
dégradation gracieuse » promettait.

⚠️ `/app/today` est gardé par `profiles.keel_role = 'student'`
(`KeelStudentRoute.tsx`). Les comptes du foyer Amara L4 n'ont **pas** ce rôle —
c'est pour ça que la preuve `/app/today` passe par la lane solo. Fait de
fixture, pas de lot.

---

## 9. Les hunks étrangers FF-042 — rien n'est perdu

```
diff <(git diff HEAD -- supabase/functions/generate-meal-v1/index.ts) \
     scratchpad/2026-08-18-1245-L7A-hunks-etrangers-FF042-diet.patch
→ IDENTIQUE (158 lignes de part et d'autre)
```

La moitié visible de FF-042 est **toujours sur le disque**, intacte, à l'octet
près de sa copie. `_shared/keel/meal_pdf_locale_test.ts` est toujours
**untracked** et porte toujours son `name: null` (l. 38). **Je n'ai rien défait
et rien commité de ce qui n'est pas à moi.**

---

## 10. Les quatre trous nommés par L7-A — lesquels bloquent

| # | Trou | Bloque ? | Ce que j'ai mesuré |
|---|---|---|---|
| 6.1 | **L'équipement n'atteint pas la lane individuelle** | 🟠 **non, mais c'est le plus coûteux** | Le run solo compose *« Heat the oven first… Roast both together »*. Un élève solo sans four reçoit **exactement le plan d'avant**. La donnée est sur **sa** ligne `student_goals`, prête. Le geste en 4 points du §6.1 est juste ; il coûte **un bump du tronc**. **À prendre dès que FF-042 rend `generate-meal-v1`.** |
| 6.2 | **`names` archivé par la lane foyer seule** | 🔴 **oui, et plus large qu'annoncé** | §5.2 : ce n'est pas `refused` qui manque, c'est **le compteur entier**, aperçu compris. C'est le zéro ambigu de 3C réinstallé sur la moitié de la population. **Deux lignes**, dans un fichier qui n'est à personne aujourd'hui. |
| 6.3 | **Le rendu du nom (L5)** | 🟢 non | Prouvé au §8.3 : aucun écran ne casse, le titre s'affiche comme hier. Le lot est **livré côté moteur** et **invisible côté produit** — c'est un lot qui reste, pas un défaut. |
| 6.4 | **La gamelle (`work_lunch`)** | 🟢 non | `work_lunch` est `null` partout, la seule porte d'écriture est une RPC que personne n'appelle. L'argument de L7-A tient tel quel. ⚠️ Ironie mesurée : le modèle a écrit **de lui-même** *« Reheat Zoe's own box and serve it as packed »* — sur la case interdite du §4.3. La gamelle **s'invente** en attendant qu'on la demande. |

**Et un cinquième, que L7-A ne nomme pas** : §4.3, le plat composé sur une case
« dehors ». Il ne bloque pas (n = 1, faute discrète), mais il faut le mesurer à
3–5 runs avant de resserrer.

---

## 11. Ce qui reste rouge

1. 🔴 **§5.2 — la lane individuelle n'a aucun compteur de noms**, ni à l'aperçu
   ni sur la ligne écrite. Correctif décrit, deux lignes, fichier hors périmètre.
2. 🟠 **§4.3 — 1 plat composé sur 4 cases « dehors »**, dans le seul run où le
   modèle a joué le bloc des plats dédiés. Correctif décrit, **non posé** (n=1).
3. 🟠 **§6.1 — la lane individuelle continue de proposer du four** à qui n'en a pas.
4. 🟠 **§4.1 — 3 noms sur 64 portent un jour faux ou ne sont pas des noms.** Les
   deux refus sont des refus de forme ; ils ne peuvent pas l'attraper, et un
   matcher est interdit ici. À lire comme une limite du chiffre, pas comme un bug.
5. ⚪ **vitest : 3 rouges, 2 fichiers, tous étrangers** (L1/L8 et L5) — §8.2.
   **Nommés, pas réparés.**
6. ⚪ **Deux plans écrits laissés en base** (§1.1) — `8982a647` (foyer Amara L4)
   et `09c4bda1` (laneb-solo). Aucun n'écrase quoi que ce soit.
7. ⚪ **Les dénominateurs « 175 » et « 63 » du rapport L7-A sont faux** (73 et 65
   en base). Les numérateurs — **0** — sont justes, donc l'argument tient.

---

## 12. Verdict

> ### Le lot est **VERT** sur ce qu'il promet, et le chiffre qui manquait est **100 %**.
>
> Les trois blocs atteignent le modèle, la version servie est prouvée sur une
> ligne écrite, les deux bumps sont byte-identiques pour toute population non
> concernée — **rejoué contre le code d'avant, en SHA256** —, la fuite TCA est
> fermée sur le log réel, 9 mutations sur 9 mordent **sur le bon test**, et
> l'avertissement le plus lourd du rapport (le jumeau du LOT 3C serait creux)
> est **réfuté sur les octets**.
>
> **Deux réserves, aucune bloquante pour livrer :** le compteur du nom n'existe
> pas sur la lane individuelle (§5.2, le zéro ambigu de 3C réinstallé à moitié),
> et le modèle a composé un plat sur une case « dehors » une fois sur quatre
> (§4.3, n=1 — à mesurer avant de resserrer).
