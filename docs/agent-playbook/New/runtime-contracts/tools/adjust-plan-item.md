# adjust_plan_item Runtime Contract

## Mental Model

`adjust_plan_item` est le tool skill propriétaire des modifications de plan. Il
ne modifie jamais le plan parce qu'un routeur global a reconnu une intention ou
parce qu'un brouillon existe. Il avance selon :

```txt
contract -> structured intake -> reducer/router -> effects -> executor -> renderer
```

Le skill possède le cycle métier complet : scope, intake spécialisé,
draft/review, confirmation, rejet, révision, explication, execution, nettoyage
de frame et bridge weekly. `run.ts` ne doit fournir que le contexte runtime et
le writer DB injecté.

## Dépend De L'Architecture De X

Ce domaine dépend de :

- `UserTurnSnapshot` / `TurnFrame` / `RouteDecision` pour lire l'état complet du
  tour sans réinventer le routage global ;
- `TurnAgenda` pour distinguer reply/effects/status/memory/repair et suspendre
  un vieux flow quand une nouvelle intention explicite prend la main ;
- `Confirmation Contract` pour interpréter approve/reject/revise/explain sans
  confirmation parallèle globale ;
- `EffectLedger` pour ne jamais dire "c'est fait" sans effet committé ;
- le contrat local `tools/operations/adjust_plan_item/contract.ts` pour
  l'intake, le router/reducer, les effets et l'adapter runtime.

Dans le code actuel :

- `AdjustPlanRouterContext` reçoit `turnFrame`, `routeDecision`, `tempMemory`,
  `planItemSnapshot`, `safetyPregateOutput`, `sourceMessageId`, `requestId` et
  `confirmationSecret`. C'est l'équivalent local du snapshot de tour dont le
  skill a besoin.
- `maybeRunAdjustPlanItemOperation` consomme ce contexte, mais ne doit pas
  relire le monde global au-delà de ces inputs.
- Les branches `approve`, `reject`, `revise`, `explain` sont traitées dans
  `tools/operations/adjust_plan_item/router.ts`, pas par `run.ts`.
- `AdjustPlanSkillResult` expose `requested_effects`, `allowed_effects`,
  `blocked_effects` et `committed_effects`; l'adapter runtime n'ajoute
  `executedTools: ["adjust_plan_item"]` que si `committed_effects.length > 0`.
- Le writer DB reste injecté depuis `run.ts` via `writePlanPatch`, mais
  l'autorisation d'appeler ce writer appartient au router + executor du skill.

## Runtime Shape

```txt
run.ts
  -> maybeRunAdjustPlanItemOperation(context, deps IO)
  -> adjust_plan_item/router.ts
     -> state.ts load/clear/write frame
     -> intake.ts sub-skills
     -> generator.ts draft + materialization checks
     -> draft_review.ts renderer/review helpers
     -> weekly_bridge.ts weekly proposals
     -> executor.ts validation + confirmation token + writer
  -> AdjustPlanSkillResult
  -> AdjustPlanOperationRuntimeResult adapter
```

Les cinq sous-skills restent la structure métier :

- `scope_router` : choisit `specific_plan_item`, `current_level` ou
  `whole_plan`.
- `action_intake` : remplit le payload d'une action précise.
- `level_intake` : remplit le payload du niveau courant.
- `whole_plan_intake` : remplit le payload plan global.
- `draft_validation` : valide, explique, révise ou rejette le brouillon avant
  exécution.

## File Ownership

- `tools/operations/adjust_plan_item/contract.ts` possède les types publics :
  `AdjustPlanIntent`, `AdjustPlanUserIntent`, `AdjustPlanEffect`,
  `AdjustPlanCommittedEffect`, `AdjustPlanSkillResult`,
  `AdjustPlanOperationRuntimeResult`, `AdjustPlanRouterContext`.
- `workflow.ts` possède l'ordre des stages et les ids de sous-skills
  (`scope_router`, `action_intake`, `level_intake`, `whole_plan_intake`,
  `draft_validation`).
- `intake.ts` possède l'intake structuré et les sous-skills :
  `runAdjustPlanScopeRouterSubSkill`, `runAdjustPlanActionSubSkill`,
  `runAdjustPlanLevelSubSkill`, `runAdjustPlanWholePlanSubSkill`,
  `runAdjustPlanDraftValidationSubSkill`, `runAdjustPlanItemIntake`.
- `legacy_intake.ts` est un alias de compatibilité vers `intake.ts`. Il ne
  possède plus de copie divergente du workflow legacy.
- `draft_compiler.ts` possède la validation structurée de l'intention via
  `compileAdjustPlanIntent`.
- `candidate_builder.ts` et `allowed_adjustment_matrix.ts` possèdent les sets
  d'items modifiables et les capacités autorisées.
- `generator.ts` prépare le draft et les checks de matérialisation :
  `runPlanAdjustmentGenerator`, `generateAdjustPlanResultWithAi`,
  `validatePlanPatch`, `planAdjustmentMaterializationBlockReason`.
- `state.ts` encapsule les clés `tempMemory` adjust_plan :
  `loadAdjustPlanFrameFromTempMemory`, `writeAdjustPlanActiveIntake`,
  `writeAdjustPlanPendingDraftReview`, `writeAdjustPlanPendingConfirmation`,
  `writeLastAdjustPlanExecution`, `clearAdjustPlanFrame`.
- `router.ts` est le reducer/router propriétaire du lifecycle :
  `maybeRunAdjustPlanItemOperation`, `executePendingAdjustPlanDraft`.
- `runtime_adapter.ts` possède l'adaptation locale
  `AdjustPlanSkillResult ->
  AdjustPlanOperationRuntimeResult`, y compris la
  règle `executedTools` depuis `committed_effects`.
- `executor.ts` est la seule couche qui peut appliquer un patch via
  `executeAdjustPlanItem`.
- `draft_review.ts` rend les réponses user-facing de review/explain/execution :
  `adjustmentExecutionAck`, `renderAdjustPlanDraftDetails`,
  `renderPendingAdjustPlanDraftDetails`, `renderLastAdjustPlanDetails`,
  `renderPendingAdjustPlanDraftQuestionAnswer`.
- `weekly_bridge.ts` transforme le contexte weekly en pending draft review
  compatible adjust_plan_item; il ne bypass jamais la confirmation ni
  l'executor.
- `router/run.ts` reste adapter IO : charge le contexte, injecte
  `writePlanPatch`, appelle le router du skill. Il ne doit pas décider ni
  appliquer l'ajustement métier.

## Inputs

- `AdjustPlanRouterContext.userMessage`, `history`, `channel`, `userTimezone`.
- `TurnFrame` et `RouteDecision` pour savoir si le tour est admis dans le skill.
- `tempMemory` pour retrouver active intake, pending draft review, pending
  confirmation, pending recommendation et last execution.
- `planItemSnapshot` pour candidate building et matérialisation.
- `safetyPregateOutput.risk_band`.
- `confirmationSecret`, `sourceMessageId`, `requestId`.
- Writer IO injecté : `writePlanPatch`.

## Outputs

- `AdjustPlanSkillResult` structuré : `status`, `user_intent`, `reply`,
  `requested_effects`, `allowed_effects`, `blocked_effects`,
  `committed_effects`, `pending_confirmation`, `debug`.
- `AdjustPlanOperationRuntimeResult` compatible `run.ts` : `content`,
  `nextTempMemory`, `toolExecution`, `executedTools`, `toolSkillRun`.
- `toolSkillRun.skill_result` doit refléter le résultat contractuel local.
- `__last_adjust_plan_execution` ne doit être écrit qu'après execution réussie
  avec `plan_patch_id`.

## Invariants

- Pas d'application sans confirmation claire.
- Pas de plan patch sans `executeAdjustPlanItem(...).status === "executed"`.
- Pas de "c'est appliqué", "c'est fait", "j'ai modifié" sans
  `committed_effects.length > 0` et `plan_patch_id`.
- `executedTools` ne contient `adjust_plan_item` que si un committed effect
  existe.
- `writer failure`, `missing plan_item_id`, `materialization block`, `reject`,
  `revise`, `explain`, `ask_question`, `topic_change` gardent
  `committed_effects=[]`.
- `specific_plan_item` exige un `plan_item_id` réel avant execution.
- Un draft non matérialisable est bloqué par
  `planAdjustmentMaterializationBlockReason`.
- Weekly peut proposer un ajustement, mais confirmation + execution restent sous
  ownership `adjust_plan_item`.
- `intake.ts` et `generator.ts` ne doivent jamais écrire en DB.
- `state.ts` est le seul propriétaire des structures `tempMemory` adjust_plan;
  `run.ts` ne doit pas manipuler leur forme interne.

## Integration Points

- `run.ts` appelle `maybeRunAdjustPlanItemOperation` et injecte
  `writePlanPatch`. Le writer peut appeler les services DB/plan generation, mais
  seulement après autorisation du skill.
- `executor.ts` utilise `createConfirmationToken` et
  `verifyExecutorConfirmation` pour sécuriser l'application.
- `EffectLedger` consomme `toolSkillRun.requested_effects`, `allowed_effects`,
  `blocked_effects`, `committed_effects` via l'adapter runtime global.
- `weekly_bridge.ts` reçoit le contexte weekly et produit un pending review
  adjust_plan_item; il ne produit pas d'écriture directe.
- `draft_review.ts` est le renderer actuel du domaine. Il peut être renommé en
  `renderer.ts` plus tard, mais il possède déjà le wording user-facing du skill.

## Allowed Changes

- Ajouter un scope ou un change kind dans `contract.ts`, à condition d'ajouter
  les tests de compiler/generator/router correspondants.
- Déplacer des helpers legacy de `router.ts` ou `intake.ts` vers `policy.ts`,
  `renderer.ts`, `effects.ts` ou `weekly_bridge.ts`, sans changer les
  invariants.
- Renforcer `AdjustPlanSkillResult` si l'adapter runtime et les tests ledger
  sont mis à jour dans la même passe.
- Ajouter un bridge weekly si son output est un pending draft review et passe
  par l'executor.

## Forbidden Changes

- Ajouter une regex L3/L4 ou dans `run.ts` pour décider le scope, la révision,
  l'approbation ou le rejet.
- Écrire un patch depuis `run.ts`, `intake.ts`, `generator.ts`,
  `draft_review.ts` ou `weekly_bridge.ts`.
- Ajouter `executedTools: ["adjust_plan_item"]` sans committed effect.
- Afficher un wording d'exécution durable sans `plan_patch_id`.
- Bypasser `validatePlanPatch`, `planAdjustmentMaterializationBlockReason`,
  confirmation token ou safety pregate.
- Laisser weekly appliquer directement un changement de plan.

## Legacy Exceptions

- `intake.ts` reste massif et contient encore orchestration, sub-skills,
  validation et génération glue. Il est accepté comme façade legacy tant que les
  responsabilités sont documentées et testées. Suppression cible : extraire
  progressivement reducer/policy/renderer sans changer le contrat public.
- `legacy_intake.ts` reste présent seulement comme module de compatibilité pour
  les anciens imports. Condition de suppression : aucune référence au chemin
  legacy dans le repo, les scripts QA et les prompts opérationnels.
- `router.ts` garde encore des politiques d'admission/handoff venant du monde
  global (`operationRouteIsSelected`, `operationInputFromPlanAdjustmentScope`,
  recommendation pending, escape policy). Elles restent injectées depuis
  `run.ts` pour préserver les flows QA existants. Suppression cible : quand
  `UserTurnSnapshot` + `TurnAgenda` exposent ces décisions comme tâches
  structurées, le router ne recevra plus que des deps IO.
- `draft_review.ts` contient encore quelques helpers déterministes de review et
  revision simple. Ils protègent des cas QA de pré-validation sans appliquer de
  patch. Suppression cible : remplacer par sortie structurée
  `draft_validation` + renderer canonique.
- `weekly_bridge.ts` contient des matchers très ciblés pour compatibilité
  weekly. Ils sont autorisés uniquement comme bridge vers pending draft review,
  jamais comme executor. Suppression cible : weekly doit produire directement
  une proposition structurée compatible `AdjustPlanEffect`.

## Required Tests

- `tools/operations/adjust_plan_item/router_test.ts` doit couvrir approve,
  reject, explain, revise, writer failure, missing plan_item_id, materialization
  block, weekly bridge et invariants `committed_effects/executedTools`.
- `tools/operations/adjust_plan_item/tests.ts` protège les sous-skills, le
  generator, la validation de matérialisation et les scénarios structurés.
- `draft_compiler_test.ts` protège `compileAdjustPlanIntent`.
- `candidate_builder_test.ts` protège le set modifiable et les exclusions.
- Tests architecture transverses attendus quand le runtime global est touché :
  `router/effect_ledger*.test.ts`, `router/runtime_guards_architecture_test.ts`,
  `tools/operations/tool_skill_contracts_test.ts`.

## Suivi Des Décisions Architecturales

| Date       | Décision                                                                                                                    | Statut         | Référence                     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------- |
| 2026-05-30 | `adjust_plan_item/intake.ts` doit être décomposé en workflow contractuel.                                                   | En cours       | `15-chantiers-log.md` J40     |
| 2026-05-30 | `AdjustPlanCommittedEffect` devient la preuve locale d'exécution; `executedTools` dépend de `committed_effects`.            | Active         | `15-chantiers-log.md` J12/J41 |
| 2026-05-30 | `draft_review.ts` est le renderer effectif du domaine jusqu'à extraction/renommage en `renderer.ts`.                        | Legacy accepté | `15-chantiers-log.md` J41     |
| 2026-05-30 | `legacy_intake.ts` devient un alias de compatibilité et l'adaptation runtime sort de `router.ts` vers `runtime_adapter.ts`. | Active         | `15-chantiers-log.md` J61     |
