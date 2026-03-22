# Machine de momentum utilisateur - Policy Phase 1

## Objectif

Encoder en dur la policy produit par état, sans encore brancher cette policy au runtime proactif.

Cette phase sert de contrat code pour la suite.

---

## Ce qui est implémenté

- un registre de policy par état dans `supabase/functions/sophia-brain/momentum_policy.ts`
- une table de décision explicite `if_state -> branch_action`
- des familles de messages autorisées / interdites
- une policy proactive minimale par état
- des limites de fréquence de base
- des conditions de sortie descriptives
- des tests de couverture du registre

---

## États couverts

- `momentum`
- `friction_legere`
- `evitement`
- `pause_consentie`
- `soutien_emotionnel`
- `reactivation`

---

## Ce que cette phase ne fait pas

- ne change aucun comportement utilisateur en prod
- ne branche pas encore les triggers sur la policy
- ne génère pas encore de messages
- ne remplace pas encore les crons ou les bilans existants

---

## Ce que ça débloque

La phase 2 d'implémentation pourra maintenant:

- lire une policy unique au lieu de re-réfléchir la logique partout
- brancher les triggers proactifs sur l'état courant
- refuser certaines familles de messages selon l'état
- appliquer des cooldowns et des gaps minimums cohérents

---

## Vérifications

- `deno test supabase/functions/sophia-brain/momentum_policy_test.ts`
- `deno check supabase/functions/sophia-brain/momentum_policy.ts supabase/functions/sophia-brain/momentum_policy_test.ts`
