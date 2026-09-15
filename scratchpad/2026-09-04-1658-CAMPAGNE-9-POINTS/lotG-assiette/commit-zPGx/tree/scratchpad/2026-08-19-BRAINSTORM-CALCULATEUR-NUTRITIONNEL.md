# Brainstorm — le calculateur de besoins, et le pont vers les grammes

> **À coller à un agent qui n'a pas ce contexte.** Il travaille sur le dépôt
> Sophia/KEEL. Qu'il lise ce fichier en entier avant de proposer quoi que ce
> soit.

---

## Ce qu'on te demande

Concevoir **l'algorithme qui transforme une personne en une cible de repas**, et
qui donne au modèle génératif, en entrée, **une répartition par groupe
d'aliments exprimée en grammes**.

Entrées : taille, âge, poids, sexe, niveau d'activité, direction (perte / prise /
maintien), rythme de perte visé, **et ses habitudes déclarées** (elle prend un
dessert, du fromage le soir, une crème au chocolat).
Sortie : pour chaque repas, quelque chose comme *« ~120 g de volaille crue,
~60 g de céréales complètes crues, ~200 g de légumes non-féculents »*.

**Le déclencheur de cette demande, mot pour mot :**

> « On ne peut pas se tenir simplement au grammage en réalité, parce que 400 g
> de poulet ce n'est pas 400 g de quinoa. »

C'est exact, et c'est tout le sujet. Un gramme n'est pas une unité de besoin.

---

## ⛔ CE QUI EXISTE DÉJÀ — LIS-LE AVANT DE PROPOSER

**Le piège n°1 de cette mission est de reconstruire une couche qui est déjà
là.** Le dépôt porte un référentiel de composition mûr, testé, avec ses
cicatrices documentées.

### `supabase/functions/_shared/keel/food_composition.ts` (FF-038)

Le référentiel vit en base (`food_composition_refs`), ce module reçoit un index
déjà construit. Il porte, **pour 100 g CRUS** :

```ts
energyKcal, proteinG, carbsG, fatG, fiberG        // null = la source ne donne pas
omega3Marine, ironSource, calciumSource,
iodineSource, zincSource, b12Source, folateSource  // marqueurs booléens
yieldClass          // cru→cuit: le riz ×2,6, la viande ×0,70
atwaterDiscount, energyDense, unitGrams
```

Trois règles déjà tranchées, à ne pas renégocier sans raison :

- **L'inconnu se propage, le zéro non.** `nutrientsOf` rend `"unknown"`, jamais
  une somme amputée — un `0` silencieux ferait passer un plat non calculable
  pour un plat léger, c'est-à-dire le sens exactement inverse.
- **Le rendement va dans les DEUX sens.** Coder une seule direction donne des
  résultats plausibles sur la moitié des plats : un bug invisible.
- **Jamais de matcher maison.** Un terme non reconnu rend `null` et atterrit
  dans `unresolvedTerms`. La cicatrice est chiffrée dans ce dépôt (« laitue » ≠
  « lait », 12 faux positifs sur 12).

### Le vocabulaire de groupes existe (`tokens.ts`, `FOOD_GROUP_REFS`)

`lean_protein · fatty_fish · white_fish · shellfish · poultry · red_meat · eggs ·
legumes · tofu_tempeh · dairy_yogurt · dairy_cheese · whole_grain ·
refined_grain · starchy_veg · cruciferous_veg · leafy_greens · non_starchy_veg ·
berries · citrus · other_fruit · …`

**C'est très probablement la maille de sortie de ton algorithme.** Ne pas en
inventer une autre sans dire pourquoi celle-ci ne suffit pas.

### Le reste de la couche

| fichier | ce qu'il répond déjà |
|---|---|
| `weight_pace.ts` | `estimatedMaintenanceFor(body)` — l'entretien en kcal/jour |
| `meal_envelope.ts` | `estimatedMaintenanceKcal`, `activityFactorOf`, `MouthBody` |
| `energy_target.ts` | la cible énergétique |
| `energy_gate.ts` | les portes de sécurité (`energySafetyGates`, `COUNTING_STANCES`) |
| `mouth_energy.ts` | l'énergie d'une bouche sur un jour, par tranches de plat |
| `household_portions.ts` | `memberTargetFactor`, `sizeBoxesFromTarget` |
| `composition_steering.ts`, `composition_forks.ts` | l'orientation de composition |

**Docs à lire :** `docs/keel/CALORIE_REVERSAL.md` (§7 surtout),
`docs/fonctionnalites/composition-des-repas/FF-038-le-referentiel-de-composition.md`,
`scratchpad/DESIGN-UNITES-DE-COMPOSITION.md`.

---

## La décision produit qui vient d'être prise (2026-08-19)

Lire `docs/keel/BOITES-PAR-REPAS.md`. En résumé :

> **Un objectif de poids ouvre une portion millimétrée. Rien d'autre ne la
> demande, et personne d'autre ne la subit.**

- La personne avec `fat_loss` ou `muscle_gain` reçoit **sa** boîte, pesée
  composant par composant à la session de cuisine.
- Tout le monde d'autre mange dans un plat commun, **sans nom ni gramme**.
- Le VOLUME cuisiné reste dimensionné par les corps de toute la maisonnée
  (« la somme survit, la division meurt ») — pour ne pas gaspiller.

**Ton algorithme sert d'abord la première ligne.** Mais réfléchis aussi à ce
qu'il donne pour la seconde : un plat commun a besoin d'un volume et d'un
équilibre, pas d'une étiquette.

---

## ⛔ LES CONTRAINTES NON NÉGOCIABLES

Elles ne sont pas de la prudence ajoutée après coup : elles sont **déjà
construites**, testées, et elles ont des cicatrices écrites.

1. **Plancher TCA.** `restrictionFlag` est **fail-closed** : tant qu'une lecture
   n'a pas prouvé le contraire, aucun chiffre. Une personne sous plancher ne
   reçoit **aucune** cible, aucun gramme, aucune calorie.
2. **Mineurs : jamais de chiffre.** Équation pédiatrique distincte, et le
   résultat ne s'énonce pas.
3. **Position du coach.** Une doctrine qui interdit de compter ferme la porte.
4. **Aucun kcal ne sort vers l'élève par défaut.** `CALORIE_REVERSAL.md` §7 :
   la cible **contraint les grammages**, elle ne devient pas un chiffre affiché.
   Ton algorithme calcule en kcal/nutriments **en interne** et rend des
   **grammes d'aliment**.
5. **`member_portions` est lisible par TOUT le foyer.** Aucun fait de corps,
   aucun objectif, aucune calorie ne peut y transiter. Ce qui va à l'écran est
   du même côté de la frontière que « 400 g de cuisses de poulet » sur une
   liste de courses.
6. **Ce produit n'est pas un prescripteur médical.** Il compose des repas. La
   frontière entre « voici une répartition équilibrée » et « voici ton
   traitement » doit être explicite dans ta proposition.

---

## Les questions à travailler

### 1. Le socle chiffré — d'où viennent les nombres ?

⚠️ **N'invente aucune valeur de référence.** Cite les sources (ANSES, EFSA,
OMS/FAO), leurs populations de validité, et leurs désaccords. Où les
recommandations divergent, dis-le et propose un choix motivé plutôt qu'une
moyenne muette.

- Quelle équation d'entretien, et pourquoi celle-là ? (Le dépôt en utilise déjà
  une — la garder ou la changer est une décision, pas un détail.)
- Protéines : g/kg de poids ? de masse maigre estimée ? Le rythme de perte ou de
  prise change-t-il la cible ?
- Que fait-on des micronutriments ? Le référentiel ne porte que des
  **marqueurs booléens** (`ironSource`, `b12Source`…), pas des milligrammes.
  Est-ce suffisant pour piloter une répartition, ou faut-il enrichir la base ?

### 2. Le pont : besoins → grammes par groupe

C'est le cœur, et c'est un **problème sous-déterminé** : plusieurs répartitions
satisfont les mêmes besoins.

- Programme linéaire ? Heuristique de remplissage par priorité (protéine
  d'abord, puis légumes, puis féculent) ? Table de ratios par archétype ?
- Comment garantir qu'il rend une solution **cuisinable** et non une optimisation
  qui sert 340 g de lentilles et 12 g d'huile ?
- Quelles bornes de plausibilité (portion minimale, maximale) et **qui les
  décide** ?

### 3. Les habitudes déclarées

La demande : *« un sélecteur pour qu'on puisse avoir un calcul de calories,
nutriments, en mode crème au chocolat le soir »*.

- L'habitude **consomme** une part du budget du jour avant que le reste soit
  réparti — comment le modéliser sans que ça devienne un compte de calories
  affiché ?
- Le dépôt a déjà `fixed_intakes` (le shaker, la collation pesée) et
  `household_member_habits` (« ce qu'elle mange déjà »). Le sélecteur
  s'y branche-t-il, ou est-ce un troisième support ? ⚠️ Trois supports pour un
  même fait est le mode d'échec n°1 de ce dépôt.

### 4. L'incertitude, et ce qu'on en fait

- Que rend l'algorithme quand un ingrédient n'est **pas** résolu ? (Rappel : le
  zéro est interdit.)
- Comment s'abstient-il **partiellement** — assez pour rester utile, sans
  affirmer ce qu'il ne sait pas ?
- Quels compteurs faut-il, et avec quel dénominateur ? (Doctrine du dépôt : un
  compteur sans sa population est un compteur qui ment.)

### 5. Où ça s'insère

- Avant le modèle (contrainte d'entrée), après lui (correction de la sortie), ou
  les deux ?
- Le dépôt a déjà mesuré qu'un budget ouvert trop grand fait « déborder
  poliment » le modèle. Quel est le risque symétrique ici ?

---

## Ce qu'on attend en sortie

Un **document de conception**, pas du code. Qui contienne :

1. Le modèle de calcul, étape par étape, avec ses **sources chiffrées**.
2. La forme exacte de la sortie (types), et pourquoi cette maille.
3. Les cas d'abstention, nommés un par un.
4. Ce qui doit être **ajouté à la base** (colonnes, valeurs) et ce qui suffit tel
   quel.
5. Les questions produit qu'il faut trancher **avant** de coder, et une
   recommandation pour chacune.
6. Ce que tu proposes de **ne pas** faire, et pourquoi.

## ⛔ Ce qui rendrait ta réponse inutile

- Proposer de construire un référentiel de composition — **il existe**.
- Des chiffres sans source, ou une « moyenne des recommandations ».
- Un plan qui affiche des calories à l'élève.
- Ignorer le plancher TCA, les mineurs, ou la position du coach.
- Un optimiseur élégant qui rend des assiettes que personne ne cuisine.
- Traiter les contraintes ci-dessus comme des options à discuter.
