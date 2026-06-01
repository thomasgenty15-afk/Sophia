# track_progress_plan_item Runtime Contract

## Mental Model

`track_progress_plan_item` est un direct effect always-on minimal. Il logge une
progression de plan uniquement quand le `TurnFrame` porte un effet explicite,
que la cible est un item du plan courant, que le statut est clair, et que le
gate global autorise la mutation.

Ce domaine n'est pas un Tool Skill multi-tour. Il ne possede pas de slot
filling durable, pas de brouillon, pas de pending confirmation propre. Son
workflow est court :

```txt
TurnFrame.direct_effects
-> track_progress_plan_item/intake.ts
-> requested_effects
-> runDirectEffectGate
-> allowed_effects
-> db writer
-> committed_effects
-> renderer
```

La phrase cardinale reste : aucune reponse "note/enregistre/marque/valide" sans
`committed_effects[0].logged_progress_id`.

## Dépend De L'Architecture De X

Ce domaine depend de :

- `UserTurnSnapshot` pour figer l'etat complet du tour avant execution. Dans le
  code actuel, `router/run.ts` construit le snapshot avec
  `buildUserTurnSnapshot`, puis `TurnAgenda`; le direct effect consomme ensuite
  les decisions derivees plutot que de relire lui-meme les flows globaux.
- `TurnAgenda` pour distinguer reply/effects/status/memory/repair. Le runtime
  operation pipeline utilise `agendaBlockedReasonForOperation(...,
  "track_progress_plan_item")` avant d'appeler
  `runTrackProgressPlanItemDirectEffect`; `run.ts` passe aussi
  `skip_reason_code` quand checkup ou weekly review bloquent l'effet.
- `Confirmation Contract` pour ne jamais contourner une confirmation active.
  `runTrackProgressPlanItemDirectEffect` transmet
  `pending_tool_skill_confirmation` a `runDirectEffectGate`, qui bloque avec
  `pending_confirmation_active`.
- `EffectLedger` pour ne jamais dire "c'est fait" sans effet committe.
  `TrackProgressDirectEffectResult` expose `requested_effects`,
  `allowed_effects`, `blocked_effects` et `committed_effects`; l'adapter
  transverse `router/effect_ledger_adapter.ts` mappe
  `track_progress_plan_item` vers `plan_item_progress.track`.
- le contrat local de `track_progress_plan_item`, dans
  `tools/always_on/track_progress_plan_item/contract.ts`, pour les intents,
  statuts, effets demandes, effets autorises, effets committes, writer et
  resultat final.

Ces briques sont complementaires : `UserTurnSnapshot` et `TurnAgenda` decrivent
le tour, `Confirmation Contract` et `runDirectEffectGate` disent si la mutation
est autorisee, le contrat local decrit l'effet, et `EffectLedger` rend le commit
observable par la reponse finale.

## Runtime Shape

```txt
router/run.ts ou router/operation_runtime_pipeline.ts
  -> maybeRunTrackProgressPlanItemRuntime / runTrackProgressPlanItemDirectEffect
  -> intake.ts: runTrackProgressIntake
  -> contract.ts: TrackProgressRequestedEffect
  -> routers/direct_effect_gate.ts: runDirectEffectGate
  -> executor.ts: executeTrackProgressWrite
  -> db.ts: createTrackProgressPlanItemWrite
  -> contract.ts: TrackProgressCommittedEffect
  -> renderer.ts: renderTrackProgressLoggedReply
  -> renderer.ts: enforceTrackProgressReplyInvariant
```

`track_progress_plan_item_tool.ts` est une facade legacy de compatibilite. Elle
delegue a `runTrackProgressPlanItemDirectEffect` et ne possede plus le statut,
la cible, la valeur ou l'ecriture.

## File Ownership

- `tools/always_on/track_progress_plan_item/contract.ts`
  - possede `TrackProgressIntent`, `TrackProgressStatus`,
    `TrackProgressWrite`, `TrackProgressRequestedEffect`,
    `TrackProgressCommittedEffect`, `TrackProgressDirectEffectResult`;
  - source de verite locale du ledger requested/allowed/committed.
- `tools/always_on/track_progress_plan_item/intake.ts`
  - possede `runTrackProgressIntake`, `requestedEffectFromIntake`,
    `isTrackProgressFutureIntent`, `isTrackProgressStatusQuestion`;
  - lit le payload dispatcher (`status_hint`, `target_item_id`,
    `target_title`, `value_hint`, `date_hint`) et retourne un resultat
    structure.
- `tools/always_on/track_progress_plan_item/router.ts`
  - possede `runTrackProgressPlanItemDirectEffect`;
  - agit comme reducer/state transition local : non-detected, ignored,
    blocked, needs_clarify, failed, logged;
  - construit `requested_effects`, appelle `runDirectEffectGate`, construit
    `allowed_effects`, délègue le write à `executor.ts`, puis rend l'état final;
  - possede `maybeRunTrackProgressPlanItemRuntime`,
    `applyTrackProgressDirectEffectRuntimeState` et
    `runTrackProgressPlanItemFromWeeklyCorrection`.
- `tools/always_on/track_progress_plan_item/executor.ts`
  - possède `executeTrackProgressWrite`;
  - appelle le writer autorisé, exige `logged_progress_id`, puis construit le
    `TrackProgressCommittedEffect`;
  - retourne `write_failed` ou `missing_logged_progress_id` sans reply visible.
- `tools/always_on/track_progress_plan_item/db.ts`
  - applique les effets autorises via `createTrackProgressPlanItemWrite`;
  - contient `logPlanItemProgressV2`, qui insere `user_plan_item_entries` et
    retourne seulement `logged_progress_id` au writer contractuel.
- `tools/always_on/track_progress_plan_item/renderer.ts`
  - rend la reponse user-facing logged;
  - applique `enforceTrackProgressReplyInvariant`.
- `tools/always_on/track_progress_plan_item/track_progress_plan_item_tool.ts`
  - facade legacy V2 pour tests/compatibilite, sans logique metier propre.
- `router/run.ts`
  - orchestre l'appel et compose la reponse finale;
  - ne doit pas decider `progress_status`, `target_item_id`, `value` ou
    `logged_progress_id`.
- `router/operation_runtime_pipeline.ts`
  - adapter operation runtime transverse; il doit relayer le resultat
    contractuel et ne pas reimplementer la mutation.
- `router/magic_reset.ts`
  - nettoie uniquement la cle runtime
    `__track_progress_plan_item_runtime`.

## Inputs

- `TurnFrame.direct_effects[]` avec `effect_type:
  "track_progress_plan_item"`;
- `payload_hint.target_item_id`, `target_title`, `status_hint`, `value_hint`,
  `date_hint` quand le dispatcher les fournit;
- `plan_snapshot` pour verifier que la cible est dans le plan courant;
- `pending_tool_skill_confirmation` pour respecter le Confirmation Contract;
- `recent_writes_idempotency` et `db_idempotency_check` pour l'idempotence;
- `no_mutation_requested` et `blocked_reason_code` quand TurnAgenda/safety/no
  tool bloquent les effets;
- `write_progress`, generalement produit par
  `createTrackProgressPlanItemWrite`.

## Outputs

- `TrackProgressDirectEffectResult` avec :
  - `requested_effects`: effet structure avant gate;
  - `allowed_effects`: effet autorise par gate;
  - `committed_effects`: effet prouve par `logged_progress_id`;
  - `blocked_effects`: raison de blocage;
  - `executed_tools`: `["track_progress_plan_item"]` seulement apres commit;
  - `reply`: uniquement si elle respecte le commit.
- Effet ledger transverse `plan_item_progress.track` via
  `router/effect_ledger_adapter.ts`.
- Etat runtime temporaire sous `__track_progress_plan_item_runtime` pour eviter
  les doubles writes sur le meme message source.

## Invariants

- Pas d'ecriture sans `TurnFrame.direct_effects` explicite
  `track_progress_plan_item`.
- Pas d'ecriture si `future_intent`.
- Pas d'ecriture si `status_question`.
- Pas d'ecriture si `no_mutation_requested` ou `blocked_reason_code`.
- Pas d'ecriture si `pending_confirmation_active`.
- Pas d'ecriture si cible ambiguë, manquante, hors plan, ou gate non-allow.
- Pas d'ecriture si statut manquant.
- Pas de double write sur le meme `source_message_id`.
- Pas de `executed_tools: ["track_progress_plan_item"]` sans
  `committed_effects.length > 0`.
- Pas de reply "note/enregistre/marque/valide" sans
  `committed_effects[0].logged_progress_id`.
- Le writer DB ne rend pas de phrase user-facing; seul `renderer.ts` le fait.
- `executor.ts` est la seule couche locale qui transforme un retour writer en
  commit local `logged_progress_id`; `router.ts` ne doit pas inventer ce commit.
- `run.ts` ne doit pas contenir de regex statut/cible, ni calculer `value`.

## Integration Points

- `routers/direct_effect_gate.ts`
  - source de verite pour safety, pending confirmation, explicitness,
    target_status, confidence, duplicate source message et duplicate DB.
- `router/turn_agenda.ts`
  - contient `track_progress_plan_item` comme operation/effect possible;
  - l'adapter runtime peut bloquer l'effet via agenda.
- `router/effect_ledger_adapter.ts`
  - mappe `track_progress_plan_item` vers `plan_item_progress.track`.
- `router/final_response_guards.ts` et `router/effect_ledger.ts`
  - protegent les claims user-facing de type progress track sans commit.
- `skills/weekly_review/runtime.ts`
  - peut signaler une correction weekly oubliee;
  - l'ecriture doit passer par
    `runTrackProgressPlanItemFromWeeklyCorrection`, qui retourne le meme
    contrat de commit.
- `router/magic_reset.ts`
  - reset la cle runtime canonique, pas un ancien marker parallele.

## Allowed Changes

- Ajouter un statut de progression seulement en modifiant `contract.ts`,
  `intake.ts`, `renderer.ts`, `db.ts` si necessaire, et les tests du contrat.
- Renforcer le payload dispatcher ou `runTrackProgressIntake` si la sortie reste
  structuree.
- Ajouter des raisons de blocage si elles sont exposees dans
  `blocked_effects` et testees.
- Ameliorer l'idempotence si elle reste dans gate/router/writer, pas dans
  `run.ts`.
- Adapter weekly forgotten progress si le resultat conserve
  `TrackProgressDirectEffectResult`.

## Forbidden Changes

- Transformer ce direct effect en Tool Skill multi-tour avec draft/pending
  confirmation propre.
- Ajouter un slot filling conversationnel local.
- Ajouter une regex cible dans `run.ts`, `router/run.ts`,
  `operation_runtime_pipeline.ts` ou `turn_intent_arbitrator.ts`.
- Dire "note/enregistre/marque/valide" depuis `db.ts`, `run.ts` ou un writer.
- Mettre `executedTools` a `track_progress_plan_item` sans committed effect.
- Bypasser `runDirectEffectGate`.
- Ecrire depuis weekly forgotten progress avec `logPlanItemProgressV2`
  directement depuis `run.ts`.
- Reintroduire `__track_progress_parallel`.

## Legacy Exceptions

- `intake.ts` contient `inferStatusFallback`, marque `TRANSITIONAL`. Il reste
  temporairement pour completer un payload direct-effect deja explicite quand le
  dispatcher n'a pas fourni `status_hint`, et seulement pour les statuts
  `completed`, `partial`, `missed`.
- Ce fallback ne doit jamais resoudre la cible, ne doit jamais bypasser
  `runDirectEffectGate`, et ne doit pas tourner sans effet
  `track_progress_plan_item` dans le `TurnFrame`.
- Condition de suppression : deux runs QA consecutifs doivent montrer que le
  dispatcher fournit `status_hint` high-confidence pour les formulations
  completed/partial/missed couvertes par
  `track_progress_plan_item_tool_test.ts`; ensuite supprimer
  `inferStatusFallback` et adapter les tests pour exiger `status_hint`.
- `track_progress_plan_item_tool.ts` reste facade legacy V2 pour compatibilite
  des tests historiques. Il doit continuer a deleguer au router.

## Required Tests

Le contrat minimal est protege par
`tools/always_on/track_progress_plan_item/track_progress_plan_item_tool_test.ts`.
Les tests doivent couvrir :

- completed -> `value=1`, `requested_effects`, `allowed_effects`,
  `committed_effects`, `logged_progress_id`;
- partial -> `value=0.5`;
- missed -> `value=0`;
- future intent -> no write;
- status question -> no write;
- target ambiguous/missing/not in plan -> no write;
- missing status -> needs clarify;
- pending confirmation active -> blocked;
- duplicate source message / duplicate DB -> blocked;
- writer missing id -> failed closed, no note;
- writer throw -> failed closed, no note;
- executor returns committed only with `logged_progress_id`;
- non-logged outcome -> no executed tool;
- weekly forgotten progress -> same commit contract;
- canonical runtime key only, no `__track_progress_parallel`.

Les tests transversaux utiles :

- `routers/effect_gate_orchestrator.test.ts`;
- `routers/routers.test.ts`;
- `router/turn_intent_arbitrator.test.ts`;
- `router/effect_ledger_adapter_test.ts` et tests EffectLedger quand le mapping
  change.

## Suivi Des Décisions Architecturales

| Date | Décision | Statut | Référence |
| --- | --- | --- | --- |
| 2026-05-29 | Agenda bloque les progress effects incompatibles. | Active | `15-chantiers-log.md` J25 |
| 2026-05-30 | `track_progress_plan_item` reste un direct effect minimal avec ledger requested/allowed/committed; le writer ne rend pas de phrase visible et `run.ts` ne porte pas la logique métier. | Active | `15-chantiers-log.md` J43 |
