# status_recap Runtime Contract

## Mental Model

`status_recap` est le skill de lecture factuelle de Sophia Brain. Il répond aux
questions du type "qu'est-ce qui existe vraiment ?", "est-ce que ce rappel est
actif ?", "quelles préférences coach sont enregistrées ?", ou "fais le recap
fait/prévu/fragile".

Il ne crée, modifie, annule, confirme ou suggère jamais rien. Sa valeur vient du
fait qu'il est DB-grounded : il préfère l'état actuel des tables métier à la
mémoire conversationnelle ou à un effet demandé mais non committé.

Exception architecturale assumée : contrairement aux autres conversation
skills, `status_recap` n'a pas d'intake IA standard. Aujourd'hui sa forme est :

```txt
contract -> DB/effect projection -> deterministic reducer -> renderer
```

Cette exception est acceptable uniquement parce que le skill est strictement
non-mutant et parce que les guards déterministes servent à éviter une action
non consentie ou une affirmation non sourcée. Ces guards ne doivent pas devenir
un nouveau moteur de compréhension métier.

## Runtime Shape

```txt
status_recap/runtime.ts
  -> loadStatusRecapProjection()
  -> decideStatusRecap()
  -> renderStatusRecapDecision()
  -> OperationRuntimeResult non-mutant, toolExecution="none"
```

## Dépend De L'Architecture De status_recap

Ce domaine dépend de :

- `UserTurnSnapshot` / `TurnFrame` : fournit les intentions tool détectées et
  empêche un status de capturer un tour explicitement mutatif.
- `TurnAgenda` : le status est une tâche de lecture, pas une tâche d'effet. Il
  ne doit pas prendre la place d'un `effect_task` explicite.
- `Confirmation Contract` : un "ok" ou une validation courte ne doit jamais être
  interprété par `status_recap`. Les confirmations appartiennent au pending flow
  concerné.
- `EffectLedger` : utilisé comme timeline d'exécution récente pour signaler des
  effets failed/blocked, mais pas comme preuve d'état actuel.
- Projection DB métier : source principale de vérité pour l'état courant des
  cartes, rappels, potions et préférences coach.
- `product_help` : propriétaire des questions "où/comment dans l'app ?".
- Tool skills : propriétaires des commandes "crée/annule/modifie/active".

Règle centrale : DB métier = vérité d'état actuel ; EffectLedger = vérité
d'exécution observée ; conversation récente = contexte faible, jamais preuve
d'existence.

## File Ownership

- `supabase/functions/sophia-brain/skills/status_recap/contract.ts`
  - possède `StatusRecapIntent`, `StatusRecapObjectType`,
    `StatusRecapConstraint`, `StatusRecapProjection`, `StatusRecapDecision`;
  - documente explicitement le statut de migration via
    `STATUS_RECAP_MIGRATION_STATUS`.
- `supabase/functions/sophia-brain/skills/status_recap/projection.ts`
  - lit les tables DB et l'historique récent d'effets;
  - normalise les libellés user-facing comme les heures locales de rappel;
  - ne prend aucune décision de routing ou de stratégie.
- `supabase/functions/sophia-brain/skills/status_recap/reducer.ts`
  - choisit l'intent de lecture et les target objects;
  - porte les guards legacy de status/recap actuellement autorisés;
  - ne produit aucun effet.
- `supabase/functions/sophia-brain/skills/status_recap/renderer.ts`
  - rend les réponses factuelles compactes;
  - possède les formats `compact`, `object_answer`, `recap`,
    `fait_prevu_fragile`;
  - doit refuser les claims non sourcés.
- `supabase/functions/sophia-brain/skills/status_recap/effect_history.ts`
  - transforme l'historique ledger récent en lignes de prudence;
  - ne compte pas les effets `requested`, `failed` ou `blocked` comme faits.
- `supabase/functions/sophia-brain/skills/status_recap/runtime.ts`
  - façade appelée par `operation_runtime_pipeline.ts`;
  - applique les interdictions globales : safety, product_help, tool command,
    active card draft;
  - retourne un `OperationRuntimeResult` avec `toolExecution: "none"` et
    `executedTools: []`.
- `supabase/functions/sophia-brain/router/operation_runtime_pipeline.ts`
  - intègre `maybeRunStatusRecapRuntime()` après les effets directs déjà
    prioritaires et avant les autres tools, avec guards de non-préemption.

## Inputs

- `userMessage`.
- `RouteDecision` : signal `status_only_no_mutation_check`, reason code
  status/recap, et exclusion product_help/safety/tool skill.
- `TurnFrame` : `tool_skill_intents` bloque le status si une opération explicite
  est détectée.
- `activeOperationIntake` : un draft `prepare_attack_card` ou
  `prepare_defense_card` actif bloque le status pour éviter de répondre à la
  place du flow.
- `tempMemory` : propagée/assainie dans le résultat, mais pas source de vérité.
- DB projection :
  - `user_attack_cards`;
  - `user_defense_cards`;
  - `scheduled_checkins` pending/cancelled one-shot;
  - `user_recurring_reminders`;
  - `user_potion_sessions`;
  - `user_profile_facts` pour `coach.*`;
  - `turn_summary_logs` / fallback traces pour EffectLedger récent.

## Outputs

- `content` : réponse factuelle rendue par `renderer.ts`.
- `nextTempMemory` : mémoire temporaire nettoyée du vieux direct reminder flow
  si le status répond.
- `toolExecution: "none"`.
- `executedTools: []`.
- `toolSkillRun.selected_handler: "status_recap"`.
- Metadata de projection :
  - `projection_used`;
  - `intent`;
  - `target_objects`;
  - `attack_card_found`;
  - `defense_card_found`;
  - `reminder_found`;
  - `coach_preference_found`;
  - `recent_effect_history_count`.

## Invariants

- Non-mutating absolu.
- `operation_suggestions` doit toujours être vide.
- `toolExecution` doit toujours être `"none"`.
- `executedTools` doit toujours être `[]`.
- Pas de claim d'objet durable sans source DB métier.
- Un effet ledger `requested`, `failed` ou `blocked` ne prouve jamais qu'un
  objet existe.
- Product help "où/comment dans l'app ?" retourne `null`.
- Une commande tool explicite retourne `null`.
- Un active draft de carte retourne `null`.
- Safety retourne `null`.
- `human_recap_no_db` retourne `null` pour laisser la réponse conversationnelle
  normale gérer un recap humain sans panneau status.
- Defaults système coach ≠ préférences utilisateur explicites.
- Rappels annulés : rendre "créé puis annulé, pas actif", jamais "actif" si la
  projection DB courante indique cancelled.
- Format `fait/prévu/fragile` : trois lignes exactement, pas de question.

## Integration Points

- `operation_runtime_pipeline.ts` appelle `maybeRunStatusRecapRuntime()` après :
  - safety gate;
  - weekly blockers;
  - pending/direct adjust plan;
  - track progress;
  - direct one-shot reminder runtime.
- `run.ts` réexporte certains wrappers legacy pour compatibilité tests, mais ne
  doit plus posséder les composers status principaux.
- `turn_intent_arbitrator.ts` peut produire des signaux status/recap, mais ne
  doit pas rendre lui-même le status.
- `product_help` garde les questions de localisation, limites et fonctionnement
  produit.
- `one_shot_reminder` garde les créations/annulations/remplacements de rappel.
- `EffectLedger` persistant enrichit le recap par des lignes de prudence :
  failed/blocked n'est pas compté comme fait.

## Allowed Changes

- Ajouter une source DB à la projection.
- Ajouter un format renderer testé.
- Améliorer la séparation entre status, product_help et tool command si les
  tests anti-préemption sont renforcés.
- Remplacer progressivement les guards texte par un signal dispatcher structuré
  `status_recap` / `status_only`, sans changer les invariants non-mutants.
- Ajouter un mapping user-facing pour une nouvelle préférence coach supportée,
  si `update_coach_preferences/status.ts` la supporte aussi.

## Forbidden Changes

- Exécuter un tool.
- Donner des instructions produit détaillées.
- Préempter une création/annulation/modification.
- Dire "c'est fait", "j'ai créé", "j'ai annulé", "j'ai enregistré" sans effet
  committé et source DB correspondante.
- Utiliser la mémoire conversationnelle comme preuve d'existence.
- Compter un effet ledger `requested` comme objet créé.
- Répondre status pendant safety.
- Transformer `status_recap` en product help ou en confirmation flow.

## Legacy Exceptions

Les guards suivants restent acceptés temporairement parce que le skill est
read-only et que leur échec préféré est de retourner `null` plutôt que de
committer un effet :

- `isStatusOnlyNoMutationRequest`;
- `isRecapOnlyRequest`;
- `isFaitPrevuFragileRecapRequest`;
- `isExplicitConversationalFormatRequest`;
- `shouldRenderStatusOnlyNoMutation`;
- `isOneShotReminderExactStatusRequest` importé depuis le runtime one-shot.

Conditions de suppression :

- le dispatcher produit un signal structuré fiable pour `status_recap`;
- `TurnAgenda` distingue explicitement `status_task` et `effect_task`;
- les tests anti-préemption product_help/tool/safety restent verts;
- `human_recap_no_db` est correctement routé vers un skill conversationnel sans
  panneau status.

Interdiction : ne pas ajouter de nouveau guard sémantique local sans documenter
son owner, sa condition de suppression et un test anti-faux-positif.

## Required Tests

- non_mutating ;
- durable status DB-grounded ;
- cancelled reminder included when requested ;
- product_help question returns null ;
- tool command returns null ;
- fait_prevu_fragile three lines.
- no claim without source ;
- no done-language without source ;
- active card draft returns null ;
- human recap no DB returns null ;
- system defaults ignored as explicit coach preferences ;
- status projection prefers current DB state over historical ledger ;
- requested-only ledger effect does not create a status claim.

Tests actuels propriétaires :

- `supabase/functions/sophia-brain/skills/status_recap/status_recap.test.ts`;
- `supabase/functions/sophia-brain/skills/status_recap/status_recap_runtime_test.ts`.

Tests d'intégration pertinents :

- `supabase/functions/sophia-brain/router/run_product_help_guard.test.ts`;
- `supabase/functions/sophia-brain/router/turn_intent_arbitrator.test.ts`;
- `supabase/functions/sophia-brain/router/runtime_guards_architecture_test.ts`;
- `supabase/functions/sophia-brain/skills/conversation_skills_contract_test.ts`.

## Known Limits

- `status_recap` reste une exception hybride :
  `contract -> projection -> deterministic reducer -> renderer`, pas encore
  `contract -> structured_intake -> reducer -> renderer`.
- L'activation dépend encore de texte normalisé et de reason codes legacy.
- Le renderer est déterministe et user-facing; c'est accepté pour un status
  factuel, mais toute nouvelle phrase doit rester courte et testée.
- L'historique d'effets récent est lu depuis les traces existantes, pas depuis
  une table dédiée `effect_ledger_entries`.
- La projection ne couvre que les surfaces listées plus haut; un nouvel objet
  durable doit être ajouté explicitement à la projection et aux tests.

## Suivi Des Décisions Architecturales

| Date | Décision | Statut | Référence |
| --- | --- | --- | --- |
| 2026-05-30 | Créer `status_recap` comme runtime non-mutant DB-grounded extrait de `run.ts`. | Implémenté | `15-chantiers-log.md` J31 |
| 2026-05-30 | Garder une exception déterministe limitée pour l'activation/réduction status, parce que le domaine ne mute jamais. | Accepté temporairement | `contract.ts` `STATUS_RECAP_MIGRATION_STATUS` |
| 2026-05-30 | DB métier reste vérité d'état actuel; EffectLedger récent complète seulement les claims failed/blocked. | Implémenté | `projection.ts`, `effect_history.ts`, J31 persistent effect ledger |
| 2026-05-30 | Product help, safety, tool commands et active card drafts préemptent `status_recap`. | Implémenté | `runtime.ts`, `operation_runtime_pipeline.ts` |
