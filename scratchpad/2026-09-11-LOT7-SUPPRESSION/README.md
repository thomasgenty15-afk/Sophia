# Lot 7 — suppression de `generate-meal-v1`

`supabase/functions/generate-meal-v1/index.ts` : **5 755 lignes**, supprimé le 2026-09-11.

## L'audit qui a précédé

`grep` naïf : 115 fichiers. Après retrait des commentaires : **53**. Parmi eux,
**zéro appelant runtime** :

| Porte | Verdict |
|---|---|
| `supabase/config.toml` | la fonction n'y est pas déclarée |
| `cron.job` en base | aucune commande ne la nomme |
| `functions.invoke(...)` côté front | aucun — le client navigateur est parti au lot 7 (moitié UI) |
| `frontend/src/keel/api/onboarding.ts` | 7 chaînes `consumer:` — de la **documentation**, pas un appel |
| le reste | des tests qui lisent son SOURCE, et des scripts de banc |

## Fichiers de test supprimés AVEC la lane

Chacun n'éprouvait que la lane individuelle, et la règle qu'il protégeait a un
porteur côté foyer :

| Fichier | La règle vit toujours dans |
|---|---|
| `solo_lane_injection_test.ts` | `household_prompt_v34_test.ts` |
| `solo_boxes_test.ts` | `box_expected_test.ts`, `box_one_per_mouth_test.ts` |
| `dietary_regime_solo_lane_test.ts` | `dietary_regime_test.ts` |
| `kitchen_equipment_solo_lane_test.ts` | `kitchen_equipment_test.ts` |
| `food_exclusion_solo_lane_test.ts` | `food_exclusion_belt_test.ts` |
| `verdict_denominator_wiring_test.ts` | `verdict_anchor_same_denominator_test.ts` |
| `plan_explanation_wiring_test.ts` | la moitié foyer est dans `household_voices_test.ts` |

⛔ **Aucune assertion métier n'a été retirée pour faire disparaître un rouge.**
Les tests à deux lanes gardent leur entrée FOYER ; seuls les jumeaux solo partent.

## Sauvegardes

- la fonction : `/tmp/generate-meal-v1-supprime/`
- les tests : `/tmp/keel-supprimes/`
