# Résultats des appels réels

Campagne du 5 septembre 2026, synthèse finalisée le 6 septembre. **21 requêtes de génération lancées**, dont 20 avec métadonnées finales ; 15 réponses HTTP 200 contenant des plats, 2 limites worker 546, 1 refus 409, 1 refus 422 et 2 incidents de banc initiaux (un statut 0, un appel interrompu sans métadonnées finales). Les incidents initiaux ne sont pas comptés comme échecs produit. Les HTTP 200 ne sont pas des verdicts de conformité. Une seule adoption a écrit un plan, sur un compte créé par cette campagne.

Les 15 réponses contiennent 314 objets plats au total, parfois dupliqués par groupe et parfois incomplets. Neuf dépassent 150 secondes. Le code des endpoints et modules partagés est identique avant/après chacun des 20 tirs instrumentés. Les quatre fixtures A03 et les trois fixtures A06 sur runtime neuf ont des empreintes identiques dans leur groupe.

| Tir | HTTP | Durée s | Jours demandés → rendus | Plats / boîtes | Manques / cellules vides | ≥200 après densification | Lignes explication |
|---|---:|---:|---|---|---|---:|---:|
| [A01-solo3](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/A01-solo3.response.json>) | 200 | 124.5 | 3 → 2 | 6 / 4 | non mesuré | — | 0 |
| [A02-duo7](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/A02-duo7.response.json>) | 409 | 0.5 | 7 → — | 0 / 0 | non mesuré | — | 0 |
| [A03-vegan4-7-r1](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/A03-vegan4-7-r1.response.json>) | 200 | 174.8 | 7 → 6 | 36 / 36 | 0 / 0 | 8 | 3 |
| [A03-vegan4-7-r2](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/A03-vegan4-7-r2.response.json>) | 200 | 229.0 | 7 → 6 | 36 / 42 | 6 / 0 | 12 | 2 |
| [A03-vegan4-7-r3](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/A03-vegan4-7-r3.response.json>) | 200 | 86.3 | 7 → 6 | 24 / 0 | 6 / 12 | 0 | 1 |
| [A03-vegan4-7-r4](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/A03-vegan4-7-r4.response.json>) | 200 | 246.3 | 7 → 6 | 36 / 51 | 0 / 0 | 8 | 2 |
| [A03-vegan4-7](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/A03-vegan4-7.response.json>) | 0 | 300.9 | 7 → — | 0 / 0 | non mesuré | — | 0 |
| [A04-allergy5-7-r1](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/A04-allergy5-7-r1.response.json>) | 546 | 225.5 | 7 → — | 0 / 0 | non mesuré | — | 0 |
| [A05-vegan-one-session](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/A05-vegan-one-session.response.json>) | 200 | 169.3 | 7 → 6 | 34 / 30 | 4 / 2 | 10 | 3 |
| [A06-allergy-pizza-r2](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/A06-allergy-pizza-r2.response.json>) | 200 | 271.2 | 3 → 2 | 16 / 12 | 0 / 0 | 3 | 3 |
| [A06-allergy-pizza-r3](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/A06-allergy-pizza-r3.response.json>) | 200 | 210.1 | 3 → 2 | 12 / 12 | 0 / 0 | 4 | 3 |
| [A06-allergy-pizza-r4](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/A06-allergy-pizza-r4.response.json>) | 200 | 279.1 | 3 → 2 | 17 / 10 | 0 / 0 | 2 | 2 |
| [A06-allergy-pizza](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/A06-allergy-pizza.response.json>) | 546 | 230.9 | 3 → — | 0 / 0 | non mesuré | — | 0 |
| [A07-solo-one-session](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/A07-solo-one-session.response.json>) | 200 | 72.7 | 7 → 6 | 18 / 12 | non mesuré | — | 0 |
| [B01-budget-no-oven](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/B01-budget-no-oven.response.json>) | 200 | 201.1 | 7 → 7 | 19 / 11 | non mesuré | — | 0 |
| [B02-opposed-multiword](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/B02-opposed-multiword.response.json>) | 200 | 198.8 | 7 → 6 | 24 / 24 | 0 / 0 | 12 | 2 |
| [B03-minimal-five-allergy](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/B03-minimal-five-allergy.response.json>) | 422 | 27.5 | 7 → — | 0 / 0 | non mesuré | — | 0 |
| [B04-memory-owner](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/B04-memory-owner.response.json>) | 200 | 91.2 | 3 → 2 | 12 / 10 | 0 / 0 | 0 | 0 |
| [B05-note-allergy-child](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/B05-note-allergy-child.response.json>) | 200 | 76.2 | 3 → 2 | 12 / 6 | 0 / 0 | 0 | 1 |
| [C01-adopt-memory](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/C01-adopt-memory.response.json>) | 200 | 59.3 | 3 → 2 | 12 / 0 | 0 / 0 | 0 | 0 |

A04-allergy5-7 initial, interrompu par le banc après l’incident client A03 : pas de réponse finale utilisable. Les champs énergie/boîtes de C01 viennent du plan effectivement persisté (`C01-after-adoption.memory.json`), car la réponse d’écriture n’en reprend pas tous les compteurs. « Non mesuré » et zéro ne sont pas interchangeables. A03-r3 et C01 ont notamment zéro mesure énergétique parce qu’ils n’ont aucune boîte.

## Rejeux exposés

- A03, mêmes données et même requête, quatre réponses : 174,8 / 229,0 / 86,3 / 246,3 s ; manques individuels 0 / 6 / 6 / 0 ; cellules totalement vides 0 / 0 / 12 / 0. Le premier résultat a une incohérence de calendrier ; les troisième et quatrième demandent une lecture au-delà du seul compteur de boîtes. Trois rejeux suivent le premier tir exploitable.
- A06, trois réponses avec runtime neuf : 271,2 / 210,1 / 279,1 s. Dans les trois, toute la table devient végétarienne (`swap.flagrant=true`). A06-r2 contient des œufs dans les raviolis attribués à Tom allergique. Le tir initial sur worker réutilisé avait donné 546.

## Appels modèle et relances

Les sources, modèles, durées et jetons de chaque appel figurent dans les fichiers `.usage.json`. La génération utilise `gpt-5.6-luna` ; certains enrichissements de composition utilisent `gpt-5-nano`. Le coût réel ne peut pas être calculé depuis cette base : aucun tarif Luna n’y est configuré et Nano y a un tarif nul. `cost_usd=0` ne signifie donc pas gratuit.

La taille d’une relance partielle n’est pas systématiquement divisée par deux : A03-r1 passe de 17 634 jetons pour la composition à 4 794 pour la relance ; A03-r4 de 15 631 à 11 380 ; A06-r4 de 8 119 à 7 801. Ces nombres incluent le raisonnement facturé, pas seulement le JSON visible. La latence des relances correspondantes est 41,1 / 103,7 / 51,1 secondes.

## Recompte des préparations finales

85 préparations inspectées, dont 53 vérifiables avec le référentiel de composition et 32 non vérifiables. Aucun dépassement de 10 % de la masse prête n’est retrouvé parmi les 53 vérifiables. Le calcul utilise les ingrédients finaux rendus, et non les alertes anciennes du parseur avant redimensionnement. Cela ne valide ni l’adéquation énergétique, ni les 32 pots inconnus. Référence relue le 6 septembre : 925 entrées et 2 702 aliases ; méthode et résultats dans [final-mass-check.ts](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/final-mass-check.ts>) et [final-masses.json](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/final-masses.json>).

## Périmètre et incidents du banc

API/Auth/PostgREST et runtime Supabase locaux, vrais appels fournisseur IA. Fixtures fictives ; comptes créés et identifiants conservés dans [created-fixtures.json](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/created-fixtures.json>). Aucun reset, déploiement ou suppression de données. Les premiers essais Node fetch ont rencontré une limite client implicite de 300 s : remplacement par node:http, interruption du banc et exclusion de ces deux tirs de l’analyse de latence isolée. La première lecture service avait un mauvais apikey opaque et a été reprise avec annotation. B01 ne valide pas les jours de cuisine : sa fixture utilisait cooking_days au lieu de cook_days. Les sentinelles du compte secondaire B04 sont exclues des défauts, conformément à la règle maître vérifiée en RPC.

Le référentiel de composition peut être enrichi par un draft. Les fixtures sont figées pour les rejeux, mais un référentiel global mutable reste une limite de reproductibilité à corriger dans le banc de staging.
