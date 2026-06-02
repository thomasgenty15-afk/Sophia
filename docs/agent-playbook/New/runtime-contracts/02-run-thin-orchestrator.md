# run.ts Thin Orchestrator Contract

## Mental Model

`run.ts` est une façade de tour. Il charge, appelle les pipelines, persiste et
log. Il ne doit pas connaître les slots internes, les brouillons ou les règles
métier des skills.

## Runtime Shape

```txt
run.ts
  -> loadTurnRuntimeContext
  -> runTurnRoutingPipeline
  -> runClarification / handoff arbitration when needed
  -> runOperationRuntimePipeline
  -> runConversationRuntimePipeline
  -> runFinalResponsePipeline
  -> persistTurnOutcome
```

## File Ownership

- `run.ts` : orchestration IO et compatibilité publique `processMessage`.
- `plan_snapshot_runtime.ts` : projection plan du tour.
- `operation_runtime_pipeline.ts` : sélection et exécution tool runtime.
- `handoff_flow_arbitration.ts` : continuité/interruption générique des
  handoffs actifs.
- `product_surface_registry/*` : destinations plateforme canoniques.
- `final_response_pipeline.ts` : guards finaux et style.
- `recommendation_runtime.ts` : recommandations/bridges consentis.

## Inputs

- `supabase`, `userId`, `userMessage`, `history`, `meta`, `opts`.
- state utilisateur et `tempMemory`.
- `TurnFrame`, `RouteDecision`, `TurnAgenda`.

## Outputs

- `content`, `mode`, `tool_execution`, `executed_tools`.
- `platform_handoff` / `clarification` quand le résultat est non-mutant.
- `conversation_turn_trace`.
- état utilisateur persisté.

## Invariants

- `run.ts` ne contient pas de writer métier.
- `run.ts` ne contient pas de status composer DB-grounded.
- `run.ts` ne contient pas la chaîne détaillée des tool runners.
- `run.ts` ne contient pas les guards sémantiques de réponse finale.
- `run.ts` ne transforme pas un `platform_handoff` en effet bloqué ou en
  pending confirmation exécutable.

## Integration Points

- Appelle les pipelines, mais ne décide pas les transitions métier.
- Enregistre le ledger, mais ne mappe pas lui-même les effets outil par outil.
- Passe l'état actif aux handoff skills, mais ne lit pas leurs slots.

## Allowed Changes

- Ajouter une étape de pipeline si elle reste générique.
- Ajouter un log/trace non-mutant.
- Extraire un bloc de responsabilité vers un module dédié.
- Brancher une arbitration handoff ou clarification si l'owner reste
  propriétaire du contenu métier.

## Forbidden Changes

- Ajouter une exception card/reminder/potion/weekly directement dans `run.ts`.
- Créer ou annuler un objet durable depuis `run.ts`.
- Faire du texte visible métier dans `run.ts` hors fallback technique global.
- Mapper `adjust_plan_item`, cartes, potion, recurring reminder ou préférences
  vers un executor depuis `run.ts`.

## Legacy Exceptions

Les exports conservés pour compat tests doivent déléguer à des modules
propriétaires et être marqués comme transitoires.

## Required Tests

- `deno check router/run.ts`
- tests operation path ;
- tests platform handoff path ;
- tests clarification path ;
- tests normal path ;
- tests no done without commit ;
- tests no `*ForTest` called from prod runtime.

## Suivi Des Décisions Architecturales

| Date | Décision | Statut | Référence |
| --- | --- | --- | --- |
| 2026-05-30 | `run.ts` doit devenir un orchestrateur mince, pas un cerveau métier bis. | À implémenter | Plan run thin orchestrator |
| 2026-06-01 | `run.ts` orchestre désormais aussi les résultats non-mutants `platform_handoff` et `clarification`, sans posséder leurs règles métier. | Active | Architecture handoff V1 |
