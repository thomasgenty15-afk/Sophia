# adjust_plan_item Runtime Contract

## Mental Model

`adjust_plan_item` est un `platform_handoff_skill`.

Il aide l'utilisateur a comprendre quoi ajuster, produit une recommandation
structuree, puis redirige vers la surface Plan. Il ne modifie plus le plan
depuis le chat.

Le flux nominal V1 est :

```txt
contract -> structured intake -> reducer/coaching policy
         -> handoff draft -> platform destination -> renderer
         -> active handoff state
```

Le terminal operationnel est supprime du runtime nominal : pas de confirmation
executable, pas d'executor, pas de writer DB plan, pas de `committed_effects`
plan, pas de phrase "c'est fait".

## Depend De L'Architecture De X

Ce domaine depend de :

- `UserTurnSnapshot` / `TurnFrame` / `RouteDecision` pour detecter
  l'opportunite `adjust_plan_item` sans trancher le scope metier a la place du
  skill ;
- `TurnAgenda` pour representer une tache `platform_handoff`, pas un effet
  durable executable ;
- `EffectLedger` pour tracer le handoff avec `no_chat_mutation=true`,
  `committed_effects=[]` et `executedTools=[]` ;
- le contrat local `tools/operations/adjust_plan_item/contract.ts` pour les
  types handoff dedies ;
- `state.ts` pour conserver quelques tours un handoff actif afin de gerer
  "redis-moi", "rends ca plus leger", "plutot cette semaine" ou "ok vas-y"
  sans execution.

## Runtime Shape

```txt
run.ts / operation_runtime_pipeline.ts
  -> maybeRunAdjustPlanItemOperation(context)
  -> adjust_plan_item/router.ts
     -> state.ts load/write/clear handoff frame
     -> intake.ts sub-skills + structured intake
     -> coach_guidance.ts / handoff.ts recommendation
     -> renderer.ts user-visible handoff
  -> AdjustPlanOperationRuntimeResult
     toolExecution="platform_handoff"
     executedTools=[]
     committed_effects=[]
```

Le router nominal ne doit pas importer :

- `createConfirmationToken`
- `executeAdjustPlanItem`
- `writePlanAdjustmentPatch`
- materializer/writer DB plan

Le code historique executable, lorsqu'il reste necessaire pour lecture ou tests
legacy, doit etre isole hors runtime nominal, par exemple dans
`legacy_execution_router.ts`.

## File Ownership

- `tools/operations/adjust_plan_item/contract.ts`
  possède les types handoff, scopes, statuts et invariants locaux.
- `tools/operations/adjust_plan_item/router.ts`
  possède la façade runtime, l'état multi-tour et l'adapter
  `OperationRuntimeResult`.
- `tools/operations/adjust_plan_item/intake.ts` et sous-skills
  possèdent la compréhension structurée, le routing de scope et la collecte des
  contraintes.
- `tools/operations/adjust_plan_item/state.ts`
  possède `__adjust_plan_handoff_state` et les clés tempMemory legacy.
- `tools/operations/adjust_plan_item/renderer.ts`
  possède le rendu user-facing handoff.
- `tools/operations/adjust_plan_item/weekly_bridge.ts`
  adapte les signaux weekly en contexte de handoff Plan.
- Executors, materializers et writers plan legacy sont hors chemin nominal V1.

## Sub-skills

Les sous-skills restent utiles pour le coaching :

- `scope_router` : identifier si la demande vise une action, un cluster, la
  semaine courante, le niveau courant ou le plan global.
- `action_intake` : comprendre la cible action-level et les contraintes.
- `level_intake` : comprendre un ajustement de niveau/semaine sans toucher
  l'objectif global.
- `whole_plan_intake` : cadrer une remise en cause globale avec prudence.
- `handoff_validation` : verifier que la recommandation contient une
  destination Plan claire et ne pretend pas appliquer.

Les stages V1 sont :

```txt
scope
reason_change
change_target
constraints
affected_items
handoff_draft_generation
handoff_validation
platform_handoff
closure_no_mutation
```

`user_confirmation` et `execution` ne font pas partie du workflow V1.

## Contract Handoff

Le draft user-facing est un `AdjustPlanHandoffDraft` :

- `operation_type: "adjust_plan_item"`
- `mode: "platform_handoff"`
- `no_chat_mutation: true`
- `executable_from_chat: false`
- `scope.kind` parmi `specific_plan_item`, `action_cluster`,
  `current_week`, `current_level`, `whole_plan`, `unknown`
- `user_goal_summary`
- `coaching_read`
- `recommendation.summary`
- `recommendation.recommended_change`
- `recommendation.preserve[]`
- `recommendation.avoid[]`
- `recommendation.platform_destination`
- `recommendation.platform_steps[]`
- `missing_decisions[]`

Ce contrat ne doit pas contenir d'`effect_plan`, de patch applicable, de token
de confirmation, de resultat executor, de `committed_effects` ou de statut
`applied`.

## State

`state.ts` possede l'etat actif :

```txt
__adjust_plan_handoff_state
  skill_id="adjust_plan_item"
  mode="platform_handoff"
  status
  draft
  scope
  turn_count
  max_turns
  created_at
  updated_at
  no_chat_mutation=true
```

Le handoff peut rester actif quelques tours pour :

- `repeat_handoff` : "redis-moi", "ou le faire dans Plan ?"
- `revise_handoff` : "rends ca plus leger", "plutot cette semaine"
- `apply_attempt` : "ok vas-y", "applique"
- `cancelled` / `topic_change`

Aucun de ces chemins ne doit creer :

- `__pending_tool_skill_confirmation`
- pending executable draft
- `__last_adjust_plan_execution`
- confirmation token state

## Inputs

- Message utilisateur courant.
- `TurnFrame` / `RouteDecision` et agenda handoff.
- Snapshot plan compact, si disponible.
- État actif `__adjust_plan_handoff_state`.
- Contexte weekly éventuel.
- Résultat de `clarification_tool` éventuel.
- Destination `plan` issue du Product Surface Registry.

## Outputs

- `AdjustPlanHandoffDraft`.
- État actif `mode="platform_handoff"`.
- `toolExecution="platform_handoff"`.
- `executedTools=[]`.
- `committed_effects=[]`.
- `platform_handoff.operation_type="adjust_plan_item"`.
- `platform_handoff.surface_id="plan"`.
- Réponse visible no-mutation.

## Renderer

`renderer.ts` est la source canonique du message visible handoff.

Un handoff complet doit toujours contenir :

1. Ce que je comprends
2. Ma recommandation
3. A preserver
4. A eviter
5. Ou le faire dans Plan
6. Une cloture no-mutation

Wording attendu :

```txt
Je te conseille de faire cet ajustement dans la section Plan.
Je ne modifie pas ton plan depuis le chat.
Voici la version a reprendre dans la plateforme.
```

Wording interdit :

- "Je peux l'appliquer"
- "Dis-moi oui et je le fais"
- "C'est fait"
- "J'ai modifie ton plan"
- toute variante qui pretend qu'un patch a ete applique

## Weekly Bridge

Weekly peut detecter une surcharge ou un besoin d'allegement, mais doit produire
un handoff :

```txt
weekly review signal -> adjust_plan handoff draft -> Plan destination
```

Weekly ne prepare plus de patch applicable, ne declenche plus de confirmation
executable et ne marque pas un ajustement comme applique via le chat.

Formulation autorisee :

```txt
Cette semaine semble trop chargee. Je te conseille d'alleger l'action X dans Plan.
```

Formulation interdite :

```txt
J'ai ajuste ta semaine.
```

## Dispatcher

Le dispatcher peut detecter :

```txt
tool_skill_opportunity.operation_type = "adjust_plan_item"
```

Il ne doit pas choisir :

- le scope final ;
- l'action exacte ;
- le type d'ajustement ;
- le draft final ;
- une confirmation.

Une fois le handoff actif, les messages comme "redis-moi", "ou le faire dans
Plan", "rends ca plus leger" et "ok vas-y" restent au skill, sauf intention
concurrente explicite.

## Integration Points

- `TurnAgenda` transforme `adjust_plan_item` en `platform_handoff`.
- `handoff_flow_arbitration` protège repeat/revise/apply active.
- `clarification_tool` clarifie scope ou cible quand le signal est ambigu.
- `Product Surface Registry` fournit `surface_id="plan"`.
- `EffectLedger` trace `platform_handoff.adjust_plan_item`, sans commit.
- `weekly_review` peut produire un handoff Plan, jamais un patch appliqué.

## Invariants

- Aucun effet durable chat pour `adjust_plan_item`.
- Aucune confirmation chat ne peut appliquer un draft.
- `ok vas-y` / `applique` produit un `apply_attempt` avec destination Plan,
  jamais une execution.
- `executedTools=[]` pour le handoff.
- `committed_effects=[]` pour le handoff.
- `no_chat_mutation=true` dans les traces et le state.
- Le renderer donne une recommandation complete, pas seulement "va dans l'app".
- Pas de fallback regex metier pour remplir les slots ; les decisions fines
  appartiennent au skill et a son intake structure.

## Allowed Changes

- Ajouter un sous-skill de coaching si le scope reste local à
  `adjust_plan_item`.
- Améliorer les drafts et recommandations handoff.
- Ajouter un champ au `AdjustPlanHandoffDraft` si le renderer et les tests sont
  mis à jour.
- Améliorer le bridge weekly tant qu'il produit un handoff non-mutant.

## Forbidden Changes

- Réintroduire un executor ou writer DB plan dans le chemin nominal.
- Créer une pending confirmation exécutable.
- Transformer `ok vas-y` en application.
- Faire porter le scope métier final au dispatcher.
- Ajouter une regex métier dans `run.ts`, TurnAgenda ou handoff arbitration.
- Dire "j'ai modifié", "c'est appliqué" ou équivalent.

## Legacy Exceptions

- Le code historique d'exécution peut rester isolé pour référence ou migration,
  mais il ne doit pas être importé par le runtime handoff nominal.
- Certaines clés tempMemory legacy peuvent être lues pour nettoyer un ancien
  flow; elles ne doivent pas permettre une exécution.
- Les sous-skills existants restent conservés pour ne pas perdre la logique de
  routing et de coaching déjà apprise.

## Required Tests

- Handoff direct : "je veux alleger mon plan" produit une recommandation et pas
  d'execution.
- Confirmation courte : "ok vas-y" repete la destination Plan et n'execute pas.
- Repeat : "redis-moi quoi faire dans Plan" reste dans `adjust_plan_item`.
- Revision : "rends ca plus leger, plutot cette semaine" regenere une
  recommandation.
- Weekly : surcharge detectee -> handoff, pas patch.
- Wording : pas de "c'est fait", "j'ai modifie", "je l'ai applique".
- Structurel : le runtime handoff n'importe pas executor, writer DB plan ou
  confirmation token.

## Suivi Des Decisions Architecturales

| Date       | Decision                                                                 | Statut   | Reference                 |
| ---------- | ------------------------------------------------------------------------ | -------- | ------------------------- |
| 2026-06-01 | `adjust_plan_item` devient un `platform_handoff_skill` no-mutation.      | Actif    | `15-chantiers-log.md` J74 |
