# LOT 8 · familles ① et ② — cas du chantier → où il est prouvé

`N` = test neuf de ce lot. `D` = déjà couvert avant.

## Famille ① — Identité/SQL

| Cas | État | Où |
|---|---|---|
| nouveau compte | D | `personal_household_test.sql` ① · `…lifecycle_test.sql` ④ |
| ancien sans foyer | D + **N** | primitive : `personal_household_test.sql` ① — rattrapage : `lot8_identite_test.sql` ①.a–①.f (9 cas) |
| deux `ensure` simultanés | **N** (partiel, limite nommée) | `lot8_identite_test.sql` ② — verrou avant lecture, index unique qui mord, cas non-mordant. La course réelle n'est pas reproductible en transaction annulée. |
| backfill répété | **N** | `lot8_identite_test.sql` ①.e — filtre `not exists` + idempotence sur une échéance 2019 |
| membre existant | D | `personal_household_test.sql` ③ · `…lifecycle_test.sql` ② |
| invitation depuis foyer personnel | D (vide) + **N** (porteur de plan) | `…lifecycle_test.sql` ① · `lot8_identite_test.sql` ③ (branche `vide_conserve`, 6 cas) |
| départ | D (échéance connue) + **N** (échéance inconnue) | `…departure_test.sql` ②③ · `lot8_identite_test.sql` ④ |
| suppression de compte | D (refus de `ensure`) + **N** (rattrapage + résidu) | `personal_household_test.sql` ④ · `lot8_identite_test.sql` ①.d et ⑤ |
| conservation essais et droits | D + **N** | `…test.sql` ③ · `…lifecycle` ③ · `…departure` ②③ · `lot8_identite_test.sql` ①.c ①.e ④ |

## Famille ② — Autorisation

| Cas | État | Où |
|---|---|---|
| maître seul autorisé | D | `generation_context_test.ts` ① |
| maître de plusieurs autorisé | D | `generation_context_test.ts` ② |
| secondaire toujours refusé, même pour un seul mangeur | D + **N** | `generation_context_test.ts` ③ · `lot8_autorisation_test.ts` ① (séquence) |
| appels directs | **N** | `lot8_autorisation_test.sql` ③ — 5 RPC fermées, 6 ouvertes, écriture directe refusée, aucune politique d'écriture |
| ancien endpoint | **N** | `lot8_autorisation_test.ts` ⑤ — **un défaut épinglé** (D1) + vocabulaire commun |
| brouillon / édition / adoption / remplacement | **N** | `lot8_autorisation_test.ts` ④ — l'admission précède la lecture de `body.operation` et `body.intent` ; les quatre gestes existent bien dans ce handler |
| identifiants falsifiés | **N** | `lot8_autorisation_test.sql` ② — `plan_not_replaceable` sur autrui, sur la nature, sur un rejeu ; + le cas qui passe. `lot8_autorisation_test.ts` ② — aucun champ client n'entre dans le verdict |
| RLS historique après rattachement | **N** | `lot8_autorisation_test.sql` ① et ④ bis — 8 lectures mesurées sous `authenticated`. **Un défaut relevé** (D2) |
| perte du droit à l'entrée, retour après départ | **N** | base : `lot8_autorisation_test.sql` ④ · décision : `lot8_autorisation_test.ts` ① |

## Hors périmètre de ces deux familles

Parité N = 1, corps/énergie, allocation, densité, mesure/service, réparations,
banc : les sept autres lignes du tableau du lot 8.
