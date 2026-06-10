# create_recurring_reminder Runtime Contract

## Mental Model

`create_recurring_reminder` est un `platform_handoff_skill`.

Il comprend les demandes de rappels répétés, clarifie les slots utiles, prépare
un brouillon clair et redirige vers la section Rappels de la plateforme. Il ne
crée plus de rappel récurrent en DB depuis le chat.

Forme canonique :

```txt
contract -> structured intake -> reducer/state transition
  -> reminder handoff draft -> platform destination -> renderer
  -> active handoff state
```

Une demande de rappel récurrent est traitée quand Sophia a clarifié la cadence,
le moment, le contenu et la cible, puis livré une version prête à reprendre
dans la plateforme.

Sortie nominale :

```txt
toolExecution="platform_handoff"
executedTools=[]
committed_effects=[]
platform_handoff.operation_type="create_recurring_reminder"
platform_handoff.surface_id="recurring_reminders"
no_chat_mutation=true
```

Une approbation user, un draft complet ou un "ok programme-le" deviennent
`apply_attempt`, jamais une écriture.

## Dépend De L'Architecture De X

Ce domaine dépend de :

- `UserTurnSnapshot` / `TurnFrame` / `RouteDecision` pour détecter
  l'opportunité recurring sans parser localement dans `run.ts` ;
- `local reducer contract` pour représenter `create_recurring_reminder` comme
  `platform_handoff`, pas comme effet durable ;
- `clarification_tool` pour les ambiguïtés one-shot vs recurring, timing,
  contenu, scope et handoff readiness ;
- `Active Handoff Arbitration` pour continuer le handoff actif ;
- `Product Surface Registry` pour fournir la destination canonique
  `recurring_reminders` ;
- `EffectLedger` pour tracer le handoff non-mutant ;
- `one_shot_reminder` pour les rappels ponctuels, qui restent le direct effect
  exécutable.

## Runtime Shape

```txt
run.ts / operation_runtime_pipeline.ts
  -> maybeRunCreateRecurringReminderOperation(router.ts)
    -> loadRecurringReminderFrameFromTempMemory(state.ts)
    -> runCreateRecurringReminderIntake(intake.ts)
    -> runRecurringReminderBuilder(generator.ts)
    -> RecurringReminderHandoffDraft
    -> write RecurringReminderHandoffState
    -> renderRecurringReminderPlatformHandoff(renderer.ts)
```

Le reducer peut encore être réparti entre `intake.ts`, `state.ts` et
`router.ts`. Le point important est comportemental : le chemin nominal ne doit
pas importer ni appeler `executor.ts`, `persistence.ts`,
`confirmation_token.ts` ou un guard d'execution.

## File Ownership

- `tools/operations/create_recurring_reminder/contract.ts`
  possède les types stables, contraintes, statuts et draft handoff.
- `tools/operations/create_recurring_reminder/intake.ts`
  possède l'intake structuré IA, le slot filling, la distinction
  recurring/one-shot, `draft_only`, `no_create`, cancel, revise, repeat et
  apply attempt.
- `tools/operations/create_recurring_reminder/state.ts`
  encapsule l'état actif de handoff et les clés tempMemory legacy.
- `tools/operations/create_recurring_reminder/platform_context.ts`
  prépare le contexte plan/action/famille d'action fourni au slot filler.
- `tools/operations/create_recurring_reminder/generator.ts`
  construit le brouillon `RecurringReminderHandoffDraft`.
- `tools/operations/create_recurring_reminder/router.ts`
  possède l'orchestration locale et l'adaptation `OperationRuntimeResult`.
- `tools/operations/create_recurring_reminder/renderer.ts`
  rend les réponses user-facing du domaine.
- `tools/operations/create_recurring_reminder/executor.ts` et
  `persistence.ts` sont legacy hors chemin nominal.

## Inputs

- Message user courant.
- `turnFrame` et `routeDecision`.
- `tempMemory` avec handoff recurring actif éventuel.
- `v2Runtime` et `planItemSnapshot` pour fournir le contexte plan/action au
  slot filler.
- Timezone locale user.
- Risque safety pregate.
- Résultat de clarification éventuel.

## Outputs

- `ask_question` : slot récurrent manquant.
- `draft_ready` : draft complet non-mutant.
- `handoff_ready` / `handoff_delivered` : draft plateforme complet.
- `revise_handoff` : modification du draft.
- `repeat_handoff` : répétition de la version plateforme.
- `apply_attempt` : l'utilisateur demande de programmer depuis le chat ; le
  skill répète le handoff et ne mute pas.
- `handoff_to_one_shot` : demande ponctuelle claire, transmise au direct effect
  one-shot.
- `cancelled` / `blocked` / `failed` / `topic_change`.

Le résultat ne contient jamais `executed` pour `create_recurring_reminder`.

## Responsabilités De X

- Distinguer demande récurrente, demande ponctuelle et sortie de flow via
  intake structuré ou clarification.
- Posséder fréquence, jours, heure locale, message exact/actionnable,
  destination `base_de_vie` vs `current_plan`.
- Posséder le sens métier du binding : transformation, plan item, action
  family, live action, snapshot, independent, lifecycle policies.
- Produire et réviser le draft.
- Interpréter repeat/revise/apply/cancel/topic_change pendant un handoff actif.
- Bloquer `draft_only` et `no_create` avant toute tentative d'exécution.
- Se retirer proprement avec `handoff_to_one_shot` si la demande devient
  ponctuelle.
- Rendre le message final via `renderer.ts`.

## Responsabilités Qui N'Appartiennent Pas À X

- Créer, modifier ou annuler un rappel ponctuel : appartient à
  `tools/always_on/one_shot_reminder/*`.
- Répondre aux questions produit/status générales.
- Décider la safety globale.
- Exécuter un effet durable.
- Réinterpréter dans `run.ts` les slots récurrents, la cadence, le contenu ou
  le binding plan.

## Invariants

- Pas de création recurring depuis le chat.
- Pas de création recurring pour une demande ponctuelle.
- Pas de draft recurring généré sur `handoff_to_one_shot`.
- Pas de DB write dans le chemin nominal.
- Pas de pending confirmation exécutable.
- Pas de confirmation token.
- Pas de `executedTools: ["create_recurring_reminder"]`.
- `committed_effects=[]` sur toutes les branches recurring.
- `apply_attempt`, `revise_handoff`, `repeat_handoff`, `cancelled` et
  `topic_change` ne doivent jamais appeler de writer.
- Pas de "C'est fait" / "J'ai créé" / "c'est programmé" /
  "je te relancerai" pour un rappel récurrent.
- Un item non-habitude ne doit jamais être transformé en `action_family`.
- Le renderer doit toujours indiquer la destination plateforme et la
  non-mutation.

## Integration Points

- `run.ts` appelle `maybeRunCreateRecurringReminderOperation()` et passe le
  contexte runtime.
- `one_shot_reminder/router.ts` reste le direct effect propriétaire des rappels
  ponctuels. La frontière est `handoff_to_one_shot`.
- `router/handoff_flow_arbitration.ts` protège les suites du handoff actif.
- `product_surface_registry` fournit la destination `recurring_reminders`.
- `clarification_tool` clarifie one-shot vs recurring quand les signaux sont
  ambigus.
- Les context/status loaders peuvent lire `user_recurring_reminders`, mais ne
  doivent pas créer ou modifier les rappels recurring.

## Allowed Changes

- Ajouter un slot ou une contrainte au JSON structuré de `intake.ts`, si le
  contrat est mis à jour.
- Extraire le reducer vers un `reducer.ts` dédié, sans changer la sémantique.
- Améliorer `renderer.ts` tant qu'il reste no-mutation.
- Renforcer les tests d'invariants du module.
- Améliorer les adapters legacy à condition que le chemin nominal handoff ne
  les appelle pas.

## Forbidden Changes

- Ajouter une regex métier dans `run.ts`, `router.ts` ou `persistence.ts` pour
  distinguer ponctuel/récurrent, cadence, contenu ou binding.
- Faire créer un one-shot par `create_recurring_reminder`.
- Appeler `insertRecurringReminderFromDraft()` dans le chemin nominal.
- Mettre `executedTools` sur une branche recurring.
- Dire "créé", "programmé", "c'est fait" ou équivalent pour un rappel
  récurrent.
- Réintroduire une confirmation globale exécutable.
- Laisser `draft_only` ou `no_create` produire une pending confirmation
  exécutable.

## Legacy Exceptions

- Les clés tempMemory legacy (`active_tool_skill_intake`,
  `pending_tool_skill_confirmation`, `__pending_recommendation_operation`) sont
  encore lues/écrites par `state.ts` pour compatibilité avec les flows actifs.
  Elles ne doivent plus signifier qu'une exécution recurring est possible.
- Le reducer est encore réparti entre `intake.ts`, `state.ts` et `router.ts`.
- `executor.ts`, `persistence.ts`, `confirmation_token.ts` et les tests legacy
  peuvent rester dans le repo pour référence ou migration, mais ils sont hors
  chemin nominal V1.
- `run.ts` contient encore des arbitrages globaux d'interruption
  one-shot/status/coach/recap autour des flows actifs. Ils doivent migrer vers
  `UserTurnSnapshot` + `local reducer contract` + `handoff_flow_arbitration`.

## Required Tests

Le contrat est protégé par
`tools/operations/create_recurring_reminder/tests.ts` :

- one-shot wording -> `handoff_to_one_shot`, sans draft recurring;
- recurring wording -> `platform_handoff`;
- missing time/content -> `ask_question`;
- draft complet -> `handoff_delivered`, aucun pending exécutable;
- `ok programme-le` -> `apply_attempt`, aucun writer;
- `revise_handoff` met à jour le draft;
- `repeat_handoff` répète destination + contenu;
- `draft_only` / `no_create` -> handoff non-mutant;
- active intake cancel -> frame cleared, aucun writer;
- active recurring + one-shot wording -> sortie vers one-shot;
- renderer -> pas de wording créé/programmé sans mutation;
- binding non-habitude -> `plan_item`, jamais `action_family`;
- structurel : le runtime nominal n'importe pas executor, persistence ou
  confirmation token.

Tests frontière utiles :

- `tools/always_on/one_shot_reminder/one_shot_reminder_tool_test.ts`
  protège la frontière ponctuel vs récurrent.
- `router/turn_intent_arbitrator.test.ts` protège le routage global des
  intents concurrents.
- tests réels : "demain matin, enfin peut-être tous les matins" doit déclencher
  clarification, pas choisir recurring trop tôt.

## Suivi Des Décisions Architecturales

| Date | Décision | Statut | Référence |
| --- | --- | --- | --- |
| 2026-05-30 | `create_recurring_reminder` suivait le modèle `contract -> intake -> reducer/state -> effects -> executor -> renderer`; `committed_effects` était la preuve d'exécution. | Superseded pour le chemin nominal | J45 dans `15-chantiers-log.md` |
| 2026-06-01 | `create_recurring_reminder` devient un handoff plateforme no-mutation; la création récurrente se fait dans la plateforme. | Active | Architecture handoff V1 |
| 2026-06-01 | La frontière one-shot vs recurring doit passer par clarification quand elle est ambiguë; seul one-shot reste exécutable depuis le chat. | Active | QA clarification dispatcher |
