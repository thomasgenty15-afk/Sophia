# Mission : une seule cible par personne, une seule bande de grammes par repas — et les crans qui les bougent ensemble

## Le contrat à faire tenir

Pour chaque personne (compte seul OU bouche de foyer), le produit doit calculer :

1. **Une cible calorique du jour**, depuis ce qu'elle a renseigné : âge, sexe, taille, poids,
   activité (cran + les deux axes journée/sport quand ils sont connus), objectif et son
   rythme (perte / prise / entretien).
2. **Une part par moment** : la cible du jour répartie sur ses moments déclarés
   (`eating_rhythm`), au prorata de `SLOT_DAY_WEIGHT` (petit-déjeuner 0,25 · déjeuner 0,40 ·
   dîner 0,35 · collations 0,10). Cinq moments ne pèsent pas comme trois.
3. **Une bande de grammes tolérée par repas**, dérivée de cette part (pas d'une table fixe).
4. **Deux crans qui bougent 1, 2 et 3 ensemble**, sur la MÊME personne :
   - l'appétit déclaré (`small` / `average` / `large`) ;
   - le retour « trop / pas assez » sur un plan (`portion.adjust`).
   Un cran = un facteur unique appliqué à la cible ; la part et la bande de grammes en
   découlent mécaniquement. Pas de second facteur caché ailleurs.

## Ce qui est câblé aujourd'hui (mesuré le 2026-09-10, ne pas re-découvrir)

| | cible kcal | part par moment | bande de grammes / repas | appétit | retour « trop / pas assez » |
|---|---|---|---|---|---|
| **Foyer** (`generate-household-meal-v1`) | `mouthTargetKcal` (`_shared/keel/mouth_anchor.ts:1181`) → adulte : `maintenanceMidKcal` = **poids × activité seulement** (`energy_target.ts:674`), ni âge, ni sexe, ni taille, ni axes | oui, `slotPlanTargets` sur les moments déclarés | `plateBoundsFor` (`portion_sizing.ts:392`) = **table fixe par tranche d'âge** (`PLATE_MASS_BOUNDS_G`), sans lien avec la part kcal | appliqué à la **bande de grammes** (`plateBoundsFor`), **PAS à la cible kcal** | appliqué à la **cible kcal** (`mouth_anchor.ts:1234`), **PAS à la bande de grammes** |
| **Solo** (`generate-meal-v1`) | `envelopeFor` (`meal_envelope.ts:1023`) → Mifflin (âge, sexe, taille, poids, activité) ; axes passés `asked: false` | **aucune** — la bande est journalière, rien par moment | **aucune** | **jamais collecté** (`appetite: null` en dur, `generate-meal-v1/index.ts:3259-3263`) | appliqué à la bande kcal (`applyPortionAdjust`), rien d'autre à bouger |

Donc : deux moteurs de cible qui ne lisent pas les mêmes champs, une bande de grammes fixe
qui ignore la part kcal, et les deux crans qui touchent chacun une moitié différente.
Aucune des deux lanes ne respecte le contrat en entier.

## Ce qu'il faut faire

1. **Une seule fonction de cible par personne**, alimentée par les mêmes champs sur les deux
   lanes (âge, sexe, taille, poids, activité + axes, objectif, rythme). Le moteur existe
   (`envelopeCore` dans `meal_envelope.ts`) ; le foyer doit y passer au lieu de
   `maintenanceMidKcal`, et le solo doit lui passer les axes et l'appétit quand ils
   existent. Ne pas écrire un troisième moteur.
2. **Collecter l'appétit en solo** : la question existe sur la fiche de bouche
   (`keel_household_set_member_body`, `p_appetite`) ; la lane solo doit la lire (un compte
   seul est une bouche de son propre foyer — `chooseGenerator`).
3. **La bande de grammes par repas se dérive de la part kcal** de ce moment pour cette
   personne (densité d'un plat ordinaire : `mealMassCapGrams` est le point d'entrée), avec
   `PLATE_MASS_BOUNDS_G` gardée comme garde-fou de vraisemblance, pas comme source.
4. **Les deux crans s'appliquent UNE fois, sur la cible** ; part et bande de grammes suivent.
   Retirer le facteur d'appétit de `plateBoundsFor` et le retour de `mouth_anchor.ts:1234`
   au profit du point unique. Le plancher d'énergie (`energyFloorFor`) reste.
5. **La part par moment en solo** : le solo doit avoir la même répartition que le foyer
   (`slotPlanTargets` sur `eating_rhythm`) ; le verdict journalier reste.

## Les tests qui prouvent

Unitaires (Deno, `_shared/keel`) — chacun doit ÉCHOUER avant le correctif :

- **Même personne, deux lanes, même cible** : une fixture (âge, sexe, taille, poids,
  activité, objectif) passée au chemin solo et au chemin foyer rend le même kcal/jour à
  ±1. Aujourd'hui elle rend deux nombres différents.
- **L'appétit bouge la cible ET la bande de grammes** : `large` → cible ×1,10 ET
  `max` grammes ×1,10 sur les deux lanes. Aujourd'hui : foyer ne bouge que les grammes,
  solo ne bouge rien.
- **Le retour bouge la cible ET la bande de grammes** : `portion.adjust` « pas assez ×2 »
  → cible ×1,10 ET bornes ×1,10. Aujourd'hui les bornes ne bougent pas.
- **Cinq moments ≠ trois moments** : même cible, rythme à 3 puis à 5 moments → la part du
  déjeuner passe de 0,40/1,00 à 0,40/1,20 de la cible, et sa bande de grammes suit.
- **Mutation** : mettre `APPETITE_FACTORS.large` à 1,00 doit faire échouer les tests
  d'appétit des DEUX lanes (sinon un des deux ne lit pas le facteur).

Réel (banc `scratchpad/2026-09-09-CAMPAGNE-PLANS`, `python3 20-run.py` + `40-rapport.py`) :

- Fixture S2 (femme 78 kg, perte 0,5 kg/sem) avec `appetite: small` : la ligne
  `keel.meal.envelope` du journal doit sortir une bande ≈ ×0,90 de celle d'aujourd'hui
  (1700–1900 → ~1530–1710). Puis `large` : ~1870–2090.
- Foyer F3 (`camp0909.f3@keeltest.dev`) : Theo `large` → sa cible dans le rapport
  (`mouthTargetKcal`) doit porter le ×1,10 ; aujourd'hui elle ne le porte pas.

## Contraintes du dépôt

- Ne modifie AUCUN fichier de `supabase/functions/**` pendant qu'un run réel tourne
  (le watcher recrée le conteneur, 502 en vol). Fais les runs avant et après, jamais pendant.
- `scripts/agent-gate.sh` doit passer (`tsc -b --force`, vitest, deno). Pas de `db reset`.
- Un paramètre de garde optionnel est une garde désarmée : les nouveaux champs sont
  requis et nullables, jamais `?`.
- Ne touche pas au rattrapage (`portion_scaling.ts`) ni au prompt : hors périmètre.
- Chaque test doit avoir un cas qui passe ET un cas qui échoue avant le correctif — un
  test qui n'a jamais été rouge ne prouve rien.
