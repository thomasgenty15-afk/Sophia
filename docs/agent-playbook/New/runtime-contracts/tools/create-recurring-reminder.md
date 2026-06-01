# create_recurring_reminder Runtime Contract

## Mental Model

`create_recurring_reminder` est le Tool Skill propriétaire des rappels répétés.
Il ne crée jamais de rappel ponctuel. Son workflow canonique est :

```txt
contract -> structured intake -> reducer/state transition -> effects
  -> executor -> renderer -> invariant tests
```

Une demande de rappel récurrent n'est considérée exécutée que si un
`CreateRecurringReminderCommittedEffect` prouve l'écriture DB dans
`user_recurring_reminders`. Une approbation user, un draft complet ou un writer
appelé ne suffisent pas.

## Dépend De L'Architecture De X

Ce domaine dépend de :

- `UserTurnSnapshot` pour lire l'état complet du tour : dans le code actuel,
  cette projection arrive encore via `run.ts` sous forme de `turnFrame`,
  `routeDecision`, `tempMemory`, `v2Runtime`, `planItemSnapshot`,
  `userTimezone`, `sourceMessageId` et `requestId`, puis est transmise à
  `tools/operations/create_recurring_reminder/router.ts`.
- `TurnAgenda` pour distinguer reply/effects/status/memory/repair : l'agenda
  n'est pas encore un objet unique injecté au skill. La frontière effective est
  `recurringReminderRouteIsSelected()` dans `router.ts`, qui accepte seulement
  une route Tool Skill recurring, une intake active recurring, une confirmation
  pending recurring ou une recommandation pending recurring. Les arbitrages
  globaux one-shot/status/coach/recap restent dans `run.ts` en tant que legacy
  orchestration.
- `Confirmation Contract` pour interpréter approve/reject/revise/explain :
  `router.ts` appelle `reviewCreateRecurringReminderDraft()` depuis
  `intake.ts`, qui délègue à `reviewToolSkillDraftWithAi()` dans
  `tools/operations/_shared/draft_review.ts`. La confirmation executable passe
  ensuite par `createConfirmationToken()` puis `verifyExecutorConfirmation()`
  dans `executor.ts`.
- `EffectLedger` pour ne jamais dire "c'est fait" sans effet committé :
  `contract.ts` définit `CreateRecurringReminderEffect`,
  `CreateRecurringReminderCommittedEffect` et `CreateRecurringReminderSkillResult`.
  `executor.ts` ne retourne `status: "executed"` qu'avec
  `committed_effects`. `router.ts` ne remplit `executedTools` que si
  `committedEffects.length > 0`. Quand une approbation exécutable lance
  réellement l'executor, `router.ts` expose aussi le
  `CreateRecurringReminderEffect` dans `requested_effects` et
  `allowed_effects` pour que le ledger voie toute la chaîne
  `requested -> allowed -> committed/failed`.
- le contrat local de X pour l'intake, le reducer, les effets et le renderer :
  `contract.ts`, `intake.ts`, `state.ts`, `router.ts`, `executor.ts` et
  `renderer.ts` forment la base de vérité locale.

## Runtime Shape

```txt
run.ts
  -> maybeRunCreateRecurringReminderOperation(router.ts)
    -> loadRecurringReminderFrameFromTempMemory(state.ts)
    -> runCreateRecurringReminderIntake(intake.ts)
    -> runRecurringReminderBuilder(generator.ts)
    -> reviewCreateRecurringReminderDraft(intake.ts) for pending draft review
    -> executeCreateRecurringReminder(executor.ts)
      -> write_recurring_reminder injected by router/persistence.ts
    -> renderRecurringReminder*(renderer.ts)
```

Le reducer n'est pas encore un fichier `reducer.ts` séparé. Il est réparti
entre :

- `intake.ts` : `defaultState()`, `normalizeStatePatch()`, `mergeState()`,
  `operationInputFromState()`, `normalizeTargetBindingAgainstPlatform()`;
- `state.ts` : load/write/clear du frame tempMemory recurring;
- `router.ts` : transitions de workflow entre recommendation, active intake,
  pending confirmation, draft review, execution et handoff.

## File Ownership

- `tools/operations/create_recurring_reminder/contract.ts`
  possède les types stables : `CreateRecurringReminderUserIntent`,
  `CreateRecurringReminderConstraint`, `CreateRecurringReminderEffect`,
  `CreateRecurringReminderCommittedEffect`, `CreateRecurringReminderSkillResult`.
- `tools/operations/create_recurring_reminder/intake.ts`
  possède l'intake structuré IA, le slot filling, la distinction
  recurring/one-shot, `draft_only`, `no_create`, `cancel`, le draft review et
  le reducer d'état interne.
- `tools/operations/create_recurring_reminder/state.ts`
  encapsule les clés tempMemory existantes :
  `__active_tool_skill_intake`, `active_tool_skill_intake`,
  `__pending_tool_skill_confirmation`, `pending_tool_skill_confirmation`,
  `__pending_recommendation_operation`.
- `tools/operations/create_recurring_reminder/platform_context.ts`
  prépare le contexte plan/action/famille d'action fourni au slot filler.
- `tools/operations/create_recurring_reminder/generator.ts`
  construit `RecurringReminderDraftV1` et le résumé du draft.
- `tools/operations/create_recurring_reminder/router.ts`
  possède l'orchestration locale : admission recurring, pending recommendation,
  active intake, pending confirmation, approve/reject/revise/explain,
  handoff one-shot, appel executor, et mapping runtime result.
- `tools/operations/create_recurring_reminder/executor.ts`
  est la seule couche qui peut exécuter l'effet durable après confirmation
  valide.
- `tools/operations/create_recurring_reminder/persistence.ts`
  applique l'effet DB par défaut : mapping days, binding draft -> colonnes,
  insert `user_recurring_reminders`, liens de target/binding.
- `tools/operations/create_recurring_reminder/renderer.ts`
  rend les réponses user-facing du domaine. Le wording de succès passe par
  `renderRecurringReminderExecuted()` et exige un effet committé.
- `router/run.ts`
  ne doit être qu'un orchestrateur : router global, safety, handoff global,
  appel au skill, persistance de logs runtime. Il ne doit pas reconstruire les
  slots, réviser un draft recurring, écrire en DB recurring ou décider le
  binding métier.

## Inputs

- Message user courant.
- `turnFrame` et `routeDecision` pour savoir si le skill est sélectionné.
- `tempMemory` pour reprendre une intake active, une confirmation pending ou
  une recommendation pending.
- `v2Runtime` et `planItemSnapshot` pour fournir le contexte plan/action au
  slot filler.
- Timezone locale user.
- Risque safety pregate.
- Draft pending pour approve/reject/revise/explain.

## Outputs

- `ask_question` : slot récurrent manquant.
- `draft_ready` : draft complet mais non exécutable (`draft_only` ou
  `no_create`).
- `pending_confirmation` : draft exécutable uniquement après approbation.
- `handoff_to_one_shot` : demande ponctuelle claire, aucun effet recurring.
- `cancelled` / `blocked` / `failed`.
- `executed` avec `committed_effects`.
- Runtime result avec `executedTools` uniquement si l'effet est committé.

## Responsabilités De X

- Distinguer demande récurrente, demande ponctuelle et sortie de flow dans
  l'intake structuré.
- Posséder fréquence, jours, heure locale, message exact/actionnable,
  destination `base_de_vie` vs `current_plan`.
- Posséder le sens métier du binding : transformation, plan item, action
  family, live action, snapshot, independent, lifecycle policies.
- Produire et réviser le draft.
- Interpréter approve/reject/revise/explain du draft pending.
- Bloquer `draft_only` et `no_create` avant toute confirmation executable.
- Annuler/clear son frame quand `user_intent: "cancel"` arrive pendant intake.
- Se retirer proprement avec `handoff_to_one_shot` si la demande est ponctuelle.
- Écrire en DB seulement via `executeCreateRecurringReminder()`.
- Rendre le message final via `renderer.ts`.

## Responsabilités Qui N'Appartiennent Pas À X

- Créer, modifier ou annuler un rappel ponctuel : appartient à
  `tools/always_on/one_shot_reminder/*`.
- Répondre aux questions produit/status générales : appartient aux conversation
  skills/status composers.
- Décider la safety globale : appartient au pregate et au routeur global.
- Exécuter un effet sans confirmation explicite.
- Réinterpréter dans `run.ts` les slots récurrents, la cadence, le contenu ou
  le binding plan.

## Invariants

- Pas de création recurring pour une demande ponctuelle.
- Pas de draft recurring généré sur `handoff_to_one_shot`.
- Pas de DB write sans approve explicite du draft pending.
- Pas de DB write si le draft est incomplet.
- Pas de DB write si `draft_only` ou contrainte `no_create`/`draft_only`.
- Pas de `executedTools: ["create_recurring_reminder"]` sans
  `committedEffects.length > 0`.
- Sur approbation exécutable, le runtime result expose l'effet
  `create_recurring_reminder` demandé puis autorisé, même si le writer échoue
  ensuite; l'échec reste sans `committed_effects` ni `executedTools`.
- Pas de "C'est fait" / "J'ai créé" sans
  `CreateRecurringReminderCommittedEffect.recurring_reminder_id`.
- `revise`, `explain`, `reject`, `cancel` ne doivent jamais appeler le writer.
- Un item non-habitude ne doit jamais être transformé en `action_family`.
- Le writer DB applique le binding décidé par le draft; il ne réinterprète pas
  le message user.

## Integration Points

- `run.ts` appelle `maybeRunCreateRecurringReminderOperation()` et passe le
  contexte runtime. Toute nouvelle branche métier recurring ajoutée dans
  `run.ts` contredit ce contrat.
- `one_shot_reminder/router.ts` reste le direct effect propriétaire des rappels
  ponctuels. La frontière est `handoff_to_one_shot`.
- `confirmation_token.ts` et `_shared/executor_guard.ts` protègent
  l'exécution post-approve.
- `persistence.ts` écrit dans `user_recurring_reminders`.
- Les context/status loaders peuvent lire `user_recurring_reminders`, mais ne
  doivent pas créer ou modifier les rappels recurring.

## Allowed Changes

- Ajouter un slot ou une contrainte au JSON structuré de `intake.ts`, si le
  contrat est mis à jour.
- Extraire le reducer vers un `reducer.ts` dédié, sans changer la sémantique.
- Ajouter un effet préparatoire explicite dans `contract.ts`.
- Améliorer `renderer.ts` tant que le succès reste conditionné aux effets
  committés.
- Renforcer les tests d'invariants du module.

## Forbidden Changes

- Ajouter une regex métier dans `run.ts`, `router.ts` ou `persistence.ts` pour
  distinguer ponctuel/récurrent, cadence, contenu ou binding.
- Faire créer un one-shot par `create_recurring_reminder`.
- Appeler `insertRecurringReminderFromDraft()` hors de l'executor guard.
- Mettre `executedTools` sur une branche failed/blocked.
- Dire "créé", "programmé", "c'est fait" ou équivalent sans
  `committed_effects`.
- Réintroduire une confirmation globale hors draft review local du skill.
- Laisser `draft_only` ou `no_create` produire une pending confirmation
  exécutable.

## Legacy Exceptions

- Les clés tempMemory legacy (`active_tool_skill_intake`,
  `pending_tool_skill_confirmation`, `__pending_recommendation_operation`) sont
  encore lues/écrites par `state.ts` pour compatibilité avec les flows actifs.
  Condition de suppression : migration globale des Tool Skills vers un frame
  unique versionné.
- Le reducer est encore réparti entre `intake.ts`, `state.ts` et `router.ts`.
  Condition de suppression : extraction d'un `reducer.ts` avec tests qui
  rejouent toutes les transitions sans runtime Supabase.
- `run.ts` contient encore des arbitrages globaux d'interruption
  one-shot/status/coach/recap autour des flows actifs. Ils restent hors métier
  recurring mais ne sont pas encore remplacés par `UserTurnSnapshot` +
  `TurnAgenda`. Condition de suppression : admission structurée globale qui
  expose explicitement supersede/suspend/resume par domaine.
- `run_product_help_guard.test.ts` est actuellement bloqué par des erreurs hors
  périmètre recurring dans `weekly_review/runtime.ts` et des helpers
  adjust-plan manquants. Ce contrat ne les couvre pas.

## Required Tests

Le contrat est protégé par
`tools/operations/create_recurring_reminder/tests.ts` :

- one-shot wording -> `handoff_to_one_shot`, sans draft ni pending recurring;
- recurring wording -> `pending_confirmation`;
- missing time/content -> `ask_question`;
- approve -> writer appelé via executor, `committedEffects` rempli,
  `executedTools` rempli;
- writer failure -> `toolExecution=failed`, `executedTools=[]`,
  `committedEffects=[]`, pas de success wording;
- invalid draft -> blocked, aucun writer, aucun effet committé;
- revise/explain/reject -> aucun writer;
- `draft_only` / `no_create` -> `draft_ready`, pas de pending exécutable;
- active intake cancel -> frame cleared, aucun writer;
- active recurring + one-shot wording -> handoff, frame cleared;
- renderer -> pas de wording créé sans effets committés;
- binding non-habitude -> `plan_item`, jamais `action_family`.

Tests frontière utiles :

- `tools/always_on/one_shot_reminder/one_shot_reminder_tool_test.ts`
  protège la frontière ponctuel vs récurrent.
- `router/turn_intent_arbitrator.test.ts` protège le routage global des
  intents concurrents.

## Suivi Des Décisions Architecturales

| Date | Décision | Statut | Référence |
| --- | --- | --- | --- |
| 2026-05-30 | `create_recurring_reminder` suit le modèle `contract -> intake -> reducer/state -> effects -> executor -> renderer`; `committed_effects` est la seule preuve d'exécution. | Active | J45 dans `15-chantiers-log.md` |
| 2026-05-30 | `draft_only` et `no_create` produisent un `draft_ready` non exécutable. | Active | J45 dans `15-chantiers-log.md` |
| 2026-05-30 | La suppression des clés tempMemory legacy est différée jusqu'à un frame Tool Skill versionné global. | Legacy temporaire | J45 dans `15-chantiers-log.md` |
