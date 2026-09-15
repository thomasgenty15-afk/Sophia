# Tir 2 — N=1 gain · 2026-09-14 18:16 Europe/Paris

Grille : [mesure.md](../../../docs/keel/mesure.md). Instrument : `analyse-lot-F.ts` sur `scratchpad/2026-09-11-CLOTURE/fixtures/dix-tir2.json`. Sortie brute : `sorties-lot-F/campagne-tir2-b10-2026-09-14T16-16-13-456Z.json`. Compte `lotf.camp2.b10@keeltest.dev`. `request_id` **vide** dans la fixture : Kong a rendu le 502 avant que le harnais n'archive les étapes.

HTTP **502** n'est pas une livraison. Les contrôles 1 à 9 restent **non mesurables**. L'instrument n'a rien à lire.

## Bilan de livraison

| | |
|---|---|
| HTTP | 502 |
| corps Kong | `An invalid response was received from the upstream server` |
| ligne écrite | non |
| durée | 171 858 ms |
| plafond hébergé | 150 000 ms → **coupé en production** (21 858 ms de trop) |
| étapes archivées | aucune (`premier_jet` absent, `reparations` 0, prompt absent) |
| transmissions fournisseur | **non mesurable** depuis la sortie (étapes vides) |

Cause côté pile locale, nommée : pendant cet appel, un fichier a été créé sous `supabase/functions/_shared/keel/` ; `functions serve` a loggé `File change detected` puis `Setting up Edge Functions runtime...`. L'amont a disparu. Ce 502 n'est **pas** le 409 du tir 1 ; c'est une coupure du processus du handler.

Le journal du serve, **avant** le reload, a émis `keel.household_meal.final_gate` (`ok=true`, `delivery=deliverable_with_gaps`, 2 refus `cell_bounds_off`, 0 bloquant) puis amorcé une 2ᵉ réparation (`calls_made: 1`, `elapsed_ms: 153742`). ⛔ **Ce n'est pas une mesure.** Ce n'est pas `boxNutrition` sur une ligne figée. Ça ne se publie pas comme « 6/6 conformes ». Ça dit seulement : le worker tournait encore, puis il a été tué.

## Les cinq dénominateurs

```text
cases attendues     6   (même dérivation que le tir 1 : mar+mer, lundi retiré, shopping_cutoff)
plats présents      non mesurable — aucune ligne écrite
portions calculées  non mesurable
portions mesurables non mesurable
portions conformes  non mesurable
```

Annonce avant l'appel : 6 × 1 = 6. Total figé : 6. ✅

Bouche : Max, 178 cm, 62 kg, homme, appétit moyen, objectif `muscle_gain`. Aucune allergie, aucun régime, aucun apport fixe.

## Les dix contrôles

| Contrôle | État | Mesure |
|---|---|---|
| 1. Calories du créneau | **non mesurable** | pas de boîte persistée |
| 2. Grammage | **non mesurable** | |
| 3. Ingrédients | **non mesurable** | premier jet non archivé dans la sortie |
| 4. Couverture | attendu **prouvé** (6) ; plats **non mesurable** |
| 5. Journée | **non mesurable** | pas « en écart » : le plan n'existe pas |
| 6. Densité | **non mesurable** | pas de prompt archivé → reconstruction non prouvable |
| 7. Sécurité | **non applicable** | rien de déclaré sur cette fixture — pas « zéro violation » |
| 8. Protéines | **non mesurable** | |
| 9. Recette vs stockage | **échoue** comme livraison | rien n'est stocké |
| 10. Réparations et livraison | **échoue** | HTTP 502, durée 171,8 s > 150 s hébergé. Compter ce 502 dans le dénominateur de livraison. Conformité nutritionnelle **non évaluée**. |

## Prouvé

- Demande figée avant l'appel : 6 cases, mar+mer, 1 bouche gain.
- Kong a répondu 502 après 171 858 ms.
- Cette durée dépasse le plafond hébergé de 150 s.

## Échoue

- Livraison : 502, aucune ligne.
- Le harnais n'a pas reçu le corps du handler : étapes vides.

## N'a pas pu être mesuré

- Contrôles 1–3, 5, 6, 8, et la couverture des plats.
- Nombre réel d'appels modèle de ce tir (la sortie ne les porte pas).
- Tout compteur du journal du serve : information de process, pas une fixture de mesure.
