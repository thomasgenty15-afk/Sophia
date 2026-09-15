# Bilan de la campagne des 30 tirs — 2026-09-15

**Version figée : `62815cfe`** (lots 1 à 4, plus la décision « aucun appel de réparation sans défaut
bloquant »). Trente demandes réelles, séquentielles, par Kong et le `functions serve` local, six
profils × cinq, un compte de fixture neuf par tir, aucune relance. De 13:26 à 14:26. Mesure :
`figer-demande.ts` → `analyse-lot-F.ts` sur chaque artefact, journal moteur archivé par tir.
Preuves : `scratchpad/2026-09-11-CLOTURE/fixtures/c30-*.json`,
`scratchpad/2026-09-15-BETA-PREUVES/mesure-30/`, `mesures-campagne-30.json`.

## Verdict : **bêta bloquée sur un critère, les plans conformes — tout le reste passe**

| critère de la passation § 3.3 | mesuré | seuil | |
|---|---:|---:|---|
| plans livrés | 27 / 30 | — | 3 refus, tous expliqués |
| sans rattrapage modèle | 26 / 30 | 24 / 30 | ✅ |
| **utilisables = conformes** (D3 : un écart nommé ne compte pas) | **14 / 30** | 27 / 30 | ⛔ |
| au moins 4 sur 5 par profil | 1 profil sur 6 | 6 sur 6 | ⛔ |
| p95 de disponibilité | 139 s | 180 s (D1) | ✅ |
| 546 / 502 inexpliqués, verrous laissés | 0 · 0 | 0 | ✅ |
| une réparation réelle utile | oui à N=4 (tir 18), non à N=2 (tir 1) | N=2 et N=4 | ⚠️ à moitié |

⛔ **Trente tirs font un taux, mais un seul.** Ils décrivent ce modèle, ce catalogue, cette heure,
sur une pile locale. Ils ne se comparent aux huit du matin ni aux campagnes d'avant.

## Ce qui bloque, en chiffres

Treize plans livrés portent un écart nommé. Les causes, sur les 27 plans livrés :

| cause de la garde (toutes en comptage) | plans | occurrences | profils | ce que l'instrument mesure |
|---|---:|---:|---|---|
| `protein_floor_short` | 4 | 10 | N=4 seulement (Paul) | **−0 % à −4 %** sous le plancher couvert : 173,7 · 171,0 · 172,8 · 171,7 · 171,1 · 172,1 g pour 176 ; 59,6 · 59,8 · 60,7 · 61,9 g pour 62 |
| `cell_bounds_off` | 5 | 6 | 7 (maintien), 8 (N=2 végane) | densité **à 1 point du couloir** : 133 pour [134–250], 99 et 100 pour [100–182], 99 pour [101–250], 250 pour [214–250] |
| `cell_energy_off` | 3 | 5 | 1, 6, 7 | des repas à **−12 %, −15 %, −18 %, +13 %, +13 %** — les seuls vrais ratés de composition |
| `day_energy_off` | 2 | 2 | 6, 7 | −7,8 % ; −5,2 % sur une journée partielle |
| `own_meal_dish_missing` | 1 | 1 | 9 | un plat à part non servi, après réparation d'une composante interdite |

**Neuf des treize écarts sont à moins de 4 % de leur seuil**, sur des grandeurs dont les portions
sont arrondies au gramme et les densités à l'unité. Le plancher protéique n'a aucune tolérance
d'arrondi ; le couloir de densité non plus. Ce ne sont pas des tolérances nutritionnelles à
élargir — c'est la borne d'arrondi que les assiettes portent déjà et que ces deux contrôles ne
reçoivent pas. Les quatre autres (repas à ±12–18 %) sont de vrais ratés du premier jet.

Si les neuf écarts d'arrondi ne comptaient pas : **23 / 30** conformes. Toujours sous 27. Si un plan
avec écart nommé comptait comme utilisable (la lecture contraire de D3) : **27 / 30**, exactement le
seuil. Ces deux nombres sont ceux que le propriétaire doit avoir sous les yeux.

## Les trois refus, expliqués un par un

| tir | profil | cause | ce qui s'est passé | famille |
|---|---|---|---|---|
| 1 | 8 · N=2 végane | `mouth_unfed`, 12 cases sans plat | le premier jet n'a écrit que le mardi sur une fenêtre de trois jours ; 18 défauts bloquants ; deux réparations (2 appels + 2 remplissages) n'ont pas ramené les six repas manquants par bouche | **premier jet** |
| 6 | 6 · duo, allergie | `preparation_quantity_unreconciled` | `prep_cod` : 1 041 g prêts pour 1 066 g prélevés ; la recette est « 8 unités de cabillaud + une pincée d'herbes », deux lignes que la croissance ne sait pas faire grossir de 25 g | **moteur** — lignes en unités |
| 13 | 1 · perte | `preparation_quantity_unreconciled` | `prep_egg_batch` : 352 g pour 363 g ; « 12 blancs d'œufs + 2 œufs entiers », même impossibilité, −11 g | **moteur** — lignes en unités |

Deux refus sur trois viennent d'un seul défaut déterministe du moteur : une casserole écrite en
unités comptables ne peut pas grossir de quelques grammes, et la publication refuse le plan entier
pour 2 à 3 % de manque. Aucun appel modèle n'a été dépensé dessus — la politique a correctement vu
qu'aucun appel ne pouvait le réparer. Ni l'un ni l'autre n'était un défaut du modèle.

## La nouvelle politique de réparation, mesurée

| | |
|---|---|
| plans partis avec un écart compté **sans appel** | 18 |
| réparations sur défaut **bloquant** | 2 tirs : tir 18 (N=4) une composante interdite servie à la bouche végane, **un appel, la violation disparaît**, plan livré ; tir 1 (N=2) douze repas absents, deux appels, échec, refus |
| appels modèle | 36 pour 30 tirs — 30 compositions, 3 réparations, 3 remplissages de 2 s |
| durées | médiane 107 s · p95 139 s · max 207 s (le tir réparé) · 26 sur 27 sous 150 s |

Hier, deux réparations sur des écarts comptés avaient coûté quatre appels pour rien. Aujourd'hui,
le seul appel de réparation qui a réussi a fermé une violation de régime — le cas exact pour lequel
la réparation existe.

## Ce que l'instrument a mesuré sur les 27 plans livrés

## 1. Bilan de livraison, par requête

| n | profil | bouches | HTTP | durée | appels | répar. | état du run | défauts | politique |
|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| 1 | 8 | 2 | 422 | 160.6 s | 5 | 2 | refusé | — | réparé (défaut bloquant) |
| 2 | 9 | 4 | 200 | 130.8 s | 1 | 0 | livrable_avec_ecarts | protein_floor_short, protein_floor_short, protein_floor_short | sans appel (écart compté) |
| 3 | 1 | 1 | 200 | 134.2 s | 1 | 0 | conforme | — | — |
| 4 | 2 | 1 | 200 | 104.3 s | 1 | 0 | conforme | — | — |
| 5 | 7 | 1 | 200 | 106.4 s | 1 | 0 | livrable_avec_ecarts | cell_energy_off, cell_energy_off, day_energy_off | sans appel (écart compté) |
| 6 | 6 | 2 | 422 | 141.1 s | 1 | 0 | refusé | — | sans appel (écart compté) |
| 7 | 1 | 1 | 200 | 93.3 s | 1 | 0 | conforme | — | — |
| 8 | 2 | 1 | 200 | 115.5 s | 1 | 0 | conforme | — | — |
| 9 | 7 | 1 | 200 | 85.2 s | 1 | 0 | livrable_avec_ecarts | cell_bounds_off | sans appel (écart compté) |
| 10 | 6 | 2 | 200 | 94.9 s | 1 | 0 | conforme | — | sans appel (écart compté) |
| 11 | 8 | 2 | 200 | 97.9 s | 1 | 0 | conforme | — | — |
| 12 | 9 | 4 | 200 | 112.6 s | 1 | 0 | livrable_avec_ecarts | protein_floor_short, protein_floor_short, protein_floor_short | sans appel (écart compté) |
| 13 | 1 | 1 | 422 | 121.9 s | 1 | 0 | refusé | — | sans appel (écart compté) |
| 14 | 2 | 1 | 200 | 89.6 s | 1 | 0 | conforme | — | sans appel (écart compté) |
| 15 | 7 | 1 | 200 | 107.0 s | 1 | 0 | conforme | — | sans appel (écart compté) |
| 16 | 6 | 2 | 200 | 86.3 s | 1 | 0 | livrable_avec_ecarts | day_energy_off | sans appel (écart compté) |
| 17 | 8 | 2 | 200 | 113.2 s | 1 | 0 | livrable_avec_ecarts | cell_bounds_off | sans appel (écart compté) |
| 18 | 9 | 4 | 200 | 206.9 s | 2 | 1 | livrable_avec_ecarts | own_meal_dish_missing, protein_floor_short, protein_floor_short, protein_floor_short | réparé (défaut bloquant) |
| 19 | 1 | 1 | 200 | 120.4 s | 1 | 0 | livrable_avec_ecarts | cell_energy_off | sans appel (écart compté) |
| 20 | 2 | 1 | 200 | 134.4 s | 1 | 0 | conforme | — | — |
| 21 | 7 | 1 | 200 | 119.9 s | 1 | 0 | livrable_avec_ecarts | cell_bounds_off | sans appel (écart compté) |
| 22 | 6 | 2 | 200 | 83.9 s | 1 | 0 | livrable_avec_ecarts | cell_energy_off, cell_energy_off | sans appel (écart compté) |
| 23 | 8 | 2 | 200 | 111.7 s | 1 | 0 | conforme | — | — |
| 24 | 9 | 4 | 200 | 128.5 s | 1 | 0 | livrable_avec_ecarts | protein_floor_short | sans appel (écart compté) |
| 25 | 1 | 1 | 200 | 139.2 s | 1 | 0 | conforme | — | — |
| 26 | 2 | 1 | 200 | 91.5 s | 1 | 0 | conforme | — | — |
| 27 | 7 | 1 | 200 | 96.3 s | 2 | 0 | livrable_avec_ecarts | cell_bounds_off | sans appel (écart compté) |
| 28 | 6 | 2 | 200 | 98.6 s | 1 | 0 | conforme | — | — |
| 29 | 8 | 2 | 200 | 102.9 s | 1 | 0 | livrable_avec_ecarts | cell_bounds_off, cell_bounds_off | sans appel (écart compté) |
| 30 | 9 | 4 | 200 | 112.0 s | 1 | 0 | conforme | — | — |

| | résultat |
|---|---|
| tirs | 30 |
| plans écrits | 27 / 30 |
| sans rattrapage modèle | 26 / 30 |
| conformes | 14 / 30 ; livrables avec écart nommé : 13 |
| plans partis avec un écart compté SANS appel (nouvelle politique) | 18 |
| appels modèle | 36 pour 30 tirs, dont 3 auxiliaires de remplissage (2 s) |
| durées | min 83.9 s · médiane 107.0 s · p95 139.2 s · max 206.9 s ; sous 150 s : 26 / 27 ; sous 180 s : 26 / 27 |

### Par profil (au moins 4 sur 5 utilisables demandés)

| profil | tirs | conformes | avec écart | sans rattrapage | durées |
|---:|---:|---:|---:|---:|---|
| 1 | 5 | 3 | 1 | 4 | 134 · 93 · 122 · 120 · 139 s |
| 2 | 5 | 5 | 0 | 5 | 104 · 115 · 90 · 134 · 91 s |
| 6 | 5 | 2 | 2 | 4 | 141 · 95 · 86 · 84 · 99 s |
| 7 | 5 | 1 | 4 | 5 | 106 · 85 · 107 · 120 · 96 s |
| 8 | 5 | 2 | 2 | 4 | 161 · 98 · 113 · 112 · 103 s |
| 9 | 5 | 1 | 4 | 4 | 131 · 113 · 207 · 129 · 112 s |

## 2. Les cinq dénominateurs

```text
cases attendues      380    par personne, absences déduites
plats présents       345    manquantes : 0
portions calculées   345
portions mesurables  344    non mesurables : 1
portions conformes   339 / 344 (±10 %) · complètes 334 / 345
```

## 3. Les dix contrôles, sommés

| # | contrôle | conforme | non conforme | non mesurable |
|---|---|---:|---:|---:|
| 1 | calories du créneau ±10 % | 339 | 5 | 1 |
| 2 | grammage dans les bornes | 345 | 0 | 0 |
| 5 | journée couverte ±5 % | 142 | 2 | 1 |
| 6 | densité dans le couloir transmis | 336 | 8 | 1 |
| 8 | plancher protéique couvert | 133 | 11 | 1 |
| 3 | ingrédients | 2294 vérifiés / 2296 lignes | estimation 0 · attente 1 | non mesurables 1 |
| 7 | allergies déclarées | 9 bouche(s) avec matière | causes d'exclusion dans la garde : 0 | — |
| 9 | prose de recette périmée | 0 / 2296 | | |

## 4. Anomalies nommées

- tir 2 · Paul · protéines · 2026-09-15          35 %                62     59.6 g  ❌ SOUS LE PLANCHER COUVERT (−4 %)
- tir 2 · Paul · protéines · 2026-09-16         100 %               176    173.7 g  ❌ SOUS LE PLANCHER COUVERT (−1 %)
- tir 2 · Paul · protéines · 2026-09-17         100 %               176    171.0 g  ❌ SOUS LE PLANCHER COUVERT (−3 %)
- tir 2 · garde du RUN · protein_floor_short · 8516d1ec-2e6c-4e6c-a0c0-ef83535e020d · 2026-09-15 · None
- tir 2 · garde du RUN · protein_floor_short · 8516d1ec-2e6c-4e6c-a0c0-ef83535e020d · 2026-09-16 · None
- tir 2 · garde du RUN · protein_floor_short · 8516d1ec-2e6c-4e6c-a0c0-ef83535e020d · 2026-09-17 · None
- tir 5 · Paul · non conforme · 2026-09-16  breakfast      841.47        841.47    841.47     740.78    -11.97 %  ❌ NON CONFORME
- tir 5 · Paul · non conforme · 2026-09-16  dinner         673.18        673.18    673.18     548.86    -18.47 %  ❌ NON CONFORME
- tir 5 · Paul · journée · 2026-09-16      3           3         2861.00        2861.00    2637.53     -7.81 %  ❌ NON CONFORME
- tir 5 · Paul · densité · 2026-09-16  breakfast  [134–250] aim 147       [134–250] aim 147       [134–250] aim 147          118    ❌ HOR
- tir 5 · Paul · densité · 2026-09-16  dinner     [107–250] aim 118       [107–250] aim 118       [250–250] aim 250 ⛔         87    ❌ HOR
- tir 5 · garde du RUN · cell_energy_off · e2718f0b-542f-4f80-aed9-3b414b9f4cd7 · wed · breakfast
- tir 5 · garde du RUN · cell_energy_off · e2718f0b-542f-4f80-aed9-3b414b9f4cd7 · wed · dinner
- tir 5 · garde du RUN · day_energy_off · e2718f0b-542f-4f80-aed9-3b414b9f4cd7 · 2026-09-16 · None
- tir 9 · Paul · densité · 2026-09-16  breakfast  [134–250] aim 147       [134–250] aim 147       [134–250] aim 147          133    ❌ HOR
- tir 9 · garde du RUN · cell_bounds_off · 793c98de-1626-499a-ba08-fbdb57fcea9e · wed · breakfast
- tir 12 · Paul · protéines · 2026-09-15          35 %                62     59.8 g  ❌ SOUS LE PLANCHER COUVERT (−4 %)
- tir 12 · Paul · protéines · 2026-09-16         100 %               176    172.8 g  ❌ SOUS LE PLANCHER COUVERT (−2 %)
- tir 12 · Paul · protéines · 2026-09-17         100 %               176    171.7 g  ❌ SOUS LE PLANCHER COUVERT (−2 %)
- tir 12 · garde du RUN · protein_floor_short · 41b382a3-f08e-4abc-9d9b-373f6159a62e · 2026-09-15 · None
- tir 12 · garde du RUN · protein_floor_short · 41b382a3-f08e-4abc-9d9b-373f6159a62e · 2026-09-16 · None
- tir 12 · garde du RUN · protein_floor_short · 41b382a3-f08e-4abc-9d9b-373f6159a62e · 2026-09-17 · None
- tir 16 · Paul · journée · 2026-09-15      1           1          858.90        2454.00     814.61     -5.16 %  ❌ NON CONFORME
- tir 16 · garde du RUN · day_energy_off · d6e7c74a-0757-42c2-a1b3-451d81f52b1d · 2026-09-15 · None
- tir 17 · Lea · densité · 2026-09-17  breakfast  [100–182] aim 110       [100–182] aim 110       [100–182] aim 110           99    ❌ HOR
- tir 17 · garde du RUN · cell_bounds_off · c6886e6b-95ae-4ab3-9203-afa0606470ee · thu · breakfast
- tir 18 · Paul · protéines · 2026-09-15          35 %                62     60.7 g  ❌ SOUS LE PLANCHER COUVERT (−2 %)
- tir 18 · Paul · protéines · 2026-09-16         100 %               176    171.1 g  ❌ SOUS LE PLANCHER COUVERT (−3 %)
- tir 18 · Paul · protéines · 2026-09-17         100 %               176    171.0 g  ❌ SOUS LE PLANCHER COUVERT (−3 %)
- tir 18 · garde du RUN · own_meal_dish_missing · 1732e035-6b23-4fd2-b770-c81fdde81bb4 · wed · dinner
- tir 18 · garde du RUN · protein_floor_short · ffa87d33-1909-4c20-b41a-d17162d8f7f8 · 2026-09-15 · None
- tir 18 · garde du RUN · protein_floor_short · ffa87d33-1909-4c20-b41a-d17162d8f7f8 · 2026-09-16 · None
- tir 18 · garde du RUN · protein_floor_short · ffa87d33-1909-4c20-b41a-d17162d8f7f8 · 2026-09-17 · None
- tir 19 · Paul · non conforme · 2026-09-16  breakfast      613.50        613.50    613.50     523.00    -14.75 %  ❌ NON CONFORME
- tir 19 · Paul · densité · 2026-09-16  breakfast  [100–245] aim 110       [100–245] aim 110       [100–245] aim 110           85    ❌ HOR
- tir 19 · garde du RUN · cell_energy_off · 7b822285-d636-4654-8bdc-107a13536bb8 · wed · breakfast
- tir 21 · Paul · densité · 2026-09-17  lunch      [214–250] aim 235       [214–250] aim 235       [214–250] aim 235          250    ❌ HOR
- tir 21 · garde du RUN · cell_bounds_off · d084c764-9e4a-42ff-bab4-a1e313261666 · thu · lunch
- tir 22 · Paul · non conforme · 2026-09-16  breakfast      613.50        613.50    613.50     692.40    +12.86 %  ❌ NON CONFORME
- tir 22 · Lea · non conforme · 2026-09-16  breakfast      456.50        456.50    456.50     514.60    +12.73 %  ❌ NON CONFORME
- tir 22 · garde du RUN · cell_energy_off · bb021558-8ea5-4c1b-85ee-81cc85c7c9e1 · wed · breakfast
- tir 22 · garde du RUN · cell_energy_off · ccbb7998-0b84-4c7e-8959-ea69e225e38e · wed · breakfast
- tir 24 · Paul · protéines · 2026-09-17         100 %               176    172.1 g  ❌ SOUS LE PLANCHER COUVERT (−2 %)
- tir 24 · garde du RUN · protein_floor_short · 9644a294-f259-44db-a39a-d569ce45fc99 · 2026-09-17 · None
- tir 27 · Paul · non mesurable · 2026-09-16  lunch         1346.35       1346.35   1346.35          —           —  ⚪ non mesurable (dish_incomp
- tir 27 · Paul · journée · 2026-09-16      3           2         2861.00        2861.00    1509.55           —  ⚪ non mesurable — 1 porti
- tir 27 · Paul · densité · 2026-09-16  lunch      [214–250] aim 235       [214–250] aim 235       [214–250] aim 235            —    ⚪ non
- tir 27 · Paul · protéines · 2026-09-16         100 %               138          —  ⚪ non mesurable — une portion de la journée manque
- tir 27 · garde du RUN · cell_bounds_off · b77a1536-1d48-43a8-8161-9037eb33f382 · wed · lunch
- tir 29 · Lea · densité · 2026-09-16  dinner     [101–250] aim 110       [101–250] aim 110       [250–250] aim 250 ⛔         99    ❌ HOR
- tir 29 · Lea · densité · 2026-09-17  breakfast  [100–182] aim 110       [100–182] aim 110       [100–182] aim 110          100    ❌ HOR
- tir 29 · garde du RUN · cell_bounds_off · d3ef911a-c8bb-4e92-8f5c-fad5c6fe5d67 · wed · dinner
- tir 29 · garde du RUN · cell_bounds_off · d3ef911a-c8bb-4e92-8f5c-fad5c6fe5d67 · thu · breakfast
- tir 30 · Paul · protéines · 2026-09-15          35 %                62     61.9 g  ❌ SOUS LE PLANCHER COUVERT (−0 %)



## Prouvé · échoue · non mesurable

**Prouvé**

- 27 plans écrits, 0 verrou laissé, 0 code 546 ni 502, 0 dépassement de 380 s ; l'issue de chaque demande lue en base après le tir.
- 345 parts attendues sur les plans livrés : **345 plats, 345 boîtes, 0 manquante**. Le premier jet écrit toutes les cases quand il écrit la fenêtre entière.
- 339 portions sur 344 mesurables dans leur cible calorique ±10 %, 345 sur 345 dans leurs bornes de masse.
- 2 294 lignes d'ingrédient sur 2 296 résolues sur une référence vérifiée ; 0 estimation de groupe ; 0 prose de recette périmée.
- 9 bouches avec une allergie déclarée, 0 cause d'exclusion, de régime ou d'allergène sur les 27 plans livrés — et la seule violation de régime du premier jet (tir 18) a été **réparée avant livraison**.
- Le contrôle d'énergie par bouche a conclu sur les 27 plans ; aucun contrôle essentiel non exécuté.

**Échoue**

- 13 plans sur 27 portent un écart nommé ; 9 à moins de 4 % du seuil, 4 de vrais ratés (repas à ±12–18 %).
- 2 plans refusés pour une casserole en unités comptables courte de 11 et 25 g.
- 1 plan refusé pour un premier jet d'une seule journée sur trois, non rattrapé en deux appels.
- Le profil maintien (7) sort conforme 1 fois sur 5 ; le foyer N=4 (9), 1 fois sur 5 — toujours Paul et son plancher de 176 g.

**Non mesurable, et pourquoi**

- tir 27, Paul, mercredi déjeuner : une ligne que l'index de relecture de l'instrument ne résout pas (une seule sur 2 296) ; le moteur, lui, a mesuré cette case.
- Les 35 parts des trois plans refusés : rien n'a été écrit, il n'y a rien à mesurer. Elles restent au dénominateur des 380.

## Ce qu'il faut faire, dans l'ordre — et ce qui demande une décision

1. **Décision produit, avec les deux nombres.** Le plancher protéique et le couloir de densité reçoivent-ils la borne d'arrondi que les portions portent déjà (au gramme, à l'unité) ? Ce n'est pas élargir une tolérance nutritionnelle : c'est cesser de refuser 173,7 g pour 176 quand chaque assiette est arrondie. Avec cette borne : 23 conformes sur 30. Et D3 : un plan avec un écart nommé de moins de 4 % est-il « inutilisable » ? Sans changer D3, la bêta reste bloquée à 23 ; en la relisant, 27.
2. **Moteur, déterministe, sans appel** : une casserole en unités comptables courte de quelques grammes gagne une unité (le surplus est permis et nommé) au lieu de faire refuser le plan ; et un refus de masse de casserole compte comme bloquant dans la décision de réparation.
3. **Premier jet** : 1 tir sur 30 a écrit une journée sur trois ; 4 repas sur 344 sont à ±12–18 %. C'est le chantier prompt, séparé, et il ne se mesure qu'avec une nouvelle campagne.
4. Rejouer **uniquement les profils 7 et 9** après 1 et 2 : ce sont eux qui portent 9 des 13 écarts.
