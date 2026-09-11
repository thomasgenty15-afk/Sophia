# État de départ — chantier moteur unique

Relevé le 2026-09-10T15:22:11Z · HEAD `080eb19d` · branche `ff-001-quotidien-du-coach`

⛔ L'arbre est PARTAGÉ et porte du travail en vol. Un écart avec HEAD prouve une
modification non commitée — ni son auteur, ni son antériorité à ce chantier.

## Empreintes des fichiers du chantier

| fichier | git | lignes | sha256 (12) |
|---|---|---|---|
| `frontend/src/keel/api/planRouting.ts` | = | 67 | `13a35e85ad26` |
| `supabase/functions/generate-household-meal-v1/index.ts` | M | 14817 | `fc13731f6ab2` |
| `supabase/functions/generate-meal-v1/index.ts` | M | 5658 | `8213d7f05b6d` |
| `supabase/functions/_shared/keel/household_bodies.ts` | = | 298 | `78a438e5f821` |
| `supabase/functions/_shared/keel/portion_sizing.ts` | ?? | 2959 | `25d4fcda1673` |
| `supabase/functions/_shared/keel/mouth_anchor.ts` | M | 1490 | `087a90e7fa1c` |
| `supabase/functions/_shared/keel/meal_energy_shared.ts` | ?? | 376 | `ba5936590b02` |
| `supabase/functions/_shared/keel/meal_envelope.ts` | M | 1996 | `4d61b13e71cf` |
| `supabase/functions/_shared/keel/weight_pace.ts` | M | 984 | `d2152f6cfd22` |
| `supabase/functions/_shared/keel/plan_budget.ts` | ?? | 371 | `0c606ddfb429` |
| `supabase/functions/_shared/keel/generation_model.ts` | M | 328 | `2de9115b049c` |
| `supabase/functions/_shared/gemini.ts` | M | 2939 | `4aec6c970b20` |
| `supabase/functions/_shared/keel/final_plan_gate.ts` | = | 1550 | `8660c46c8cf6` |
| `supabase/functions/_shared/keel/draft_adopt.ts` | = | 768 | `7ee2c9a8e462` |
| `supabase/functions/_shared/keel/food_exclusion_belt.ts` | = | 364 | `5d835ed157ed` |
| `supabase/functions/_shared/keel/household_restriction_lock.ts` | = | 142 | `c0310c1d9f5b` |
| `supabase/functions/_shared/keel/slot_fixed_kcal.ts` | ?? | 131 | `30e07d4defc8` |
| `supabase/functions/_shared/keel/household_fixed_intakes.ts` | M | 338 | `7b707343ef7f` |

## L'arbre, en gros

```
 602 ??
 298 M
  26 D
```

## Les rouges REPRODUITS au départ

⛔ **Le premier relevé n'a rien pu lancer** : `composition_fill_test.ts:225` ne
compilait pas contre `FilledComposition.reviewReason`, ajouté par le travail en
vol d'un autre agent sur le même arbre. Le décor a été complété
(`reviewReason: null`) — c'est une réparation, pas un contournement : le champ
est requis, le décor l'omettait.

Après cette réparation, la suite `_shared/keel/` retrouve les **deux mêmes rouges
antérieurs** que le chantier densité avait déjà nommés et prouvés contre `HEAD` :

| Test | Cause | Preuve d'antériorité |
|---|---|---|
| `cooking_style_brief_test.ts` — « le style DÉRIVE la difficulté » | `maxFridgeDays` requis et absent du décor | `maxFridgeDays` n'existe pas dans `cooking_plan.ts` à `HEAD` |
| `household_merge_quota_test.ts` — « AUCUNE PORTE DE SORTIE » | 5 sorties entre la réclamation de quota et l'appel modèle | même mesure à `HEAD` : **1** |

⚠️ Aucun des deux n'appartient à ce chantier, et aucun n'est ajouté à une liste
de tolérance : leur cause est du travail non commité, et une tolérance écrite
pour un vol a la durée de vie d'un vol.

## ⚠️ Deux agents ont travaillé sur ce plan

Le 2026-09-10, deux agents exécutaient ce plan dans cet arbre. Le propriétaire en
a arrêté un. Les migrations `20260910160000` (couverture) et `20260910170000`
(gel) et les trois du sas `2026091018*` viennent de l'autre ; elles sont
appliquées localement et ne sont pas défaites.
