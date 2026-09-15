# Reprise des dix tirs sur la version corrigée — 2026-09-15

**Version tirée : l'arbre de travail du 15/09 à 15 h 16** (les commits `0833f300` + les quatre corrections
de ce chantier, servies par `functions serve` redémarré à 15:16:21). Dix demandes réelles, séquentielles,
profils **7** (maintien, une bouche) et **9** (N=4, présences variables) en alternance, cinq fois chacun,
un compte neuf par tir (`c4101` à `c4110`), aucune relance. De 15:19 à 15:40. Même chaîne de mesure que
les 30 : `figer-demande.ts` → `analyse-lot-F.ts`, journal moteur archivé par tir. Preuves :
`scratchpad/2026-09-11-CLOTURE/fixtures/c41-*.json`, `scratchpad/2026-09-15-BETA-PREUVES/mesure-10/`,
`mesures-campagne-10.json`, `bilan-10.md`.

## Verdict : **la borne d'arrondi ne ferme rien, et les dix le confirment en direct**

| critère de la passation § 3.3 | les 30 (`62815cfe`) | les dix (corrigée) | seuil |
|---|---:|---:|---:|
| plans livrés | 27 / 30 | **10 / 10** | — |
| sans rattrapage modèle | 26 / 30 | **10 / 10** | 24 / 30 |
| **conformes** (D3 : un écart nommé ne compte pas) | 14 / 30 | **4 / 10** | 27 / 30 |
| profil 7 conformes | 1 / 5 | **3 / 5** | 4 / 5 |
| profil 9 conformes | 1 / 5 | **1 / 5** | 4 / 5 |
| p95 de disponibilité | 139 s | **137 s** (tous sous 150 s) | 180 s |
| 546 / 502 inexpliqués, verrous laissés | 0 · 0 | 0 · 0 | 0 |

⛔ **Dix tirs ne font pas un taux.** 3/5 contre 1/5 sur le profil 7 est dans le bruit de deux profils
tirés cinq fois ; rien ici n'autorise « la version corrigée fait mieux ». Ce que dix tirs prouvent, c'est
ce qu'ils montrent tir par tir : **six écarts nommés sur six ne sont pas de l'arrondi**.

### Ce que les compteurs neufs disent, sur les dix

| compteur (journal du handler) | valeur sur 10 tirs | ce que ça veut dire |
|---|---:|---|
| `checked.protein_within_rounding` | **0** sur 10 | aucune journée n'a été tenue *grâce* à la borne |
| `potReconcile.unit_bumped` | **0** sur 10 | aucune casserole n'a eu besoin d'un palier d'unité |
| `potReconcile.overdrawn_after` | **0** sur 10 | aucun refus de masse : le cas des tirs 6 et 13 des 30 ne s'est pas présenté |
| réparations / appels | 0 / 10 | aucun défaut bloquant ; les six écarts sont partis nommés, sans appel |

## Les six écarts, un par un — et la borne en face

| tir | profil | écart de la garde | ce que l'instrument mesure | borne calculée | verdict |
|---|---|---|---|---:|---|
| 1 | 7 | `cell_bounds_off` jeu. petit-déj. | densité **125** pour un couloir [134–250] | 0,09 kcal/100 g | recette : 9 points sous le couloir |
| 3 | 7 | `cell_bounds_off` mer. petit-déj. | densité **133,02** pour [134–250] | 0,000 (contenant d'un seul terme) | recette : 1 point |
| 10 | 9 | `cell_bounds_off` mer. déjeuner (Paul) | densité **140,0** pour [141–250] | 0,06 kcal/100 g | recette : 1 point |
| 2 | 9 | `cell_energy_off` jeu. petit-déj. (Nils) | **640 kcal pour 716,75** (−10,7 %) | — | recette |
| 4 | 9 | `protein_floor_short` ×3 (Paul) | 57,5 / 62 (−7 %) · 171,0 / 176 (−3 %) · **175,1 / 176 (−0,9 g)** | 0,1 à 0,4 g/jour | recette ; la journée à −0,9 g reste hors borne |
| 6 | 9 | `protein_floor_short` ×3 (Paul) | 60,3 / 62 · 160,4 / 176 (−9 %) · **150,3 / 176 (−15 %)** | 0,1 à 0,4 g/jour | recette, et large |

Le tir 4 est la meilleure épreuve de la borne : une journée à **0,9 g** du plancher, la borne calculée
vaut moins de la moitié, la garde refuse — et c'est juste. L'écriture des grammes en entiers ne peut
pas expliquer 0,9 g de protéine sur trois boîtes.

### Le rejeu hors ligne, fait avant de tirer

Sur les 9 plans à écarts des 30 (`borne-hors-ligne.ts`, même lecteur que l'audit du produit, grammes
de l'instrument retrouvés au dixième) : **0 plan fermé**. Dix journées protéiques impossibles (manques de
1,3 à 5,0 g contre des bornes de 0,11 à 0,44 g), trois cases de densité impossibles, trois indécidables à
l'entier du couloir affiché. Le nombre « neuf écarts d'arrondi » du bilan des 30 était une qualification
au pourcentage, pas une mesure ; le nombre mesuré est zéro, et il l'était avant de dépenser un appel.
Détail dans `docs/keel/mesure.md` (section du 15/09, 15 h).

## Les quatre corrections, et ce que dix tirs en prouvent

| correction | où | preuve | exercée en direct ? |
|---|---|---|---|
| borne d'arrondi calculée (protéine et densité), portée jusqu'à la garde | `mouth_energy.ts` → `final_plan_audit.ts` → `final_plan_gate.ts` | `rounding_bound_test.ts` (8 tests), fixture du cas propre | oui, sur 10 plans : 0 journée, 0 case fermée |
| palier d'unité quand aucun facteur ne déplace un dénombrable | `portion_scaling.ts` (`bumpCountableToReadyMass`) | 4 tests (œufs +1, « 1 tin » refusé, demi-cuillère, cas qui passe) | non : aucune casserole courte sur les dix |
| refus de masse compté BLOQUANT, non réparable | `plan_defect_pass.ts` (`POT_MASS_UNRECONCILED_CAUSE`) | `pot_mass_blocking_test.ts` (3 tests, dont le littéral du 422) | non : aucun refus de masse |
| journal `pot_grow_stuck` : la casserole qui ne grossit pas dit ses lignes | `generate-household-meal-v1/index.ts` | posé après la campagne, `deno check` | non |

⚠️ **Les deux casseroles refusées des 30 restent inexpliquées.** Rejouées hors ligne depuis le premier jet
(`rejouer-palier.ts`, `rejouer-palier-db.ts` avec le vrai référentiel), elles grossissent toutes deux par le
facteur seul — mais ce ne sont pas les casseroles que le handler tenait au moment du refus (832 g mesurés
contre 1 041 g au journal ; 506 g contre 352 g) : il les avait redimensionnées avant, et cet état n'est
archivé nulle part. Le journal `pot_grow_stuck` ferme ce trou pour la prochaine fois ; il ne prouve pas que
le palier d'unité aurait sauvé les tirs 6 et 13.

## Deux incidents de mesure, dits

1. **Un premier tir 1 mort en 502 à 45,9 s, zéro appel, verrou laissé (compte `c4001`).** Cause : j'ai
   déplacé un fichier de test sous `supabase/functions/_shared/keel/` pendant que le handler tournait ;
   `functions serve` recharge le runtime à toute écriture, tests compris, et Kong rend 502 sur la requête
   en vol (second « Serving functions » à 15:18:07 dans le journal). Relancé sur des comptes neufs
   (`c41xx`) ; aucun appel dépensé ; le verrou de `c4001` expire seul. Règle ajoutée en mémoire.
2. **L'instrument et le produit ne disent pas la même chose sur le tir 9.** Le produit rend `conforme` ;
   l'instrument marque deux cases « hors couloir » : 106,86 pour un plancher affiché 107, 213,87 pour 214.
   La borne (0,03 et 0,07) ne peut pas l'expliquer ; c'est l'instrument qui juge encore sur le couloir
   **entier** là où le produit juge sur le couloir **exact** depuis le 14/09 (BÊTA 1C ⑤). Le produit a
   raison ; l'instrument est à corriger (chantier à part, il ne change aucun nombre de ce rapport hormis
   « complètes 164/170 » qui vaut 166/170 au jugement du produit).

## Ce qui reste, et à qui

- **Le critère qui bloque est le même : les plans conformes.** Six écarts sur dix plans, tous dans la
  recette du premier jet : Paul (N=4) sous son plancher protéique sur 2 plans sur 5 (jusqu'à −15 %), le
  petit-déjeuner de maintien sous son couloir de densité sur 2 plans sur 5, un petit-déjeuner à −10,7 %.
- **Décision D3, au propriétaire** : un plan « livrable avec écart nommé » (Paul à 175,1 g pour 176) est-il
  utilisable en bêta ? Lu strictement, 4/10 ; lu avec l'écart nommé comme utilisable, 10/10. Ce n'est pas
  un seuil à abaisser dans le moteur : la borne calculée dit précisément ce que l'arrondi couvre, et c'est
  presque rien.
- **Chantier premier jet, à part** : la protéine de Paul et la densité du petit-déjeuner sont deux
  consignes que le prompt porte déjà et que le modèle manque d'un à quinze pour cent ; ça se mesure sur des
  premiers jets, pas sur des réparations.
- **Instrument** : aligner `analyse-lot-F.ts` sur les bornes exactes du contrat.

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
