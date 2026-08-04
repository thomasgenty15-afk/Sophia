# Active Handoff Arbitration Contract

## Mental Model

`active_handoff_arbitration` protège la continuité des handoffs plateforme.

Quand un handoff est actif, les messages courts comme "redis-moi", "ok vas-y",
"plus simple" ou "où je le fais ?" ne doivent pas être avalés par
`status_recap`, `product_help`, `normal_reply` ou un ancien tool flow. Ils
doivent rester au skill propriétaire, qui décidera la transition locale :
`repeat_handoff`, `revise_handoff`, `apply_attempt`, `cancelled` ou
`topic_change`.

Cette couche ne comprend pas les slots métier. Elle ne régénère pas de draft,
ne remplit pas de target, ne rend pas de réponse et n'exécute rien. Elle décide
seulement si le tour reste dans le handoff actif, sort vers une intention
concurrente claire, ou demande clarification.

Quand la sortie vers une intention concurrente change de dispatcher, le flow
proprietaire doit produire une `note_information` conforme a
`09-note-information-contract.md`. L'arbitration peut exiger sa presence, mais
elle ne lit pas la note pour choisir un target.

## Runtime Shape

```txt
TurnFrame produced
  -> active handoff state loaded
  -> handoff_flow_arbitration
     -> continue_handoff
     -> interrupt_for_explicit_intent
     -> ask_clarification
     -> clear_handoff
     -> ignore
  -> routers / skill owner / clarification runtime
```

## File Ownership

- `router/handoff_flow_arbitration.ts`
  - possède le contrat `HandoffArbitrationInput`,
    `HandoffArbitrationDecision` et la policy commune de continuité /
    interruption.
- `router/active_flow_state.ts`
  - expose les handoff states actifs depuis `tempMemory` sans lire les slots
    métier.
- `router/user_turn_snapshot.ts`
  - inclut le snapshot du handoff actif.
- `router/local_reducer.ts`
  - représente la suite comme `platform_handoff` ou `clarification`.
- `clarification_tool`
  - est appelé quand la policy ne sait pas distinguer continuité et nouvelle
    intention.
- Chaque skill handoff
  - reste propriétaire de `revise_handoff`, `repeat_handoff`, `apply_attempt`,
    `cancelled` et `topic_change`.

## Inputs

- message user courant ;
- active handoff state :
  - `operation_type` ;
  - `mode="platform_handoff"` ;
  - `status` ;
  - `surface_id` ;
  - `turn_count` / `max_turns` ;
  - `no_chat_mutation=true` ;
- `TurnFrame` structuré ;
- `RouteDecision` éventuelle ;
- `local reducer contract` / snapshot si disponibles ;
- historique récent compact.

## Outputs

```ts
type HandoffArbitrationDecision = {
  action:
    | "continue_handoff"
    | "interrupt_for_explicit_intent"
    | "ask_clarification"
    | "clear_handoff"
    | "ignore";
  continuation_intent?:
    | "revise_handoff"
    | "repeat_handoff"
    | "apply_attempt"
    | "cancel_handoff"
    | "topic_change"
    | "explicit_interrupt"
    | "unclear";
  operation_type?: string | null;
  reason_code: string;
  no_chat_mutation: true;
};
```

## Continuation Rules

Messages qui restent dans le handoff actif sauf intention concurrente claire :

- "redis-moi" ;
- "où je le fais ?" ;
- "ok vas-y" ;
- "applique" ;
- "crée-la" ;
- "programme-le" ;
- "plus simple" ;
- "plus doux" ;
- "plutôt cette semaine" ;
- "change la technique" ;
- "moins de questions" ;
- "pas de suivi".

Mapping attendu :

- précision, allègement, changement de technique ou de cadence ->
  `revise_handoff` ;
- "redis-moi", "où je le fais/lance/crée ?" -> `repeat_handoff` ;
- "ok vas-y", "applique", "crée-la", "programme-le", "active-la" ->
  `apply_attempt` ;
- "annule", "pas de carte", "pas de potion" -> `cancel_handoff` ou
  `blocked` selon le skill.

Le skill propriétaire décide le détail. Cette policy ne doit pas savoir comment
réviser un plan, une carte, une potion, un rappel récurrent ou une préférence.

## Interruptions Autorisées

Un handoff actif doit céder si le tour contient une intention concurrente
claire déjà structurée :

- safety ;
- `create_one_shot_reminder` explicite ;
- `track_progress_plan_item` clair ;
- status DB clair ;
- product help clair de navigation générale ;
- changement de sujet explicite ;
- refus global de continuer le flow.

Exemples :

```txt
"mets-moi un rappel demain à 9h"
  -> interrupt_for_explicit_intent

"j'ai fini l'action"
  -> interrupt_for_explicit_intent

"où sont mes rappels actifs ?"
  -> interrupt_for_explicit_intent

"stop, autre sujet"
  -> clear_handoff
```

## Clarification

Si le message est ambigu entre continuité du handoff et nouvelle intention, la
policy doit retourner `ask_clarification` et fournir des candidats structurés au
`clarification_tool`.

Exemple :

```txt
"plutôt demain matin"
```

Peut être une révision d'un rappel récurrent, un one-shot reminder ou une
révision plan. La policy ne choisit pas par regex.

## Invariants

- Aucun slot métier n'est rempli dans cette couche.
- Aucun executor n'est appelé.
- Aucun writer DB n'est appelé.
- Aucun pending confirmation exécutable n'est créé.
- `apply_attempt` reste non-mutant.
- Safety préempte toujours.
- Une interruption locale vers global, safety, product_help, status_recap ou un
  autre dispatcher local requiert `note_information`.
- Un `cancel_handoff` ou stop local sans nouveau sujet ferme ou differe le flow
  local et ne rappelle pas global sur le meme tour.
- Les direct effects autorisés (`create_one_shot_reminder`,
  `track_progress_plan_item`) peuvent interrompre proprement le handoff.
- Un handoff actif ne doit pas être avalé par `status_recap` ou `product_help`
  quand le user demande seulement de répéter, préciser ou tenter d'appliquer le
  handoff.

## Allowed Changes

- Ajouter un nouveau `continuation_intent` générique si plusieurs handoff skills
  en ont besoin et si les tests transverses sont ajoutés.
- Ajouter un reason code d'interruption ou de clarification.
- Ajouter une source de snapshot non-mutante.
- Améliorer l'appel au `clarification_tool` avec de meilleurs candidats
  structurés.

## Forbidden Changes

- Ajouter une regex métier large pour décider le flow.
- Lire le message brut pour remplir un target, une technique, une cadence, un
  type de potion ou une préférence.
- Rendre une réponse user-facing depuis cette policy.
- Transformer "ok vas-y" en confirmation exécutable.
- Empêcher safety ou one-shot explicite de sortir du handoff.

## Legacy Exceptions

- Certains skills peuvent encore protéger localement leurs états actifs jusqu'à
  ce que l'arbitration commune soit branchée partout.
- Les clés tempMemory legacy restent acceptées si elles exposent clairement
  `mode="platform_handoff"` et `no_chat_mutation=true`.

## Required Tests

- active adjust plan + "rends ça plus léger" -> `continue_handoff` /
  `revise_handoff` ;
- active adjust plan + "redis-moi quoi faire" -> `repeat_handoff` ;
- active adjust plan + "ok vas-y" -> `apply_attempt` ;
- active attack card + "change la technique" -> `revise_handoff` ;
- active defense card + "plus doux" -> `revise_handoff` ;
- active potion + "pas de suivi" -> continuation locale, sans recurring ;
- active recurring + "tous les lundis plutôt" -> `revise_handoff` ;
- active preferences + "moins de questions" -> `revise_handoff` ;
- active handoff + one-shot reminder explicite -> interrupt ;
- active handoff + track progress explicite -> interrupt ;
- active handoff + safety signal -> interrupt ;
- active handoff + status DB clair -> interrupt ;
- ambiguity continuation/new intent -> `ask_clarification` ;
- no active handoff -> `ignore`.

## Suivi Des Décisions Architecturales

| Date | Décision | Statut | Référence |
| --- | --- | --- | --- |
| 2026-06-01 | Créer une policy commune de continuité/interruption des handoffs actifs, sans slot filling métier ni exécution. | Active | Architecture handoff V1 |
