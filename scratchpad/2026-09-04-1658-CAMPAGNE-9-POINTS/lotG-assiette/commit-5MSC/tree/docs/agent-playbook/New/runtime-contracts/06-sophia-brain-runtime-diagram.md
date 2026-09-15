# Sophia Brain Runtime Diagram

## Mental Model

Ce document donne la vue système de Sophia Brain. Il ne remplace pas les
contrats de domaine : il montre où chaque instance intervient, quelle vérité
elle possède, et quelles frontières elle ne doit pas franchir.

## Vue Globale D'Un Tour

```mermaid
flowchart TD
  U["User message"] --> EP["Edge Function sophia-brain/index.ts"]
  EP --> RUN["router/run.ts facade IO"]
  RUN --> CTX["Context loaders\nhistory, tempMemory, DB projections"]
  CTX --> DISP["Dispatcher L1\nTurnFrame"]
  DISP --> ROUTERS["Routers L2/L3\nRouteDecision"]
  ROUTERS --> HARB["Handoff Arbitration\ncontinue / interrupt / clarify"]
  HARB --> CLARIFY["clarification_tool\nquestion or resolve"]
  CLARIFY --> SNAP["UserTurnSnapshot\ncurrent turn truth"]
  SNAP --> AGENDA["local reducer contract\nreply/effect/handoff/clarification/status tasks"]
  AGENDA --> CONF["Confirmation Contract\napprove/reject/revise/explain/status"]

  CONF --> OPPIPE["Operation Runtime Pipeline"]
  CONF --> CONVPIPE["Conversation Runtime Pipeline"]

  OPPIPE --> DIRECT["Chat-executable effects\none-shot + track progress"]
  DIRECT --> EXEC["Executor\nDB write or external action"]
  EXEC --> LEDGER["EffectLedger\nrequested/allowed/blocked/committed/failed"]

  OPPIPE --> HANDOFF["Platform Handoff Skills\ncomplex tools no-mutation"]
  HANDOFF --> SURFACE["Product Surface Registry\ncanonical destination"]
  SURFACE --> LEDGER

  CONVPIPE --> CSKILL["Conversation Skill Owner\ncontract/intake/reducer/renderer"]
  CSKILL --> LEDGER

  OPPIPE --> STATUS["status_recap\nDB-grounded read-only"]
  STATUS --> LEDGER

  LEDGER --> FINAL["Final Response Pipeline\nclaim guard + style"]
  FINAL --> TRACE["Trace + persistence"]
  TRACE --> OUT["Assistant reply"]
```

## Vérités Du Système

```mermaid
flowchart LR
  DB["Business DB\ncurrent durable state"] --> STATUS["status_recap\nstate answers"]
  DB --> TOOLS["Tool executors\ncommit durable changes"]

  LEDGER["EffectLedger\nexecution timeline"] --> FINAL["Final response guard"]
  LEDGER --> STATUS

  SNAP["UserTurnSnapshot\nstate of this turn"] --> AGENDA["local reducer contract\nrequested tasks"]
  AGENDA --> TOOLS
  AGENDA --> HANDOFFS["Platform handoffs\nnon-mutating"]
  AGENDA --> CONV["Conversation skills"]

  CONF["Confirmation Contract\nuser response to pending or handoff"] --> TOOLS
  CONF --> WEEKLY["weekly/daily decisions"]

  MEMORY["Memory\ncontext, not proof"] --> DISP["Dispatcher"]
  MEMORY --> CONV

  DB -. "truth of state" .-> FINAL
  LEDGER -. "truth of execution" .-> FINAL
  MEMORY -. "context only" .-> FINAL
```

Règles :

- DB métier = vérité d'état actuel.
- EffectLedger = vérité d'exécution observée.
- UserTurnSnapshot = vérité du tour courant.
- local reducer contract = vérité des tâches demandées par le tour.
- Confirmation Contract = vérité de ce que le user vient d'approuver, refuser,
  modifier, demander en preview/status ou rendre ambigu.
- Product Surface Registry = vérité des destinations de handoff.
- Platform handoff = résultat conversationnel non-mutant, jamais preuve d'état
  ni commit.
- Memory = contexte utile, jamais preuve d'existence.

## Ownership Par Instance

```mermaid
flowchart TB
  subgraph Global["Global Runtime"]
    RUN["run.ts\nIO + orchestration"]
    DISP["dispatcher\nTurnFrame"]
    ROUTE["routers/arbitrators\nowner selection"]
    SNAP["UserTurnSnapshot"]
    AGENDA["local reducer contract"]
    CONF["Confirmation Contract"]
    LEDGER["EffectLedger"]
    HARB["handoff_flow_arbitration"]
    SURF["product_surface_registry"]
  end

  subgraph Tools["Tool Skills"]
    ATTACK["prepare_attack_card"]
    DEFENSE["prepare_defense_card"]
    ONE["one_shot_reminder"]
    REC["create_recurring_reminder"]
    PLAN["adjust_plan_item"]
    POTION["select_state_potion"]
    PREF["update_coach_preferences"]
    PROG["track_progress_plan_item"]
  end

  subgraph Conversation["Conversation Skills"]
    EMO["emotional_repair"]
    DEMO["demotivation_repair"]
    HELP["product_help"]
    SAFETY["safety_crisis"]
    STATUS["status_recap"]
  end

  subgraph Proactive["Proactive Reviews"]
    DAILY["daily_action_review"]
    WEEKLY["weekly_review"]
  end

  RUN --> DISP --> ROUTE --> SNAP --> AGENDA --> CONF
  ROUTE --> HARB
  CONF --> Tools
  CONF --> Conversation
  CONF --> Proactive
  Tools --> SURF
  Tools --> LEDGER
  Proactive --> LEDGER
  Conversation --> LEDGER
```

Chaque bloc local est propriétaire de son contrat. Le runtime global ne doit
pas connaître les détails internes comme `draft_only`, `mode_tunnel`,
`target_binding`, `potion_type`, `weekly_patch`, ou les slots d'une carte.

## Cycle D'Un Tool Skill

```mermaid
stateDiagram-v2
  [*] --> Observe
  Observe --> Intake: message + snapshot + active state
  Intake --> Reduce: structured JSON
  Reduce --> Draft: missing confirmation or preview
  Reduce --> Blocked: no consent / no tool / stale flow / safety
  Draft --> AwaitConfirmation
  AwaitConfirmation --> Revise: user revises
  AwaitConfirmation --> Cancelled: user rejects
  AwaitConfirmation --> EffectPlan: user approves compatible pending
  EffectPlan --> Execute: allowed effects only
  Execute --> Committed: DB write success
  Execute --> Failed: writer failed
  Committed --> Render
  Failed --> Render
  Blocked --> Render
  Cancelled --> Render
  Render --> [*]
```

Règles :

- `Draft` ne peut pas écrire en DB.
- `AwaitConfirmation` n'exécute rien sans pending compatible.
- `EffectPlan` doit exposer allowed/blocked effects.
- `Execute` est le seul endroit où l'écriture durable est autorisée.
- `Render` parle à partir de `committed`, `failed` ou `blocked`.

Ce cycle reste valide pour les effets chat exécutables et les domaines durables
qui possèdent encore un executor. En V1 chat, seuls `create_one_shot_reminder`
et `track_progress_plan_item` restent mutatifs nominaux.

## Cycle D'Un Platform Handoff Skill

```mermaid
stateDiagram-v2
  [*] --> Observe
  Observe --> Intake: message + snapshot + active handoff state
  Intake --> Clarify: ambiguity
  Clarify --> Intake: user answers
  Intake --> Draft: handoff recommendation
  Draft --> Delivered: platform destination rendered
  Delivered --> Revise: user refines
  Delivered --> Repeat: user asks "redis-moi"
  Delivered --> ApplyAttempt: user says "ok vas-y"
  Delivered --> Cancelled: user cancels
  Delivered --> Interrupted: explicit other intent or safety
  Revise --> Draft
  Repeat --> Delivered
  ApplyAttempt --> Delivered
  Cancelled --> [*]
  Interrupted --> [*]
```

Règles :

- Aucun executor.
- Aucun writer DB.
- Aucun pending confirmation exécutable.
- `ApplyAttempt` refuse l'exécution chat et redonne la destination plateforme.
- `Delivered` est un succès conversationnel non-mutant.
- La destination vient du Product Surface Registry.

## Cycle D'Un Conversation Skill

```mermaid
flowchart TD
  IN["message + skill context"] --> SI["structured intake"]
  SI --> RED["reducer/policy"]
  RED --> HANDOFF["handoff request\noptional"]
  RED --> SUGGEST["operation suggestion\nconsent required"]
  RED --> REPLY["renderer/reply"]
  HANDOFF --> OUT["ConversationSkillOutput"]
  SUGGEST --> OUT
  REPLY --> OUT
```

Un conversation skill peut :

- stabiliser;
- expliquer;
- produire une phrase;
- suggérer un handoff avec consentement;
- demander clarification.

Il ne peut pas :

- écrire en DB;
- créer/annuler/modifier un objet;
- marquer un effet comme committé;
- dire qu'une opération est faite.

## Cycle Daily / Weekly

```mermaid
flowchart TD
  PROJ["Projection factuelle"] --> EVID["Evidence summary"]
  EVID --> RED["Reducer strategy"]
  RED --> Q["Question humaine\nsi preuve faible"]
  RED --> HANDOFF["Adjust plan handoff\nplatform destination"]
  Q --> STATE["State patch only"]
  HANDOFF --> LEDGER["platform_handoff\nno commit"]
  LEDGER --> RENDER["Renderer"]
```

Daily collecte des preuves légères. Weekly décide une stratégie hebdomadaire à
partir des preuves. Pour V1 chat, les ajustements de plan sortent en handoff
plateforme; weekly ne modifie pas le plan depuis le chat.

## Safety Priority

```mermaid
flowchart LR
  MSG["User turn"] --> SAFETY["Safety detection / active safety state"]
  SAFETY -->|active or detected| BLOCK["Block tools, product help, proactive flows"]
  BLOCK --> SAFE_SKILL["safety_crisis"]
  SAFE_SKILL --> SAFE_RENDER["Safety reply\nhuman support + emergency resources if needed"]
  SAFETY -->|not active| NORMAL["Normal routing"]
```

Safety est prioritaire sur tous les autres owners. Aucun tool, plan, potion,
rappel, product help, préférence coach ou handoff produit ne doit s'exécuter ou
être proposé pendant une crise.

## Où Lire Ensuite

- Doctrine : `00-architecture-doctrine.md`
- Runtime global : `01-global-runtime.md`
- `run.ts` mince : `02-run-thin-orchestrator.md`
- Snapshot de tour : `03-user-turn-snapshot.md`
- Confirmation : `04-confirmation-contract.md`
- EffectLedger : `05-effect-ledger.md`
- Active handoff arbitration : `07-active-handoff-arbitration.md`
- Product Surface Registry : `08-product-surface-registry.md`
- Contrats locaux : `tools/*`, `conversation-skills/*`, `proactive/*`

## Suivi Des Décisions Architecturales

| Date | Décision | Statut | Référence |
| --- | --- | --- | --- |
| 2026-05-30 | Ajouter une carte système détaillée des instances Sophia Brain dans `runtime-contracts`. | Active | J59 |
| 2026-05-30 | Séparer les vérités DB, EffectLedger, local reducer contract, Confirmation Contract et Memory. | Active | `00-architecture-doctrine.md` |
| 2026-06-01 | Ajouter la vue `platform_handoff_skill` : complex tools no-mutation, Product Surface Registry et active handoff arbitration. | Active | Architecture handoff V1 |
