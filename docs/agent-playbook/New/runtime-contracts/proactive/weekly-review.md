# weekly_adaptive_review Runtime Contract

## Mental Model

`weekly_adaptive_review_v1` est un workflow proactif de décision hebdomadaire.
Il lit des preuves, produit une décision structurée, demande confirmation avant
tout changement durable, applique uniquement via un writer/bridge qui expose des
`committed_effects`, puis rend une réponse qui ne prétend jamais avoir appliqué
un changement sans commit.

Le chemin canonique est :

```txt
weekly_progress_review projection
  -> weekly_review evidence
  -> weekly_review reducer
  -> plan_patch confirmable
  -> confirmation review
  -> effects / adjust_plan_item bridge
  -> committed_effects
  -> renderer
```

Le weekly ne doit pas redevenir un bilan narratif qui corrige le plan au fil de
la conversation. Il possède la décision hebdomadaire, pas l'exécution durable
hors confirmation.

## Dépend De L'Architecture De X

Ce domaine dépend de :

- `UserTurnSnapshot` pour lire l'état complet du tour ;
- `TurnAgenda` pour distinguer reply/effects/status/memory/repair ;
- `Confirmation Contract` pour interpréter approve/reject/revise/explain ;
- `EffectLedger` pour ne jamais dire "c'est fait" sans effet committé ;
- le contrat local de `weekly_adaptive_review` pour l'intake, le reducer, les
  effets et le renderer.

Utilisation concrète dans le code actuel :

- `UserTurnSnapshot`/`TurnAgenda` ne sont pas encore branchés directement dans
  le module weekly. Leur rôle est simulé par le couple `TurnFrame` +
  `RouteDecision` dans `sophia-brain/router/run.ts`, qui appelle uniquement les
  fonctions exposées par `sophia-brain/skills/weekly_review/runtime.ts`.
- Le maintien du skill actif passe par
  `shouldKeepWeeklyAdaptiveReviewInConversation(...)` dans
  `sophia-brain/skills/weekly_review/bridges.ts`. Cette fonction lit
  `RouteDecision`, `TurnFrame`, `tempMemory` et l'état actif pour décider si le
  tour reste dans le weekly ou peut partir vers un tool explicite.
- La confirmation locale passe par
  `reviewWeeklyReviewConfirmation(...)` dans
  `sophia-brain/skills/weekly_review/confirmation.ts`, qui délègue au contrat
  partagé `reviewWeeklyPatchConfirmation(...)` dans
  `_shared/weekly_review/confirmation.ts`.
- Le ledger d'effets weekly partagé est
  `applyWeeklyReviewEffects(...)` dans `_shared/weekly_review/effects.ts`.
  Le chemin runtime vers `adjust_plan_item` expose aussi un marker via
  `weeklyRuntimeEffectFromOperation(...)` et ne met à jour l'état weekly via
  `markWeeklyAdaptiveReviewAdjustPlanApplied(...)` que si
  `operationRuntime.toolExecution === "success"` et que
  `executedTools` contient `adjust_plan_item`.
- Le rendu contractuel partagé est `renderWeeklyReviewDecision(...)` et
  `renderWeeklyEffectsAck(...)` dans `_shared/weekly_review/renderer.ts`.
  La façade legacy `buildWeeklyAdaptiveReviewMessage(...)` délègue désormais à
  ce renderer. Le runtime conversationnel applique en plus
  `renderWeeklyResponseWithEffects(...)` dans
  `sophia-brain/skills/weekly_review/renderer.ts` pour retirer les claims
  "appliqué/validé/enregistré" sans effets commités.

## Runtime Shape

```txt
process-checkins/index.ts
  -> loadWeeklyProgressReview(...)
  -> buildWeeklyAdaptiveReview(...)
  -> generateWeeklyAdaptiveReviewOpening(...)
  -> active skill state weekly_adaptive_review_v1

conversation turn
  -> dispatcher / routeDecision
  -> skills/weekly_review/runtime.ts facade
  -> state / confirmation / bridges / effects / renderer
  -> optional adjust_plan_item router
  -> committed_effects
  -> final response guards
```

Le module `sophia-brain/skills/weekly_review/runtime.ts` est une façade mince
qui réexporte les sous-modules du runtime weekly. Il ne doit pas redevenir un
fichier de logique métier massif.

## File Ownership

- `_shared/weekly_review/contract.ts`
  possède les types stables :
  `WeeklyReviewDecision`, `WeeklyReviewIntent`, `WeeklyReviewStatus`,
  `WeeklyReviewPlanPatch`, `WeeklyEvidenceSummary`, `WeeklyHumanSignals`,
  contraintes et stratégies.
- `_shared/weekly_progress_review.ts`
  possède la projection factuelle :
  `loadWeeklyProgressReview(...)`,
  `buildWeeklyProgressReviewFromRows(...)`,
  `buildWeeklyProgressReviewGrounding(...)`.
- `_shared/weekly_review/projection.ts`
  réexporte la projection pour garder un point d'entrée proche du contrat.
- `_shared/weekly_review/evidence.ts`
  transforme la projection en preuves exploitables :
  `flattenWeeklyReviewActions(...)`,
  `buildWeeklyHabitVerdict(...)`,
  `buildWeeklyEvidenceSummary(...)`,
  `weeklyDailyEvidenceSnapshotForAction(...)`.
- `_shared/weekly_review/reducer.ts`
  possède la stratégie hebdomadaire :
  `reduceWeeklyReview(...)`.
- `_shared/weekly_review/plan_patch.ts`
  prépare le patch confirmable :
  `buildWeeklyPlanPatch(...)`,
  `weeklyStrategyRequiresQuestion(...)`.
- `_shared/weekly_review/confirmation.ts`
  possède la review de confirmation locale :
  `reviewWeeklyPatchConfirmation(...)`,
  `weeklyPatchConfirmationClearsPending(...)`.
- `_shared/weekly_review/effects.ts`
  possède l'application injectable des effets weekly :
  `applyWeeklyReviewEffects(...)`,
  `weeklyReviewAppliedStatusForEffects(...)`.
- `_shared/weekly_review/renderer.ts`
  possède le rendu contractuel :
  `renderWeeklyReviewDecision(...)`,
  `renderWeeklyEffectsAck(...)`.
- `_shared/weekly_adaptive_review.ts`
  est une façade legacy compatible avec les check-ins. Elle doit déléguer à
  `reduceWeeklyReview(...)` et `renderWeeklyReviewDecision(...)`, pas décider
  une stratégie parallèle.
- `_shared/weekly_adaptive_review_opening.ts`
  possède l'ouverture proactive générée par IA :
  `generateWeeklyAdaptiveReviewOpening(...)` et le guard
  `weeklyAdaptiveReviewOpeningLooksValid(...)`.
- `sophia-brain/skills/weekly_review/state.ts`
  possède l'état actif runtime :
  `readWeeklyReviewState(...)`, `writeWeeklyReviewState(...)`,
  `clearWeeklyReviewState(...)`,
  `updateWeeklyReviewStateAfterTurn(...)`.
- `sophia-brain/skills/weekly_review/confirmation.ts`
  adapte la confirmation partagée au runtime actif :
  `reviewWeeklyReviewConfirmation(...)`,
  `isEarlyWeeklyPlanningValidationRequest(...)`,
  `isExplicitPendingApplyConfirmation(...)`.
- `sophia-brain/skills/weekly_review/effects.ts`
  marque les effets runtime issus du bridge :
  `weeklyRuntimeEffectFromOperation(...)`,
  `markWeeklyAdaptiveReviewAdjustPlanApplied(...)`.
- `sophia-brain/skills/weekly_review/renderer.ts`
  nettoie/rend la réponse conversationnelle runtime :
  `cleanWeeklyVisibleResponse(...)`,
  `renderWeeklyResponseWithEffects(...)`,
  `summarizeWeeklyAdaptiveReviewForAddon(...)`,
  `buildWeeklyTurnSlotAddon(...)`,
  `weeklyReturnAfterAdjustmentMessage(...)`.
- `sophia-brain/skills/weekly_review/bridges.ts`
  arbitre les sorties vers `adjust_plan_item` :
  `shouldKeepWeeklyAdaptiveReviewInConversation(...)`,
  `weeklyReviewAllowsAdjustPlanBridge(...)`,
  `operationInputFromPlanAdjustmentScope(...)`.
- `sophia-brain/skills/weekly_review/evidence.ts`
  gère la correction "j'avais oublié de cocher" pendant le weekly via
  `maybeLogWeeklyForgottenProgressParallel(...)`, en utilisant le contrat de
  commit du tool `track_progress_plan_item`.
- `sophia-brain/tools/operations/adjust_plan_item/weekly_bridge.ts`
  transforme les demandes weekly explicites en pending draft review
  `adjust_plan_item`. Il ne doit jamais être l'executor durable.
- `sophia-brain/router/run.ts`
  reste orchestrateur : il appelle les fonctions du runtime weekly, mais ne
  doit pas contenir de stratégie, renderer, confirmation ou parsing métier
  weekly.

## Inputs

- Projection factuelle `WeeklyProgressReviewV2` issue de
  `_shared/weekly_progress_review.ts`.
- Evidence daily conservée avec `source`, `reason_category`, `reason_text`,
  `still_relevant`, `reschedule_decision` et `confidence`.
- État dashboard/planning hebdomadaire confirmé.
- Réponse humaine pendant le weekly, stockée dans l'état actif et interprétée
  par le skill conversationnel.
- Pending patch weekly typé `WeeklyReviewPlanPatch`.
- Résultat d'exécution du bridge `adjust_plan_item` avec `committed_effects`.
- Corrections de progression oubliée, traitées via `track_progress_plan_item`
  et uniquement considérées comme écrites si le tool retourne un commit.

## Outputs

- `WeeklyReviewDecision` structuré avec `evidence`, `habit_verdict`,
  `human_signals`, `week_strategy`, `question`, `item_decisions`,
  `plan_patch`, `effect_plan`, `constraints`, `state_patch`.
- Message d'ouverture proactive weekly.
- Question bloquante si le signal est faible.
- Proposition confirmable de semaine suivante.
- Pending adjust-plan review quand le user demande explicitement une
  modification concrète d'organisation.
- `committed_effects` / `failed_effects` pour tout effet durable weekly.
- Réponse user-facing nettoyée des labels internes et des faux claims de
  succès.

## Invariants

- `weekly_review_v1` est la source de vérité stratégique.
- `weekly_progress_review.ts` reste une projection factuelle ; il ne décide pas
  `advance`, `repeat_week`, `bridge_week`, `level_review`, `carry_over` ou
  `drop`.
- Toute décision stratégique passe par `reduceWeeklyReview(...)`.
- Toute `plan_patch` weekly a `requires_confirmation: true`.
- Aucun changement durable weekly ne s'applique sans confirmation explicite.
- `approve` applique seulement un pending weekly patch typé et compatible.
- `reject`, `revise`, `explain`, `unrelated`, `unclear` n'appliquent jamais.
- Low/none daily coverage ou low confidence bloque la confirmation et pose une
  question, sauf cas `no_change` explicitement sûr.
- Une mission/clarification déjà faite ne peut jamais être `carry_over`,
  `drop` ou `repeat_with_week`.
- Une habitude déjà faite est comptabilisée, pas replanifiée comme tâche.
- Weekly ne modifie pas directement l'objectif du niveau ni l'architecture
  profonde du niveau. Il propose `open_level_review` si le problème est
  structurel.
- Les supports/fiches ne sont pas des items weekly à reporter ou alléger.
- Les labels internes `bridge_week`, `plan_patch`, `carry_over`,
  `item_decision`, `level_review`, `not_relevant` ne doivent pas sortir dans
  la réponse visible.
- Aucun wording "appliqué", "validé", "corrigé", "reporté", "enregistré" ne
  peut être visible sans `committed_effects` appropriés.

## Integration Points

- `process-checkins/index.ts`
  construit la projection avec `loadWeeklyProgressReview(...)`, crée la
  décision avec `buildWeeklyAdaptiveReview(...)`, génère l'ouverture via
  `generateWeeklyAdaptiveReviewOpening(...)`, puis installe l'état actif
  `weekly_adaptive_review_v1`.
- `whatsapp-webhook/handlers_pending.ts`
  active l'état weekly à partir du payload proactif.
- `sophia-brain/router/run.ts`
  appelle `shouldKeepWeeklyAdaptiveReviewInConversation(...)`,
  `weeklyReviewAllowsAdjustPlanBridge(...)`,
  `maybeLogWeeklyForgottenProgressParallel(...)`,
  `markWeeklyAdaptiveReviewAdjustPlanApplied(...)` et les render/guards du
  runtime. Il ne possède pas leur logique.
- `adjust_plan_item/router.ts`
  possède l'exécution durable des patchs d'organisation. Le bridge weekly ne
  produit qu'un pending review ; l'ack positif dépend du commit writer.
- `track_progress_plan_item/router.ts`
  possède l'écriture d'une correction de progression oubliée pendant le weekly.
- `weekly_planning_confirmation.ts`
  reste le message de confirmation de planning hebdomadaire, et réexporte
  `reviewWeeklyPatchConfirmation(...)` pour éviter une confirmation parallèle.
- `v2-weekly-bilan-engine.ts`
  est legacy. Son `materializeWeeklyAdjustments(...)` est déprécié pour le
  chemin `weekly_review_v1`.

## Allowed Changes

- Ajouter un champ au contrat local dans `_shared/weekly_review/contract.ts` si
  le reducer, les effets, le renderer et les tests sont mis à jour ensemble.
- Renforcer la projection factuelle sans y ajouter de stratégie.
- Améliorer `reduceWeeklyReview(...)` avec une règle déterministe testée.
- Ajouter une opération `plan_patch` seulement si elle reste confirmable et
  possède un effet/renderer/test.
- Ajouter un bridge vers un tool si le tool propriétaire applique via son
  executor et retourne des `committed_effects`.
- Déplacer des guards legacy de `runtime.ts` vers `guards.ts`, `renderer.ts`,
  `confirmation.ts`, `bridges.ts`, `state.ts` ou `evidence.ts`.
- Ajouter des tests ciblés sous `skills/weekly_review/*_test.ts` ou
  `_shared/weekly_review_test.ts`.

## Forbidden Changes

- Ajouter une regex weekly dans `run.ts`.
- Réintroduire une stratégie parallèle dans `_shared/weekly_adaptive_review.ts`,
  `weekly_adaptive_review_opening.ts`, `run.ts` ou `weekly_bridge.ts`.
- Appliquer un patch weekly depuis un "ok" global sans pending patch weekly
  typé.
- Utiliser `adjust_plan_item/weekly_bridge.ts` comme executor.
- Faire dire "c'est appliqué/enregistré/validé/corrigé/reporté" si le writer
  a échoué ou si aucun `committed_effect` n'existe.
- Modifier directement l'objectif du niveau depuis weekly.
- Reporter une action déjà faite.
- Masquer des labels internes uniquement par un guard final sans corriger le
  renderer ou l'instruction propriétaire.
- Ajouter une proposition tool/carte/potion pendant l'ouverture weekly.

## Legacy Exceptions

- `weekly_adaptive_review_opening.ts` génère encore une ouverture par IA à
  partir de grounding + instruction, puis valide avec
  `weeklyAdaptiveReviewOpeningLooksValid(...)`. Cette exception reste parce que
  l'ouverture doit être conversationnelle et non templated. Suppression cible :
  remplacer par un renderer/intake structuré qui produit une ouverture validée
  sans post-guard lexical.
- `sophia-brain/skills/weekly_review/confirmation.ts` garde
  `isEarlyWeeklyPlanningValidationRequest(...)` et
  `isExplicitPendingApplyConfirmation(...)` avec matchers localisés. Ils sont
  acceptés comme transition depuis `run.ts`, pas comme nouveau modèle. Condition
  de suppression : le `Confirmation Contract`/`TurnAgenda` doit porter cette
  décision sous forme structurée pour le weekly actif.
- `sophia-brain/skills/weekly_review/guards.ts` et
  `renderer.ts` contiennent encore des nettoyages lexicaux de réponse. Ils sont
  autorisés uniquement pour empêcher une fuite visible de labels internes ou de
  claims sans commit. Condition de suppression : le renderer weekly devient
  l'unique source des réponses finales et les tests prouvent qu'aucun nettoyage
  aval n'est nécessaire.
- `sophia-brain/tools/operations/adjust_plan_item/weekly_bridge.ts` contient
  encore des propositions weekly ciblées. Elles restent parce que
  `adjust_plan_item` possède l'exécution concrète de modification de plan.
  Condition de suppression : `weekly_review_v1` produit directement un pending
  patch typé consommé par `adjust_plan_item` sans matchers spécialisés.
- `maybeLogWeeklyForgottenProgressParallel(...)` accepte une correction
  "action faite mais oubliée" dans le weekly. Elle reste parce que le weekly
  reçoit parfois une preuve utilisateur rétrospective pendant le bilan.
  Condition de suppression : les corrections rétrospectives passent par un
  sous-skill structuré partagé avec `daily_action_review`.
- `v2-weekly-bilan-engine.ts` reste testé pour l'ancien bilan V2, mais
  `materializeWeeklyAdjustments(...)` est legacy et ne doit pas être utilisé
  pour `weekly_review_v1`.

## Required Tests

- `_shared/weekly_review_test.ts`
  - `validated_habits_advance`
  - `partial_with_fatigue_bridge_week`
  - `failed_not_relevant_level_review`
  - `no_signal_asks_question`
  - `low_daily_coverage_blocks_confirmation`
  - `completed_mission_never_carried_over`
  - `habit_done_counted_not_rescheduled`
  - `plan_patch_always_requires_confirmation`
  - `approve_pending_patch_applies`
  - `reject_pending_patch_clears`
  - `explain_pending_patch_no_apply`
  - `revise_pending_patch_no_apply_until_confirmed`
  - `unrelated_message_does_not_apply`
  - `no_done_language_without_committed_effect`
  - `writer_failure_reports_failure`
  - `committed_effects_required_for_applied_status`
  - renderer internal-label tests.
- `_shared/weekly_progress_review_test.ts`
  - projection daily evidence by `occurrence_id`
  - confirmed week plans only
  - done/partial/missed/not_answered/rescheduled.
- `_shared/weekly_adaptive_review_test.ts`
  - `weekly_adaptive_review_delegates_to_weekly_review_reducer`
  - `weekly_adaptive_review_message_uses_weekly_review_renderer`
  - opening copy guard.
- `sophia-brain/skills/weekly_review/weekly_review_state_test.ts`
  protège l'état actif, le unlock de validation et la mémoire de synthèse.
- `sophia-brain/skills/weekly_review/weekly_review_renderer_test.ts`
  protège le nettoyage des labels internes et le langage sans commit.
- `sophia-brain/skills/weekly_review/weekly_review_confirmation_test.ts`
  protège approve/reject/revise/explain/unrelated dans le runtime weekly.
- `sophia-brain/skills/weekly_review/weekly_review_bridges_test.ts`
  protège le bridge adjust-plan et l'absence d'application directe.
- `sophia-brain/skills/weekly_review/weekly_review_evidence_test.ts`
  protège les corrections de progression oubliée.
- `sophia-brain/tools/operations/adjust_plan_item/router_test.ts`
  doit inclure `weekly_adjust_plan_bridge_requires_commit_before_ack`.

## Suivi Des Décisions Architecturales

| Date | Décision | Statut | Référence |
| --- | --- | --- | --- |
| 2026-05-30 | `weekly_review_v1` est la source de vérité stratégique ; `_shared/weekly_adaptive_review.ts` reste une façade compatible qui délègue au reducer et au renderer du contrat. | Active | `15-chantiers-log.md` J22 |
| 2026-05-30 | Le runtime weekly est maintenant documenté comme façade de sous-modules `state`, `confirmation`, `effects`, `renderer`, `bridges`, `guards`, `evidence`; `run.ts` ne doit pas reprendre ces responsabilités. | Active | `15-chantiers-log.md` J55 |
| 2026-05-30 | Les guards lexicaux weekly restent une exception legacy acceptée uniquement pour empêcher une fuite visible ou un claim sans commit. | Legacy accepté | `15-chantiers-log.md` J55 |
