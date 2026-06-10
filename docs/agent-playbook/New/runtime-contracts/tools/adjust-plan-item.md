# adjust_plan_item Runtime Contract

## Mental Model

`adjust_plan_item` est un `platform_handoff_skill`.

Il aide l'utilisateur a comprendre quoi ajuster, produit une recommandation
structuree, puis redirige vers la surface Plan. Il ne modifie plus le plan
depuis le chat.

Le flux nominal cible est :

```txt
global dispatcher starts adjust_plan_item
-> adjust_plan_item.local_dispatcher while flow active
-> reducer/state update
-> visible prompt stage-specific
-> optional platform_handoff Plan
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
- `local reducer contract` pour representer une tache `platform_handoff`, pas un effet
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
     -> local_dispatcher.ts structured decision
     -> reducer.ts state + handoff draft
     -> visible_agent.ts stage-specific visible prompt
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
- `tools/operations/adjust_plan_item/local_dispatcher.ts` possède la
  compréhension structurée du flow actif, le routing de scope local et la
  collecte des contraintes.
- `tools/operations/adjust_plan_item/intake.ts` et sous-skills legacy peuvent
  rester en compat pendant la migration, mais ne doivent pas devenir un second
  décideur.
- `tools/operations/adjust_plan_item/state.ts`
  possède `__adjust_plan_handoff_state` et les clés tempMemory legacy.
- `tools/operations/adjust_plan_item/visible_agent.ts` possède les prompts
  visibles stage-specific. `renderer.ts` ne peut rester qu'en fallback/guard de
  sécurité pendant la migration, pas comme chemin nominal.
- `tools/operations/adjust_plan_item/weekly_bridge.ts`
  adapte les signaux weekly en contexte de handoff Plan.
- Executors, materializers et writers plan legacy sont hors chemin nominal V1.

## Local Dispatcher

Le dispatcher local est l'unique décideur métier quand `adjust_plan_item` est
actif.

Il décide :

- si le user répond au champ courant ;
- si le scope vise une action, un cluster, une semaine/niveau, un plan entier
  ou plusieurs plans ;
- si la cible est ambiguë et doit être clarifiée ;
- si la proposition peut devenir un handoff Plan ;
- si le user révise, répète, demande où le faire, tente d'appliquer, annule ou
  sort du flow.

Il ne doit jamais :

- appeler le dispatcher global tant que le flow est actif ;
- router vers global sauf `exit_to_global_dispatcher` ;
- appliquer un changement Plan ;
- produire une réponse visible ;
- remplir par regex, mots-clés isolés ou template.

Les anciens sous-skills peuvent être lus comme contexte de migration, mais la
cible est un seul JSON structuré de dispatcher local consommé par le reducer.

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

`user_confirmation` et `execution` ne font pas partie du workflow cible.

## Multi-Plan / Scope Support

`adjust_plan_item` doit fonctionner quand le snapshot contient plusieurs plans,
niveaux ou transformations.

Chaque cible ou item cité dans le handoff doit préserver :

```json
{
  "plan_id": "string|null",
  "plan_title": "string|null",
  "level_id": "string|null",
  "level_title": "string|null",
  "plan_item_id": "string|null",
  "plan_item_title": "string|null"
}
```

Règles :

- Une demande globale peut viser tout le Plan seulement si le user le demande
  clairement ou si le contexte actif le rend non ambigu.
- Une demande comme "le deuxième plan", "celui du sport", "l'autre plan",
  "cette action" ou "la semaine légère" doit être résolue depuis le contexte ou
  clarifiée.
- Le handoff Plan doit nommer le plan ou l'item concerné si ce contexte existe.
- Un handoff multi-plan doit grouper les changements par plan.
- Le reducer bloque tout handoff qui perd `plan_id`/`plan_item_id` quand ces
  identifiants étaient disponibles.
- Le visible agent ne doit pas inventer de scope manquant.

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
- Clarification amont éventuelle, lue seulement comme contexte historique si
  elle existe.
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

## Visible Prompts

Le chemin nominal n'utilise pas de renderer déterministe.

Le dispatcher local retourne `visible_task.kind` et les données structurées. Le
prompt visible correspondant écrit naturellement la réponse.

Les prompts visibles doivent couvrir :

- clarification de scope ;
- clarification raison / changement souhaité ;
- clarification contraintes / éléments à préserver ;
- handoff Plan prêt ;
- révision du handoff ;
- répétition / destination courte ;
- tentative d'application depuis le chat ;
- explication de la recommandation ;
- annulation / sortie.

Ils ne doivent pas imposer de squelette fixe du type :

- `Ce que je comprends` ;
- `Ma recommandation` ;
- `A préserver` ;
- `A éviter` ;
- `Petit pas immédiat`.

Ces blocs peuvent apparaître uniquement si le modèle les choisit
naturellement, jamais comme template obligatoire.

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
flow_opportunity.operation_type = "adjust_plan_item"
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

Quand `__adjust_plan_handoff_state` est actif, le dispatcher global ne doit pas
fonctionner.

Exception :

```txt
flow_action = exit_to_global_dispatcher
```

Dans ce cas seulement, le même message user est réanalysé par le dispatcher
global avec un `exit_memo` produit par le dispatcher local.

## Integration Points

- `local reducer contract` transforme `adjust_plan_item` en `platform_handoff`.
- `active_skill_state` / état local maintient le flow actif.
- `clarification_tool` peut exister en amont avant l'entrée dans le flow, mais
  ne doit pas relire le message comme second décideur quand `adjust_plan_item`
  est actif.
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
- Le visible prompt donne une recommandation utile, pas seulement "va dans
  l'app".
- Pas de fallback regex metier pour remplir les slots ; les decisions fines
  appartiennent au skill et a son intake structure.
- Si plusieurs plans existent, le scope est conservé ou clarifié.
- Un handoff multi-plan groupe les changements par plan.

## Allowed Changes

- Ajouter un sous-skill de coaching si le scope reste local à
  `adjust_plan_item`.
- Améliorer les drafts et recommandations handoff.
- Ajouter un champ au `AdjustPlanHandoffDraft` si le visible agent, le reducer
  et les tests sont mis à jour.
- Améliorer le bridge weekly tant qu'il produit un handoff non-mutant.

## Forbidden Changes

- Réintroduire un executor ou writer DB plan dans le chemin nominal.
- Créer une pending confirmation exécutable.
- Transformer `ok vas-y` en application.
- Faire porter le scope métier final au dispatcher global.
- Ajouter une regex métier dans `run.ts`, local reducer contract ou handoff arbitration.
- Ajouter une regex métier dans `run.ts`, local reducer contract, handoff arbitration,
  reducer ou visible agent.
- Dire "j'ai modifié", "c'est appliqué" ou équivalent.
- Réintroduire un renderer déterministe comme chemin nominal.

## Legacy Exceptions

- Le code historique d'exécution peut rester isolé pour référence ou migration,
  mais il ne doit pas être importé par le runtime handoff nominal.
- Certaines clés tempMemory legacy peuvent être lues pour nettoyer un ancien
  flow; elles ne doivent pas permettre une exécution.
- Les sous-skills existants restent conservés pour ne pas perdre la logique de
  routing et de coaching déjà apprise.
- Le renderer legacy peut rester temporairement comme guard/fallback, mais doit
  sortir du chemin nominal.

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
- Active flow : quand `adjust_plan_item` est actif, aucun dispatcher global ne
  fonctionne sauf `exit_to_global_dispatcher`.
- Multi-plan : deux plans dans le snapshot, demande ciblée sur un plan, le
  handoff conserve le bon `plan_id`.
- Ambiguïté multi-plan : "l'autre plan" sans contexte demande clarification.
- Handoff multi-plan : proposition groupée par plan.
- Renderer : pas de renderer déterministe dans le chemin nominal.

## Suivi Des Decisions Architecturales

| Date       | Decision                                                                 | Statut   | Reference                 |
| ---------- | ------------------------------------------------------------------------ | -------- | ------------------------- |
| 2026-06-01 | `adjust_plan_item` devient un `platform_handoff_skill` no-mutation.      | Actif    | `15-chantiers-log.md` J74 |
