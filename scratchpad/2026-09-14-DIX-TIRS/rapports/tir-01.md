# Tir 1 — N=1 perte · 2026-09-14 18:14 Europe/Paris

Grille : [mesure.md](../../../docs/keel/mesure.md). Instrument : `analyse-lot-F.ts` sur la demande figée `scratchpad/2026-09-11-CLOTURE/fixtures/dix-tir1.json`. Sortie brute : `sorties-lot-F/campagne-tir1-b10-2026-09-14T16-14-02-583Z.json`. Compte `lotf.camp1.b10@keeltest.dev`. Requête `603f0a95-a241-422a-abe6-8af59f8e265f`.

HTTP **409** n'est pas une livraison. Les contrôles 1 à 9 restent **non mesurables** : aucune ligne dans `student_generated_meals`. L'instrument l'écrit : « cette sortie ne porte aucune ligne écrite (le tir a échoué). »

## Bilan de livraison

| | |
|---|---|
| HTTP | 409 |
| erreur | `plan_not_written` |
| détail | `function public.write_student_meal_plan(..., p_duration_days => integer, ...) does not exist` |
| ligne écrite | non |
| durée | 127 962 ms |
| plafond hébergé | 150 000 ms → passerait le cut Kong de production |
| modèle | `gpt-5.6-luna` |
| transmissions fournisseur | **1** (génération initiale, 126 986 ms, succès) |
| réparations | 0 demandées / 0 archivées |
| premier jet | 10 944 caractères, prompt 25 843 |

Le modèle a répondu. L'écrivain n'a pas été trouvé : `keel_household_publish_generation` passe `p_duration_days integer` ; `write_student_meal_plan` n'existe qu'en `smallint`. En notation nommée, PostgreSQL ne résout pas l'appel.

## Les cinq dénominateurs

Déduits de la **demande figée avant l'appel**, jamais des plats (il n'y en a pas en base).

```text
cases attendues     6   (mar+mer × breakfast/lunch/dinner ; lundi retiré, shopping_cutoff)
plats présents      non mesurable — aucune ligne écrite
portions calculées  non mesurable
portions mesurables non mesurable
portions conformes  non mesurable
```

Annonce avant l'appel : 6 cases × 1 bouche = 6. Total figé : 6. ✅ l'attendu est celui qui avait été annoncé.

Bouche : Paul, 178 cm, 88 kg, homme, appétit moyen, objectif `fat_loss`, 0,5 kg/sem. Aucun rythme déclaré, aucun repas léger, aucun apport fixe, aucune allergie.

## Les dix contrôles

| Contrôle | État | Mesure |
|---|---|---|
| 1. Calories du créneau | **non mesurable** | pas de boîte persistée ; `boxNutrition` n'a rien à lire |
| 2. Grammage de l'assiette | **non mesurable** | idem |
| 3. Ingrédients | **non mesurable** | le premier jet existe dans l'archive ; ce n'est pas l'enregistrement |
| 4. Couverture | **non mesurable** pour les plats ; **prouvé** pour l'attendu : 6 cases, grille `{tue, wed}` |
| 5. Cohérence de la journée | **non mesurable** | journée à trou par absence de plan, pas « en écart » |
| 6. Densité | **non mesurable** | prompt archivé (25 843 car.) ; reconstruction non rejouée faute de ligne |
| 7. Contraintes / sécurité | **non applicable** | aucune allergie, exclusion ni régime déclaré — « zéro violation » voudrait dire « on ne l'a pas essayé » |
| 8. Protéines | **non mesurable** | pas de portions |
| 9. Recette vs stockage | **échoue** comme livraison | rien n'est stocké ; la cohérence recette/base ne se pose pas |
| 10. Réparations et livraison | **échoue** | 1 appel modèle réussi, 0 réparation, HTTP 409, motif ci-dessus. Compter ce 409 dans le dénominateur de livraison. Conformité nutritionnelle **non évaluée**. |

Tolérances annoncées (±10 % / ±5 %) : **non appliquées** — pas de portions à juger.

## Prouvé

- La demande a été figée **avant** l'appel : 6 cases, mar+mer, 1 bouche, lundi tombé pour `shopping_cutoff`.
- Un appel fournisseur a abouti (premier jet 10 944 car.).
- La publication a échoué sur la signature `integer` vs `smallint` de `write_student_meal_plan`.
- Durée sous le plafond hébergé 150 s.

## Échoue

- Livraison : 409 `plan_not_written`.
- Contrôle 9/10 au sens enregistrement : aucune ligne.

## N'a pas pu être mesuré

- Contrôles 1, 2, 3, 5, 6, 8.
- Couverture des plats (contrôle 4 côté présents).
- Plancher protéique, densités, kcal par case.
- Porte finale rejouée par l'instrument (pas de journal `keel.household_meal.final_gate` dans la fixture : `/tmp/keel-serve.log` introuvable au gel).
