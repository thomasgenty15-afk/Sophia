# Cas 01 — une personne, une journée, trois repas

**Le cas le plus simple du produit.** Aucune allergie, aucun régime, aucun
objectif, aucune habitude fixe, une seule bouche. C'est le socle : tout cas plus
difficile est celui-ci **plus** une contrainte, et doit reproduire ces chiffres
là où la contrainte ne mord pas.

> ⚠️ **Ce déroulé suppose trois lots livrés** — sans eux, les chiffres de la
> colonne « après correction » ne sortent pas :
> **11** (`composedDishShare` supprimée — sinon tout est à 42 %),
> **9 bis** (plancher de densité — sinon deux repas sur trois sont rabotés),
> **16** (repli d'activité — ici sans effet, les deux axes sont répondus).

---

## 1. Les données de départ

| ce qui est déclaré | valeur |
|---|---|
| sexe | homme |
| âge | 28 ans |
| taille | 1,86 m |
| poids | 73 kg |
| journées *(travail et vie courante, sport exclu)* | **plutôt assis** |
| sport | **3 à 4 séances par semaine** |
| objectif de poids | **aucun** |
| repas confiés au plan | petit-déjeuner, déjeuner, dîner |

| ce qui n'est PAS déclaré | conséquence |
|---|---|
| allergie, interdit médical | aucune exclusion sur la composition |
| régime alimentaire | aucune exclusion |
| habitude fixe *(en-cas, shaker, goûter)* | rien à soustraire, rien à composer en plus |
| appétit | pas d'ajusteur ±10 % |

**IMC = 21,1** — sous 30, donc le plafond du poids de référence protéique ne mord
pas. **Âge 28** ⇒ bande `18_29`, pas de relèvement senior, pas de garde mineur.

---

## 2. Ce que le moteur calcule AVANT d'appeler le modèle

```
① métabolisme de base — Mifflin-St Jeor, homme
   10×73 + 6,25×186 − 5×28 + 5
   = 730 + 1 162,5 − 140 + 5                        =  1 758 kcal/j

② facteur d'activité — croisement des deux axes     [source: crossed]
   base « assis » 1,45  +  0,05 × 3,5 séances       =  1,63

③ entretien
   1 758 × 1,63                                     =  2 865 kcal/j

④ objectif
   aucun → executedPaceFor = 0 → écart 0            =  2 865 kcal/j
   portes traversées à vide : TCA · mineur · plancher 1 500

⑤ couverture du jour
   petit-déj 0,25 + déjeuner 0,40 + dîner 0,35      =  1,00

⑥ part du repas que le plat porte
   le plan compose tout                             =  1,00

⑦ découpe par repas
   petit-déjeuner  2 865 × 0,25                     =    716 kcal
   déjeuner        2 865 × 0,40                     =  1 146 kcal
   dîner           2 865 × 0,35                     =  1 003 kcal

⑧ plancher protéique
   maintenance → 1,6 g/kg · IMC 21,1, pas de plafond
   1,6 × 73                                         =    117 g/j
```

⚠️ **La case « 3 à 4 » est une BANDE, pas un nombre.** Le moteur en prend le
milieu — 3,5 séances. Quelqu'un qui en fait exactement 4 sortirait à 2 900 kcal.
35 kcal d'écart : sans conséquence, mais il faut savoir que c'est une bande.

**Vitamines et minéraux** : lus dans la table homme 18-64, **jamais calculés**, et
**jamais envoyés en milligrammes**. Ils deviennent des fréquences — poisson 2× par
semaine dont un gras, légumes secs 2×, ≥ 400 g de légumes par jour, céréales
complètes chaque jour.

---

## 3. Ce qui part dans le prompt

**Ce que le modèle reçoit :**
- trois repas à composer, avec une structure par repas — protéine, féculent,
  légume, matière grasse
- une cible de densité : 1,1 à 1,3 kcal/g
- les fréquences de la semaine
- la consigne d'uniformité : *« the SAME ordinary figure — one plate's worth »*

**Ce que le modèle ne reçoit PAS :**
- ⛔ aucun gramme
- ⛔ aucune kcal, et **pas même la cible** — il ne vise rien
- ⛔ ni poids, ni taille, ni âge, ni sexe

Tout le corps entre **au numérateur**, après coup. Rien ne traverse la frontière.

---

## 4. La génération — les trois repas

Le modèle écrit une part ordinaire ; le moteur lit chaque aliment dans
`food_composition_refs` *(valeurs pour 100 g **cru**)*, calcule ce que ça livre,
et réécrit les grammes par `cible ÷ livré`.

### Petit-déjeuner — cible 716 kcal

| | part ordinaire | après correction |
|---|---|---|
| flocons d'avoine | 50 g | **70 g** |
| lait demi-écrémé | 200 ml | **280 ml** |
| banane | 100 g | **140 g** |
| beurre de cacahuète | 10 g | **14 g** |
| œuf | 1 (55 g) | **1** |
| **livré** | 510 kcal | **714 kcal** |

`facteur = 716 ÷ 510 =` **1,40** · **581 g dans le bol** · **1,23 kcal/g**

### Déjeuner — cible 1 146 kcal

| | part ordinaire *(cru)* | après correction *(cru)* | dans l'assiette |
|---|---|---|---|
| poulet | 130 g | **204 g** | 153 g |
| riz | 80 g | **126 g** | 328 g |
| légumes | 180 g | **283 g** | 241 g |
| huile d'olive | 12 g | **19 g** | 19 g |
| avocat | 50 g | **79 g** | 79 g |
| **livré** | 728 kcal | **1 146 kcal** | **820 g** |

`facteur = 1 146 ÷ 728 =` **1,57** · **1,40 kcal/g**

⚠️ Le riz passe de 126 g crus à **328 g cuits** — `yield_class` `grain_absorbs`,
×2,6. **Tout chiffre de masse doit porter son état.** Sans cette mention, un repas
normal a l'air énorme et on « répare » un calcul qui était juste.

### Dîner — cible 1 003 kcal

| | part ordinaire *(cru)* | après correction *(cru)* | dans l'assiette |
|---|---|---|---|
| saumon | 130 g | **191 g** | 149 g |
| pommes de terre | 220 g | **323 g** | 310 g |
| légumes | 180 g | **265 g** | 225 g |
| huile d'olive | 10 g | **15 g** | 15 g |
| pain complet | 40 g | **59 g** | 59 g |
| **livré** | 684 kcal | **1 008 kcal** | **758 g** |

`facteur = 1 003 ÷ 684 =` **1,47** · **1,33 kcal/g**

---

## 5. Le contrôle final — le plancher de densité

| repas | densité | plancher 0,80 |
|---|---|---|
| petit-déjeuner | 1,23 kcal/g | passe |
| déjeuner | 1,40 kcal/g | passe |
| dîner | 1,33 kcal/g | passe |

**Contre-épreuve — la ceinture mord-elle encore ?** Si le modèle composait une
soupe de légumes pour ce dîner : `1 003 ÷ 0,40 =` **2 508 g**. Densité 0,40, sous
le plancher ⇒ **refusé, à recomposer plus dense.** On corrige la recette, jamais
la portion — raboter la portion affamerait la personne.

⚠️ **Avec le code d'aujourd'hui, ce tableau serait rouge deux fois** : le plafond
de masse à 8 g/kg autorise 584 g, donc le déjeuner (820 g) et le dîner (758 g)
seraient **rabotés en silence**, sous la cible. C'est le lot 9 bis.

---

## 6. Le bilan de la journée

| | livré | attendu |
|---|---|---|
| énergie | **2 868 kcal** | 2 865 |
| protéines | **150 g** | plancher 117 |
| masse totale | **2 159 g** | aucune borne — normal pour un adulte |
| densité | **1,33 kcal/g** | plancher 0,80 |

---

## 7. Ce que la personne voit

**Aucun chiffre qui la vise.** Pas d'objectif ⇒ pas de boîte pesée : elle a un
**bac**, et le gramme y décrit le récipient, pas sa portion. Elle voit le plat,
ses ingrédients, et la quantité à cuisiner. Jamais une kcal.

---

## 8. Ce que ce cas ne teste PAS — la suite de la série

| cas | ce que ça ajoute | ce que ça devrait faire bouger |
|---|---|---|
| **02** | une **allergie** et un **régime** | des exclusions sur la composition, pas sur les cibles |
| **03** | un **objectif de poids** | l'écart, le plafond 500 kcal/j, la porte TCA, **et une vraie boîte pesée** |
| **04** | un **aliment inconnu** dans un plat | l'abstention pesée et l'auto-remplissage (lots 17-18) |
| **05** | une **habitude fixe** *(shaker, goûter)* | la soustraction **et** la sortie du dénominateur — une seule porte |
| **06** | un **foyer** de plusieurs bouches | une casserole, N portions, l'union des interdits |
| **07** | un **mineur**, ou une **grossesse** | des portes qui refusent, pas des cibles qui bougent |

Chaque cas doit reproduire **les chiffres du cas 01** partout où sa contrainte ne
mord pas. Un écart non expliqué est un bug.

---

## 9. Les identifiants du code — pour un agent qui doit retrouver la chaîne

| étape de la §2 | identifiant | fichier |
|---|---|---|
| ① métabolisme de base | `estimatedMaintenanceKcal` | `_shared/keel/meal_envelope.ts` |
| ② facteur d'activité | `crossedActivityFactor`, `activityFactorOf` | idem |
| ② les constantes du croisement | `DAY_ACTIVITY_BASE` *(1,45 / 1,65 / 1,85)*, `SPORT_PAL_PER_WEEKLY_SESSION` *(0,05)*, `SPORT_SESSIONS_PER_WEEK` *(0 / 1,5 / 3,5 / 5,5)* | idem |
| ② le repli quand rien n'est répondu | `ACTIVITY_FACTOR` *(1,5)*, `ActivityFactorSource` *(`crossed` / `legacy` / `assumed`)* | idem |
| ③ l'autre estimateur, celui en kcal/kg | `ACTIVITY_KCAL_PER_KG` *(26-36)* | `_shared/keel/energy_target.ts` |
| ④ objectif et écart | `executedPaceFor`, `mouthTargetKcal` | `_shared/keel/mouth_anchor.ts` |
| ④ les portes | `ENERGY_FLOOR_KCAL` *(1 500 H / 1 200 F / 1 350)*, `MAX_DAILY_DEFICIT_KCAL` *(500)* | `energy_gate.ts`, `weight_pace.ts` |
| ⑤ couverture du jour | `dayCoverageOf` | `mouth_anchor.ts` |
| ⑥ part du plat *(à supprimer, lot 11)* | `composedDishShare`, `COMPOSED_DISH_MEAL_SHARE` *(0,42)* | idem |
| ⑦ découpe par repas | `SLOT_DAY_WEIGHT` *(0,25 / 0,40 / 0,35)* | idem |
| §4 le facteur | `anchorFactorFor`, `ANCHOR_FACTOR_MIN` *(0,60)*, `ANCHOR_FACTOR_MAX` *(3,00)* | idem |
| §4 la lecture du référentiel | `food_composition_refs`, `food_composition_aliases` | `_shared/keel/food_composition.ts` |
| §4 le cru → prêt | colonne `yield_class` | table `food_composition_refs` |
| §5 la borne actuelle *(à remplacer, lot 9 bis)* | `MEAL_MAX_GRAMS_PER_KG` *(8)*, terme `physicalMax` | `mouth_anchor.ts` |
| §4 la mise à l'échelle des boîtes | `sizeBoxesFromTarget`, `weighedPortionMembers` | `_shared/keel/household_portions.ts` |
| §7 la forme de la boîte | `docs/keel/BOITES-PAR-REPAS.md` | — |

⚠️ **Les deux lanes ne partagent pas ce calcul.** `generate-meal-v1` et
`generate-household-meal-v1` partagent `buildMealPrompt`, mais portent **deux
implémentations de `cible ÷ livré` qui ne partagent rien**. Un agent qui modifie
la chaîne doit vérifier les deux et dire laquelle il a touchée.

**Le design complet dont ce cas est une instance :**
`scratchpad/2026-08-20-1900-DESIGN-CALCUL-ET-COMPOSITION.md` — partie 5 pour les
décisions du 2026-08-21, §5.4 pour le détail technique et les lots.
