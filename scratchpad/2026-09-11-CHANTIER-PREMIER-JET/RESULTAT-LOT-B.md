# Lot B — unifier les masses, les calories et les portions · LIVRÉ

`preparation_mass.ts` (neuf) + `preparation_mass_test.ts` (12 tests) +
`portion_unified_measure_test.ts` (8 tests). `box_densify.ts`, `portion_sizing.ts`,
`mouth_energy.ts` modifiés. Suite : **6 519 verts · 3 rouges** (les trois préexistants).

## Ce qui est prouvé

**Le 811/901 g est fermé, et le test a d'abord été rouge.** La fixture vient des données réelles
(plan `a18f522e`, samedi déjeuner, 10 fiches copiées du référentiel). Le test rejoue d'abord
**l'arithmétique d'avant** et retrouve les cinq nombres du § 4 de l'enquête à l'unité — 20 ·
548,5 · 332,5 · **901** · **811** — ce qui prouve que le décor est la vraie case ; puis il tient
le comportement neuf.

- **Un seul lecteur** : `weighedReadyGrams` délègue (signature inchangée, 8 appelants intacts) ;
  `densityFromComposition`, `potDensities`, `applySizing`, `applySizingForEaters` et
  `standardPortionOf` passent tous par `measurePreparation`. Test : les trois lecteurs rendent
  le même kcal/g sur deux casseroles aux règles d'eau **opposées**.
- **Prélèvements réels** : 390 g et 130 g tirés de la même casserole donnent **525 et 175 kcal**
  — rapport 3, et surtout pas 350/350.
- **`finalPortionCheck`** mesure les grammes **écrits**, **sans aucune exception de population** :
  un foyer d'une bouche rend `measured: true` et attrape 1 040 g contre 700.
- **Cible explicite** : `(2454+2602)/2 = 2528 ≠ 2454`, et la substitution est **observable** (le
  couloir bouge strictement) — le test rougirait si quelqu'un cessait de lire la cible donnée.
- **`Dpréf`** inchangé ; ajout de `targetAnchoredPer100G` **brut** et de
  `anchorDivergencePer100G`. A15 cité en tête.

## Les arbitrages du lot B

| Question | Décision | Raison |
|---|---|---|
| Le biais de la pincée : gardé ou corrigé ? | **Corrigé** | La part d'une casserole comptait les lignes sans `amount` (pincée de sel) **entières** dans chaque part, alors qu'`applySizing` écrit `readyG ÷ tirages`, condiments compris. **Mesuré** : 3 parts de couscous réclamaient **997,5 g** d'un pot qui en produit **986,5**. Coût : l'assiette passe de 901 à **896,8 g** (−0,46 %) |
| `discarded` déduit de la prose de la méthode ? | **Non, aucun mot lu** | La méthode réelle du couscous dit « **égrener** avec l'huile » — un matcher artisanal l'aurait pris pour un égouttage. `discarded` ne vient que d'un champ structuré, **que personne n'écrit encore** : l'état est atteignable et testé, jamais deviné |
| `legume_absorbs` traité comme `grain_absorbs` ? | **Non** | Des lentilles mijotées dans une eau qui reste au fond ne sont pas du riz pilaf, et l'enquête l'écrit. Comportement d'avant conservé — mais **par casserole** |
| Tolérance des 5 % : par composant ou par assiette ? | **Par assiette** | C'est la règle déjà mesurée de `boxKcalByItems` : juger le frais seul rendait 188–342 g/jour illisibles |
| Méthode de friture : celle du plat ou de la casserole ? | **Celle de la casserole** | La liste aplatie faisait porter la méthode du plat à toutes les casseroles ; `potDensities` faisait déjà l'inverse |
| `proteinG` sur `BoxEnergy` ? | **Type à part** (`BoxNutrition extends BoxEnergy`) | `box_energy_decision_test.ts` construit des `BoxEnergy` littéraux et n'a rien à voir avec la protéine |
| Compteur de divergence `Dpréf` : global ou par appel ? | **Par appel** | Le module est pur ; un compteur à mémoire ferait deux réponses pour la même entrée |
| Un bac collectif est-il jugé par `finalPortionCheck` ? | **Non, et c'est compté** (`tubsNotJudged`) | Les grammes d'un contenant à plusieurs noms sont une quantité de récipient, pas une prescription (v4) |

## ⚠️ La correction que le lot B apporte à mon brief

Je demandais de retirer `return off("single_mouth")` (`index.ts:7680`). **C'est faux** : à une
bouche, `shadowSizing` ferait de l'ombre à un chemin `portion_v1` qui pose réellement.
**C'est le contrôle final qui devait cesser de s'abstenir**, pas l'ombre. Le lot E branche donc
`finalPortionCheck` à ~13525, là où `finalSizing` appelle aujourd'hui `shadowSizing()`.

## Ce qui reste sans appelant (moitié manquante, à brancher par E)

`finalPortionCheck`, `potProteinPerGram`, `BoxNutrition.proteinG`.

## Demandes aux voisins

- **Lot C** : `preparationReadyGrams` / `preparationReadyKcal` (`meal_generation.ts` ~5270/~5320)
  sont un 2ᵉ et 3ᵉ lecteur de la règle d'eau. Déjà par casserole, donc pas faux — mais à
  **arbitrer**, pas à remplacer mécaniquement : ils lisent `ing.gramsRaw` et rendent `null` au
  premier ingrédient non pesé, sémantique différente.
- **Lot C** : un champ `water_treatment` sur une préparation ferait vivre le 3ᵉ état ; il est
  **déjà lu** par `measurePreparation` et n'attend qu'un écrivain.
