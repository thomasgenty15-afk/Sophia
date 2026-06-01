# one_shot_reminder Runtime Contract

## Mental Model

`one_shot_reminder` est un direct effect always-on, pas un Tool Skill à long
slot filling. Il possède uniquement le périmètre rappel ponctuel : créer,
annuler ou remplacer un rappel one-shot quand l'intention, l'horaire et le
texte utile sont suffisamment structurés, puis répondre à partir des effets
réellement commités.

Le domaine suit la forme canonique :

```txt
contract.ts
  -> route_guards.ts / time_parser.ts / instruction_parser.ts
  -> intake.ts
  -> reducer.ts
  -> executor.ts / persistence.ts
  -> renderer.ts
  -> router.ts
  -> run.ts orchestre seulement le résultat
```

La règle centrale est stricte : un rappel n'existe pas parce que le dispatcher,
un parser ou le router l'a compris. Il existe seulement si
`committed_effects` contient un commit DB durable.

Compatibilité legacy actuelle : le contrat local accepte encore les aliases
`product_help`, `status_question` et `ignore` dans `OneShotReminderIntent`.
Ils sont non-mutants et doivent être traités comme `answer_product_question`,
`status` et handoff/refus one-shot côté reducer/router.

## Dépend De L'Architecture De X

Ce domaine dépend de :

- `UserTurnSnapshot` pour lire l'état complet du tour ;
- `TurnAgenda` pour distinguer reply/effects/status/memory/repair ;
- `Confirmation Contract` pour interpréter approve/reject/revise/explain ;
- `EffectLedger` pour ne jamais dire "c'est fait" sans effet committé ;
- le contrat local de `one_shot_reminder` pour l'intake, le reducer, les effets
  et le renderer.

Utilisation actuelle :

- `run.ts` appelle `maybeRunOneShotReminderDirectEffect` et transmet
  `pendingToolSkillConfirmation`, `turnFrame`, `noMutationRequested`,
  `contextMessages`, `requestId` et `now`. Il ne doit plus assembler
  `cancel + create`, ni ajouter de wording métier après coup.
- `turnFrame` sert encore surtout au `Confirmation Contract` via
  `buildToolConfirmationDecision` dans `router.ts`, pour bloquer une mutation
  quand une confirmation outil concurrente est active.
- `TurnAgenda`/agenda block est représenté dans le contrat local par
  `reduceOneShotReminderIntake(..., agendaBlockedReason)`. Le chemin `run.ts`
  ne l'alimente pas encore systématiquement : c'est une limite restante.
- `EffectLedger` consomme les champs du résultat local :
  `requested_effects`, `allowed_effects`, `attempted_effects`,
  `committed_effects`, `blocked_effects`. `executed_tools` reste présent pour
  compatibilité mais doit être dérivé des commits, pas des tentatives.
- Le contrat local est `tools/always_on/one_shot_reminder/contract.ts`. Il
  définit `OneShotReminderIntent`, `OneShotReminderState`,
  `OneShotReminderEffectPlan`, `OneShotReminderDirectEffectResult`,
  `OneShotReminderCommittedEffect`, `OneShotReminderFailedEffect` et les
  outcomes create/cancel legacy.

## Runtime Shape

Chemin canonique souhaité et partiellement en place :

1. `route_guards.ts` fournit les guards d'admission et de compatibilité :
   `isLikelyOneShotReminderRequest`, `detectsExplicitOneShotReminderCancel`,
   `isOneShotReminderExactStatusRequest`,
   `oneShotReminderDirectEffectBlockForNonMutationContext`,
   `shouldPreferOneShotReminderOverRecurring`,
   `hasExplicitOneShotReminderDirectEffectOverride`.
2. `time_parser.ts` parse les dates/heures one-shot :
   `parseOneShotReminderRequest`, `parseReminderFromMessageDeterministic`,
   `parseScheduledForFromMessage`, `formatLocalReminderLabel`,
   `localHHMMForScheduledFor`. Quand un message fusionné contient un contexte
   récurrent puis une ligne one-shot explicite, le parser peut choisir la ligne
   candidate one-shot plutôt que bloquer tout le message sur le hint récurrent.
3. `instruction_parser.ts` extrait le payload user-facing utile :
   `extractReminderInstruction`, `extractQuotedReminderInstruction`,
   `isDegenerateReminderInstruction`, `loadLastReminderInstructionForUser`.
4. `intake.ts` construit `OneShotReminderStructuredIntake` via
   `buildOneShotReminderIntake`. Il possède aussi le fallback legacy local qui
   transforme un créneau + `texte exact`/`instruction` en intake create
   structuré ; ce fallback ne doit pas sortir du domaine.
5. `reducer.ts` applique les politiques locales via
   `reduceOneShotReminderIntake` et produit `requested_effects`,
   `allowed_effects`, `blocked_effects`, `missing_slots` et le state.
6. `executor.ts` contient les writes DB et les chemins legacy :
   `executeOneShotReminderEffects`, `maybeCreateOneShotReminder`,
   `maybeCancelOneShotReminder`, `runCreateOneShotReminderV2`.
7. `persistence.ts` isole les reads pending avec
   `readPendingOneShotReminderRows`.
8. `renderer.ts` rend la réponse et les addons one-shot :
   `renderOneShotReminderReply`, `oneShotReminderManagementReply`,
   `localTextAddonForOneShotReminder`,
   `buildMinuteByMinuteSequenceAddonForOneShotReminder`,
   `summarizeOneShotReminderOutcome`.
9. `router.ts` expose le runtime appelé par `run.ts` :
   `maybeRunOneShotReminderDirectEffect`.

## File Ownership

- `contract.ts` possède les types publics, les effets, l'état local et les
  invariants implicites de statut.
- `route_guards.ts` possède les guards transitionnels encore nécessaires pour
  admission/status/product-help/no-mutation. Aucun nouveau guard sémantique ne
  doit être ajouté ailleurs.
- `time_parser.ts` possède les parsers de temps one-shot, labels locaux et
  normalisation HH:mm, y compris la sélection conservatrice d'une ligne
  candidate one-shot dans un burst multi-lignes.
- `instruction_parser.ts` possède l'extraction du texte utile et les anti
  méta-commandes.
- `intake.ts` possède l'intake structuré local. Il peut consommer un payload
  déjà parsé, des direct effects et des guards legacy locaux. Il possède les
  aliases legacy non-mutants `product_help`, `status_question`, `ignore`.
- `reducer.ts` possède la transition d'état et la décision
  requested/allowed/blocked/missing.
- `executor.ts` possède les writes DB vers `scheduled_checkins` et les wrappers
  legacy create/cancel/V2.
- `persistence.ts` possède les reads DB réutilisables.
- `renderer.ts` possède tout wording user-facing spécifique one-shot.
- `router.ts` est l'API runtime : il câble guards, confirmation, executor et
  résultat final.
- `one_shot_reminder_tool.ts` est une façade legacy de compatibilité. Ne pas y
  ajouter de logique runtime.
- `run.ts` orchestre seulement : appel du router, mapping
  `OperationRuntimeResult`, ledger/logging. Il ne possède pas la logique métier.

## Inputs

- Message user courant.
- `TurnFrame` / direct effects du dispatcher quand disponible.
- `pendingToolSkillConfirmation` et `noMutationRequested`.
- Historique récent user (`contextMessages`) pour récupérer heure ou
  instruction lors d'une confirmation courte.
- DB `scheduled_checkins` pending `event_context like one_shot_reminder:%`.
- Time context user (`getUserTimeContext`) pour timezone, now et locale.

## Outputs

- `OneShotReminderDirectEffectResult` avec :
  `detected`, `intent`, `status`, `reply`, `requested_effects`,
  `allowed_effects`, `attempted_effects`, `executed_tools`,
  `committed_effects`, `blocked_effects`, `missing_slots`, debug.
- Create commit : `type=create_one_shot_reminder`, `id`, `scheduled_for`,
  `local_label`, `reminder_instruction`.
- Cancel commit : `type=cancel_one_shot_reminder`, ids/labels ciblés quand
  disponibles.
- Blocks : `missing_time`, `missing_instruction`, `no_reminder_found`,
  `no_tool`, `safety_blocks`, `pending_confirmation_active`,
  `product_help`, `status_only`, `insert_failed`, `update_failed`.

## Invariants

- Ne jamais répondre "programmé" sans `committed_effects` create avec
  `inserted_checkin_id`/`id`.
- Ne jamais répondre "annulé" sans `committed_effects` cancel ; le router doit
  dériver `executed_tools` des commits cancel/create réellement construits, pas
  du simple statut legacy `cancelled`/`success`.
- Ne jamais marquer `executed_tools` pour un effet seulement tenté ou bloqué.
- `attempted_effects` peut indiquer une tentative technique ; ce n'est pas une
  preuve durable.
- `status`, `answer_product_question`, `no_tool`, safety et confirmation
  pending ne mutent jamais.
- Une annulation ciblée par heure ne doit annuler que les reminders matching
  cette heure locale. Si aucun match n'existe, retourner `no_reminder`.
- Les wordings récurrents (`tous les jours`, `chaque semaine`, routine,
  pendant N jours) ne créent jamais un one-shot.
- `replace` est deux effets explicites. Si un demi-effet échoue, la réponse et
  le ledger doivent montrer exactement ce qui a commit et ce qui a échoué.
- `run.ts` ne doit pas ajouter d'addon ou de phrase métier one-shot après le
  renderer.
- `one_shot_reminder_tool.ts` ne doit rester qu'une façade de compatibilité.

## Integration Points

- `router/run.ts` appelle `maybeRunOneShotReminderDirectEffect` et consomme
  `reply`, `status`, `executed_tools`, `committed_effects`, `blocked_effects`.
- `tool_skill_runtime/operation_runtime_pipeline` et l'EffectLedger lisent les
  effets runtime pour prouver les mutations durables.
- `direct_effect_gate.ts` reste utilisé par `runCreateOneShotReminderV2`,
  chemin V2 legacy create protégé par `runDirectEffectGate`.
- `create_recurring_reminder` doit recevoir les wordings récurrents ; ce domaine
  ne crée jamais de `user_recurring_reminders`.
- `status_recap` lit la DB pour les statuts rappel ; `one_shot_reminder` ne
  doit pas inventer un statut hors DB.
- `product_help` peut expliquer où gérer un rappel, mais ne doit pas muter.

## Responsibilities De X

- Distinguer create/cancel/replace/status/product-help/off-topic sur le
  périmètre rappel ponctuel.
- Extraire `scheduled_for`, label local et instruction utile.
- Lire les reminders pending nécessaires à cancel/replace.
- Produire `requested_effects`, `allowed_effects`, `blocked_effects`.
- Appliquer create/cancel sur `scheduled_checkins`.
- Rendre une réponse user-facing cohérente avec les commits.
- Exposer des helpers `*ForTest` uniquement comme compatibilité de tests et
  migration des anciens guards.

## Hors Périmètre De X

- Créer ou gérer des rappels récurrents.
- Répondre aux questions générales de produit hors rappel ponctuel.
- Gérer les confirmations d'autres tool skills.
- Décider la safety globale.
- Modifier des plans, cartes, potions, préférences coach ou mémoire.
- Faire un status recap global.
- Ajouter une nouvelle branche métier dans `run.ts`.

## Allowed Changes

- Corriger un parser horaire ou instruction dans `time_parser.ts` /
  `instruction_parser.ts` avec tests ciblés.
- Ajouter un nouveau reason_code dans `contract.ts` + reducer + tests.
- Déplacer un guard legacy depuis `route_guards.ts` vers intake/reducer si le
  contrat devient plus structuré.
- Renforcer `executeOneShotReminderEffects` sans changer les invariants ledger.
- Ajouter des tests DST/timezone/idempotence/partial replace.

## Forbidden Changes

- Ajouter une regex one-shot dans `run.ts`, `turn_intent_arbitrator.ts` ou un
  autre domaine.
- Faire créer un one-shot depuis product-help/status/no-tool/safety.
- Rendre "c'est fait" depuis `attempted_effects` ou un status tool non commit.
- Annuler tous les pending quand une heure ciblée ne matche rien.
- Réintroduire une seconde architecture runtime dans `one_shot_reminder_tool.ts`.
- Faire créer un récurrent depuis `one_shot_reminder`.
- Ajouter un fallback IA/regex silencieux qui contourne `intake.ts` et
  `reducer.ts`.

## Legacy Exceptions

- `route_guards.ts` contient encore des guards regex transitionnels. Ils restent
  parce que le direct effect one-shot est always-on et doit protéger les cas
  status/product-help/no-mutation pendant la migration hors `run.ts`. Condition
  de suppression : le dispatcher + `TurnAgenda` fournissent un intent structuré
  fiable pour create/cancel/replace/status/product-help et les tests router
  restent verts sans ces guards.
- `router.ts` garde encore un fast-path create/cancel direct basé sur
  `isLikelyOneShotReminderRequest` et `detectsExplicitOneShotReminderCancel`
  avant l'intake/reducer complet, mais il centralise maintenant la
  classification via `buildOneShotReminderIntake`, gère les aliases
  product/status/ignore non-mutants et expose replace comme cancel+create
  partiellement commitables. Condition de suppression :
  `maybeRunOneShotReminderDirectEffect` doit être entièrement câblé sur
  `buildOneShotReminderIntake` + `reduceOneShotReminderIntake` +
  `executeOneShotReminderEffects`, avec tests router équivalents.
- `runCreateOneShotReminderV2` reste dans `executor.ts` pour compatibilité avec
  l'ancien `DirectEffectGate` create et les tests d'idempotence. Condition de
  suppression : le router canonique applique la même politique gate
  (`pending_tool_skill_confirmation`, duplicate source, duplicate DB, safety,
  past/missing time) et tous les appelants prod/test ont migré.
- `one_shot_reminder_tool.ts` reste façade legacy pour les imports tests et les
  anciens chemins. Condition de suppression : aucun import prod/test ne dépend
  plus des noms historiques ou des alias `*ForTest`.

## Required Tests

Tests propriétaires :

- `one_shot_reminder_contract_test.ts` : types/result shape et invariants
  contractuels.
- `one_shot_reminder_reducer_test.ts` : transitions
  requested/allowed/blocked/missing/no-mutation/status/product-help.
- `one_shot_reminder_executor_test.ts` : writes create/cancel, failures,
  commits, no done language without commit.
- `one_shot_reminder_router_test.ts` : intégration router direct effect,
  pending confirmation, product/status no mutation, recurring boundary.
- `one_shot_reminder_tool_test.ts` : compat legacy, parsers, extraction,
  exact text, cancel ciblé, replace partial.

Cas obligatoires :

- create success → commit id/scheduled_for/instruction.
- create failure → no commit, no success wording, no executed tool.
- missing/past time → `needs_clarify`.
- exact text quoted/unquoted → payload propre.
- burst multi-lignes avec contexte récurrent + demande ponctuelle explicite →
  parse la ligne one-shot, pas le contexte récurrent.
- cancel targeted HH:mm no match → no update DB.
- cancel global explicite → pending one-shot seulement.
- replace full success → cancel + create committed.
- replace partial → réponse honnête + only committed half.
- status/product-help/no-tool/safety/pending confirmation → aucun write.
- recurring wording → handoff/refus one-shot, jamais create.
- `run.ts` ne contient pas de rendu/addon one-shot.

## Suivi Des Décisions Architecturales

| Date | Décision | Statut | Référence |
| --- | --- | --- | --- |
| 2026-05-30 | `one_shot_reminder_tool.ts` est une façade legacy ; la source runtime doit être `contract/intake/reducer/executor/renderer/router`. | Active, migration incomplète | J1, Jx, ce contrat |
| 2026-05-30 | `committed_effects` est la seule preuve durable ; `attempted_effects` ne suffit jamais pour "c'est fait". | Active | EffectLedger mandatory proof |
| 2026-05-30 | Les guards regex one-shot restants sont legacy transitionnels et doivent rester localisés dans `route_guards.ts` jusqu'à remplacement par `TurnAgenda`/intake structuré complet. | Temporaire | Legacy Exceptions |
| 2026-05-30 | `runCreateOneShotReminderV2` reste uniquement pour compatibilité DirectEffectGate/idempotence tant que le router canonique ne porte pas toute cette politique. | Temporaire | Legacy Exceptions |
