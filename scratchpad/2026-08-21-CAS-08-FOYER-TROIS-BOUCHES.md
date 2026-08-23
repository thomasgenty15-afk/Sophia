# Cas 08 — un foyer de trois bouches

**Le premier cas à plusieurs.** iku garde tout ce que les sept cas précédents lui
ont donné ; Léa et Noah arrivent avec des données qui le contredisent.

> ⛔ **CE DOCUMENT CORRIGE LES SEPT PRÉCÉDENTS.** Une vérification adversariale
> (3 agents, recalcul complet sur le code exécuté) a réfuté **16 affirmations sur
> 37**, dont deux qui se répètent dans toutes les fiches. Voir §0.

Design : `2026-08-21-DESIGN-FOYER-REPARTITION.md` — décisions D1 à D5, registre de
166 conflits. Autorité produit : `FF-043 — la résolution foyer`.

---

## 0. ⛔ Ce que la vérification a cassé

### ① Le moteur n'utilise JAMAIS l'âge exact

```ts
const midAge = { "18_29": 24, "30_44": 37, "45_59": 52, "60_plus": 67 }
const base = 10*weightKg + 6.25*heightCm - 5*midAge[ageBand]
```

**iku a 28 ans, le calcul en injecte 24. Léa en a 31, le calcul en injecte 37.**

⇒ **Tous les métabolismes de base des fiches 01 à 07 sont faux.** iku n'est pas à
1 758 mais à **1 777,5**. Ce n'est pas une erreur d'arrondi : c'est une formule que
ce dépôt n'exécute pas.

### ② Le plafond protéique à l'IMC 30 n'existe pas — et l'IMC est INTERDIT ici

J'ai écrit dans chaque fiche *« IMC 21,1, donc pas de plafond »*, comme si une
porte était franchie. **Cette porte n'existe pas.** `PROTEIN_FLOOR_G_PER_KG` n'est
indexé que sur l'objectif ; le seul modificateur est `SENIOR_PROTEIN_FLOOR_G_PER_KG`,
et il **élève**.

⚠️ Pire : l'IMC est **banni en toutes lettres** dans ce dépôt —
*« no BMI, no category, no target »*, et `"bmi"` figure dans la liste des termes
interdits et dans le validateur de lexique.

⇒ Le plafond IMC 30 est le **lot 1 du design**, une proposition. Le décrire comme
une garde franchie rendait **indétectable** le jour où le vrai chemin change.

### ③ Le surplus d'iku EST plafonné, dans le code d'aujourd'hui

0,35 kg/semaine demande 385 kcal/j. `MAX_SURPLUS_FRACTION` (+10 %) n'en autorise
que **319**. `clampedBy: 'surplus_band'`.

⇒ **Son rythme exécuté est 0,29 kg/semaine, pas 0,35.** Le lot 37 propose de lever
ce plafond ; il n'est pas livré.

---

## 1. Les trois bouches — chiffres vérifiés

| | iku | Léa | Noah |
|---|---|---|---|
| | homme, 28 ans, 1,86 m, 73 kg | femme, 31 ans, 1,65 m, 68 kg | garçon, **9 ans**, 1,35 m, 30 kg |
| bande d'âge · âge injecté | `18_29` · **24** | `30_44` · **37** | Schofield `3_10` |
| métabolisme de base | **1 777,5** | **1 365,25** | **1 185,5** |
| activité | assis + 3-4 → **1,63** | debout + 1-2 → **1,73** | ⚠️ **jamais demandée** → 1,60 par défaut |
| appétit | ×1,10 | ×1,00 *(non déclaré)* | — |
| **entretien** | **3 187** | **2 362** | **1 916** |
| objectif | prise 0,35 → **plafonné à 0,29** | perte 0,4 — passe entier | ⛔ **aucun, mineur** |
| écart | **+319** *(voulu 385)* | **−440** | 0 |
| **cible** | **3 506 kcal/j** | **1 922 kcal/j** | *(une bande, pas une cible)* |
| plancher protéique | 117 g | **136 g** | 30 g |
| **rapport protéique** | **33,4 g/1 000 kcal** | ⛔ **70,8** | 15,7 |
| régime | omnivore | **végétarienne** | — |
| interdit dur | **arachide** | — | **fruits à coque** |
| dégoût | poisson | poulet | légumes verts |

⚠️ **Le produit ne demande pas l'activité d'un enfant.** « Très actif » n'a de
chemin que si le compte maître coche les axes sur sa fiche. Par défaut, Noah est à
1,60 — ce qui le sous-estime probablement.

---

## 2. ⛔ L'architecture réelle — et ce n'est pas « une casserole, N portions »

`FF-043` porte la raison en tête, et elle n'est **pas** nutritionnelle :

> *« Une assiette qui diverge est lisible par tout le monde AUTOUR DE LA TABLE. Ce
> n'est pas une question de nutrition, c'est une question de qui sait quoi sur qui :
> si le tronc commun est dimensionné sur l'enveloppe de quelqu'un, la personne
> protégée par un plancher mange la restriction d'un autre ; et si les différences
> se voient, l'objectif de chacun devient public au dîner. »*

### L'ordre, et il est l'algorithme

```
①  LE VERROU DE LANE      évalué AVANT tout calcul — jamais un `if` de fin
                          une seule bouche flaggée dégrade TOUTE la lane

②  LE TRONC               sur le MIN des enveloppes, jamais le référent,
                          jamais la moyenne

③  LES ADD-ONS            additifs, et ils n'ajoutent JAMAIS un plat séparé
```

### Pourquoi le MIN

> *« C'est la seule arithmétique compatible avec "on ajoute, on ne retire jamais".
> Le référent imposerait son déficit à tous ; une moyenne servirait à quelqu'un une
> portion plus petite que la sienne. »*

**Sur ce foyer :**

```
enveloppes        iku  { ~3 331 – 3 681 }
                  Léa  { ~1 826 – 2 018 }
                  Noah { ~1 820 – 2 012 }
                                          MIN
TRONC                                     { 1 820 – 2 008 }     3 bouches comptées

ADD-ONS           iku   3 506 − ~1 914  =  ~+1 590 kcal/j
                  Léa   1 922 − ~1 914  =  ~+8       -> elle mange le TRONC
                  Noah  1 916 − ~1 914  =  ~+2       -> il mange le TRONC
```

⚠️ **C'est l'enfant qui dimensionne la casserole.** Le commentaire du module le dit
et l'assume : *« un tout-petit à table TIRE LE TRONC VERS LE BAS, et les adultes
récupèrent l'écart en add-on »*. Le MIN a été étendu à **toutes** les bouches le
2026-08-12 — avant, dans un foyer d'une mère en perte et de deux enfants, **les
enfants mangeaient le déficit de leur mère**.

---

## 3. Le régime — et le résultat le plus contre-intuitif du cas

```
strictestRegimeAt(omnivore, vegetarian, null)     ->  VEGETARIAN
                       pescatarian 2 ⊂ vegetarian 5 ⊂ vegan 8   (groupes exclus)

regimeCapsProtein('vegetarian')                   ->  FALSE
                       ANIMAL_PROTEIN_ANCHORS = 7 groupes, tous exclus par VEGAN seul
                       le végétarien garde les œufs, le yaourt, le fromage

dietDiverges(iku)                                 ->  FALSE
```

⇒ ⛔ **iku, en prise de masse, mange végétarien toute la semaine — et aucun plat
dédié ne s'ouvre pour lui.** Ce n'est pas un bug : c'est un arbitrage qui évite de
fabriquer un second plat pour presque tout le monde. Mais il n'est **écrit nulle
part** : un lecteur doit le dériver de `ANIMAL_PROTEIN_ANCHORS`.

⚠️ **Et l'oméga-3 marin n'est PAS perdu**, contrairement à ce que j'annonçais. Le
végétarien exclut `fatty_fish` et `shellfish` — les deux porteurs — mais la
couverture se coche **par aliment**, et **5 des 21 lignes `eggs` portent
`omega3_marine`**. Le drapeau reste atteignable par les œufs.

---

## 4. ⛔ LE TROU DU CAS — la protéine n'atteint rien

Le tronc et les add-ons résolvent **l'énergie**. Ils ne touchent **pas** la
protéine.

```
proteinFloorG      3 lecteurs   portion_scaling.ts · portion_anchor.ts · meal_verdict.ts
                                ⛔ les DEUX premiers n'ont AUCUN appelant

la part de chaque bouche vient de   anchorFactorFor   (cible ÷ livré — purement énergétique)
                                    bodyShareFactors  (des rapports de corps)

grep 'per_1000 | proteinDensity | protein_per_kcal' dans _shared/keel   ->   0 résultat
```

### Et le rapport de Léa est inatteignable dans un plat végétarien ordinaire

Elle demande **70,8 g de protéines pour 1 000 kcal**. Mesuré sur la vraie table :

| groupe | lignes ≥ 70,8 g/1 000 kcal |
|---|---|
| céréales complètes | **0 / 25** |
| céréales raffinées | **0 / 54** |
| féculents | **0 / 40** |
| fruits | **0 / 81** |

**Le féculent est le tueur.** Meilleures céréales : muffin complet 57,6 · nouilles
complètes 38,3 · quinoa 36,9 · riz cuit 20,0. Huile d'olive : 0,0.

**Plats réels recalculés, tous sous le seuil :**

```
dhal 200 g + riz 150 g + brocoli 150 g + huile 10 g   ->   565 kcal · 28,4 g  ->  50,2  ✗
tofu 200 g + riz 200 g                                ->   618 kcal · 35,6 g  ->  57,6  ✗
```

⇒ **Le tronc ne peut pas porter le plancher de Léa.** Son add-on devrait être
quasi pure protéine — fromage blanc, œufs, tofu — et **rien ne le dirige dans ce
sens** : l'add-on est énergétique.

⚠️ **Et une seule casserole ne pourrait pas les servir tous les deux de toute
façon** : `3 506 × 70,8/1 000 = 248 g` de protéines pour iku. Un facteur **2,12 de
densité** et **1,82 de volume**, en sens opposés. C'est précisément pourquoi le
code ne compose pas ainsi.

---

## 5. ⛔ Trois défauts du mineur, trouvés sur ce cas

**① Un mineur PEUT entrer dans les boîtes pesées.**
`weighedPortionMembers` filtre sur `goal` **et rien d'autre** — l'en-tête l'assume :
*« aucune porte de sécurité ici »*. Noah en est exclu **seulement parce que son
`goal` est `null`**, pas parce qu'il est mineur. Et la base l'autorise : le CHECK
sur `goal` n'a **aucune clause d'âge**.

**② Le contenant de Noah ne porte qu'UN nom — donc il sera lu comme une portion
individuelle.** Le protocole de boîte est explicite : *« `member_ids` EST LA CLÉ DE
LECTURE. Un seul id ⇒ c'est une portion. Il n'y a aucun autre marqueur. »* Avec un
seul id, la branche individuelle s'applique et **Noah reçoit un kcal calculé** —
l'exact contraire de *« il a toujours un contenant, il n'a plus de chiffre à lui »*.

⇒ **À trois bouches dont deux à objectif, le mineur récupère un chiffre.**

**③ Le nombre de contenants est 3 PAR REPAS, pas 3 en tout.**
`boîtes = Σ sur chaque repas (groupes présents)`. Sur un plan de 5 jours × 2 repas
cuisinés, c'est **30 contenants**, pas 3.

---

## 6. Ce qui part au modèle

```
DUR         arachide ∪ fruits à coque, sous toutes leurs formes d'écriture
RÉGIME      le plat partagé est végétarien
GOÛTS       pas de poisson (iku) · pas de poulet (Léa) · pas de légumes verts (Noah)
TRONC       une structure, dimensionnée sur le MIN
ADD-ONS     ce que chacun ajoute — additif, jamais un plat séparé
CONTENANTS  3 par repas : iku seul, Léa seule, Noah
DENSITÉ     ⚠️ Léa est sous 1,3 kcal/g -> « fais le volume avec les légumes »
CURSEUR     la réponse à « comment tu cuisines cette semaine »
RANG        les cinq rangs de la hiérarchie, en position de récence

⛔ JAMAIS    aucune kcal · aucun gramme · aucun objectif · aucun âge · aucun poids
⛔ JAMAIS    aucun prénom comme clé — member_id, toujours
```

---

## 7. Ce que ce cas révèle, et qui n'est pas un défaut de lui

**L'architecture foyer est meilleure que celle que je décrivais.** Le tronc sur le
MIN + les add-ons additifs résout élégamment le problème social — personne ne mange
la restriction d'un autre, et aucun objectif ne devient public au dîner.

**Ce qu'elle ne résout pas, c'est la protéine.** Elle est calculée pour chaque
bouche, elle n'a que trois lecteurs dont deux morts, et rien ne la fait descendre
dans la composition. Sur un foyer où une bouche est en perte et végétarienne, c'est
le plancher le plus exigeant du produit — et il n'atteint rien.

⚠️ **Et un bug de données, trouvé en chemin.** `goat_cheese` est mappé sur
CIQUAL 21800 — *« Chevreau, cru »*, c'est-à-dire de la **viande de chèvre**
(103 kcal, 2,3 g de lipides pour 100 g). C'est le **seul** aliment du groupe
`dairy_cheese` à dépasser 70,8 g/1 000 kcal : un plat cherchant un fromage riche en
protéines pour Léa **tomberait sur de la viande**, et la ceinture de régime ne le
verrait pas — elle juge sur le `food_group_ref`, pas sur la ligne CIQUAL.

---

## 8. Ce que ce cas ne teste PAS

| cas | ce que ça ajoute |
|---|---|
| **09** | **le verrou de lane** — une bouche sous plancher TCA dégrade **toute** la table |
| **10** | un **végane** à table — le seul régime qui ouvre vraiment un plat dédié |
| **11** | **six à huit bouches** — là où l'intersection des interdits se referme |
| **12** | une **grossesse** — le jeton existe, le lecteur manque |

⚠️ **Le cas 09 est le plus urgent** : un seul plancher TCA fait basculer la lane
entière en `per_portion`, et **rien ne le dit à personne**.

---

## 9. Les identifiants du code

| ce que ce cas ajoute | où |
|---|---|
| la résolution foyer | `_shared/keel/household_composition.ts` — `laneMode`, `trunkSizing`, les add-ons |
| l'âge par bande | `meal_envelope.ts` — `midAge` *(24 / 37 / 52 / 67)* |
| l'enveloppe d'un enfant | `childEnvelopeFromBody` — Schofield + `CHILD_GROWTH_ALLOWANCE` |
| le plafond de surplus | `MAX_SURPLUS_FRACTION = 0,10` — mord ici |
| le régime le plus strict | `household_diet.ts` — `strictestRegimeAt`, `regimeCapsProtein`, `dietDiverges` |
| les boîtes pesées | `household_portions.ts:2321` — ⛔ **aucune porte d'âge** |
| le plancher protéique | `PROTEIN_FLOOR_G_PER_KG` — ⛔ **deux lecteurs sur trois sans appelant** |
| ⛔ le rapport protéine/énergie | **n'existe nulle part** — 0 résultat dans tout `_shared/keel` |
