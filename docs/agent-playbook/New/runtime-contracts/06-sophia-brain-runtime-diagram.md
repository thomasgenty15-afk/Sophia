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
  ROUTERS --> SNAP["UserTurnSnapshot\ncurrent turn truth"]
  SNAP --> AGENDA["TurnAgenda\nreply/effect/status/memory/repair tasks"]
  AGENDA --> CONF["Confirmation Contract\napprove/reject/revise/explain/status"]

  CONF --> OPPIPE["Operation Runtime Pipeline"]
  CONF --> CONVPIPE["Conversation Runtime Pipeline"]

  OPPIPE --> TOOL["Tool Skill Owner\ncontract/intake/reducer/effects"]
  TOOL --> EXEC["Executor\nDB write or external action"]
  EXEC --> LEDGER["EffectLedger\nrequested/allowed/blocked/committed/failed"]

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

  SNAP["UserTurnSnapshot\nstate of this turn"] --> AGENDA["TurnAgenda\nrequested tasks"]
  AGENDA --> TOOLS
  AGENDA --> CONV["Conversation skills"]

  CONF["Confirmation Contract\nuser response to pending"] --> TOOLS
  CONF --> WEEKLY["weekly/daily confirmations"]

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
- TurnAgenda = vérité des tâches demandées par le tour.
- Confirmation Contract = vérité de ce que le user vient d'approuver, refuser,
  modifier, demander en preview/status ou rendre ambigu.
- Memory = contexte utile, jamais preuve d'existence.

## Ownership Par Instance

```mermaid
flowchart TB
  subgraph Global["Global Runtime"]
    RUN["run.ts\nIO + orchestration"]
    DISP["dispatcher\nTurnFrame"]
    ROUTE["routers/arbitrators\nowner selection"]
    SNAP["UserTurnSnapshot"]
    AGENDA["TurnAgenda"]
    CONF["Confirmation Contract"]
    LEDGER["EffectLedger"]
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
    EXECB["execution_breakdown"]
    HELP["product_help"]
    SAFETY["safety_crisis"]
    STATUS["status_recap"]
  end

  subgraph Proactive["Proactive Reviews"]
    DAILY["daily_action_review"]
    WEEKLY["weekly_review"]
  end

  RUN --> DISP --> ROUTE --> SNAP --> AGENDA --> CONF
  CONF --> Tools
  CONF --> Conversation
  CONF --> Proactive
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
- suggérer un tool avec consentement;
- demander un handoff.

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
  RED --> PATCH["Plan patch\nrequires confirmation"]
  Q --> STATE["State patch only"]
  PATCH --> PENDING["Pending confirmation"]
  PENDING --> CONF["Confirmation Contract"]
  CONF --> EFFECTS["Effect plan"]
  EFFECTS --> EXEC["Writer"]
  EXEC --> LEDGER["Committed/failed effects"]
  LEDGER --> RENDER["Renderer"]
```

Daily collecte des preuves légères. Weekly décide une stratégie hebdomadaire à
partir des preuves, mais ne modifie rien sans confirmation et writer success.

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
rappel, product help ou préférence coach ne doit s'exécuter pendant une crise.

## Où Lire Ensuite

- Doctrine : `00-architecture-doctrine.md`
- Runtime global : `01-global-runtime.md`
- `run.ts` mince : `02-run-thin-orchestrator.md`
- Snapshot/agenda : `03-user-turn-snapshot-agenda.md`
- Confirmation : `04-confirmation-contract.md`
- EffectLedger : `05-effect-ledger.md`
- Contrats locaux : `tools/*`, `conversation-skills/*`, `proactive/*`

## Suivi Des Décisions Architecturales

| Date | Décision | Statut | Référence |
| --- | --- | --- | --- |
| 2026-05-30 | Ajouter une carte système détaillée des instances Sophia Brain dans `runtime-contracts`. | Active | J59 |
| 2026-05-30 | Séparer les vérités DB, EffectLedger, TurnAgenda, Confirmation Contract et Memory. | Active | `00-architecture-doctrine.md` |
