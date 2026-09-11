# Deux directions, deux plans — mesure selon `docs/keel/mesure.md`

**Date** : 2026-09-11. **Pile** : locale, `ff-001-quotidien-du-coach`.
**Instruments** : ceux du produit — `planEnergy`, `readDishes`/`readPreparations`,
`resolveIngredients`, `nutrientsOf`, `loadCompositionIndex` (les mêmes fonctions
que `meal-energy-v1`), et la cible demandée à **`meal-energy-v1` lui-même**, avec
le jeton de la personne. Rien n'est recalculé à la main.

**Reproduire** :

```bash
deno run --allow-net --allow-read --allow-env scripts/2026-09-11-mesure-deux-directions.ts les-deux
deno run --allow-net --allow-read --allow-env scripts/2026-09-11-mesure-grille.ts lot8m.perte@keeltest.dev lot8m.gain@keeltest.dev
```

---

## Les deux sujets

| | **PERTE** | **GAIN** |
|---|---|---|
| compte | `lot8m.perte@keeltest.dev` | `lot8m.gain@keeltest.dev` |
| corps | homme, 178 cm, **88 kg**, 36 ans | homme, 178 cm, **62 kg**, 28 ans |
| activité | `trains_some` · assis · 3-4 séances | idem |
| objectif | `fat_loss` → 78 kg | `muscle_gain` → 70 kg |
| cadence demandée | **0,5 kg/sem** | **0,25 kg/sem** |
| fenêtre | 3 jours, 9 créneaux | 3 jours, 9 créneaux |

---

## 0. Bilan de livraison

| | PERTE | GAIN |
|---|---|---|
| plan | `5fad22ce` | `a18f522e` |
| HTTP | 200, ligne écrite | 200, ligne écrite |
| **durée** | **237 382 ms** | **286 375 ms** |
| appels modèle | 3 (1 initial + **2 `density_repair`**) | 3 (1 initial + **2 `density_repair`**) |
| réparations | 2 demandées / 2 utilisées / 2 autorisées, 0 refusée | idem |
| plans non livrés | 0 | 0 |

> ⛔ **LES DEUX DÉPASSENT LE PLAFOND DE PRODUCTION.** Kong coupe à **150 000 ms**
> — valeur recopiée de l'hébergé (« *to match hosted project* » dans sa
> configuration). **238 s et 287 s : en production, ces deux requêtes sont
> coupées et la personne ne reçoit rien.** Les plans mesurés ci-dessous sont
> bons ; ils n'arrivent pas. C'est le défaut le plus grave de cette mesure, et
> il est indépendant de la qualité nutritionnelle.
>
> La mesure a été possible parce que le Kong local était relevé à 600 s
> (`scripts/local_serve_functions.sh`). Le relevé sert à connaître la durée,
> jamais à la pardonner.

### D'où vient la durée — décomposée, appel par appel

`llm_usage_events`, les six appels des deux générations :

| | appel | durée | part du total |
|---|---|---|---|
| **PERTE** | génération | 97,4 s | 41,0 % |
| | réparation densité 1 | 67,2 s | 28,3 % |
| | réparation densité 2 | 72,5 s | 30,5 % |
| | *modèle cumulé* | *237,0 s* | *99,8 %* |
| | **hors modèle** | **0,4 s** | **0,2 %** |
| **GAIN** | génération | 78,6 s | 27,4 % |
| | réparation densité 1 | **113,7 s** | 39,7 % |
| | réparation densité 2 | 93,8 s | 32,7 % |
| | *modèle cumulé* | *286,0 s* | *99,9 %* |
| | **hors modèle** | **0,3 s** | **0,1 %** |

> ⛔ **LA DURÉE EST ENTIÈREMENT DU TEMPS DE MODÈLE — ET MAJORITAIREMENT DU
> RATTRAPAGE.** Le code du moteur pèse 0,4 s sur 237, et 0,3 s sur 286. Tout le
> reste est de l'attente d'appel.
>
> | | rattrapages | part du total | sans eux |
> |---|---|---|---|
> | PERTE | **139,6 s** | **58,8 %** | **~98 s** |
> | GAIN | **207,5 s** | **72,4 %** | **~79 s** |
>
> **Sans réparation, les deux plans passent sous le plafond de 150 s.** Avec
> deux réparations, aucun des deux ne passe. La « variance » observée les jours
> précédents (59 s → 144 s → 287 s sur le même chemin) n'était pas du bruit :
> **c'est le nombre de réparations.**
>
> ⚠️ **Sur GAIN, une réparation coûte PLUS CHER que la génération elle-même**
> (113,7 s contre 78,6 s) : elle rejoue le brief entier avec, en plus, la
> consigne de correction — 9 990 jetons d'entrée contre 8 591.
>
> ⛔ **ET CES 347 SECONDES DE RATTRAPAGE N'ONT RIEN ACHETÉ DE MESURABLE.** Après
> les quatre réparations, il reste 2 assiettes hors couloir sur PERTE et 1 sur
> GAIN (contrôle 6). Le budget est épuisé (2/2 des deux côtés) et le défaut
> visé est toujours là.

---

## 1. Calories du créneau

**Cible du créneau** = bande du jour × `SLOT_DAY_WEIGHT` (`mouth_anchor.ts:719` :
breakfast 0,25 · lunch 0,40 · dinner 0,35).

> ⚪ **CONFORMITÉ PAR CRÉNEAU : NON APPLICABLE.** **Aucune tolérance de créneau
> n'est déclarée dans ce dépôt.** Projeter la bande du JOUR sur un créneau
> donnerait une bande de ±3 % qu'aucune règle du produit ne demande, et
> l'élargir « pour que ça passe » est exactement ce que la grille interdit. Les
> écarts sont donc **rendus**, pas jugés. Le verdict d'énergie vit au contrôle 5.

### PERTE — bande du jour 2454 – 2602 kcal

| jour | créneau | cible | mesuré | écart |
|---|---|---|---|---|
| fri | breakfast | 632 | 613 | −3,0 % |
| fri | lunch | 1011 | 982 | −2,9 % |
| fri | dinner | 885 | 757 | **−14,4 %** |
| sat | breakfast | 632 | 614 | −2,8 % |
| sat | lunch | 1011 | 1056 | +4,4 % |
| sat | dinner | 885 | 788 | **−10,9 %** |
| sun | breakfast | 632 | 613 | −3,0 % |
| sun | lunch | 1011 | 1011 | −0,0 % |
| sun | dinner | 885 | 931 | +5,2 % |

**L'écart se concentre sur le dîner** : les trois dîners sont les trois plus
gros écarts, deux d'entre eux à plus de 10 % en dessous.

### GAIN — bande du jour 2846 – 2978 kcal

| jour | créneau | cible | mesuré | écart |
|---|---|---|---|---|
| fri | breakfast | 728 | 728 | 0,0 % |
| sat | breakfast | 728 | 728 | 0,0 % |
| sun | breakfast | 728 | 728 | 0,0 % |
| fri | lunch | 1165 | 1172 | +0,6 % |
| fri | dinner | 1019 | 1021 | +0,2 % |
| sat | lunch | 1165 | 1067 | −8,4 % |
| sat | dinner | 1019 | 1144 | **+12,2 %** |
| sun | lunch | 1165 | 1157 | −0,7 % |
| sun | dinner | 1019 | 998 | −2,1 % |

⚠️ **Les trois petits-déjeuners tombent à 728 kcal exactement** — au kcal près,
trois jours de suite. Ce n'est pas une coïncidence de composition : c'est le
même petit-déjeuner redimensionné. Un plan qui répète un moment à l'identique
est un résultat, pas un défaut, mais il est à connaître.

---

## 2. Grammage de l'assiette (par personne)

Grammes servis = somme des items de **la boîte de cette personne**, pas le poids
de la casserole.

| jour · créneau | PERTE | GAIN |
|---|---|---|
| fri breakfast | 609 g | 675 g |
| fri lunch | 667 g | 623 g |
| fri dinner | 660 g | 584 g |
| sat breakfast | 345 g | 383 g |
| sat lunch | 625 g | 727 g |
| sat dinner | 690 g | 488 g |
| sun breakfast | 272 g | 373 g |
| sun lunch | 672 g | 677 g |
| sun dinner | 663 g | 549 g |

> ⚪ **MIN / PRÉFÉRÉ / MAX : NON MESURABLES SUR LA LIGNE.** Les bornes de
> grammage **ne sont enregistrées nulle part** dans `student_generated_meals` —
> elles ne vivent que dans le brief envoyé au modèle. Ce qui EST enregistré,
> c'est le couloir de **densité**, et il est mesuré au contrôle 6.
>
> **1 boîte par plat sur les 18 plats** : les deux foyers sont à une bouche,
> donc aucun contenant collectif ne peut dépasser un maximum individuel ici.

---

## 3. Ingrédients comptabilisés

| | PERTE | GAIN |
|---|---|---|
| lignes d'ingrédient | 32 | 35 |
| **non résolus par le référentiel** | **0** | **0** |
| admis par une **borne de groupe** | **0** | **0** |
| `composition_unknowns` | 0 | 0 |
| arrondis à zéro / non pesés | 0 / 0 | 0 / 0 |
| non quantifiés | 0 sur 33 | 0 sur 35 |
| **provenance des kcal** | **100 % table** (`model: 0`) | **100 % table** (`model: 0`) |

✅ **CONFORME, et c'est le meilleur résultat des deux rapports.** Aucune donnée
manquante n'a été comptée zéro, parce qu'il n'y en a aucune : chaque kcal des
7 651 (PERTE) et 8 020 (GAIN) vient du référentiel vérifié, aucune d'une
estimation du modèle ni d'une borne de groupe.

---

## 4. Couverture du plan

| | PERTE | GAIN |
|---|---|---|
| cases demandées | 9 | 9 |
| présentes | **9** | **9** |
| manquantes | 0 | 0 |
| doublons | 0 | 0 |
| `empty_slots` | `[]` | `[]` |

Les attentes sont déduites de la demande (3 jours × 3 moments), pas des plats
produits. ✅ **CONFORME** des deux côtés.

---

## 5. Cohérence de la journée

Périmètre couvert = la journée entière (3 moments sur 3), donc la bande du jour
s'applique telle quelle.

### PERTE — bande 2454 – 2602

| jour | plats | servi | écart | verdict |
|---|---|---|---|---|
| fri | 3/3 | **2352** | −7,0 % | ❌ **102 kcal SOUS le plancher de la bande** |
| sat | 3/3 | 2458 | −2,8 % | ✅ dans la bande |
| sun | 3/3 | 2555 | +1,1 % | ✅ dans la bande |

❌ **1 jour sur 3 hors bande.**

### GAIN — bande 2846 – 2978

| jour | plats | servi | écart | verdict |
|---|---|---|---|---|
| fri | 3/3 | 2921 | +0,3 % | ✅ |
| sat | 3/3 | 2939 | +0,9 % | ✅ |
| sun | 3/3 | 2883 | −1,0 % | ✅ |

✅ **3 jours sur 3 dans la bande.**

---

## 6. Densité calorique

**Ce qui a RÉELLEMENT été envoyé au modèle**, relu dans
`llm_raw_response_events.user_message` (6 briefs par génération ; les trois qui
portent une consigne sont identiques d'un appel à l'autre) :

| créneau | PERTE | GAIN |
|---|---|---|
| breakfast | plafond **245**, visée 110 (plancher redondant) | **104 – 250**, visée 114 |
| lunch | **141 – 250**, visée 154 | **167 – 250**, visée 183 |
| dinner | **123 – 250**, visée 135 | **146 – 250**, visée 160 |

**Couloirs impossibles : 0** des deux côtés (`empty_intersection: 0`,
`above_askable_cap: 0`).

### Densité mesurée du plat servi (kcal/100 g cuits prêts à servir)

| jour · créneau | PERTE | verdict | GAIN | verdict |
|---|---|---|---|---|
| fri breakfast | 100,7 | ✅ | 107,9 | ✅ |
| fri lunch | 147,2 | ✅ | 188,1 | ✅ |
| fri dinner | **114,7** | ❌ **sous 123** | 174,8 | ✅ |
| sat breakfast | 178,0 | ✅ | 190,1 | ✅ |
| sat lunch | 169,0 | ✅ | **146,8** | ❌ **sous 167** |
| sat dinner | **114,2** | ❌ **sous 123** | 234,4 | ✅ |
| sun breakfast | 225,4 | ✅ | 195,2 | ✅ |
| sun lunch | 150,4 | ✅ | 170,9 | ✅ |
| sun dinner | 140,4 | ✅ | 181,8 | ✅ |

❌ **PERTE : 2 assiettes hors couloir sur 9.** Les deux sont des dîners, les deux
sous le plancher, et **les deux ont survécu à DEUX réparations de densité.**
❌ **GAIN : 1 assiette hors couloir sur 9** (sat lunch, 20 kcal/100 g sous le
plancher), également après deux réparations.

> **Ce que ça dit** : les couloirs partent bien, ils sont bien formés, et la
> boucle de réparation tourne bien — mais **3 assiettes sur 18 restent hors
> couloir après réparation**. Le compteur `clamped: {max: 0, min: 0}` est à
> zéro, donc le moteur ne s'en est pas aperçu : **il n'existe aucun compteur qui
> attrape « le plat rendu est hors du couloir qu'on a demandé »** pour un foyer
> d'une bouche. Le verdict du lot 5 s'abstient ici (`single_mouth`).

---

## 7. Contraintes alimentaires et sécurité

| | PERTE | GAIN |
|---|---|---|
| `regime_belt` | tout à 0 | tout à 0 |
| `exclusion_belt` | tout à 0 | tout à 0 |
| `cross_contact` | `skipped_no_medical: 1` | `skipped_no_medical: 1` |
| allergies / exclusions déclarées | **aucune** | **aucune** |

> ⚪ **NON APPLICABLE — et surtout PAS « conforme ».** Les deux fixtures ne
> portent aucune allergie, aucune exclusion, aucun régime. Un « ✅ zéro
> violation » ici serait un compliment adressé à un contrôle qui n'a jamais eu
> l'occasion de mordre. Les ceintures sont **non éprouvées par cette mesure**.
>
> ⚠️ **Contrôle absent, à tracer** : `skipped_no_medical: 1` dit que le bloc de
> contamination croisée n'a pas été émis faute d'allergie médicale — cohérent,
> mais c'est bien un contrôle qui n'a pas tourné.

---

## 8. Protéines

**Protéine mesurée par jour**, préparations **repliées au prorata**
(`uses.servings / servingsMade`) :

| jour | PERTE (88 kg) | GAIN (62 kg) |
|---|---|---|
| fri | 167 g · 1,90 g/kg | 146 g · 2,35 g/kg |
| sat | 133 g · 1,51 g/kg | 116 g · 1,87 g/kg |
| sun | 126 g · 1,43 g/kg | 140 g · 2,26 g/kg |

`protein_anchor_missing: []` · `protein_anchor_retry: false` des deux côtés.

> ⚪ **CIBLE : NON APPLICABLE.** Ce que ce dépôt appelle « ancre protéine » est
> une **présence** (`detectProteinAnchor` vérifie qu'un repas principal porte un
> ingrédient du groupe protéine), **pas un grammage**. Aucune constante de type
> `g/kg` n'existe. Il n'y a donc **aucune cible interne** à laquelle comparer ces
> chiffres, et l'écart restant est inmesurable par construction.
>
> ⚠️ **Le repli des préparations n'est pas cosmétique** : sans lui, la mesure
> rendait **111 / 32 / 26 g** pour PERTE — les jours qui puisent dans un batch
> perdaient presque toute leur protéine. C'est la cicatrice connue du dépôt
> (« 51 % de la protéine hors du verdict »), et elle mord encore tout instrument
> qui l'oublie.

---

## 9. Cohérence entre recette et stockage

| | PERTE | GAIN |
|---|---|---|
| plats | 9 | 9 |
| préparations | 2 | 6 |
| lignes de courses | 31 | 35 |
| sessions de cuisson | 2 | 2 |
| `member_portions` | 1 | 1 |
| portions vagues | 0 | 0 |
| ingrédients non quantifiés | 0 | 0 |

⚠️ **UNE DIVERGENCE NOMMÉE, ET ELLE EST DANS LES DEUX PLANS** :

```
boxes : {"delivery": "none_delivered", "expected": 5|6, "boxes": 0,
         "cells_no_box": 9, "mouths_no_box_cell": 9}
```

Le modèle **n'a émis aucune clé `boxes`** — pour 5 repas (PERTE) et 6 (GAIN) qui
puisent dans un batch. **Et pourtant les 18 plats portent bien une boîte** : les
grammes du contrôle 2 en viennent. Elles ont donc été écrites **en aval, par le
chemin déterministe** (`portion_sizing.apply.boxes_authored`), pas par le
modèle. L'`issue` du moteur le dit en toutes lettres — « *a deterministic sizing
path may still author them downstream* ».

**Ce n'est pas une incohérence du plan livré** : recette, portions, boîtes et
courses décrivent les mêmes quantités. C'est une **consigne non suivie par le
modèle**, rattrapée en silence. À ce titre elle reste un défaut résiduel : elle
est comptée, mais rien ne la fait remonter.

---

## 10. Réparations et livraison

| | PERTE | GAIN |
|---|---|---|
| défauts mesurés avant réparation | densité | densité |
| réparations demandées | 2 | 2 |
| réparations utilisées | **2** | **2** |
| autorisées | 2 | 2 |
| refusées | 0 | 0 |
| **appels fournisseur réels** | **3** | **3** |
| durée | 237 382 ms | 286 375 ms |
| résultat | livré | livré |
| **défauts résiduels** | **2 assiettes hors couloir** | **1 assiette hors couloir** |
| réparation ayant introduit un allergène | aucune (aucun allergène déclaré) | idem |

> ⛔ **LE BUDGET DE RÉPARATION EST ÉPUISÉ DANS LES DEUX CAS** (2/2), et le défaut
> **survit** dans les deux cas. Les deux réparations de densité ont coûté
> ~140 s de modèle chacune sans fermer le défaut qu'elles visaient.

---

## Ce qui est prouvé, ce qui échoue, ce qui n'a pas pu être mesuré

### ✅ Prouvé

- **La chaîne va de bout en bout**, pour les deux directions, jusqu'à la ligne
  écrite. L'objectif **et** la cadence entrent dans le calcul (voir l'annexe).
- **Le référentiel tient** : 67 lignes d'ingrédient, **zéro** non résolue, zéro
  borne de groupe, **100 % des kcal depuis la table**.
- **La couverture est parfaite** : 18 cases demandées, 18 servies, 0 manquante.
- **GAIN est conforme en énergie** : 3 jours sur 3 dans la bande annoncée.
- **Les couloirs de densité partent vraiment**, bien formés, sur les 3 créneaux,
  et aucun n'est impossible.

### ❌ Échoue

1. **La durée, et elle est faite de rattrapage.** 238 s et 287 s contre un
   plafond de production de 150 s : **les deux plans seraient coupés chez le
   client**. La décomposition est sans ambiguïté — 99,8 % du temps est de
   l'appel modèle, et **59 % (PERTE) à 72 % (GAIN) sont des réparations**. Sans
   elles, les deux sortaient en ~98 s et ~79 s, donc **sous le plafond**.
2. **3 assiettes sur 18 hors du couloir de densité demandé**, toutes sous le
   plancher, **toutes après épuisement du budget de réparation**.
3. **1 journée sur 6 hors de la bande d'énergie** (PERTE, vendredi, 102 kcal
   sous le plancher).
4. **Aucun compteur n'attrape (2) ni (3)** sur un foyer d'une bouche :
   `clamped` est à zéro et le verdict du lot 5 s'abstient (`single_mouth`). Le
   défaut est réel et le moteur se croit propre.

### ⚪ Non mesurable / non applicable

| | état | raison |
|---|---|---|
| conformité **par créneau** | non applicable | aucune tolérance de créneau n'existe dans le dépôt ; en inventer une serait élargir pour faire passer |
| bornes de **grammage** min/préf/max | non mesurables | jamais enregistrées sur la ligne du plan |
| **allergies / exclusions** | non applicable | les fixtures n'en portent aucune ; les ceintures n'ont pas eu l'occasion de mordre |
| **cible de protéine** | non applicable | l'« ancre protéine » du dépôt est une présence, pas un grammage |
| **contenant collectif** | non applicable | deux foyers d'une bouche |

---

## Annexe — l'objectif et la cadence sont-ils pris en compte ?

**Oui, les deux.** `goalGapKcalOf` (`mouth_anchor.ts:1036`) donne le **signe**
depuis l'objectif et la **grandeur** depuis la cadence, puis
`mouthTargetKcal` fait `cible = maintenance + écart`.

`executedPaceFor` (`weight_pace.ts:838`), appelé avec les corps réels :

**PERTE — 88 kg, 36 ans, `down`, maintenance estimée 2954 kcal/j**

| cadence demandée | voulu /j | **appliqué** /j | kg/sem réels | bridé par |
|---|---|---|---|---|
| 0,25 | −275 | **−275** | 0,250 | `chosen` |
| **0,5** | −550 | **−500** | **0,455** | **`deficit_cap`** |
| 0,75 | −825 | −500 | 0,455 | `deficit_cap` |
| 1,0 | −1100 | −500 | 0,455 | `deficit_cap` |

**GAIN — 62 kg, 28 ans, `up`, maintenance estimée 2637 kcal/j**

| cadence demandée | voulu /j | **appliqué** /j | kg/sem réels | bridé par |
|---|---|---|---|---|
| **0,25** | +275 | **+275** | 0,250 | `chosen` |
| 0,5 | +550 | +550 | 0,500 | `chosen` |
| 0,75 | +825 | **+660** | 0,600 | `slider_ceiling` |
| 1,0 | +1100 | +660 | 0,600 | `slider_ceiling` |

Constantes, toutes déclarées : `KCAL_PER_KG_BODY_MASS = 7700`,
`MAX_DAILY_DEFICIT_KCAL = 500`, `ENERGY_FLOOR_KCAL = {male: 1500, female: 1200,
other: 1350}`, `MAX_KG_PER_WEEK = 1,0`, `MAX_WEEKLY_BODY_FRACTION = 0,01`,
`DEFAULT_PACE_KG_PER_WEEK = 0,25`.

**Ce que j'ai vérifié, et ce que je n'ai pas fini de vérifier :**

- **PERTE : l'égalité est exacte.** Le produit rend `low = 2454`, et
  `2954 − 500 = 2454`. La cadence bridée à 500 kcal/j se retrouve au kcal près
  dans la bande affichée.
- **GAIN : il reste 66 kcal d'écart que je n'ai pas refermés.** Le produit rend
  `low = 2846` ; `2637 + 275 = 2912`. La cause probable est nommée mais **non
  confirmée** : la bande affichée passe par `estimatedMaintenanceKcal`, qui lit
  une **bande d'âge** et l'**appétit**, tandis que le bridage de cadence passe
  par `estimatedMaintenanceFor`, qui lit l'âge **en années**. Deux estimateurs
  de maintenance, deux entrées différentes. **À confirmer avant d'en faire un
  défaut** — je le signale, je ne le conclus pas.

⚠️ Cet écart ne change rien aux verdicts des contrôles 1 et 5 : ceux-ci sont
mesurés contre la bande **que le produit rend lui-même**, pas contre ma
reconstruction.

> ⚠️ **UN BRIDAGE QUI NE SE DIT NULLE PART.** Paul a demandé **0,5 kg/semaine** ;
> le moteur en applique **0,455** — le plafond de déficit de 500 kcal/j mord.
> Le jeton existe (`clampedBy: "deficit_cap"`), il est calculé à chaque plan, et
> **aucune surface ne le rend** : `grep` sur `frontend/src` ne trouve
> `clampedBy`, `deficit_cap` ni `slider_ceiling` nulle part. La personne règle un
> curseur sur 0,5 et reçoit 0,455 sans que rien ne le lui dise. Au-delà de
> 0,5 kg/sem, l'écart grandit et reste muet : à 1,0 kg/sem demandé, le moteur en
> applique toujours 0,455.
