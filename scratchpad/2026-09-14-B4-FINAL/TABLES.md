# B4 — casseroles, portions, courses (2026-09-14)

Équation : **masse prête produite = somme des prélèvements + reste réel**.
Mesure : `measurePreparation` + `growIngredientsToReadyMass` (fonctions de production).
Chiffres banc : journal `keel.household_meal.pot_reconcile` de la ligne écrite.
Aucun appel modèle facturé.

Sources : `tables.json`, journaux banc, fixtures listées ci-dessous.

## Synthèse

| Cas | Chemin | HTTP / écriture | overdrawn_after | unreadable_drawn | prête | prélevé | reste | équation | courses |
|---|---|---|---|---|---|---|---|---|---|
| sna1 | banc `--reponse` sna1 | 200 / 1 ligne `82460264` | 0 | 0 | 1367 | 1364 | 3 | oui | 12/12 requantifiées, 0 non attribué |
| −35 g (6146/6181) | plan stocké `82e60169` + grow hors handler | banc `--reponse` **422**, 0 ligne | 0 après grow | 0 | 6187 | 6181 | 6 | oui | 0 non attribué, 8 requantifiées |
| N=2 partagé | banc lot2-ref2 | 200 / 1 ligne `518d6583` | 0 | 0 | 3048 | 3042 | 6 | oui | rebuild 0 non attribué ; `generated_from` signale encore `shopping_list_unattributed: 1/13` |
| N=4 toutes présentes | banc lot2-ref4 | 200 / 1 ligne `f426053a` | 0 | 0 | 5724 | 5722 | 2 | oui | **1 ligne non attribuée** (`lentils_dry` 260 g, absente des recettes finales) |
| N=4 Nils absent mar | banc lot2-ref4 `--absences=,,tue` | 200 / 1 ligne `f10020b3` | 0 | 0 | 4687 | 4687 | 0 | oui | **1 ligne non attribuée** (`lentils_dry` 260 g) |

`overdrawn_before` (avant grow, journal banc) : sna1 = 1, n2 = 1, n4-ref4 = 0.
Plan 6146 stocké : 4 casseroles déficitaires (−35 g au total historique 6146 vs 6181). Grow courant : 6187 = 6181 + 6.

---

## 1. sna1 — `perte-sna1-…-c0.json`

Compte `lotf.perte.b4-sna1-final@keeltest.dev`. Facturé 0. Garde : `deliverable_with_gaps` (`cell_energy_off`, `day_energy_off`), blocking 0.
`final_sizing.reason = remeasured_after_apply` · 6/6 in_bounds · 0 unmeasurable.
Journal : `overdrawn_before=1` puis grow `prep_poulet` 510 → 513.

| Casserole | Prête avant | Prête après | Prélevé | Reste | Motif | Cru (g) | Prête/cru |
|---|---:|---:|---:|---:|---|---|---:|
| `prep_poulet` Poulet rôti au citron | 510 | 513 | 510 (lun 255 + mar 255, 1 bouche) | 3 | rounding / grown | blanc de poulet 685 + huile 20 = 705 | 0,728 |
| `prep_saumon` Saumon rôti et pommes de terre | 854 | 854 | 854 (lun 427 + mar 427) | 0 | kept | saumon 546 + pomme de terre 445 + huile 17 = 1008 | 0,847 |
| **total** | 1364 | **1367** | **1364** | **3** | | | |

513 = 510 + 3. 854 = 854 + 0.

Courses finales (12) : blanc de poulet 685 g, huile d'olive 49 g, saumon 546 g, pomme de terre 445 g, skyr 744 g, avoine 136 g, myrtilles 224 g, amandes 30 g, couscous complet 170 g, courgette 322 g, tomate 160 g, haricots verts 210 g.

`--sans-naissance=1` n'a pas ôté l'âge du titulaire (`ageYears.personal:1`). Ce n'est pas le cas « titulaire sans date ».

---

## 2. Plan réel 6146 g / 6181 g — `82e60169-d687-403d-894e-727f4e31f0a7`

Fixture : `scratchpad/2026-09-14-B4-FINAL/fixtures/parcours-6146-6181.json`.
Le banc `--reponse` de ce JSON **échoue** (422) : boîtes aux `member_id` d'un autre foyer, 16 plats au-dessus du plafond 9, `cell_two_table_dishes`, dinde servie à une bouche végane. 0 écriture, 0 €.

Mesure hors handler sur le plan **tel qu'il a été publié** :

| Casserole | Prête stockée | Prête après grow | Prélevé | Reste | Grow |
|---|---:|---:|---:|---:|---|
| `prep_lentil_barley` Lentilles aux légumes | 1144 | 1144 | 1143 (lun, 1 bouche) | 1 | non |
| `prep_turkey` Dinde rôtie à l’ail | 486 | 489 | 488 | 1 | ×1,01, 1 ligne |
| `prep_chickpea_couscous` Couscous pois chiches | 1068 | 1087 | 1086 (mar) | 1 | ×1,028, 4 lignes |
| `prep_pork_tray` Porc et pommes de terre | 1151 | 1151 | 1151 | 0 | non |
| `prep_tofu_pasta` Pâtes tofu brocoli | 1105 | 1114 | 1113 (mer) | 1 | ×1,01, 2 lignes |
| `prep_ham_couscous` Couscous jambon tahini | 1192 | 1202 | 1200 | 2 | ×1,015, 4 lignes |
| **total** | **6146** | **6187** | **6181** | **6** | 4 casseroles |

L’écart historique −35 g (6146 − 6181) est le déficit **avant** grow. Après `growIngredientsToReadyMass` : 6187 = 6181 + 6. `overdrawn_after = 0`. `decidePotMassPublication` → `published`.

Crus (après grow) : lentilles 290, oignon 110, carotte 150, chou rouge 215, huile 20 ml ; dinde 655, ail 3 u, huile 16 ml ; pois chiches 2 u / 480 g crus, couscous 120, poivron 175, oignon 125, huile 25 ml ; porc 560, pommes de terre 560, oignon 140, huile 90 ml ; tofu 405, pâtes 105, brocoli 270, champignons 200, huile 13 ml ; jambon 12 u / 360 g, couscous 155, poivron 315, tahini 125, huile 30 ml.

Courses reconstruites : 32 lignes, 8 requantifiées (dont pois chiches 521 g, jambon 18 u, tahini 137 g, huile 194 ml), 0 non attribué, 0 besoin non acheté.

---

## 3. N=2 — préparation partagée (`lot2-ref2-c0.json`)

Garde : `conforme`. `final_sizing` 12/12 in_bounds. Journal `overdrawn_before=1`.

| Casserole | Prête | Prélevé | Reste | Jours | Bouches (g) | Cru | Prête/cru |
|---|---:|---:|---:|---|---|---|---:|
| `prep_tempeh` Tempeh mariné | 1354 | 1350 | 4 | lun 675 + mar 675 | 576 / 774 | tempeh 1080, courgette 215, huile 45, soja 35 | 0,985 |
| `prep_tofu_lentilles` Tofu et lentilles | 1694 | 1692 | 2 | lun 846 + mar 846 | 722 / 970 | tofu 1129, lentilles 413, oignon 138, huile 28 | 0,992 |
| **total** | **3048** | **3042** | **6** | | | | |

1354 = 1350 + 4. 1694 = 1692 + 2.

Courses (13) : tempeh 1080 g, courgette 215 g, huile 87 g, sauce soja 35 g, tofu 2147 g, lentilles 413 g, oignon 138 g, épinards 406 g, pain complet 88 g, couscous 122 g, edamame 276 g, graines de courge 158 g, tomate 220 g.
`shopping_rebuild` : 13 requantifiées, 0 dropped, 0 unattributed. `generated_from.issues` contient encore `shopping_list_unattributed: 1/13`.

---

## 4. N=4 — `lot2-ref4` (toutes présentes, pas d’absence)

Une casserole partagée, 4 bouches **tous les créneaux**. Ce n’est **pas** le cas « présences variables ».

| Casserole | Prête | Prélevé | Reste | Jours | Bouches (g) |
|---|---:|---:|---:|---|---|
| `prep_tofu_table` Tofu doré graines courgette | 5724 | 5722 | 2 | lun 2861 + mar 2861 | 1330 / 1464 / 1464 / 1464 |

5724 = 5722 + 2. Cru : tofu 4255, graines de courge 1076, courgette 284, huile 19, soja 118. Prête/cru 0,995.

`final_sizing` : 6 in_bounds, **6 unmeasurable** — calories/protéines non relues sur la moitié des cases.

Courses : tofu 5715 g, graines 1668 g, courgette 284 g, huile 37 g, soja 118 g, **lentilles 260 g**, edamame 1166 g, pain 70 g, épinards 234 g, couscous 92 g, tomate 130 g.

`shopping_rebuild` : dropped 2, **unattributed 1**. La ligne `lentils_dry` 260 g n’est ni dans la casserole ni dans les ingrédients des plats écrits.

---

## 5. N=4 présences variables — banc `--absences=,,tue` (Nils, 3ᵉ bouche)

Compte `lotf.perte.b4-n4-away-final@keeltest.dev`. HTTP 200, 1 ligne `f10020b3`, 0 €.
Mardi : 3 bouches. Lundi : 4. Journal : `overdrawn_before=1` puis grow 4682 → 4687.

| Casserole | Prête avant | Après grow | Prélevé | Reste | Présence |
|---|---:|---:|---:|---:|---|
| `prep_tofu_table` Tofu doré graines courgette | 4682 | **4687** | **4687** | **0** | lun 4 bouches · mar 3 (Nils absent) |

4687 = 4687 + 0. `decision: grown`. `final_sizing` remesuré : 6 in_bounds, **6 unmeasurable**.

Même ligne orpheline : `lentils_dry` 260 g. Cause : `prep_tempeh_lea` retirée (« not cooked, not bought ») ; la ligne d’achat `lentilles` reste parce que `lentils_cooked` (casserole) et `lentils_dry` (courses) sont deux identités. Yaourt soja + avoine, eux, ont bien été retirés.

### 5bis. Campagne tir9-s1 (ligne déjà publiée, grow hors handler)

Ancienne ligne payante, 9 casseroles, Nils absent mardi. Grow courant : 14868 = 14843 + 25, `overdrawn_after=0`. Ne pas mélanger avec `f10020b3`.

| Casserole | Prête avant | Après grow | Prélevé | Reste | Présence |
|---|---:|---:|---:|---:|---|
| `prep_breakfast_mon` | 1717 | 1727 | 1718 | 9 | 4 bouches lun |
| `prep_lunch_lentil_barley` | 1645 | 1645 | 1643 | 2 | 3 bouches lun (sans Nils) |
| `prep_dinner_tofu_pasta` | 1424 | 1425 | 1425 | 0 | 3 bouches lun |
| `prep_nils_pork_barley` | 1192 | 1196 | 1195 | 1 | Nils seul lun |
| `prep_lunch_lentil_barley_high_protein` | 1177 | 1182 | 1181 | 1 | 3 bouches mar |
| `prep_dinner_tofu_pasta_high_protein` | 1289 | 1289 | 1286 | 3 | 3 bouches mar |
| `prep_breakfast_wed` | 1866 | 1866 | 1865 | 1 | 4 bouches mer |
| `prep_lunch_tofu_couscous` | 2224 | 2229 | 2225 | 4 | 4 bouches mer |
| `prep_dinner_tofu_beans` | 2299 | 2309 | 2305 | 4 | 4 bouches mer |
| **total** | 14833 | **14868** | **14843** | **25** | |

6 casseroles agrandies. `overdrawn_after=0`. Courses : 0 non attribué, 9 requantifiées.

---

## Critères B4

| Critère | État |
|---|---|
| overdrawn_after = 0 | oui sur les objets mesurés |
| unreadable_drawn = 0 | oui |
| aucun reste négatif | oui |
| aucun gramme servi sans avoir été produit | oui **après** grow ; le plan 6146 **stocké** avait −35 g |
| courses = ingrédients cuisinés | **non** : N=4 garde 260 g `lentils_dry` alors que `prep_tempeh_lea` (`lentils_cooked`) a été retirée. Yaourt/avoine ont bien disparu. |
| calories/protéines remesurées après réconciliation | sna1 et n2 : 0 unmeasurable. N=4 (présent ou absent) : **6 cases unmeasurable** |
| pot déficitaire/illisible → 0 écriture | tests (3/3) ; 6146 banc 422 n’a rien écrit |
| aucune tolérance élargie | inchangée |

**B4 n’est pas clos** : 260 g de lentilles achetées pour une casserole retirée. Corriger ça touche `supabase/functions/` (identité `lentils_cooked` ≠ `lentils_dry`) et rechargerait le runtime Edge. Pas fait pendant que `functions serve` tourne.
