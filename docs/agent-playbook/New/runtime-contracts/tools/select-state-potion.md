# select_state_potion Runtime Contract

## Mental Model

`select_state_potion` est un Tool Skill L5 propriétaire du workflow potion :
choisir une potion, présenter deux options quand le choix n'est pas clair,
collecter les détails propres à la potion, préparer un brouillon, gérer
`approve/reject/revise/explain/cancel`, appliquer l'activation, et supprimer
tout suivi quand le user le refuse.

Le dispatcher ou `run.ts` peuvent seulement dire que le tour ressemble à une
opportunité potion. La décision de continuer, annuler, bloquer, demander une
précision, activer, supprimer le follow-up ou passer la main appartient au
skill.

Le flow canonique est :

```txt
contract.ts
  -> intake.ts + subskills/*
  -> router.ts reducer/state transition
  -> requested/allowed/blocked effects
  -> executor.ts + persistence.ts
  -> renderer.ts
```

## Dépend De L'Architecture De X

Ce domaine dépend de :

- `UserTurnSnapshot` pour lire l'état complet du tour ;
- `TurnAgenda` pour distinguer reply/effects/status/memory/repair ;
- `Confirmation Contract` pour interpréter approve/reject/revise/explain ;
- `EffectLedger` pour ne jamais dire "c'est fait" sans effet committé ;
- le contrat local de `select_state_potion` pour l'intake, le reducer, les
  effets et le renderer.

Dans le code actuel :

- `router/operation_runtime_pipeline.ts` appelle
  `maybeRunSelectStatePotionOperation` après les runtimes plus prioritaires
  et lui passe `turnFrame`, `routeDecision`, `tempMemory`, `history`,
  `safetyPregateOutput`, `requestId` et `sourceMessageId`. C'est l'adaptateur
  runtime actuel vers le futur `UserTurnSnapshot` complet.
- `tools/operations/select_state_potion/policy.ts` lit `TurnFrame` et
  `RouteDecision` dans `selectStatePotionRouteIsSelected` pour savoir si le
  skill doit recevoir le tour. Les décisions internes ne doivent pas retourner
  dans `run.ts`.
- `tools/operations/select_state_potion/router.ts` construit un
  `SelectStatePotionSkillResult`, puis l'adapte au format attendu par le
  runtime avec `adaptSkillResultToRuntime`. Cet adaptateur est la seule zone
  qui traduit le contrat local vers `content`, `nextTempMemory`,
  `toolExecution`, `executedTools` et `toolSkillRun`.
- `tools/operations/select_state_potion/draft_validation.ts` expose
  `reviewSelectStatePotionDraft`. Le router utilise cette décision structurée
  dans `reducePotionDraftReview`; le dispatcher global ne doit pas interpréter
  `approve/reject/revise/explain` pour ce skill.
- `tools/operations/select_state_potion/contract.ts` porte les intentions
  (`SelectStatePotionUserIntent`), contraintes
  (`SelectStatePotionConstraint`), effets (`SelectStatePotionEffect`), effets
  commités (`SelectStatePotionCommittedEffect`) et le mini ledger local
  (`SelectStatePotionEffectLedger`).
- `tools/operations/select_state_potion/renderer.ts` applique le garde-fou
  user-facing : si `status="executed"` mais que `committed_effects` est vide,
  Sophia ne doit pas annoncer que la potion est activée.

Limite actuelle : le runtime ne passe pas encore un objet
`UserTurnSnapshot`/`TurnAgenda` unique au skill. Le router reçoit les briques
legacy séparées depuis `operation_runtime_pipeline.ts`. Une future migration
peut changer la forme d'entrée, mais pas déplacer la logique métier vers
`run.ts`.

## Runtime Shape

```txt
router/operation_runtime_pipeline.ts
  -> maybeRunSelectStatePotionOperation(...)
       -> loadSelectStatePotionFrameFromTempMemory(...)
       -> hardConsentGuards / legacySemanticDetectors
       -> reviewSelectStatePotionDraft(...) si pending draft
       -> reducePotionDraftReview(...)
       -> runSelectStatePotionIntake(...) si intake actif ou nouveau départ
       -> createConfirmationToken(...) si draft prêt
       -> executeActivateStatePotion(...) si approve explicite
       -> renderSelectStatePotionSkillResult(...)
```

Le router raisonne en `SelectStatePotionSkillResult`. Les statuts runtime
`toolExecution` et `executedTools` sont dérivés à la fin :

- `executedTools=["select_state_potion"]` seulement si
  `committed_effects.length > 0`;
- `toolExecution="success"` seulement après `executeActivateStatePotion`
  `status="executed"` et commit writer confirmé;
- `toolExecution="blocked"` ou `"failed"` ne peut pas produire de claim
  d'activation.

## File Ownership

- `tools/operations/select_state_potion/contract.ts` : source de vérité locale
  pour intentions, contraintes, effets, effets commités, ledger et résultat
  skill.
- `tools/operations/select_state_potion/intake.ts` : intake structuré. Il lit
  les sorties JSON des sous-skills, valide les enums, merge
  `SelectStatePotionIntakeState`, calcule les slots manquants et appelle le
  generator. Il ne doit pas contenir de regex métier.
- `tools/operations/select_state_potion/subskills/potion_router.ts` :
  sélection IA de l'état émotionnel, du type de potion ou de la shortlist deux
  potions.
- `tools/operations/select_state_potion/subskills/potion_detail_intake.ts` et
  `subskills/potions/*` : détails propres à chaque potion.
- `tools/operations/select_state_potion/router.ts` : orchestration L5,
  contraintes, reducer `reducePotionDraftReview`, préparation d'effets,
  activation via executor, adaptation runtime.
- `tools/operations/select_state_potion/state.ts` : seule façade autorisée sur
  `tempMemory` pour l'active intake, le pending confirmation, la pending
  recommendation et `__potion_followup_consent`.
- `tools/operations/select_state_potion/policy.ts` : hard consent guards et
  détecteurs sémantiques legacy documentés.
- `tools/operations/select_state_potion/generator.ts` : draft user-ready,
  messages visibles immédiats et informations potion/follow-up.
- `tools/operations/select_state_potion/draft_validation.ts` : validation
  structurée du brouillon pending.
- `tools/operations/select_state_potion/executor.ts` : seule couche qui peut
  appliquer `activate_state_potion` après confirmation token valide.
- `tools/operations/select_state_potion/persistence.ts` :
  `writeStatePotionActivation`, writer DB des sessions potion et follow-ups.
- `tools/operations/select_state_potion/renderer.ts` : rendu final protégé par
  les effets commités.
- `router/operation_runtime_pipeline.ts` : appel du router comme runtime
  d'opération; ne possède pas le métier potion.
- `router/run.ts` : orchestration globale. Il ne doit pas interpréter
  `approve/reject/revise/explain`, no-potion, follow-up consent, ou détails
  d'activation potion.

## Inputs

Le skill consomme :

- `userMessage`, `history`, `channel`, `userTimezone`, `requestId`,
  `sourceMessageId`;
- `TurnFrame` et `RouteDecision` pour l'admission du tour;
- `safetyPregateOutput` pour bloquer l'exécution si le risque est incompatible;
- le frame potion chargé par `loadSelectStatePotionFrameFromTempMemory` :
  `pending`, `active`, `recommendation`, `followup_consent`;
- le contexte DB prompt-only chargé par `loadPotionBaseContext` pour aider le
  generator et les sous-skills IA;
- les décisions structurées de `reviewSelectStatePotionDraft`;
- les sorties structurées de `runSelectStatePotionIntake`.

Le contexte DB ne doit jamais devenir un second cerveau déterministe pour
choisir la potion ou remplir les slots.

## Outputs

Le résultat canonique est `SelectStatePotionSkillResult` :

- `user_intent` : `start`, `choose_potion`, `provide_detail`, `draft_only`,
  `activate`, `cancel`, `reject`, `revise`, `explain`, `topic_change`,
  `forbid_potion`, `forbid_followup`, `one_shot_reminder_handoff`, `clarify`
  ou `unknown`;
- `constraints` : notamment `no_potion`, `no_followup`,
  `instant_support_only`, `one_question_max`, `respect_existing_potion`;
- `requested_effects`, `allowed_effects`, `blocked_effects`,
  `committed_effects`;
- `effect_ledger` local, miroir explicite des effets;
- `pending_confirmation` si un brouillon attend validation;
- `updated_state` si l'intake reste actif;
- `handoff` si le skill libère le tour pour un autre outil;
- `reply` et `additional_replies` user-facing.

L'adaptateur runtime retourne ensuite `content`, `additionalContents`,
`nextTempMemory`, `toolExecution`, `executedTools` et `toolSkillRun`.

## Invariants

- Pas de draft, question potion, activation ou follow-up sous contrainte
  `no_potion`.
- Un "pas de potion" pendant un flow actif clear le frame via `state.ts` et ne
  doit pas ressusciter au tour suivant.
- Pas d'activation durable sans `approve` explicite, pending draft valide et
  confirmation token créé par `createConfirmationToken`.
- Toute activation passe par `executeActivateStatePotion`.
- `executedTools` est dérivé de `committed_effects`, jamais du simple
  `status`.
- Le renderer ne dit pas "activé", "programmé" ou équivalent si
  `committed_effects` est vide.
- `no_followup`, `no_recurring`, `no_weekly_series` ou
  `instant_support_only` doivent produire un effet autorisé avec
  `suppress_follow_up_scheduling=true`, pas un recurring reminder caché.
- `reject`, `cancel`, `topic_change`, `forbid_potion` et handoff nettoient le
  pending/active state du skill.
- `revise` et `explain` ne créent aucun effet durable.
- Une demande de rappel ponctuel explicite pendant un flow potion retourne un
  handoff vers le domaine rappel; le router potion ne crée pas ce rappel.
- Une potion déjà sélectionnée dans `active` doit être respectée; le skill ne
  redemande pas le choix de potion quand le user fournit seulement un détail.
- `intake.ts` ne reçoit pas de regex métier, de fallback keyword, ni de choix
  déterministe depuis le contexte DB.
- Les clés `tempMemory` historiques ne sont manipulées que par `state.ts`.

## Integration Points

- `router/operation_runtime_pipeline.ts` sélectionne le runtime
  `select_state_potion` après les chemins plus prioritaires et avant les
  autres tool skills plus bas dans la chaîne.
- `confirmation/confirmation_token.ts` fournit le token requis par
  `executeActivateStatePotion`.
- `tools/operations/_shared/executor_guard.ts` vérifie le token, le pending
  confirmation et le risk band avant tout writer.
- `_shared/potion-base-context.ts` fournit le contexte DB prompt-only.
- `tools/operations/select_state_potion/catalog.ts` expose le catalogue prompt
  depuis la source canonique `_shared/v2-potions.ts`.
- `tools/operations/_shared/committed_effect_renderer_guard.ts` protège les
  messages sans effet commité.
- Le ledger global de `router/effect_ledger.ts` reste la base transverse; le
  ledger local du skill expose les effets potion avant adaptation runtime.

## Allowed Changes

- Ajouter une potion ou un détail si `catalog.ts`, les sous-skills, le draft,
  les validations et les tests sont mis à jour ensemble.
- Améliorer `generator.ts` ou `renderer.ts` sans annoncer d'effet absent du
  ledger.
- Remplacer les entrées legacy séparées par un vrai `UserTurnSnapshot` ou
  `TurnAgenda`, si le contrat `SelectStatePotionSkillResult` reste la source
  de vérité du skill.
- Déplacer un détecteur legacy vers l'intake IA, le dispatcher ou une
  `InterruptionPolicy` explicite.
- Ajouter des contraintes contractuelles si elles produisent des
  `blocked_effects` ou un effet autorisé clair.

## Forbidden Changes

- Ajouter des regex métier dans `intake.ts` ou dans `run.ts`.
- Laisser `run.ts` interpréter `approve`, `reject`, `revise`, `explain`,
  `cancel`, `no_potion` ou le refus de follow-up.
- Activer une potion depuis un draft sans `executeActivateStatePotion`.
- Marquer le tool exécuté sans `committed_effects`.
- Dire au user qu'un suivi est programmé si `suppress_follow_up_scheduling`
  est vrai ou si le writer n'a pas retourné d'ids.
- Transformer le contexte DB en routing déterministe de potion.
- Créer le one-shot reminder depuis le router potion.
- Relancer un flow potion après `forbid_potion`.

## Legacy Exceptions

- `policy.ts` conserve des `hardConsentGuards` regex :
  `detectsExplicitNoPotionRequest`, `detectsPotionFollowUpRefusal` et
  `detectsExplicitStatePotionExit`. Elles sont acceptées car elles bloquent ou
  suppriment des effets durables; elles ne remplissent pas de slots.
- `policy.ts` conserve `legacySemanticDetectors` :
  `isExplicitSelectStatePotionRequest`,
  `looksLikeOneShotReminderHandoff` et
  `detectsExplicitConcreteDeliverableRequest`. Elles protègent encore des
  rouges QA de transition, mais ne doivent pas devenir le cerveau métier. Elles
  pourront disparaître quand le dispatcher, `TurnAgenda` et
  l'`InterruptionPolicy` fourniront ces signaux structurés.
- `noPotionReply` et `statePotionDeclineReply` restent des réponses fallback
  courtes pour garantir qu'un refus explicite reçoit une sortie propre sans
  relancer la potion. Elles devront être remplacées par un renderer/composer
  contractuel quand les invariants de composer seront centralisés.
- `router/run.ts` contient encore de la mise en forme d'opportunités
  `state_potion` pour des recommendations globales. Cette logique ne doit pas
  grandir; elle doit migrer vers le builder de recommendation ou le dispatcher.

## Required Tests

À lancer pour toute modification runtime du domaine :

```bash
deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/select_state_potion/tests.ts
deno check supabase/functions/sophia-brain/tools/operations/select_state_potion/router.ts
deno check supabase/functions/sophia-brain/tools/operations/select_state_potion/contract.ts
```

Tests contractuels attendus dans `tests.ts` :

- `no_potion` annule un intake actif et clear le frame;
- `no_potion` bloque un nouveau start et ne crée aucun pending;
- `no_potion` + demande micro-action retourne une réponse utile sans relancer
  potion;
- refus follow-up avant activation persiste jusqu'à l'effet autorisé avec
  `suppress_follow_up_scheduling=true`;
- refus récent de suivi bloque scheduled checkins et recurring reminder;
- pending draft + approbation explicite appelle l'executor;
- pending draft + correction produit `revise`, sans activation;
- pending draft + `explain` produit `explained`, sans activation;
- `reject` clear le pending;
- executor bloqué ne produit pas de `committed_effects` ni de message
  d'activation;
- succès writer expose `potion_session_id`, `recurring_reminder_id` et
  `scheduled_checkin_ids` dans `committed_effects`;
- demande de rappel ponctuel pendant potion retourne `handoff`, sans draft;
- potion déjà sélectionnée reste préservée quand le user donne un détail.

Les checks globaux utiles, quand le worktree transverse le permet :

```bash
deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/run_product_help_guard.test.ts
deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/turn_intent_arbitrator.test.ts
deno check supabase/functions/sophia-brain/router/run.ts
```

## Suivi Des Décisions Architecturales

| Date | Décision | Statut | Référence |
| --- | --- | --- | --- |
| 2026-05-29 | No-potion doit être porté par le skill, pas seulement par L4. | Remplacée par contrat local | `15-chantiers-log.md` |
| 2026-05-30 | `select_state_potion` raisonne en `SelectStatePotionSkillResult` avec contraintes, effets, ledger local et renderer protégé par `committed_effects`. | Active | J46 |
