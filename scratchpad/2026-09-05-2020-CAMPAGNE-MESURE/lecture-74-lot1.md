# Lecture 74 — lot 1 (M01–M12), énergie par bouche, lecture seule

Outils : `lecture-74.sh` (cibles par `estimatedMaintenanceFor`/`executedPaceFor` ; livré par
`40-boites.ts` = plat + casseroles au prorata `uses.servings/servings_made`, part de boîte par
grammes du couvercle, bac divisé par ses mangeurs ; `analyse.ts` pour le solo). Un tirage par
cas : on lit des ordres de grandeur, jamais un taux. Sortie brute : `lecture-74-lot1.txt`.

## 1. Livré contre cible, par bouche et par jour (boîtes)

| cas | fixture | bouche (cible kcal/j) | livré kcal/j | protéine g/j | masse non résolue | `unmet_band ≥200` |
|---|---|---|---|---|---|---|
| M01 | solo, perte | 2 059–2 175 | **1 441** (70 %) sur 5 jours pleins | 97 (59 % de 164) | 1/109 termes | verdict `below/under` |
| M02 | solo minimal 3 j | 2 059–2 175 | **2 277** (111 %) sur 2 jours | 156 (95 %) | 0 | `within/under` |
| M05 | quatre balanced | Paul 2 200 · Claire 1 986 · Léo 2 459 · Nora 1 926 | 1 795 · 1 327 · 1 327 · 1 428 | 124 · 95 · 95 · 98 | 5 % | 12/12 |
| M06 | quatre minimal | idem | 1 597 · 1 262 · 1 262 · 1 270 | 148 · 117 · 117 · 118 | 0 % | 12/12 |
| M07 | cinq keen | Sonia 1 648 · Marc 4 226 · Léa 2 418 · Tom 2 324 · Zoé 1 622 | **184 · 379 · 204 · 204 · 204** ⚠️ artefact, voir §2 | 7–16 | 9 % | 8/8 |
| M08 | cinq minimal | idem | 268 · 582 · 274 · 274 · 274 (6 boîtes, `uses.servings` = 5 : lecture saine mais plan 100 % végétal peu dense) | 13–28 | 19 % | 8+4/12 |
| M09 | cinq balanced 3 j | idem | 439 · 786 · 433 · 433 · 433 (2 jours, 5 boîtes à un nom) | 18–32 | 0 % | 3/3 |
| M10 | quatre keen | Paul/Claire/Léo/Nora | 1 519 · 1 844 · 1 844 · 1 399 — **sur 2 jours composés / 6** | 93–104 | 0 % | 2/2 |
| M11 | duo, 14 h | Julie 2 007 · Marc 2 179 | 750 · 818 | 51 · 56 | 5 % | 10/10 |
| M12 | duo, 23 h | idem | 526 · 577 | 33 · 36 | 12 % | 8/8 |

Solo : M02 (3 jours, minimal) tient l'enveloppe — c'est le premier plan solo mesuré ≥ 100 % de la
borne basse depuis le 23 août ; M01 reste à 70 % (deux tirages sur trois sous v27 : 88 % puis 70 %).

## 2. ⚠️ Le déficit du foyer de cinq est d'abord un artefact d'ATTRIBUTION — dans l'outil ET dans le moteur

Sur M07, les boîtes tirent **34 417 g** des casseroles alors que le pliage n'en attribue que
**5 826 g** aux plats (×5,9) : le modèle a écrit `uses.servings: 1` sur des casseroles de 10 à
15 parts pendant que cinq bouches mangent 3 kg par repas. Le pliage (`foldPreparationsIntoDishes`,
`share = servings / servingsMade`) donne alors 1/15 de casserole à un repas de 3 kg, et l'énergie
lue tombe à 0,2 kcal/g. **Le moteur lit exactement le même pliage** (`mouth_energy.ts` → `day.kcal`
de l'ancre) : sur ce plan, « 8/8 journées-bouche ≥ 200 kcal sous le besoin » et
`no_dense_target` sont des conséquences de l'attribution, pas de l'assiette.

Écart d'attribution par plan (grammes tirés par les boîtes / grammes de casserole attribués) :

| M05 | M06 | M07 | M08 | M09 | M10 | M11 | M12 |
|---|---|---|---|---|---|---|---|
| ×1,1 | ×1,0 | **×5,9** | ×1,0 | ×1,3 | ×1,3 | ×1,3 | ×1,6 |

`uses.servings` vaut 1 sur 36/39 plats de M05, 44/44 de M06, 11/12 de M07, 11/11 de M11, 19/19 de
M12 — quel que soit le nombre de bouches. Il n'est corrigé nulle part côté foyer (aucune
écriture de `uses[].servings` dans l'index ; le seul exemple du prompt dit `"servings": 1`).

**Ce que ça implique pour l'arbitrage 1** : avant de changer le plafond, rendre la lecture de
l'énergie indépendante de la convention du modèle — l'énergie d'une boîte qui cite une casserole
= grammes tirés × (kcal de la casserole / grammes prêts de la casserole), ou `uses.servings`
dérivé de ce que les boîtes tirent. Sinon le nouveau plafond se calculera sur une densité et un
livré faux d'un facteur 1,3 à 6 selon le plan. Compteur à poser : `Σ tiré par les boîtes / Σ
attribué par uses`, par plan.

## 3. Ce qui tient dans la lecture énergie

- Densité réelle des boîtes (kcal/g), là où l'attribution est saine : M05 1,57 · M06 1,69 ·
  M10 1,65 · M11 1,02 · M12 0,84 — les foyers de quatre sont **au-dessus** de la constante 1,35
  (v27 a porté) ; les duos restent bas (raviolis, plats mijotés).
- Aucune boîte à énergie illisible (colonne « g sans énergie lisible » = 0 partout) : les termes
  non résolus (raviolis, orzo, pâte à pizza, comté, « poulet roti » sans accent) pèsent 0–19 % de
  la masse, jamais un plat entier.
- M10 : 2 jours composés sur 6 (confirmé : `jours composés 2 (fenêtre 6)`), une session — le plan
  tronqué est accepté et la rationale annonce trois sessions.

## 4. Explication IA (lane foyer)

Présente 8/8 sur le foyer, absente 2/2 sur le solo. Nomme un arbitrage réel sur M07, M08, M09,
M11, M12 (raviolis/champignons de Marc, pizza du vendredi, envie remplacée) ; générique sur M05,
M06, M10 (« la base commune reste végétale… »). M09 dit que l'envie a été remplacée — arbitrage
nommé mais contraire à « a pizza is a pizza ».
