# LOT 8 — familles ALLOCATION et DENSITÉ : ce qui existe, ce qui manque

Périmètre : deux fichiers créés, aucun autre touché.
`supabase/functions/_shared/keel/lot8_allocation_test.ts` · `lot8_densite_test.ts`

## Inventaire de ce qui est DÉJÀ vert (à ne pas dupliquer)

| Propriété | Où |
|---|---|
| redistribution : faisable / impossible / gelé / léger / cascade / apport fixe | `redistribution_test.ts` (8 cas) |
| rendu d'une borne basse redondante (`up to N`) sur `SlotDensity` monté à la main | `redistribution_test.ts` (3 cas) |
| `slotPlanTargets` : somme = cible (4 moments), dîner léger, `lightSlots: []` legacy, shaker à SON moment, apport fixe entier sans plancher, apport fixe excédentaire (`fixedCovered`) | `portion_sizing_test.ts` 183-355 |
| `plateBoundsFor` : enfant, âge inconnu, collation, bande depuis la part kcal, table en garde-fou, `slotTargetKcal: null`/`0`, plancher qui ne monte pas | `portion_sizing_test.ts` 576-680 |
| appétit adulte : ratios 0,90 / 1,10 sur min, max et préférée ; l'énergie ne bouge pas | `one_target_per_person_test.ts` 436 |
| `requiredDensityFor` : les 4 couloirs de GRAND, l'ordre du jour, `redundantMin` sur un goûter, moment léger, plancher TCA, max sur les jours, sans cible, shaker | `portion_sizing_test.ts` 1580-1850 |
| plafond de demande (`capped: 1`, `kcalPer100G === 250`) | `portion_sizing_test.ts` 2082 |
| couloir [100, 135] d'un goûter de 250 kcal | `moteur_unique_contre_exemples_test.ts` CE-1 |
| apports fixes : jours, moment absent, terme illisible, somme | `slot_fixed_kcal_test.ts` |

## Ce qui MANQUE (et que ces deux fichiers écrivent)

ALLOCATION
1. 1 à 6 créneaux — seule la grille à 4 est éprouvée.
2. repas dehors / case gelée : `coveredSlots ⊊ wholeSlots` — le prix exact de l'erreur.
3. `appetiteFactor` rendu ; **A = 1 sur un mineur** (jamais éprouvé).
4. E = 0 vu de l'AVAL : `plateBoundsFor(0)` et `densityCorridorFor(0)`.
5. apport fixe excédentaire vu de `requiredDensityFor` (`fixed_covered`).
6. apport fixe **intermittent** : deux jours, `occurrences` séparées.
7. `redistributeDayBudget` n'a **aucun appelant** — ⛔ défaut épinglé.

DENSITÉ
8. `light: true` n'atteint **jamais** `plateBoundsFor` dans un test ⇒ `densityFloorPerG`
   (0,6) et le cas « 588 kcal léger, plafond 700 g → 84 » sont neufs.
9. le **voyage** `requiredDensityFor` → `densityFragment` sur un couloir RÉEL
   (le seul test du fragment monte un `SlotDensity` à la main).
10. `incompatible: "above_askable_cap"` et `neededMinPer100G` jamais assertés.
11. `empty_intersection` jamais produit ni asserté.
12. `max(Dmin)` / `min(Dmax)` sur **trois** occurrences — le plafond vient d'un
    autre jour que le plancher.
13. couloir « trop bas » : Dmin = 100/A, donc **91 sous un gros appétit**.
14. « sans arrondi représentable » — ⛔ défaut épinglé + la preuve d'inatteignabilité.

## Nombres dérivés à la main, confirmés par sonde

- cible GRAND (187 cm, 72 kg, 28 ans, `trains_some`, +0,35 kg/sem) :
  BMR = 10×72 + 6,25×187 − 5×24 + 5 = 1 773,75 ; ×1,80 = 3 192,75 → 3 193 ;
  +0,35×7 700/7 = 385 ⇒ **3 578**. L'appétit ne la déplace pas.
- 588 léger, plafond 700 g : Dmin = 100×588/700 = **84** ; Dmax = ⌊58 800/250⌋ = 235 ;
  visée = arrondi(84×1,10) = 92.
- 250 kcal, repas adulte : bornes 185–250 g ⇒ [**100**, **135**], visée 110.
- 500 kcal, repas adulte : bornes 250–500 g ⇒ [100, 200], visée 110 (Dmin = plancher).
- 500 kcal, gros appétit : bornes 275–550 g ⇒ [**91**, 181], visée 100.
- 900 kcal sur une collation : bornes 80–300 g ⇒ besoin **300**, demandé 250,
  `above_askable_cap`.
- couloir vide : lundi [186, 250] ⊓ mardi [101, 135] (shaker 1 000 au déjeuner)
  ⇒ 186 > 135 ⇒ `empty_intersection`, bande refermée sur 186.
- trois jours : lundi [186, 250] ⊓ mardi [144, 250] ⊓ mercredi [101, 200] ⇒ [186, 200].

## Défauts produit trouvés (NON corrigés)

- **D-1** `redistributeDayBudget` : zéro appelant dans `supabase/**` et `frontend/**`.
  Le lot 4 en fait la sortie du couloir vide ; le couloir vide se produit et ne
  déclenche rien.
- **D-2** `DensityCorridor.incompatible` : **aucun lecteur**. Ni le prompt
  (`densityFragment` ignore le champ), ni le handler (`densityCounters` ne porte
  ni `capped` ni `empty_intersection` ni `fixed_covered` ni `floor_min_kept`).
  « on écrit que le besoin ne l'était pas » — et personne ne le lit.
- **D-3** `densityCorridorFor` rabat en silence un intervalle sans entier :
  `Math.max(minPer100G, …)` rend `[121, 121]` là où l'intervalle vrai est
  [120,265 ; 120,667]. Le chantier exige `explicitement incompatible`.
  ⚠️ Inatteignable par la chaîne au-dessus de 50 kcal (0 cas sur ~1,3 M échantillons).

## Épreuve de mutation (source mutée par `perl -pi`, restaurée par `cp`, sha vérifié)

| Mutation | Rouges attendus | Rouges obtenus |
|---|---|---|
| `LIGHT_MEAL_KCAL_PER_G_FLOOR` 0,6 → 1,0 | 588 léger, plancher générique | 2/2 |
| `isMinor` → `false` (appétit sur un enfant) | mineur | 1/1 |
| `mergeCorridors` : garder le jour le plus exigeant EN ENTIER | trois jours, couloir vide | 2/2 |
| `slotPlanTargets` : dénominateur = `coveredSlots` | repas dehors, case gelée, apport excédentaire, shaker intermittent | 4/4 |

`shasum` avant/après identique sur `mouth_anchor.ts` et `portion_sizing.ts`.
Aucun `git stash`, aucun `git checkout`.

## Résultat

`deno test --allow-all lot8_allocation_test.ts lot8_densite_test.ts` → **22 passed, 0 failed**.
Suites voisines (portion_sizing, redistribution, contre-exemples, one_target, slot_fixed) → **152 passed, 0 failed**.
