# Bilan de la campagne des 10 tirs — 2026-09-15

## 1. Bilan de livraison, par requête

| n | profil | bouches | HTTP | durée | appels | répar. | état du run | défauts | politique |
|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| 1 | 7 | 1 | 200 | 130.3 s | 1 | 0 | livrable_avec_ecarts | cell_bounds_off | sans appel (écart compté) |
| 2 | 9 | 4 | 200 | 136.9 s | 1 | 0 | livrable_avec_ecarts | cell_energy_off | sans appel (écart compté) |
| 3 | 7 | 1 | 200 | 105.6 s | 1 | 0 | livrable_avec_ecarts | cell_bounds_off | sans appel (écart compté) |
| 4 | 9 | 4 | 200 | 119.3 s | 1 | 0 | livrable_avec_ecarts | protein_floor_short, protein_floor_short, protein_floor_short | sans appel (écart compté) |
| 5 | 7 | 1 | 200 | 113.5 s | 1 | 0 | conforme | — | — |
| 6 | 9 | 4 | 200 | 109.4 s | 1 | 0 | livrable_avec_ecarts | protein_floor_short, protein_floor_short, protein_floor_short | sans appel (écart compté) |
| 7 | 7 | 1 | 200 | 129.9 s | 1 | 0 | conforme | — | — |
| 8 | 9 | 4 | 200 | 137.0 s | 1 | 0 | conforme | — | — |
| 9 | 7 | 1 | 200 | 120.1 s | 1 | 0 | conforme | — | — |
| 10 | 9 | 4 | 200 | 125.4 s | 1 | 0 | livrable_avec_ecarts | cell_bounds_off | sans appel (écart compté) |

| | résultat |
|---|---|
| tirs | 10 |
| plans écrits | 10 / 10 |
| sans rattrapage modèle | 10 / 10 |
| conformes | 4 / 10 ; livrables avec écart nommé : 6 |
| plans partis avec un écart compté SANS appel (nouvelle politique) | 6 |
| appels modèle | 10 pour 10 tirs, dont 0 auxiliaires de remplissage (2 s) |
| durées | min 105.6 s · médiane 122.8 s · p95 137.0 s · max 137.0 s ; sous 150 s : 10 / 10 ; sous 180 s : 10 / 10 |

### Par profil (au moins 4 sur 5 utilisables demandés)

| profil | tirs | conformes | avec écart | sans rattrapage | durées |
|---:|---:|---:|---:|---:|---|
| 7 | 5 | 3 | 2 | 5 | 130 · 106 · 114 · 130 · 120 s |
| 9 | 5 | 1 | 4 | 5 | 137 · 119 · 109 · 137 · 125 s |

## 2. Les cinq dénominateurs

```text
cases attendues      170    par personne, absences déduites
plats présents       170    manquantes : 0
portions calculées   170
portions mesurables  170    non mesurables : 0
portions conformes   169 / 170 (±10 %) · complètes 164 / 170
```

## 3. Les dix contrôles, sommés

| # | contrôle | conforme | non conforme | non mesurable |
|---|---|---:|---:|---:|
| 1 | calories du créneau ±10 % | 169 | 1 | 0 |
| 2 | grammage dans les bornes | 170 | 0 | 0 |
| 5 | journée couverte ±5 % | 70 | 0 | 0 |
| 6 | densité dans le couloir transmis | 165 | 5 | 0 |
| 8 | plancher protéique couvert | 64 | 6 | 0 |
| 3 | ingrédients | 1325 vérifiés / 1325 lignes | estimation 0 · attente 0 | non mesurables 0 |
| 7 | allergies déclarées | 5 bouche(s) avec matière | causes d'exclusion dans la garde : 0 | — |
| 9 | prose de recette périmée | 0 / 1325 | | |

## 4. Anomalies nommées

- tir 1 · Paul · densité · 2026-09-17  breakfast  [134–250] aim 147       [134–250] aim 147       [134–250] aim 147          125    ❌ HOR
- tir 1 · garde du RUN · cell_bounds_off · d61d8939-5b99-4cb8-9a7f-534ea2474ce9 · thu · breakfast
- tir 2 · Nils · non conforme · 2026-09-17  breakfast      716.75        716.75    716.75     640.00    -10.71 %  ❌ NON CONFORME
- tir 2 · garde du RUN · cell_energy_off · 1cd96fe2-3052-49d0-ab6e-cba8f69d27f4 · thu · breakfast
- tir 3 · Paul · densité · 2026-09-16  breakfast  [134–250] aim 147       [134–250] aim 147       [134–250] aim 147          133    ❌ HOR
- tir 3 · garde du RUN · cell_bounds_off · 0cf07099-b5d0-4f18-8d0a-3f61cb7ac9bb · wed · breakfast
- tir 4 · Paul · protéines · 2026-09-15          35 %                62     57.5 g  ❌ SOUS LE PLANCHER COUVERT (−7 %)
- tir 4 · Paul · protéines · 2026-09-16         100 %               176    171.0 g  ❌ SOUS LE PLANCHER COUVERT (−3 %)
- tir 4 · Paul · protéines · 2026-09-17         100 %               176    175.1 g  ❌ SOUS LE PLANCHER COUVERT (−1 %)
- tir 4 · garde du RUN · protein_floor_short · d0a28869-cabe-4148-b54e-c4ad650bdda9 · 2026-09-15 · None
- tir 4 · garde du RUN · protein_floor_short · d0a28869-cabe-4148-b54e-c4ad650bdda9 · 2026-09-16 · None
- tir 4 · garde du RUN · protein_floor_short · d0a28869-cabe-4148-b54e-c4ad650bdda9 · 2026-09-17 · None
- tir 6 · Paul · protéines · 2026-09-15          35 %                62     60.3 g  ❌ SOUS LE PLANCHER COUVERT (−3 %)
- tir 6 · Paul · protéines · 2026-09-16         100 %               176    160.4 g  ❌ SOUS LE PLANCHER COUVERT (−9 %)
- tir 6 · Paul · protéines · 2026-09-17         100 %               176    150.3 g  ❌ SOUS LE PLANCHER COUVERT (−15 %)
- tir 6 · garde du RUN · protein_floor_short · e2bf510e-aa2f-4afa-8c36-e28afa586a10 · 2026-09-15 · None
- tir 6 · garde du RUN · protein_floor_short · e2bf510e-aa2f-4afa-8c36-e28afa586a10 · 2026-09-16 · None
- tir 6 · garde du RUN · protein_floor_short · e2bf510e-aa2f-4afa-8c36-e28afa586a10 · 2026-09-17 · None
- tir 9 · Paul · densité · 2026-09-16  dinner     [107–250] aim 118       [107–250] aim 118       [250–250] aim 250 ⛔        107    ❌ HOR
- tir 9 · Paul · densité · 2026-09-17  lunch      [214–250] aim 235       [214–250] aim 235       [214–250] aim 235          214    ❌ HOR
- tir 10 · Paul · densité · 2026-09-16  lunch      [141–250] aim 154       [141–250] aim 154       [141–250] aim 154          140    ❌ HOR
- tir 10 · garde du RUN · cell_bounds_off · e5b11209-3e8c-4ef9-ac15-1e2f84f5e6e6 · wed · lunch

## 5. Les seuils de la passation (§ 3.3)

| critère | mesuré | seuil | verdict |
|---|---:|---:|---|
| plans livrés (HTTP 200) | 10 / 10 | — | — |
| sans rattrapage modèle | 10 / 10 | 24 / 10 | ⛔ |
| utilisables = conformes (D3 : un écart nommé ne compte pas) | 4 / 10 | 27 / 10 | ⛔ |
| p95 de disponibilité ≤ 180 s (D1) | 137.0 s | 180 s | ✅ |
| aucun 546 / 502 inexpliqué | 0 | 0 | ✅ |
