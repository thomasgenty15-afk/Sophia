# Global Runtime Contract

## Mental Model

Sophia Brain est un noyau d'orchestration mince autour de skills propriétaires.
Le runtime global ne comprend pas les détails métier des skills. Il sélectionne
le propriétaire du tour, applique les garanties globales, journalise les effets
et persiste l'état.

## Runtime Shape

```txt
processMessage
  -> load user state/context
  -> dispatcher produces TurnFrame
  -> routers choose owner
  -> UserTurnSnapshot + Agenda resolve competing intents
  -> operation_runtime_pipeline OR conversation_runtime_pipeline
  -> EffectLedger records requested/allowed/committed/failed/blocked
  -> final_response_pipeline guards visible reply
  -> persist state/logs
```

## File Ownership

- `router/run.ts` : façade IO et orchestration globale.
- `dispatcher/*` : première compréhension globale du tour.
- `routers/*` : choix déterministe du propriétaire depuis `TurnFrame`.
- `router/user_turn_snapshot.ts` : snapshot canonique du tour.
- `router/turn_agenda.ts` : agenda multi-intention.
- `router/effect_ledger.ts` : vérité d'exécution du tour.
- `skills/*` et `tools/*` : workflows propriétaires.

## Inputs

- message user courant ;
- historique récent ;
- `tempMemory` ;
- projections DB utiles ;
- `TurnFrame` ;
- `RouteDecision` ;
- active/pending skill state.

## Outputs

- réponse visible ;
- state patch ;
- tool runtime result ;
- effect ledger ;
- trace conversation turn ;
- logs observabilité.

## Invariants

- Pas de DB write hors executor propriétaire.
- Pas de "c'est fait" sans `committed_effect`.
- Pas de confirmation globale qui applique un brouillon dont le skill n'est pas
  propriétaire.
- Pas de fallback regex métier quand l'IA de compréhension échoue.
- Pas de patch L3/L4 nouveau sans exception documentée.

## Integration Points

- `UserTurnSnapshot + Agenda` bloquent les effets incompatibles.
- `ConfirmationContract` normalise approve/reject/revise/explain.
- `EffectLedger` autorise ou réécrit les claims visibles.
- `status_recap` lit DB + traces, mais ne mute jamais.

## Allowed Changes

- Extraire une responsabilité de `run.ts` vers un module propriétaire.
- Ajouter un invariant global s'il ne comprend pas de sémantique métier brute.
- Ajouter une trace ou un test d'architecture.

## Forbidden Changes

- Ajouter dans le runtime global une règle `if message contains ...`.
- Faire écrire un reducer ou renderer en DB.
- Faire dépendre un test métier standard d'une vraie clé IA.
- Faire d'un fallback technique un brouillon métier.

## Legacy Exceptions

Les guards sémantiques legacy doivent être isolés et porter une condition de
suppression. Ils ne doivent pas être étendus.

## Required Tests

- agenda interruption ;
- confirmation contract ;
- effect ledger claims ;
- no tool without consent ;
- no done language without commit ;
- central `run_test.ts` déterministe.

## Suivi Des Décisions Architecturales

| Date | Décision | Statut | Référence |
| --- | --- | --- | --- |
| 2026-05-30 | Le runtime global orchestre mais ne possède pas les règles métier des skills. | Active | `00-architecture-doctrine.md` |
| 2026-05-30 | Renuméroter le contrat global de `00-global-runtime.md` vers `01-global-runtime.md` pour réserver `00` à la doctrine. | Active | J59 |
