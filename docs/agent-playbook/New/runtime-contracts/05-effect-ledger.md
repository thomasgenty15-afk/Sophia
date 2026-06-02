# EffectLedger Contract

## Mental Model

`EffectLedger` est la preuve transversale des effets visibles et des resultats
runtime non-mutants dans Sophia Brain. Il ne décide pas quoi faire et ne
comprend pas le métier : les skills décident, les executors écrivent, le ledger
prouve ou trace, puis le renderer ou le final guard parle seulement de ce qui
est prouvé.

Règle non négociable :

```txt
requested -> allowed / blocked -> committed / failed
```

Un effet durable visible n'existe dans la réponse user-facing que s'il existe
un `committed` ledger correspondant, produit après le succès réel de
l'executor ou de l'écriture DB. `executedTools` n'est jamais une preuve
suffisante seul.

Un `platform_handoff` ou une `clarification` n'est pas un effet durable. Il
peut être `proposed`, `delivered` ou `asked` sans commit. C'est un succès
conversationnel non-mutant quand le message est honnête sur le fait que Sophia
ne modifie rien depuis le chat.

La DB métier reste la vérité d'état courant. Le ledger persistant est une
timeline d'exécution observée, pas un read model qui remplace les tables métier.

## Dépend De L'Architecture De X

Ce domaine dépend de :

- `UserTurnSnapshot` pour lire l'état complet du tour avant mutation ;
- `TurnAgenda` pour distinguer `reply`, `effect`, `platform_handoff`,
  `clarification`, `status`, `memory` et `repair` ;
- Confirmation Contract pour interpréter approve/reject/revise/explain ;
- `EffectLedger` pour ne jamais dire "c'est fait" sans effet committé ;
- les contrats locaux des tools/skills pour l'intake, le reducer, les effets
  et le renderer.

Utilisation actuelle dans le code :

- `router/run.ts` crée `const effectLedger = createEffectLedger(...)`, aligne
  son `turn_id` avec le `TurnFrame`, puis appelle
  `recordAgendaEffectsInLedger`, `recordToolSkillEffectsInLedger` et
  `recordRecommendationEffectInLedger`.
- `router/turn_agenda.ts` produit les tâches `effect`, `platform_handoff` et
  `clarification` qui deviennent respectivement des entries durables ou
  non-mutantes via `recordAgendaEffectsInLedger`.
- `router/confirmation_contract.ts` et les confirmations locales des tools
  décident approve/reject/revise/explain. Le ledger ne relit jamais le message
  user pour décider une confirmation.
- Les routers propriétaires (`tools/.../router.ts`) exposent
  `requested_effects`, `allowed_effects`, `blocked_effects`,
  `committed_effects` et, quand présent, `failed_effects`.
- `router/effect_ledger_adapter.ts` traduit ces tableaux en entries ledger
  génériques. Il ne doit pas décider la sémantique métier d'un effet.
- `router/final_response_pipeline.ts` appelle
  `rewriteUncommittedEffectClaims` avant le style/emoji final. Si une réponse
  affirme un effet non commité, le pipeline enregistre un `blocked`
  `final_reply.claim`.
- `router/effect_ledger_persistence.ts` sérialise la timeline dans
  `turn_summary_logs` via `log_turn_summary_log`, en non-bloquant.
- `router/effect_ledger_reader.ts` recharge l'historique récent depuis
  `turn_summary_logs`, avec fallback `conversation_turn_traces.effect_ledger`.

## Runtime Shape

```txt
dispatcher / routers
  -> TurnAgenda effect / platform_handoff / clarification tasks
  -> EffectLedger durable_effect / platform_handoff / clarification entries

tool skill router
  -> local contract + structured intake + reducer
  -> requested_effects / allowed_effects / blocked_effects
  -> executor
  -> committed_effects / failed_effects
  -> recordToolSkillEffectsInLedger

platform handoff skill router
  -> local contract + structured intake + reducer
  -> platform_handoff proposed / delivered
  -> no_chat_mutation=true
  -> committed_effects=[] / executedTools=[]
  -> record platform_handoff in ledger

normal reply / operation reply
  -> final_response_pipeline
  -> rewriteUncommittedEffectClaims
  -> trace + optional persisted EffectLedger timeline
```

## File Ownership

- `router/effect_ledger.ts` possède les types génériques
  `EffectLedgerStatus`, `EffectLedgerEntry`, `EffectLedger`, les fonctions
  `recordRequestedEffect`, `recordAllowedEffect`, `recordBlockedEffect`,
  `recordCommittedEffect`, `recordFailedEffect`, `hasCommittedEffect`,
  `summarizeEffectLedgerForTrace`,
  `serializeEffectLedgerForPersistence` et
  `rewriteUncommittedEffectClaims`.
- `router/effect_ledger_adapter.ts` possède le mapping runtime générique :
  `effectTypeFromToolType`, `executedToolsForStatus`,
  `recordToolSkillEffectsInLedger`, `recordAgendaEffectsInLedger`,
  `recordRecommendationEffectInLedger` et
  `agendaBlockedReasonForOperation`.
- `router/effect_ledger_persistence.ts` possède
  `persistEffectLedgerForTurn`, writer non-bloquant vers `turn_summary_logs`.
- `router/effect_ledger_reader.ts` possède `loadRecentEffectHistory`.
- `router/final_response_guards.ts` contient encore des guards legacy
  centralisés, dont `applyUnexecutedEffectClaimGuard`.
- `router/final_response_pipeline.ts` orchestre les guards finaux, y compris
  le guard ledger.
- `router/operation_runtime_pipeline.ts` appelle les runtimes tools/direct
  effects et doit retourner des `OperationRuntimeResult` exposant les effets.
- `observability/trace_logger.ts` accepte `effect_ledger` dans
  `ConversationTurnTrace` et garde un fallback de schéma legacy.

## Inputs

- `TurnAgenda.tasks` de type `effect`, `platform_handoff` ou `clarification`.
- `toolSkillRun.requested_effects`.
- `toolSkillRun.allowed_effects`.
- `toolSkillRun.blocked_effects`.
- `toolSkillRun.committed_effects`.
- `toolSkillRun.failed_effects`.
- `ProductRecommendation` avec `decision`, `operation_type`,
  `executor_tool_id`, `requires_consent`.
- Réponse finale candidate, pour neutralisation des claims durables non
  prouvés.

## Outputs

- Entries ledger compactes avec `kind`, `status`, `effect_type`, `source`,
  `operation_id`, `committed_id`, `reason_code`, `payload_summary` et
  `db_ref`. Les entries `platform_handoff` et `clarification` portent
  `no_chat_mutation: true`, `committed: false` et `executed_tool: false`.
- `effect_ledger` dans `conversation_turn_trace`.
- Entrées persistées compactes dans `turn_summary_logs` quand le writer est
  disponible.
- Réponse finale neutralisée quand elle affirme un effet durable absent du
  ledger.

## Responsibilities

Appartient à `EffectLedger` :

- enregistrer ce qui a été demandé, autorisé, bloqué, commité ou échoué ;
- tracer les handoffs plateforme et clarifications comme événements runtime
  non-mutants ;
- compacter les payloads pour trace/persistence sans gros drafts ni texte brut
  sensible ;
- fournir une preuve booléenne via `hasCommittedEffect` ;
- empêcher les claims finaux non prouvés par `rewriteUncommittedEffectClaims` ;
- exposer une timeline récente lisible par status/product help si nécessaire.

N'appartient pas à `EffectLedger` :

- comprendre l'intention user ;
- remplir des slots métier ;
- valider une confirmation ;
- décider qu'un effet doit être lancé ;
- écrire en DB métier ;
- rendre la réponse métier normale ;
- remplacer les tables métier pour savoir ce qui est actif maintenant.

## Effect Source Matrix

| Source | Effect type stable | Statuts attendus | Propriétaire du commit | Notes |
| --- | --- | --- | --- | --- |
| one-shot reminder | `one_shot_reminder.create`, `one_shot_reminder.cancel` | requested, allowed, blocked, committed, failed | `tools/always_on/one_shot_reminder/executor.ts` | Le runtime direct dans `operation_runtime_pipeline.ts` expose les effets du router. |
| track progress | `plan_item_progress.track` | requested, allowed, blocked, committed, failed | `tools/always_on/track_progress_plan_item/db.ts` | Un `logged_progress_id` est requis pour commit. |
| recurring reminder | `platform_handoff.create_recurring_reminder` | requested, proposed, delivered, blocked, cancelled | aucun | Le rappel récurrent se crée depuis la plateforme; l'ancien effet durable recurring est hors chemin nominal. |
| attack card | `platform_handoff.prepare_attack_card` | requested, proposed, delivered, blocked, cancelled | aucun | Le brouillon carte est rendu par le skill; aucune DB card write depuis le chat. |
| defense card | `platform_handoff.prepare_defense_card` | requested, proposed, delivered, blocked, cancelled | aucun | Le brouillon défense est un handoff; `executedTools=[]`. |
| adjust plan item | `platform_handoff.adjust_plan_item` | requested, proposed, delivered, blocked, cancelled | aucun | Weekly et chat recommandent; aucun patch plan depuis le chat. |
| state potion | `platform_handoff.select_state_potion` | requested, proposed, delivered, blocked, cancelled | aucun | La potion et ses follow-ups s'activent depuis la plateforme. |
| coach preferences | `platform_handoff.update_coach_preferences` | requested, proposed, delivered, blocked, cancelled | aucun | Les préférences restent lisibles; l'écriture se fait depuis les préférences coach UI. |
| weekly bridge | `platform_handoff.adjust_plan_item` request | requested, proposed, blocked | aucun | Le weekly peut recommander un ajustement; aucun commit plan. |
| platform handoff | `platform_handoff.<operation>` | requested, proposed, delivered, blocked, cancelled | aucun | Succès conversationnel non-mutant ; ne devient jamais `committed`. |
| clarification | `clarification.<ambiguity_kind>` | requested, asked, resolved, cancelled, topic_change | aucun | Question ou résolution non-mutante ; ne crée jamais de pending executable. |
| recommendation | operation recommandée | requested, proposed, blocked | aucun | Une recommandation complexe devient `platform_handoff`; elle ne produit jamais `committed`. |
| memory candidates | `memory.write_candidate` / futur `memory.write` | requested/rejected aujourd'hui, committed futur | memory runtime/memorizer | Un candidate ou une queue n'est pas une mémoire commitée. |
| status/product reads | aucun effet durable | n/a | DB métier | Le ledger peut compléter l'historique, pas prouver l'état courant seul. |
| final reply claims | `final_reply.claim` | blocked | final guard | Un claim neutralisé est tracé comme blocked guard. |

## Inputs Par Domaine

- `update_coach_preferences/router.ts` : expose un handoff Préférences coach;
  `runtime_policy.ts` peut lire les préférences existantes, mais le chat ne les
  écrit plus.
- `one_shot_reminder/router.ts` : `OneShotReminderDirectEffectResult` expose
  `requested_effects`, `allowed_effects`, `attempted_effects`,
  `committed_effects`, `blocked_effects`.
- `track_progress_plan_item/router.ts` : `runTrackProgressPlanItemDirectEffect`
  exige un `logged_progress_id` avant `committed_effects`.
- `prepare_attack_card/router.ts` et `prepare_defense_card/router.ts` :
  les adapters runtime exposent un `platform_handoff` et gardent
  `executedTools=[]` / `committed_effects=[]`.
- `adjust_plan_item/router.ts` : expose un handoff Plan; le renderer local
  porte la recommandation, pas le ledger.
- `create_recurring_reminder/router.ts` : expose un draft de rappel récurrent à
  reprendre dans la plateforme; il peut sortir vers le direct effect one-shot si
  la demande devient ponctuelle.
- `select_state_potion/router.ts` : expose un handoff Etat / Potions; aucun
  `user_potion_sessions`, `user_recurring_reminders` ou `scheduled_checkins`
  n'est créé depuis le chat.
- `update_coach_preferences/router.ts` : expose un handoff Préférences coach;
  `runtime_policy.ts` peut lire les préférences existantes, mais le chat ne les
  écrit plus.
- `recommendation/recommendation_tool.ts` : produit une suggestion ou un
  handoff, jamais un commit.
- `memory_runtime/memorizer_bridge.ts` : valide et queue des
  `MemoryWriteCandidate`, mais ne prouve pas encore une écriture mémoire
  durable.

## Invariants

- Pas de "créé", "programmé", "appliqué", "modifié", "noté",
  "enregistré", "mémorisé" ou "activé" sans `committed` correspondant.
- `blocked` et `failed` ne comptent jamais comme commit.
- `requested` et `allowed` ne comptent jamais comme commit.
- `executedTools` doit être dérivé de `committed_effects`, directement dans le
  runtime ou via `executedToolsForStatus`.
- Un bridge weekly/recommendation ne peut pas produire de `committed_effect`.
- `platform_handoff` ne peut jamais avoir `committed`.
- `platform_handoff` ne peut jamais ajouter `executedTools`.
- `platform_handoff delivered` est un succès conversationnel, pas un échec.
- `clarification asked` est un succès conversationnel non-mutant.
- Un `MemoryWriteCandidate` n'est pas une mémoire durable.
- `payload_summary` ne doit pas contenir de draft complet, texte brut user,
  historique conversationnel, transcript ou contenu sensible massif.
- La lecture historique du ledger doit toujours être présentée comme timeline
  d'exécution, jamais comme état actuel.

## Integration Points

- `run.ts` :
  - crée le ledger ;
  - enregistre l'agenda ;
  - enregistre l'operation runtime ;
  - enregistre les recommendations ;
  - persiste le ledger non-bloquant ;
  - passe le ledger au final pipeline.
- `operation_runtime_pipeline.ts` :
  - transforme direct effects et tool skills en `OperationRuntimeResult` ;
  - doit transmettre tous les tableaux d'effets dans `toolSkillRun`.
- `final_response_pipeline.ts` :
  - applique les guards legacy centralisés ;
  - applique le guard ledger final ;
  - trace les claims neutralisés.
- `effect_ledger_reader.ts` :
  - peut alimenter status/product help en complément de la DB ;
  - ne doit jamais permettre d'affirmer qu'un objet est encore actif sans
    requête DB métier.

## Allowed Changes

- Ajouter un nouveau `effect_type` stable dans `effectTypeFromToolType`.
- Ajouter un `db_ref` compact pour une nouvelle famille.
- Ajouter un champ metadata compact non sensible.
- Ajouter un `failed_effects` dans un tool runtime si un executor peut échouer.
- Déplacer un mapping de `run.ts` vers `effect_ledger_adapter.ts`.
- Ajouter des tests transversaux qui prouvent qu'un commit est requis.

## Forbidden Changes

- Ajouter de la logique métier ou de slot filling dans `EffectLedger`.
- Marquer `committed` avant le retour réel de l'executor ou du writer DB.
- Dériver `executedTools` d'un simple `status === "executed"`.
- Faire produire un `committed_effect` à une recommendation ou à un bridge.
- Promettre une mémoire durable depuis un `MemoryWriteCandidate` ou une queue.
- Mapper un handoff plateforme en `durable_effect blocked`.
- Neutraliser une phrase de handoff honnête du type "je te conseille de le
  faire dans Plan" ou "je ne le modifie pas depuis le chat".
- Stocker des drafts complets, raw text, historique ou messages longs dans la
  persistence ledger.
- Utiliser le ledger persistant seul pour dire "ce rappel existe encore" ou
  "cette carte est active".

## Legacy Exceptions

- `final_response_guards.ts` contient encore
  `applyUnexecutedEffectClaimGuard`, garde legacy basée sur
  `intendedTools/executedTools`. Elle reste comme défense transitionnelle tant
  que tous les chemins passent par `runFinalResponsePipeline` + ledger. Elle
  pourra être supprimée quand les tests de final response prouvent que
  `rewriteUncommittedEffectClaims` couvre les claims durables sans faux
  positifs.
- `memory_runtime/memorizer_bridge.ts` queue les candidates sans preuve de
  write finale. Tant que le memorizer ne retourne pas un ID stable, le ledger
  ne doit tracer que `memory.write_candidate` requested/rejected ou bloquer les
  claims "je m'en souviens".
- `status_recap` peut mentionner un "créé puis annulé" du tour seulement s'il
  lit la DB actuelle ou un ledger récent explicitement présenté comme
  historique. Le ledger seul ne remplace pas la DB.
- Certains fallbacks d'orchestration dans `run.ts` restent pendant la migration
  vers `operation_runtime_pipeline.ts`, mais ils doivent appeler l'adapter
  ledger et ne pas porter de logique métier nouvelle.

## Required Tests

- `router/effect_ledger.test.ts` :
  création ledger, statuts, commit vs failed/blocked, compaction payload,
  rewrites de claims préférence/rappel/carte/plan/potion/progrès/mémoire.
- `router/effect_ledger_adapter_test.ts` :
  mapping effect types, db_ref, failed_effects, `executedToolsForStatus`,
  agenda blocked, recommendation request-only, handoff non-mutant.
- `router/effect_ledger_integration_test.ts` :
  `executed_tools_requires_committed_effect`,
  `blocked_effect_does_not_authorize_success_reply`,
  `failed_effect_does_not_authorize_success_reply`,
  `bridge_request_does_not_commit`,
  `memory_candidate_is_not_memory_commit`,
  final guards plan.
- `router/effect_ledger_persistence_test.ts` :
  serialization compacte, pas de draft/raw text, persistence non bloquante.
- `router/effect_ledger_reader_test.ts` :
  lecture depuis `turn_summary_logs` puis fallback
  `conversation_turn_traces`.
- Tests propriétaires de tools à maintenir :
  `one_shot_reminder/one_shot_reminder_tool_test.ts`,
  `track_progress_plan_item/track_progress_plan_item_tool_test.ts`,
  `prepare_attack_card/tests.ts`,
  `prepare_defense_card/tests.ts`,
  `adjust_plan_item/router_test.ts`,
  `create_recurring_reminder/tests.ts`,
  `select_state_potion/tests.ts`,
  `update_coach_preferences/tests.ts`.
- Tests handoff transverses attendus :
  handoff proposé/livré sans `committed`, sans `executedTools`, wording
  honnête autorisé, done language bloqué, et complex tools absents des effets
  durables exécutables.

## Suivi Des Décisions Architecturales

| Date | Décision | Statut | Référence |
| --- | --- | --- | --- |
| 2026-05-29 | Ledger par tour protège les claims visibles. | Active | `15-chantiers-log.md` J29 |
| 2026-05-30 | EffectLedger devient la preuve obligatoire pour tout effet durable visible ; bridges/recommendations/memory candidates ne peuvent pas committer. | Active | `15-chantiers-log.md` J53 |
| 2026-05-30 | Ledger persistant sert de timeline d'exécution, pas d'état métier. | Active | `effect_ledger_persistence.ts`, `effect_ledger_reader.ts` |
| 2026-06-01 | Les complex tools V1 ne sont plus ledgerisés comme effets durables chat; ils deviennent `platform_handoff.*`, sans commit ni executed tool. | Active | Architecture handoff V1 |
