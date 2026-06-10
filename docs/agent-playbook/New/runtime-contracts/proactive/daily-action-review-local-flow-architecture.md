# daily_action_review Local Dispatcher Architecture

Document de cadrage pour migrer `daily_action_review_v1` vers une architecture
a dispatcher local, sans perdre son role actuel :

```txt
collecter une preuve quotidienne fiable
-> ecrire seulement si les slots sont complets
-> ne dire "noté/enregistré" qu'apres commit DB prouve
```

Ce document ne modifie pas le principe du daily. Il stabilise la nouvelle forme
conversationnelle.

## Mental Model

`daily_action_review_v1` n'est pas un coach complet. C'est un collecteur de
preuve leger pour les actions planifiees du jour.

Il doit repondre a cette question :

```txt
Qu'est-ce qui s'est passe aujourd'hui sur les actions ciblees, avec assez de
preuve pour ecrire une entree daily fiable ?
```

Il ne doit pas :

- proposer une carte ;
- proposer une potion ;
- ajuster le plan ;
- creer un rappel ;
- faire du coaching motivationnel long ;
- transformer une collecte de preuve en conversation libre.

Mais contrairement aux potions/cartes/status recap, le daily a un effet durable
legitime :

```txt
log_daily_action_review -> user_plan_item_entries
```

Cet effet est autorise uniquement apres :

```txt
local_dispatcher JSON
-> reducer merge state
-> buildDailyReviewEffectPlan(...)
-> executeDailyReviewEffectPlan(...)
-> committed_effects verifies
```

## Runtime Shape

Ouverture :

```txt
process-checkins
  -> decideDailyBilan / policy
  -> selectInitialDailyActionReviewFocus
  -> buildDailyActionReviewOpeningPlan
  -> IA produit l'ouverture daily existante
  -> persist whatsapp_pending_actions
       chat_capability = daily_action_review
       targets = [...]
       review_state = initial state
       action_intelligence_by_occurrence_id = {...}
```

Reponse utilisateur :

```txt
whatsapp inbound
  -> pending daily_action_review actif
  -> skip global dispatcher
  -> daily_action_review.local_dispatcher
  -> reduceDailyReviewState
  -> buildDailyReviewEffectPlan
  -> if missing slots:
       visible prompt clarification
       update pending review_state
     if effect_plan allowed:
       executeDailyReviewEffectPlan
       if committed:
         visible prompt commit_success
         mark pending done
       if failed:
         visible prompt commit_failed
         keep pending active
     if exit_to_global_dispatcher:
       exit_memo
       second-pass global dispatcher
```

## What Stays

The following pieces stay conceptually valid :

- `selectInitialDailyActionReviewFocus` chooses targets.
- The opening IA can stay, with the current guards.
- `review_state` stays the local state source.
- `reduceDailyReviewState` keeps merging item updates.
- `buildDailyReviewEffectPlan` remains the effect gate.
- `executeDailyReviewEffectPlan` remains the writer/ledger boundary.
- The `commit_success` visible prompt is called only after
  `dailyReviewEffectsFullyCommitted`; no deterministic visible renderer is part
  of the nominal path.

## What Changes

The current nominal chain :

```txt
parseDailyReviewAnswer
  -> generated_user_message
  -> deterministic clarification/final renderer
```

should become :

```txt
daily_action_review.local_dispatcher
  -> item_updates JSON
  -> reducer/effect gate
  -> visible prompt stage-specific
  -> post-visible commit guard
```

`generated_user_message` should not be the nominal visible output.

The deterministic renderer can remain only as fallback/compatibility if the
runtime needs it, but not as the main visible path.

## Multi-Plan / Multi-Target Support

The daily can cover one or two targets by design. Those targets may come from
different plans.

The local dispatcher does not choose the targets freely. It receives the target
list prepared by the selector.

Target shape recommended :

```json
{
  "occurrence_id": "string",
  "plan_id": "string",
  "plan_title": "string|null",
  "plan_item_id": "string",
  "item_title": "string",
  "dimension": "habit|mission|clarification|unknown",
  "planned_for": "YYYY-MM-DD",
  "cycle_id": "string|null",
  "transformation_id": "string|null"
}
```

If two targets are present and the user says only :

```txt
je l'ai fait
```

the dispatcher must not guess. It should return `clarify_which_action`.

If the user says :

```txt
j'ai fait les deux
```

the dispatcher can update both targets.

## Opening Message

The opening phrase produced by IA can remain the same architectural surface.

It opens the flow by persisting :

- `chat_capability: "daily_action_review"`;
- `targets`;
- `review_state`;
- `action_intelligence_by_occurrence_id`;
- `local_date`;
- pending metadata.

The local dispatcher starts on the next user message.

Opening constraints remain :

- one main question max ;
- exact targets only ;
- no target outside focus ;
- no card/potion/tool suggestion ;
- no plan adjustment ;
- no guilt ;
- no claim that something is already done.

## Active Flow Rule

If a pending daily exists with :

```txt
chat_capability = daily_action_review
```

then the daily local dispatcher owns the next message.

The global dispatcher must not run.

Exception :

```txt
flow_action = exit_to_global_dispatcher
```

Then the same user message can be re-analysed by the global dispatcher with
`exit_memo`.

## Exit Memo Contract

`exit_memo` is mandatory when `flow_action=exit_to_global_dispatcher`.

```json
{
  "needed": true,
  "reason": "topic_change|explicit_tool_request|product_help|status_question|preference_update|normal_coaching|safety|unknown",
  "user_intent_summary": "string",
  "local_flow_context": {
    "skill_id": "daily_action_review_v1",
    "targets": [
      {
        "occurrence_id": "string",
        "plan_title": "string|null",
        "item_title": "string"
      }
    ],
    "current_daily_state": "string",
    "collected_updates_summary": "string|null",
    "missing_slots": [],
    "committed_effects": []
  },
  "handoff_hint_for_global_dispatcher": {
    "likely_intent": "prepare_attack_card|prepare_defense_card|select_state_potion|update_coach_preferences|status_recap|product_help|normal_coaching|unknown",
    "why": "string",
    "constraints": [
      "Do not mark daily as completed unless daily_action_review later commits an entry.",
      "Daily has not mutated anything unless committed_effects is non-empty."
    ]
  }
}
```

Examples :

User says :

```txt
prepare-moi une carte d'attaque pour m'y mettre
```

Expected :

```txt
exit_to_global_dispatcher
likely_intent = prepare_attack_card
```

User says :

```txt
en fait je veux une potion de clarte
```

Expected :

```txt
exit_to_global_dispatcher
likely_intent = select_state_potion
```

User says :

```txt
resume-moi ce qui est en place
```

Expected :

```txt
exit_to_global_dispatcher
likely_intent = status_recap
```

## Mutation Policy

The dispatcher never writes.

The reducer never writes.

Only the executor writes, and only when :

- all targets have usable updates ;
- outcome is `completed|partial|missed`;
- required missing slots are empty ;
- confidence is medium/high ;
- evidence_text is present ;
- `buildDailyReviewEffectPlan(...).allowed === true`.

Visible success wording is allowed only after :

```txt
dailyReviewEffectsFullyCommitted(...)
```

or idempotence verified with an existing entry id.

## Local Dispatcher Responsibilities

The dispatcher decides :

- what the user response does to the daily flow ;
- which target(s) the response refers to ;
- which item updates are present ;
- which slots are missing ;
- whether the message is still daily or should exit.

The dispatcher does not decide final commit.

## Reducer Responsibilities

The reducer :

- validates contract ;
- ignores updates for unknown occurrence ids ;
- merges item updates ;
- recalculates missing slots ;
- builds effect_plan ;
- marks ready to commit only through `effect_plan.allowed`;
- preserves state on clarification ;
- replaces old values on correction ;
- closes/stops safely if user stops.

## Visible Prompt Responsibilities

Visible prompts :

- write only the next user-facing message ;
- do not fill fields ;
- do not decide outcome ;
- do not write ;
- do not suggest tools ;
- do not produce success wording unless commit state says it is allowed.

## Logs And Trace

Trace fields expected :

- `daily_action_review.local_dispatcher_called`;
- `flow_action`;
- `target_occurrence_ids`;
- `missing_slots`;
- `visible_task.kind`;
- `effect_plan.allowed`;
- `write_attempted`;
- `committed_effects_count`;
- `failed_effects_count`;
- `global_dispatcher_skipped_due_daily_action_review`;
- `exit_to_global_dispatcher`;
- `exit_memo.reason`;
- `global_dispatcher_second_pass_after_daily_exit`.

## Tests To Add

Architecture tests :

- opening persists targets from two different plans ;
- pending daily skips global dispatcher ;
- "je l'ai fait" with two targets asks which action ;
- "j'ai fait les deux" updates both targets ;
- partial answer asks completion level/reason if missing ;
- missed asks reason and still_relevant if missing ;
- correction replaces previous structured update ;
- stop does not commit ;
- explicit tool request exits with `exit_memo`;
- global dispatcher runs only after local exit ;
- no visible "noté/enregistré" without commit ;
- commit success only after `committed_effects`;
- commit failure keeps pending active and does not mark done.

## Implementation Notes

Do not put the daily into `sophia-brain/router/run.ts`.

The daily currently lives in pending WhatsApp infrastructure. The migration can
start there, then later move to `sophia-brain/skills/*` if the project decides
to standardize proactive flows.

No Supabase destructive commands.
