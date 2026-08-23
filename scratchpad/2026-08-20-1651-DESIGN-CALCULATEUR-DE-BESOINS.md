# Le calculateur de besoins, et le pont vers les grammes — conception

**Écrit le 2026-08-20.** Répond au brief « le calculateur de besoins, et le pont
vers les grammes ». Rien de ce qui suit n'est construit.

---

## 0. La réponse courte, et pourquoi elle n'est pas celle qui était demandée

**Le calculateur de besoins existe déjà, en entier.** De la personne à la cible
en kcal du plat, la chaîne est écrite, testée, et elle porte ses cicatrices :

```
corps  --estimatedMaintenanceFor-->  entretien kcal/j        (meal_envelope, weight_pace)
       --executedPaceFor---------->  +/- l'écart exécutable  (weight_pace)
       --mouthTargetKcal---------->  cible du jour           (mouth_anchor)
       --dayCoverageOf------------>  x la part de la journée que le plan compose
       --composedDishShare-------->  x la part du repas que le PLAT porte
                                      = la cible d'UN plat, pour UNE bouche
```

Ce qui manque n'est pas en amont. C'est **le dernier mètre**, et il est
aujourd'hui occupé par un seul nombre :

```ts
// household_portions.ts, sizeBoxesFromTarget
const sized = Math.round(share.grams * factor);   // UN facteur, TOUTE la part
```

**Ce scalaire unique est très exactement la phrase qui a déclenché ce brief.**
Multiplier toutes les lignes d'un plat par 1,7 conserve sa composition et
déplace son énergie : un plat pauvre en protéine devient un plat pauvre en
protéine, en plus gros. 400 g de poulet ne sont pas 400 g de quinoa, et un
facteur qui les traite pareil ne peut pas le savoir.

**Le pont à construire n'est donc pas « personne → grammes ». C'est
« cible d'un plat → grammes PAR RÔLE ».** Un cran, pas une couche.

⚠️ **Et il ne s'empile pas sur l'ancrage : il le remplace à l'intérieur du
plat.** `anchorFactorFor` continue de dire *combien* d'énergie ce plat doit
porter pour cette bouche ; le pont dit *comment cette énergie se répartit entre
les lignes*. Deux questions, deux étages, aucun double comptage — c'est la règle
`anchor-replaces-relative-never-multiplies`, appliquée un cran plus bas.

---

## 1. Le socle chiffré — les sources, et ce qu'on garde

### 1.1 L'entretien : on GARDE Mifflin-St Jeor. C'est une décision, pas une inertie.

**Ce qui est en place** (`meal_envelope.ts:808`) : Mifflin-St Jeor × facteur
d'activité × facteur d'appétit ; Schofield pour les mineurs.

| | source | population de validité |
|---|---|---|
| adulte | Mifflin MD *et al.*, *Am J Clin Nutr* 1990;51:241-247 | 498 adultes US, 19-78 ans, 247 non-obèses / 251 obèses |
| validation | Frankenfield D *et al.*, *J Am Diet Assoc* 2005;105:775-789 (revue systématique ADA) | ~82 % des non-obèses et ~70 % des obèses à ±10 % du RMR mesuré |
| mineur | Schofield WN, *Hum Nutr Clin Nutr* 1985;39C Suppl 1:5-41, retenue par FAO/WHO/UNU | enfants ; sur-prédit d'environ 5 % sur certaines populations non-européennes (échantillon d'origine à forte composante italienne) |
| PAL | FAO/WHO/UNU 2004, *Human Energy Requirements* (TRS 1) : 1,40-1,69 sédentaire/léger · 1,70-1,99 modéré · 2,00-2,40 vigoureux | adultes |
| PAL (variante) | EFSA 2013, *DRV for energy*, EFSA Journal 11(1):3005 : 1,4 / 1,6 / 1,8 / 2,0 | adultes UE |

**Le désaccord qui compte, et il n'est pas entre les équations.** Katch-McArdle
et Cunningham (base masse maigre) battent Mifflin sur les sujets très maigres ou
très musclés. Elles exigent une **composition corporelle** que ce produit
n'a pas et **s'interdit** de collecter (`meal_body.ts` ; le design
`DESIGN-UNITES-DE-COMPOSITION.md` §2.2 écrit « branche non mesurable = branche
non écrite »). Changer d'équation pour une entrée qu'on ne peut pas remplir est
un progrès de papier.

⚠️ **Le repli `ACTIVITY_FACTOR = 1.5`** (`meal_envelope.ts:135`) tombe dans la
bande FAO « sédentaire/léger » (1,40-1,69). Il est défendable, et il est déjà
nommé comme un repli. **Rien à changer.**

**Ce qui doit être écrit et ne l'est pas :** l'incertitude composée. Mifflin
donne ±10 % sur 82 % de la population ; le PAL deviné en ajoute ±20 % ; le
référentiel de composition ajoute ±10-15 % (table + cuisson). **La cible d'un
plat porte donc ±25-30 %.** C'est écrit dans `DESIGN-UNITES-DE-COMPOSITION.md`
§2.3 pour le verdict et nulle part pour l'allocation. Conséquence directe et
non négociable : **le pont rend des bandes, jamais des points.** « ~120 g » dans
la demande d'origine était juste ; « 118 g » serait un mensonge de précision.

### 1.2 Protéine : g/kg de POIDS CORPOREL, et le dire

**Ce qui est en place** (`meal_envelope.ts:505`) : `fat_loss` 2,0 · `maintenance`
1,6 · `muscle_gain` 1,6 · plancher 60+ 1,2 · enfant 1,0 g/kg/j.

| source | ce qu'elle dit | sur quoi |
|---|---|---|
| Morton RW *et al.*, *Br J Sports Med* 2018;52:376-384 (méta, 49 ECR, n=1863) | plateau des gains à ~1,62 g/kg/j (IC 95 % 1,03-2,20) | **poids corporel total** |
| Helms ER *et al.*, *IJSNEM* 2014;24:127-138 | 2,3-3,1 g/kg pour l'athlète entraîné maigre **en déficit** | ⚠️ **masse maigre**, pas poids total |
| Bauer J *et al.* (PROT-AGE), *JAMDA* 2013;14:542-559 ; Deutz N *et al.* (ESPEN), *Clin Nutr* 2014;33:929-936 | ≥1,0-1,2 g/kg/j après 65 ans ; 1,2-1,5 en cas de maladie | poids corporel |
| EFSA 2012 (*DRV for protein*) et ANSES 2016 | PRI population générale **0,83 g/kg/j** | poids corporel |

⛔ **LE DÉFAUT LATENT, ET IL EST DANS LE CODE AUJOURD'HUI.** Le `2,0` de
`fat_loss` descend de Helms 2014, qui parle en **masse maigre**. Appliqué au
poids **total**, il sur-prescrit d'autant plus que la personne a de masse
grasse : une femme de 95 kg à 40 % de masse grasse se voit demander 190 g/j là
où la source en supporterait ~130-175. Le commentaire dit « borne haute
rationale Helms 2014 » — il ne dit pas que le dénominateur a changé.

**Recommandation :** garder `2,0` (le changer sans mesure serait un autre
chiffre non fondé), et **écrire la substitution de dénominateur au-dessus de la
constante**, avec la direction du biais. Une contrainte documentée survit à sa
cause ; une contrainte non documentée survit à sa vérité.

**Le rythme change-t-il la cible protéique ?** Non, et c'est déjà la position du
dépôt : le plancher est indexé sur l'**objectif**, pas sur le cran de perte.
Morton ne mesure pas de dose-réponse au rythme. Ne pas ouvrir ce paramètre.

**Le plancher de tout le monde :** 0,83 g/kg/j (EFSA/ANSES). Il n'apparaît
nulle part dans le code, parce que les quatre valeurs actuelles sont toutes
au-dessus. **À poser quand même**, comme borne basse absolue de la table : le
jour où une doctrine coach abaissera le plancher, c'est ce nombre-là qui devra
refuser.

### 1.3 Le volume végétal : la seule contrainte de MASSE qui a une source

C'est la pièce qui manque au dépôt, et c'est celle qui rend une assiette
cuisinable plutôt qu'optimisée.

- **OMS/FAO 2003, TRS 916** : ≥400 g/jour de fruits et légumes (hors tubercules
  féculents).
- **ANSES / PNNS 2019** : au moins 5 portions par jour, dont les légumes.

Réparti sur 2-3 repas principaux, fruits pris hors repas : **150-250 g de
légumes non-féculents par plat principal.** C'est une **contrainte de masse**,
pas d'énergie, et c'est ce qui empêche le pont de rendre « 340 g de lentilles et
12 g d'huile ». Une allocation qui satisfait une cible énergétique sans masse
végétale n'est pas une assiette.

### 1.4 Les micronutriments : les booléens SUFFISENT, et il faut dire pourquoi

Le référentiel ne porte que `ironSource`, `b12Source`, `calciumSource`… Le brief
demande si c'est assez pour piloter une répartition. **Oui, et enrichir en mg
serait une régression.** Trois raisons chiffrées :

1. **Variance à la source** : sol, saison, variété, cultivar — l'ordre de
   grandeur admis est ±30-50 % sur les minéraux d'origine végétale.
2. **Rétention à la cuisson** : USDA, *Table of Nutrient Retention Factors*
   Release 6 — 10 à 50 % de perte sur les vitamines hydrosolubles selon la
   méthode. Le référentiel porte `yieldClass` (masse), pas de facteur de
   rétention (nutriment). Les deux ne sont pas le même objet.
3. **Biodisponibilité dépendante du repas** : WHO/FAO 2004, *Vitamin and Mineral
   Requirements in Human Nutrition*, publie **quatre** scénarios de
   biodisponibilité du fer — 5 %, 10 %, 12 %, 15 % — selon la matrice
   (phytates, ascorbate, fer héminique). Un « mg de fer » dans une assiette
   varie donc d'un facteur 3 selon ce qu'il y a à côté.

**Un mg sur une assiette n'est pas une grandeur décidable.** Le booléen
« source de » est la seule granularité honnête, et il pilote par **fréquence**
(« du poisson gras deux fois cette semaine »), pas par quantité — ce que
`FrequencyRule` sait déjà exécuter.

⚠️ **Une seule exception, et elle est déjà en base : les fibres.** `fiberG` est
quantifiable, robuste à la cuisson, et porte une référence nette (ANSES 2016 :
30 g/j chez l'adulte). C'est la seule grandeur micro qui peut entrer dans une
allocation sans mentir. **Recommandation : l'utiliser comme contrôle de
plausibilité de l'allocation végétale, jamais comme cible affichée.**

---

## 2. Le pont — l'algorithme, et pourquoi ce n'est pas un programme linéaire

### 2.1 Pourquoi pas un LP

Trois raisons, dont une est structurelle et disqualifiante.

1. ⛔ **L'optimum d'un programme linéaire est un SOMMET du polytope
   admissible.** C'est-à-dire : le maximum possible de variables collées à leurs
   bornes. « 340 g de lentilles et 12 g d'huile » n'est pas un LP mal réglé,
   c'est **la définition d'une solution de LP**. Aucun réglage de fonction
   objectif ne corrige ça ; il faudrait un terme quadratique de régularisation,
   c'est-à-dire abandonner le LP.
2. **Il faut une composition par GROUPE, qui n'existe pas.** `poultry` couvre
   110 kcal/100 g (blanc sans peau) à 220 (cuisse avec peau) — un facteur 2. Un
   LP résoudrait contre une moyenne fictive avec une erreur plus grande que la
   précision qu'il prétend rendre.
3. **Il n'est pas auditable.** La discipline de ce dépôt est « nomme le motif ».
   La réponse d'un simplexe à « pourquoi 118 g » est « le solveur a atterri là ».

### 2.2 Ce qu'on construit : une allocation SÉQUENTIELLE à ordre fixe

Chaque étage a un statut, un motif d'abstention nommé, et rend une **bande**.

```
ENTRÉE   T          la cible en kcal de CE plat pour CETTE bouche  (mouth_anchor, déjà là)
         roles      les rôles présents dans le plat que le modèle a nommé
         index      le référentiel VIVANT (jamais grams_raw)
SORTIE   Allocation grammes CRUS par rôle, en bandes, ou une abstention nommée
```

**① PROTÉINE — plancher, jamais résiduel.**
`P = envelope.proteinFloorG / (nombre de repas principaux déclarés)` — c'est
`portionAnchorFor`, déjà écrit. Puis, **sur l'index vivant** :

```
grammes_protéine = P / densité_protéique(groupe) x 100
```

où `densité_protéique(groupe)` est le **p25-p75** des refs de ce groupe, pas
leur moyenne. Deux bornes ⇒ une bande de grammes. Moins de `MIN_REFS_FOR_BAND`
refs dans le groupe ⇒ **`null`, et l'allocation entière s'abstient** : la
protéine est le seul rang que rien ne peut éteindre, donc ne pas savoir la
placer, c'est ne pas savoir composer.

**② VOLUME VÉGÉTAL — masse, pas énergie.**
`150-250 g` de `non_starchy_veg` / `leafy_greens` / `cruciferous_veg` par plat
principal (§1.3). **Ne se dérive pas de T** : c'est la contrainte qui empêche
l'assiette dégénérée. Son énergie est ensuite retirée de T, pas l'inverse.

**③ MATIÈRE GRASSE AJOUTÉE — BORNÉE, jamais résiduelle.**
`10-15 g` (≈ 1 c. à soupe) par plat principal. ⛔ **C'est le point où un
allocateur naïf casse** : l'huile est le poste le plus dense et le moins
visible ; en faire la variable d'ajustement produit 45 g d'huile pour fermer une
cible, ce qui est invisible dans l'assiette et faux dans le corps. Cette borne
est aussi ce que `FRY_OIL_UPTAKE_RATIO = 0.12` suppose déjà en aval.

**④ FÉCULENT — le RÉSIDU, et lui seul.**
```
E_res = T - kcal(①) - kcal(②) - kcal(③)
grammes_féculent = E_res / densité_énergétique(groupe)     [p25-p75, index vivant]
```
⚠️ **C'est ici que « 400 g de poulet ≠ 400 g de quinoa » reçoit sa réponse.**
Le même `E_res` devient ~75 g de riz cru ou ~250 g de pommes de terre crues.
Le rôle est fixe, le gramme suit le groupe que le modèle a nommé.

**⑤ LES CEINTURES, dans cet ordre.**
- masse totale ≤ `MEAL_MAX_GRAMS_PER_KG x poids` — la borne existe, elle est
  dérivée, elle est testée (`mouth_anchor.ts`). L'allocation la respecte au lieu
  de la subir après coup.
- densité implicite de l'assiette ≤ `DENSITY_CEILING_*` — pas un refus, un jeton
  de correction (`lower_density`).
- ⛔ `E_res` négatif ou hors des bornes culinaires du féculent ⇒ **abstention
  PARTIELLE** : ① ② ③ sont émis, ④ ne l'est pas et **est compté**. Le résidu
  part dans `unmetDemand` (`pot_demand.ts`), qui existe pour ça.

### 2.3 ⛔ La maille de CONTRAINTE est le RÔLE. La maille de SORTIE est le GROUPE.

**C'est le seul endroit où cette conception s'écarte du brief, et c'est
délibéré.** Le brief demande une répartition **par groupe** en entrée. Contraindre
`poultry` à 120 g **interdit au modèle de servir du poisson** — ce serait ce que
`DESIGN-UNITES-DE-COMPOSITION.md` §8 a déjà écarté sous le nom « vocabulaire
fermé imposé au générateur », avec quatre coûts mesurés.

La forme demandée — *« ~120 g de volaille crue, ~60 g de céréales complètes
crues, ~200 g de légumes »* — est la forme **RENDUE**, pour le plat que le
modèle a choisi. Elle n'est pas la forme **ENVOYÉE**.

```ts
type CompositionRole = "protein" | "vegetable" | "starch" | "added_fat";

interface RoleBand { role: CompositionRole; minG: number; maxG: number; }

interface Allocation {
  memberId: string;               // un id du roster, jamais un prénom
  slot: MealSlot;
  day: string;
  bands: readonly RoleBand[];     // vide si abstention totale
  reason: AllocationReason;       // TOUJOURS rendu, y compris sur `allocated`
  /** Les rôles qu'on n'a pas su borner, nommés. Jamais un silence. */
  unallocated: readonly CompositionRole[];
}
```

⚠️ **`bands` en grammes de CRU**, comme le référentiel (`yieldClass` fait le
cru↔cuit et va **dans les deux sens** — c'est déjà une règle tranchée de
`food_composition.ts`, ne pas la re-trancher).

⚠️ **`reason` est rendu même quand ça marche.** Un compteur qui ne nomme que les
refus ne distingue pas « la porte a laissé passer » de « la porte n'a pas
tourné » — même discipline que `ANCHOR_REASONS`.

Le **groupe** reste ce qui revient : `parseGeneratedMeal` valide déjà
`ingredient.group` contre `FOOD_GROUP_REFS` (`meal_generation.ts:3551`). Rien à
inventer côté sortie.

---

## 3. Les habitudes — TOUTES dans le plan (décision du 2026-08-20)

> **Décidé par le propriétaire :** *« le mieux c'est de faire en sorte que toutes
> les habitudes soient intégrées au plan, comme ça le compte est correct et
> englobe tout. »*

Ce document portait d'abord l'inverse (garder la clé de répartition, ajouter
`starter`). **La décision ci-dessus la remplace**, et elle déclenche exactement
ce que `mouth_anchor.ts` avait déjà écrit au-dessus de sa constante :

> ⚠️ *Le jour où il composera le repas entier (fromage, dessert, pain), cette
> constante doit passer à `1` — et non être « ajustée ».*

### 3.1 C'est une SUPPRESSION, pas un ajout

| meurt | survit, en changeant de rôle |
|---|---|
| `COMPOSED_DISH_MEAL_SHARE = 0.42` | `takes_dessert / cheese / bread / starter` : de **clé de répartition** ils deviennent **instruction de composition** |
| `MEAL_COMPONENT_KCAL` (300/120/120/80) | — |
| `composedDishShare()` et ses 4 états | — |
| le repli « moyenne française » | — |

**Le gain est exactement celui qui est visé :** le compte cesse d'être une
convention et devient un calcul. Les 120 kcal conventionnels du dessert
deviennent la composition réelle du dessert composé, lue sur l'index vivant.

⚠️ **Les quatre booléens restent `boolean | null`.** `false` est une réponse
(« je n'en prends pas » ⇒ le plan n'en compose pas), `null` est un silence
(⇒ le plan n'en compose pas **non plus**, et c'est compté séparément). Les deux
mènent au même plat, mais pas au même compteur — et confondre les deux est la
cicatrice `auto-tick-writes-undeniable-false-facts`.

### 3.2 Les trois supports, après la décision

La frontière ne disparaît pas, elle se simplifie : **deux supports alimentent la
composition, un seul alimente encore le calcul.**

| support | ce qu'il dit | après la décision |
|---|---|---|
| `takes_*` | ce qui est à côté du plat | **le plan le COMPOSE.** Plus aucune part à calculer. |
| `household_member_habits` | « elle mange une pomme le matin » | **le plan le COMPOSE** aussi, quand il est composable |
| `fixed_intakes` | « 60 g d'avoine », `food_ref` + quantité | **inchangé** : il reste SOUSTRAIT, parce qu'il est préparé par quelqu'un d'autre que le plan |

⛔ **`fixed_intakes` ne rejoint PAS la composition.** Un apport fixe dit qu'une
part de la journée est déjà composée **par quelqu'un d'autre** ; la recomposer
la compterait deux fois. C'est la seule frontière qui survit, et c'est celle qui
a une raison mécanique et non conventionnelle.

### 3.3 ⛔ Les trois coûts, à prendre en connaissance de cause

**① Ça franchit une ligne produit.** Aujourd'hui les cases « ne prescrivent
rien : on lit ce que la personne a dit qu'elle prend déjà ». Si le plan compose
le dessert, il le **prescrit**. C'est défendable — plus honnête qu'un plat qui
ignore la moitié de l'assiette — mais c'est une décision, pas une conséquence
technique, et elle doit être écrite là où la phrase inverse vivait.

**② Le volume du plan double, et la lane foyer frôle déjà le mur de temps du
worker** (mesuré, `household_portions.ts:1454`). ~9 plats/jour deviennent
~20 lignes. **À instrumenter AVANT le lot**, pas après : le temps de génération
par plan, sur la lane foyer, à fenêtre égale.

**③ ⛔ UN DÉFAUT RÉVEILLÉ, ET IL EST SILENCIEUX.** `SLOT_DAY_WEIGHT` ne porte
que **trois** moments (0,25 / 0,40 / 0,35) alors qu'`EATING_OCCASIONS` en a
**six**. `dayCoverageOf` lit `SLOT_DAY_WEIGHT[slot] ?? 0` : un `snack_pm`
composé apporterait de l'énergie réelle dans `day.kcal` **en comptant pour zéro
dans la couverture**. Le rapport `cible x couverture / livré` sortirait donc
**trop petit, systématiquement** — dans le sens qui sous-nourrit, sans qu'aucun
test actuel ne bouge.

⇒ **Les six moments reçoivent un poids dans le MÊME lot.** Aucune habitude n'est
composée avant que cette table soit complète.

## 4. L'incertitude — les abstentions, une par une

**Aucune ne rend `0`. Aucune ne rend un repli muet.** Chacune a son jeton.

| jeton | déclencheur | ce qui sort |
|---|---|---|
| `allocated` | tout est calculable | les 4 bandes |
| `restriction_floor` | plancher TCA levé sur CE compte | **rien**. Plat commun. |
| `restriction_unknown` | ceinture non évaluable — fail-closed | **rien** |
| `minor` | `ageState === "minor"` | **rien**, jamais de chiffre |
| `age_unknown` | « je ne sais pas » ≠ « c'est un adulte » | **rien** |
| `no_body` | pas de corps exploitable | **rien** |
| `counting_closed` | doctrine du coach interdit de compter | **rien** |
| `no_goal` | ni `fat_loss` ni `muscle_gain` | **rien** — BOITES-PAR-REPAS |
| `no_target` | la chaîne amont s'est abstenue (`day_incomplete`…) | **rien** |
| `protein_group_unbandable` | <`MIN_REFS_FOR_BAND` refs, ou `proteinG` null | **rien** (abstention TOTALE) |
| `starch_unbandable` | ④ ne se borne pas | ① ② ③ seuls ; `unallocated: ["starch"]` |
| `mass_capped` | la somme dépasse `MEAL_MAX_GRAMS_PER_KG x kg` | bandes rabotées, résidu → `unmetDemand` |

⛔ **`starch_unbandable` est le seul cas d'abstention PARTIELLE, et c'est la
réponse à la question « comment s'abstenir assez pour rester utile ».** Placer la
protéine et les légumes est déjà la moitié du travail ; refuser tout parce qu'on
ne sait pas borner le riz jetterait ce qu'on sait avec ce qu'on ignore.

### Les compteurs, avec leur dénominateur

Un compteur sans sa population est un compteur qui ment.

| compteur | dénominateur — **et il n'est pas « tout le monde »** |
|---|---|
| `allocation.reason` (histogramme) | **bouches-jours-créneaux à objectif** ayant atteint le générateur |
| `allocation.bands_respected` | rôles **contraints**, mesurés **après pliage des préparations, sur l'index vivant** |
| `group_band_null / group_band_queried` | interrogations du référentiel — dit si l'index est assez épais |
| `mass_capped / allocated` | assiettes allouées — dit si `MEAL_MAX_GRAMS_PER_KG` mord |
| **`allocated / (allocated + abstentions)`** | **le compteur qui décide de la suite** (§7) |

⚠️ Trois pièges de mesure, tous déjà payés :
- **jamais `grams_raw` en base** — il est figé à la génération ; rejouer
  `resolveIngredients` sur l'index vivant (261 plats « à réparer » en valaient 17) ;
- **après `foldPreparationsIntoDishes`**, et le taux **DESCEND** au pliage
  (37,8 % → 28,6 %) — c'est le chiffre d'après qui fait foi ;
- **`coverage`, pas `resolved.length`** — 96 % contre 69 % sur la même assiette.

---

## 5. Où ça s'insère — une passe, deux points de contact

### Avant le modèle : les bandes, dans le brief

`boxingOrderLines` ordonne aujourd'hui au modèle **le même chiffre pour tout le
monde** :

> *« Give every share of a meal the SAME ordinary figure -- one plate's worth »*

⛔ **Cette phrase est le seul ancrage du nombre 450 dans tout le produit.** Elle
existe pour une raison mesurée (le modèle découpait par classe, le moteur
multipliait par-dessus : double comptage sur trois runs sur trois). Elle
disparaît **le jour où le moteur cesse de multiplier**, pas avant — et c'est
précisément ce que ce pont fait.

Ce qui la remplace, pour les bouches à objectif seulement :

```
FOR iku, thursday lunch: about 110-150 g of raw poultry or fish or another
full protein food, 180-250 g of non-starchy vegetables, 60-90 g of raw
whole grain or 200-300 g of potatoes, and one tablespoon of oil.
```

⚠️ **Du même côté de la frontière que « 400 g de cuisses de poulet » sur une
liste de courses.** Aucun kcal, aucun corps, aucun objectif, aucun facteur,
aucune comparaison entre deux personnes. Un facteur dit au prompt est un nombre
que le modèle recopie — mesuré au LOT E : *« Zoé : 0,85 de la part de Marc »*,
lu à voix haute à table.

**Pourquoi en entrée et pas seulement en sortie :** l'en-tête de
`portion_scaling.ts` documente **quatre tentatives par la consigne, toutes sans
effet**, et le dépôt a mesuré que le levier qui marche est un **nombre attendu,
nommé** (0→11 plats, 0→38 % de notes). Un plan parti à 46 % de son plancher
reste hors d'atteinte d'un facteur borné à ×2 : **c'est la génération qui
sous-porte, et ça se répare en amont.**

### Après le modèle : un verdict par rôle. **PAS une seconde mise à l'échelle.**

`sizeBoxesFromTarget` passe de `share.grams x facteur` à une correction **par
`items[]`**, chaque ligne ramenée dans la bande de son rôle. Le `items[]` de
BOITES-PAR-REPAS **n'est pas construit** (`SizableMeal` porte encore `shares`) :
la couture est ouverte, il n'y a rien à défaire.

⚠️ Et `scaleIngredients` **ne touche que les lignes en g/ml** : toute cible
traduite en facteur **retire la part fixe avant de diviser**
(`fixe + mobile x f == cible`), et « part mobile » se lit `isScalableUnit`,
jamais une liste recopiée.

### Le risque symétrique, nommé

Le dépôt a mesuré qu'un budget ouvert trop grand fait « déborder poliment » le
modèle. **Le risque inverse d'une allocation fermée est que le modèle cesse de
cuisiner** — il rend les quatre lignes qu'on lui donne et rien d'autre, et
l'assiette devient poulet-riz-brocoli-huile pour l'éternité.

**Deux mitigations, structurelles :**
1. la contrainte porte sur **4 rôles**, pas sur 30 groupes — le modèle choisit
   toujours l'aliment, la cuisson et la recette ;
2. **la liste de rôles est un PLANCHER, pas un menu.** Le modèle peut ajouter des
   rôles (fromage, sauce, fruit) ; le vérificateur ne contrôle que les rôles
   contraints. Une allocation qui interdirait l'ajout serait une recette de kit.

**Et ça se mesure** : diversité des groupes servis par plan, avant/après, à
`MEAL_PROMPT_VERSION` bumpée. Si elle chute, la contrainte est trop serrée.

---

## 6. La base — ce qu'il faut ajouter, et ce qui suffit tel quel

### ✅ Suffit tel quel

- **`food_composition_refs`** — énergie, protéine, glucides, lipides, fibres,
  `yieldClass`, `atwaterDiscount`, `energyDense`, `unitGrams`, marqueurs
  sentinelles. **Tout ce dont le pont a besoin y est.**
- **`FOOD_GROUP_REFS`** (30 groupes, FK, seed, token-lint) — la maille de sortie.
  **Ne pas en créer une seconde.**
- **`household_member_bodies`** — corps, axes d'activité, appétit, les trois
  cases de structure. Complet depuis le 2026-08-20.
- **`generated_from`** — porte déjà les compteurs et les versions.

### ⚠️ À ajouter, et c'est court

1. **`takes_starter boolean` + `starter_asked`** sur `household_member_bodies`,
   et `starter: 100` dans `MEAL_COMPONENT_KCAL`. Le trou nommé du §3.
2. **`CompositionRole` et la table rôle→groupes**, en TypeScript, dérivée de
   `FOOD_GROUP_REFS` par un `satisfies readonly FoodGroupRef[]` — le patron
   `PROTEIN_SOURCES`, pour la même raison : un slug inventé ne compile pas.
3. **`MIN_REFS_FOR_BAND`** et les bornes culinaires par rôle. **Conventions
   déclarées**, calibrées sur les premiers runs réels, écrites comme telles avec
   leur date de péremption — le patron `COMPOSED_DISH_MEAL_SHARE`.

### ⛔ À NE PAS ajouter

- **Aucune colonne de mg de micronutriment** (§1.4).
- **Aucune table d'agrégats par groupe.** Une bande p25-p75 par groupe se
  **calcule à la lecture, sur l'index vivant**. La stocker, c'est refabriquer
  `grams_raw` : un chiffre figé qui dit l'état du référentiel d'un autre jour.
- **Aucune table pour l'allocation.** Elle vit dans le plan et dans
  `generated_from`, comme le reste.

⚠️ Si une table interne devait quand même naître : **REVOKE `authenticated` et
`anon` dès la migration** (`authenticated` a TOUT sur toute table neuve), et
**réclamation par le lifecycle RGPD dans la même migration** (9 tables sont déjà
hors export).

---

## 7. Les questions à trancher AVANT de coder — avec une recommandation

**Q1 — Les bandes atteignent-elles le modèle dès la v1, ou d'abord l'ombre ?**
→ **En ombre d'abord.** L'allocation est calculée, écrite dans `generated_from`,
**et le prompt ne bouge pas** — hash inchangé pour toute la base. On mesure
`allocated / (allocated + abstentions)` sur des runs réels. **La barre : si le
taux est sous 60 %, on ne branche pas.** Une couche qui répond dans 20 % des cas
ne remplace rien — et cette barre a déjà été payée une fois sur ce chantier.

**Q2 — Quand les bandes sont branchées, `bodyShareFactors` disparaît-il ?**
→ **Non, il BASCULE.**
```
allocation émise  ->  elle gouverne les items ; le scalaire ne s'applique pas
sinon             ->  le scalaire relatif reste, seul
JAMAIS les deux
```
La règle est déjà tranchée (`anchor-replaces-relative-never-multiplies`, arbitrage
du 2026-08-20). Le retirer pendant que l'allocation s'abstient rendrait `450/450`,
c'est-à-dire le produit d'avant, livré sous le nom d'un progrès.

**Q3 — Le plat commun reçoit-il une allocation ?**
→ **Un VOLUME, jamais une répartition nommée.** `Σ` sur les bouches des bandes de
chaque rôle, **arrondi au demi-équivalent**, un scalaire, sans ventilation. « La
somme survit, la division meurt » — et l'arrondi **est une garde** : une précision
au centième sur un foyer de deux laisse deviner un corps par soustraction.

**Q4 — 4 rôles, ou 5 (les légumineuses à cheval protéine/féculent) ?**
→ **4.** Un cinquième rôle mi-protéine mi-féculent rouvre le double comptage par
la porte de la taxonomie. Les légumineuses sont dans `PROTEIN_SOURCES` ; qu'elles
apportent aussi des glucides est vrai, et c'est au **calcul** de le voir
(`nutrientsOf` rend les deux), pas à la maille.

**Q5 — Que fait le pont sous une doctrine `energy: off` ?**
→ **Il calcule et n'arbitre pas.** Mesure ≠ pilotage : les bandes se calculent,
la protéine et le volume végétal restent (planchers, non désactivables), et
**aucun jeton de correction d'énergie n'est servi** à cette cohorte. C'est déjà
la règle du §3.6 du design de composition.

**Q6 — Qui décide des bornes culinaires ?**
→ **Le produit les déclare, et elles portent leur date de péremption.** L'honnête
version est celle de `DENSITY_CEILING_*` : « constantes opérationnelles, et c'est
avoué ». Les prétendre issues de la littérature serait défendre un chiffre
indéfendable. **Elles se recalibrent sur les runs de la phase ombre (Q1), et
c'est le seul motif légitime de les bouger.**

---

## 8. Ce qu'on propose de NE PAS faire

- ⛔ **Ne pas construire de référentiel de composition.** Il existe, il est mûr,
  il est testé, et ses trois règles (l'inconnu se propage, le rendement va dans
  les deux sens, jamais de matcher maison) ne se renégocient pas.
- ⛔ **Ne pas construire d'optimiseur.** §2.1 — le défaut est structurel, pas
  paramétrique.
- ⛔ **Ne pas ajouter de mg de micronutriments.** §1.4 — trois variances
  indépendantes, dont une d'un facteur 3.
- ⛔ **Ne pas contraindre par groupe.** §2.3 — c'est le vocabulaire fermé imposé
  au générateur, déjà écarté avec quatre coûts mesurés.
- ⛔ **Ne pas ajouter de sélecteur d'habitudes.** §3 — les champs existent ; la
  décision du 2026-08-20 les fait CHANGER DE RÔLE, elle n'en crée pas.
- ⛔ **Ne pas faire entrer `fixed_intakes` dans la composition.** §3.2 — il est
  préparé par quelqu'un d'autre ; le composer le compterait deux fois.
- ⛔ **Ne pas changer d'équation d'entretien.** §1.1 — les alternatives exigent
  une donnée que le produit s'interdit.
- ⛔ **Ne pas retirer le facteur relatif avant d'avoir MESURÉ l'abstention.**
  Q2 — le déclencheur est un chiffre, jamais une symétrie d'architecture.
- ⛔ **Ne pas étendre l'allocation aux bouches sans objectif.** BOITES-PAR-REPAS :
  `maintenance` n'ouvre rien, et ce n'est pas un oubli.
- ⛔ **Ne pas afficher un kcal.** Le pont calcule en kcal en interne et rend des
  **grammes d'aliment**. La cible contraint les grammages ; elle ne devient
  jamais un chiffre montré.

---

## 9. La frontière médicale, explicitement

Le brief demande qu'elle soit écrite. Elle tient en trois lignes, et deux d'entre
elles sont déjà du code.

1. **Ce produit rend des grammes d'ALIMENT à cuisiner.** Il ne rend ni cible
   calorique, ni cible de macro, ni cible de poids, à personne. La cible interne
   contraint la casserole ; elle ne traverse jamais l'écran.
2. **Il ne s'adresse pas à une personne malade.** Les contraintes médicales
   structurées sont un **verrou binaire en tête de préséance**
   (`safetyConstraintsPromptBlock`), pas une entrée du calcul : le pont
   **n'adapte rien** à une pathologie — il compose à l'intérieur de ce que le
   verrou a déjà autorisé.
3. **Le plancher TCA est fail-closed et il précède tout.** Tant qu'une lecture
   n'a pas prouvé le contraire, aucun chiffre. Levinson 2017 : 73 % des patients
   TCA déclarent qu'un tracker de calories a contribué à leur trouble. *(Le
   « 83 % » de la revue 2025 est une erreur de citation ; ne pas la propager.)*

⛔ **Et la garde retire les chiffres à UNE personne**, pas à la table. Une garde
doit coûter à qui elle protège, et à personne d'autre.

---

## 10. L'ordre d'exécution

Chaque étape livrable seule, condition de désarmement testée **par égalité de
chaînes**, `MEAL_PROMPT_VERSION` bumpée **si et seulement si** la consigne change.

| # | ce qu'on livre | ce qui décide de la suite |
|---|---|---|
| 1 | **Les 6 moments dans `SLOT_DAY_WEIGHT`** (§3.3 ③), puis les habitudes composées : `starter` ajouté, `composedDishShare` retiré, `share = 1`. **Bump.** | temps de génération par plan, lane foyer, à fenêtre égale |
| 2 | `CompositionRole`, la table rôle→groupes, `groupBandOf(index, group)` **pur**. Zéro appelant. | — |
| 3 | `allocationFor(...)` **pur**, les 12 jetons d'abstention, les compteurs. **Écrit dans `generated_from`, PAS dans le prompt.** Hash inchangé. | `allocated / (allocated + abstentions)` **≥ 60 %** |
| 4 | Les bandes entrent dans `buildPortionBrief` pour les bouches à objectif. `boxingOrderLines` perd « the SAME ordinary figure ». **Bump.** | **diversité des groupes servis, avant/après** — une contrainte fermée peut faire cesser de cuisiner |
| 5 | `sizeBoxesFromTarget` sur `items[]`, correction **par rôle**, bascule du scalaire relatif. | `bands_respected`, sur index vivant, après pliage |
| 6 | Le volume du plat commun par la **somme**, arrondie au demi. Repli **nommé** sur le compte de têtes. | plans dimensionnés à l'appétit contre au compte |

⚠️ **Les étapes 1-3 ne changent aucune assiette.** C'est voulu : la mesure de
l'étape 3 est ce qui décide si l'étape 4 a le droit d'exister. Brancher avant de
mesurer, c'est le mode d'échec n°1 de ce dépôt — un lot construit, branché,
désarmé, qui ressemble trait pour trait à un lot qui marche.
