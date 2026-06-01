# Central Test Suite Contract

## Mental Model

La suite centrale doit prouver l'architecture, pas seulement le wording. Les
tests métier standards ne doivent pas dépendre d'une vraie clé IA.

## Runtime Shape

```txt
unit tests
  -> pure reducers/guards/effects
runtime integration tests
  -> stubs IA injectés
real AI tests
  -> séparés et skippés si clé absente
```

## File Ownership

- `router/run_test.ts` : runtime intégration déterministe.
- `run_product_help_guard.test.ts` : guards produit/status.
- `effect_ledger.test.ts` : claims/effects.
- `turn_agenda.test.ts` : agenda.
- tool-specific tests : invariants métier.

## Inputs

- fixtures DB/mock Supabase ;
- stubs IA ;
- pending states ;
- tool runtime outputs.

## Outputs

- assertions sur state/effects/commits ;
- no hidden real network dependency.

## Invariants

- Aucun test métier standard ne doit échouer par `OPENAI_API_KEY missing`.
- `fallback_dashboard` n'est pas un succès nominal.
- Business writes et audit writes sont distingués.
- Les tests vérifient `committed_effects`, pas seulement le texte visible.

## Integration Points

- Test helpers IA.
- EffectLedger.
- ConfirmationContract.
- Adjust materializer.

## Allowed Changes

- Ajouter un stub IA.
- Séparer un test real-AI conditionnel.
- Corriger un attendu obsolète après analyse du contrat.

## Forbidden Changes

- Ajouter un patch runtime pour satisfaire un test.
- Masquer un vrai bug par un changement d'attendu non justifié.
- Lancer une commande de reset DB Supabase.

## Legacy Exceptions

Les tests legacy doivent documenter pourquoi ils restent et quelle condition
permet leur suppression.

## Required Tests

- `run_test.ts` sans clé IA ;
- no fallback_dashboard expected ;
- broad pause business vs audit writes ;
- no done without commit run path.

## Suivi Des Décisions Architecturales

| Date | Décision | Statut | Référence |
| --- | --- | --- | --- |
| 2026-05-30 | La suite centrale doit être déterministe sans vraie IA. | À implémenter | Plan central test suite |
