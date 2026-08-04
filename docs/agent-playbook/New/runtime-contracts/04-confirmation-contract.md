# Confirmation Contract

## Mental Model

Le Confirmation Contract est le vocabulaire commun qui repond a la question :
ce tour user confirme-t-il, rejette-t-il, corrige-t-il, demande-t-il une
preview, demande-t-il une explication, demande-t-il un status, tente-t-il une
application depuis le chat, ou parle-t-il d'autre chose ?

Il ne possede aucun brouillon metier et n'execute aucun effet. Il produit une
decision ciblee et typée que le skill proprietaire convertit ensuite en
transition de workflow.

Dans l'architecture handoff V1, une confirmation courte comme `ok`, `oui` ou
`vas-y` ne suffit jamais a muter un objet complexe. Pour les platform handoffs,
elle devient une suite conversationnelle non-mutante :

```txt
apply_attempt -> repeat destination plateforme -> no_chat_mutation
```

Elle ne devient une execution durable que pour les effets chat explicitement
autorisés, avec pending compatible et commit prouve. En V1, les effets chat
exécutables restent :

- `create_one_shot_reminder`
- `track_progress_plan_item`

## Dépend De L'Architecture De X

Ce domaine depend de :

- `UserTurnSnapshot` pour lire l'etat complet du tour. Dans le code actuel,
  `decideConfirmation(...)` accepte encore des snapshots partiels
  (`pending`, `active_operation`, `agenda_tasks`,
  `turn_frame_confirmation`) plutot qu'un objet `UserTurnSnapshot` complet.
- `local reducer contract` pour distinguer `effect`, `platform_handoff`,
  `clarification`, `status`, `memory`, `repair` et `reply`.
- `Active Handoff Arbitration` pour que les suites d'un handoff actif soient
  interpretees comme `repeat_handoff`, `revise_handoff`, `apply_attempt`,
  `cancelled` ou `topic_change`, pas comme approvals exécutables.
- `EffectLedger` pour ne jamais dire "c'est fait" sans effet committé, et pour
  tracer les handoffs/clarifications comme resultats non-mutants.
- le contrat local du skill pour l'intake, le reducer, le draft, le handoff et
  le renderer.

## Runtime Shape

```txt
TurnFrame + active state + agenda snapshot + user message
  -> router/confirmation_contract.ts::decideConfirmation
  -> direct effect owner OR platform handoff owner

direct effect owner
  -> local pending/effect reducer
  -> executor only for chat-executable effects
  -> committed_effects / failed_effects
  -> EffectLedger + renderer

platform handoff owner
  -> active handoff arbitration
  -> repeat / revise / apply_attempt / cancel / topic_change
  -> platform_handoff result
  -> EffectLedger non-mutant + renderer no-mutation
```

Le contrat global est une decision de ciblage et de securite, pas un troisieme
appel IA. Il peut utiliser `turn_frame.confirmation_response` comme signal, mais
ne l'execute jamais aveuglement sans target compatible.

## File Ownership

- Contrat global :
  `supabase/functions/sophia-brain/router/confirmation_contract.ts`.
  Fonctions/types proprietaires :
  `decideConfirmation`, `ConfirmationDecision`,
  `ConfirmationDecisionKind`, `PendingConfirmationSnapshot`,
  `ConfirmationTarget`.
- Tests du contrat global :
  `supabase/functions/sophia-brain/router/confirmation_contract.test.ts`.
- Arbitration handoff :
  `supabase/functions/sophia-brain/router/handoff_flow_arbitration.ts`.
- Clarification :
  `supabase/functions/sophia-brain/clarification/*`.
- Owners directs executables :
  `tools/always_on/one_shot_reminder/*`,
  `tools/always_on/track_progress_plan_item/*`.
- Owners handoff :
  `tools/operations/adjust_plan_item/*`,
  `tools/operations/prepare_attack_card/*`,
  `tools/operations/prepare_defense_card/*`,
  `tools/operations/select_state_potion/*`,
  `tools/operations/create_recurring_reminder/*`,
  `tools/operations/update_coach_preferences/*`.

## Inputs

`decideConfirmation(...)` lit :

- `message` : dernier message user brut, normalise localement dans le contrat ;
- `pending` : pending executable seulement pour les effets chat compatibles ;
- `active_operation` : contexte actif optionnel, notamment handoff actif ;
- `agenda_tasks` : taches concurrentes optionnelles pour detecter plusieurs
  cibles compatibles ;
- `turn_frame_confirmation` : signal L1 optionnel
  `TurnFrame.confirmation_response`.

Inputs metier qui restent hors contrat :

- slots de plan, carte, potion, rappel ou preference ;
- contenu complet du brouillon ;
- choix de surface produit ;
- validation metier d'un draft ;
- droits d'ecriture DB.

## Outputs

`ConfirmationDecision` expose :

- `decision` :
  `approve | reject | revise | explain | preview | status | unrelated | ambiguous` ;
- `applies_to_pending_effect` : vrai seulement si la cible correspond a un
  pending executable compatible ;
- `target` : operation/effect/source ciblee ;
- `confidence` : `low | medium | high` ;
- `evidence` et `reason_code` ;
- flags d'orchestration :
  `should_execute`, `should_clear_pending`, `should_revise`,
  `should_explain`.

Pour les `platform_handoff`, les owners doivent adapter ces decisions ainsi :

| ConfirmationDecision | Transition handoff |
| --- | --- |
| `approve` / `ok vas-y` | `apply_attempt`, non-mutant |
| `revise` | `revise_handoff` |
| `preview` / `explain` | `repeat_handoff` ou explication propriétaire |
| `status` | status/read-only si explicitement demandé |
| `reject` | `cancelled` |
| `unrelated` | interruption par owner concurrent |
| `ambiguous` | clarification |

`should_execute=true` est interdit pour les operation types suivants :

- `adjust_plan_item`
- `prepare_attack_card`
- `prepare_defense_card`
- `select_state_potion`
- `create_recurring_reminder`
- `update_coach_preferences`

## Responsibilities

Le Confirmation Contract possede :

- la classification commune approve/reject/revise/explain/preview/status/
  unrelated/ambiguous ;
- la normalisation de ciblage minimal entre pending, active flow et agenda ;
- la regle de precedence : status/explain/preview/revise/reject bloquent toute
  execution avant approve ;
- la protection contre les confirmations incompatibles, par exemple handoff
  carte + `programme le rappel` => `unrelated` ;
- les flags utilisables par l'EffectLedger et les routers propriétaires.

Le Confirmation Contract ne possede pas :

- la generation d'un brouillon ;
- la validation metier d'un draft ;
- l'intake structure d'un tool ;
- le reducer/state machine local ;
- la preparation exacte des effets metier ;
- l'execution DB ;
- la destination produit ;
- la reponse user-facing finale.

## Intake Structuré

Le Confirmation Contract n'a pas d'intake IA propre. Il depend de deux sources
structurees existantes :

- L1 dispatcher :
  `contracts/turn_frame.v1.ts::TurnFrame.confirmation_response` avec
  `kind: yes | no | correction_to_pending | topic_change | unknown` et
  `confidence_band` ;
- L5 skill/tool intake :
  chaque owner lit le message dans son contexte metier.

Pour les ambiguïtés réelles, le dispatcher ou le skill actif doit utiliser
`clarification_tool` avec candidats structurés. Le Confirmation Contract ne doit
pas devenir un routeur metier par regex.

## Reducer / State Transition

Le reducer n'est pas dans `confirmation_contract.ts`.

- Direct effects executables :
  - `one_shot_reminder` peut transformer une approval compatible en execution
    uniquement si le pending/target est unique et que l'executor retourne un
    commit ;
  - `track_progress_plan_item` peut logger une progression uniquement si le
    writer retourne un `logged_progress_id`.
- Platform handoffs :
  - `approve` devient `apply_attempt` ;
  - `revise` regenere une recommandation ;
  - `preview` / `explain` reste read-only ;
  - `reject` clear l'etat actif ;
  - `unrelated` laisse un owner concurrent explicite reprendre ;
  - aucun chemin ne crée de pending executable.

## Effects

Le contrat ne prepare pas les effets metier complets. Il autorise ou bloque
l'idee d'executer un pending.

- Pour un direct effect autorisé, l'owner peut produire `requested_effects`,
  `allowed_effects`, `committed_effects` ou `failed_effects`.
- Pour un `platform_handoff`, l'owner produit `platform_handoff` et
  `no_chat_mutation=true`, avec `committed_effects=[]` et `executedTools=[]`.
- Pour une clarification, l'owner produit une question ou une resolution
  non-mutante.

## Executor

Executors nominaux autorisés en V1 :

- one-shot reminder ;
- track progress.

Les operations complexes suivantes ne doivent pas appeler d'executor dans leur
runtime nominal :

- `adjust_plan_item`
- `prepare_attack_card`
- `prepare_defense_card`
- `select_state_potion`
- `create_recurring_reminder`
- `update_coach_preferences`

Le Confirmation Contract ne doit jamais importer Supabase ni appeler un
executor.

## Renderer

Le rendu user-facing reste proprietaire du direct effect, du handoff skill ou
du status reader. Le contrat global ne doit pas contenir de phrase finale
metier.

Pour un `apply_attempt` handoff, le renderer doit dire la vérité :

```txt
Je ne le fais pas depuis le chat. Voici où le reprendre dans la plateforme.
```

Cette phrase est un succès handoff honnête, pas un blocked effect.

## Invariants

- `approve` ne peut jamais executer sans pending executable compatible.
- `approve.should_execute=true` exige :
  pending compatible, cible unique, confidence `medium` ou `high`, aucun marker
  revise/reject/preview/explain/status, et operation type chat-executable.
- `revise`, `preview`, `explain`, `status`, `reject`, `unrelated` et
  `ambiguous` ne commitent jamais.
- `oui mais...` est toujours `revise`, jamais `approve`.
- `montre-moi`, `brouillon`, `avant de creer`, `prepare sans creer` sont
  read-only (`preview`).
- Une demande status est read-only et ne consomme pas un handoff.
- Une intention explicite incompatible avec l'etat actif retourne `unrelated`
  et laisse la main au router/tool concerne.
- `ok vas-y` dans un handoff complexe est `apply_attempt`, pas execution.
- Un platform handoff ne crée jamais `__pending_tool_skill_confirmation`.
- Le contrat peut utiliser des detecteurs deterministes centralises pour la
  securite confirmation, mais un agent ne doit pas ajouter de nouvelles regex
  metier dans chaque tool.

## Integration Points

- `router/run.ts` orchestre le tour et garde les protections globales, mais ne
  doit pas recevoir de nouvelles confirmations metier ad hoc.
- `router/turn_intent_arbitrator.ts` peut router/clear dans certains cas
  legacy, mais ne doit pas reclassifier localement `ok`/`oui` en execution
  metier.
- `router/handoff_flow_arbitration.ts` protège la continuité des handoffs
  actifs avant qu'un status/product help opportuniste capture le tour.
- `router/effect_ledger.ts` et les guards de reponse finale restent la preuve
  aval : le contrat confirmation n'est pas une preuve de commit.

## Allowed Changes

- Ajouter un `reason_code` ou de l'evidence dans
  `confirmation_contract.ts`.
- Ajouter un champ de target si un nouveau runtime global l'exige, tant que
  `should_execute` reste conservateur.
- Brancher un direct effect ou un handoff en convertissant
  `ConfirmationDecision` vers son reducer local.
- Ajouter un test de regression dans `confirmation_contract.test.ts` avant de
  changer une classification.
- Ajouter un test d'integration dans le owner branche.

## Forbidden Changes

- Faire de `ok`, `oui`, `vas-y` une validation universelle.
- Executer un pending sans target compatible.
- Executer un `platform_handoff`.
- Traiter `oui mais...` comme approve.
- Commit sur `preview`, `explain` ou `status`.
- Ajouter une nouvelle regex confirmation dans `run.ts`, L3 ou un tool alors
  qu'elle appartient au contrat global ou a l'intake structure du skill.
- Deplacer les regles metier du skill dans `confirmation_contract.ts`.
- Faire dire "c'est fait" a partir de `should_execute`; seul un effet committe
  ou une lecture DB peut fonder cette phrase.

## Legacy Exceptions

- Les chemins historiques de confirmation executable peuvent rester dans le
  repo pour reference ou migration, mais ils ne sont plus le chemin nominal des
  complex tools V1.
- `tools/operations/_shared/confirmation_review.ts` peut rester utilisé comme
  lecture de suite dans un skill actif. Son resultat ne peut plus autoriser une
  execution pour `adjust_plan_item`, cartes, potion, recurring reminder ou
  preferences; il doit etre adapté en `repeat_handoff`, `revise_handoff`,
  `apply_attempt`, `cancelled`, `topic_change` ou clarification.
- Les draft reviews locales IA restent autorisees quand elles relisent un
  brouillon dans le contexte du skill proprietaire. Elles ne doivent pas
  contredire le contrat global.

## Required Tests

Contrat global :

- `supabase/functions/sophia-brain/router/confirmation_contract.test.ts`
  couvre approve/reject/revise/preview/explain/status/unrelated/ambiguous,
  target incompatible, plusieurs targets compatibles et signal
  `turn_frame.confirmation_response`.
- Confirmation pour direct effect compatible -> `should_execute=true` possible
  seulement avec pending unique.
- Confirmation pour complex operation -> `should_execute=false`.
- `ok vas-y` dans un handoff actif -> `apply_attempt` côté owner, aucun
  `committed_effects`, aucun `executedTools`.

Tests handoff attendus :

- `adjust_plan_item`, cartes, potion, recurring reminder et preferences :
  `apply_attempt` non-mutant ;
- `repeat_handoff` et `revise_handoff` restent dans le skill actif ;
- nouvelle intention explicite one-shot/progress/status/safety interrompt le
  handoff ;
- wording "c'est fait" reste bloqué sans commit, wording handoff honnête est
  autorisé.

## Suivi Des Décisions Architecturales

| Date | Decision | Statut | Reference |
| --- | --- | --- | --- |
| 2026-05-29 | ConfirmationContract devient le vocabulaire commun, pas un executor global. | Active | `15-chantiers-log.md` J24 |
| 2026-05-30 | Le contrat runtime confirmation documente explicitement ses dependances UserTurnSnapshot, local reducer contract, EffectLedger et les reducers L5 proprietaires. | Active | Mise a jour runtime-contracts confirmation |
| 2026-06-01 | Les complex tools V1 ne consomment plus une confirmation comme approval executable; `ok vas-y` devient `apply_attempt` non-mutant. | Active | Architecture handoff V1 |
