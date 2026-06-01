# Legacy Guards Contract

## Mental Model

Un guard runtime est soit un invariant de production, soit une policy runtime,
soit un patch legacy temporaire, soit un helper de test. Les fonctions `*ForTest`
ne doivent pas être appelées depuis le runtime prod.

## Runtime Shape

```txt
runtime modules
  -> production guards
  -> legacy_semantic_patches isolated
tests
  -> optional *ForTest aliases
```

## File Ownership

- `runtime_guards.ts` : invariants prod.
- `final_response_guards.ts` : guards de réponse finale.
- `legacy_semantic_patches.ts` : patchs sémantiques temporaires.
- modules propriétaires : guards spécifiques à un skill/tool.

## Inputs

- réponse visible ;
- route decision ;
- ledger ;
- user message seulement si legacy patch documenté.

## Outputs

- rewritten response ;
- blocked paths/reason codes ;
- guard events.

## Invariants

- Aucun appel prod à un suffixe `ForTest`.
- Aucun nouveau patch sémantique sans owner/removal condition.
- Renommer ne suffit pas : chaque guard doit avoir un statut clair.

## Integration Points

- Final response pipeline.
- Operation runtime pipeline.
- Tests architecture.

## Allowed Changes

- Renommer un invariant prod.
- Déplacer un guard vers son module propriétaire.
- Ajouter un alias `ForTest` seulement pour compat test.

## Forbidden Changes

- Étendre une regex legacy.
- Ajouter un guard dans `run.ts`.
- Utiliser `ForTest` depuis prod.

## Legacy Exceptions

Chaque patch doit indiquer owner cible, raison QA et condition de suppression.

## Required Tests

- no prod runtime imports ForTest ;
- legacy patches isolated ;
- final effect claim guard works ;
- behavior preserved for moved guards.

## Suivi Des Décisions Architecturales

| Date | Décision | Statut | Référence |
| --- | --- | --- | --- |
| 2026-05-30 | Les guards runtime doivent être renommés/classés, les patchs legacy isolés. | À implémenter | Plan runtime guards |
