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

Le daily est binaire cote conversation : pour chaque target du pending, Sophia
doit obtenir soit `fait`, soit `pas fait`. Si le user a fait meme une partie
concrete de l'action, le daily la classe comme faite (`completed`). Le wording
visible ne doit pas proposer ou reprendre une categorie intermediaire.

Il ne doit pas :

- proposer une carte ;
- proposer une potion ;
- ajuster le plan ;
- creer un rappel ;
- faire du coaching motivationnel long ;
- transformer une collecte de preuve en conversation libre.

Il peut en revanche expliquer une action ciblee si le user demande ce qu'elle
veut dire. Cette explication reste locale au daily, ne mute pas l'etat metier,
et doit revenir a la question binaire : action faite ou pas faite aujourd'hui.

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
     if explain_target:
       visible prompt explain_target
       keep pending review_state open without item update
     if effect_plan allowed:
       executeDailyReviewEffectPlan
       if committed:
         visible prompt commit_success
         mark pending done
       if failed:
         persist commit incident
         mark pending failed
         no daily visible response
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

If the current visible focus is complete but `remaining_occurrence_ids` is not
empty, the dispatcher must ask the next remaining target before the daily can
close. It must not return a success stage for the whole daily.

## Local Action Explanation

If the user asks what a selected target means, why it is in the daily, or what
Sophia expects for that action, the local dispatcher returns :

```txt
flow_action = explain_target
visible_task.kind = explain_target
```

This does not create an item update and does not exit to product help. The
visible agent may use only filtered target fields, current daily state, and
filtered `action_intelligence_by_occurrence_id`. It must not say the action is
done or not done. It should end by resuming the daily collection with one
question.

## Coaching Recommendation Bridge

Daily exits to `coaching_recommendation` only when the user is no longer merely
answering the check and expresses a concrete need for a Sophia lever or action
support. Accepted bridge situations are :

- `action_blocker`: the user is stuck or cannot start ;
- `recurrent_forgetting`: the user reports repeated forgetting ;
- `action_too_hard`: the action feels too hard or too costly ;
- `low_relevance`: the action no longer seems relevant ;
- `emotional_friction`: emotion blocks the action without safety preemption ;
- `needs_lever_choice`: the user asks what Sophia lever/tool to use ;
- `dropoff_risk`: the user sounds close to disengaging.

The bridge note is normalized into the parent coaching bridge contract. It must
carry `return_target=daily_action_review_v1`, `recommendation_only`,
`no_mutation`, and enough action context for coaching to recommend without
marking the daily as done.

Anti-false-positive rule : if the user still gives a usable daily answer, daily
stays local and collects the missing `fait` / `pas fait` outcome instead of
bridging.

## Affect Context For Visible Tone

Daily has two separate layers :

- safety risk, which preempts the flow with `safety_preempt` ;
- non-safety emotional fragility, which adjusts visible tone.

For non-safety fragility, the visible agent receives an `affect_context` :

```json
{
  "emotional_intensity": "none|low|medium|high",
  "fragile_signal": false,
  "suggested_tone": "neutral|gentle|supportive_investigate|calm",
  "evidence": []
}
```

This context can come from the current dispatcher output or from filtered
`action_intelligence_by_occurrence_id`. It is tone context only. It must not
invent safety and must not produce a durable mutation.

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

If daily commits successfully, the local flow closes the pending action and
does not trigger a same-turn global dispatcher pass. The runtime writes a
completion memo for future context instead of a handoff:

```json
{
  "completed_flow_memo": {
    "source_flow_id": "daily_action_review_v1",
    "status": "completed",
    "committed_effects": [],
    "completed_at": "iso_timestamp"
  }
}
```

This memo is trace/context, not an instruction to redispatch the same user
message.

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
    "likely_intent": "coaching_recommendation|product_help|normal_coaching|unknown",
    "why": "string"
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
target_dispatcher = coaching_recommendation
bridge_reason = needs_lever_choice
```

User says :

```txt
en fait je veux une potion de clarte
```

Expected :

```txt
exit_to_global_dispatcher
target_dispatcher = coaching_recommendation
bridge_reason = needs_lever_choice
```

User says :

```txt
resume-moi ce qui est en place
```

Expected :

```txt
exit_to_global_dispatcher
target_dispatcher = global
likely_intent = normal_coaching|unknown
```

## Mutation Policy

The dispatcher never writes.

The reducer never writes.

Only the executor writes, and only when :

- all targets have usable updates ;
- outcome is `completed|missed`;
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
- can explain a selected target with `explain_target` without mutation ;
- must respect `affect_context` and `tone_constraints` ;
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
- concrete progress on an action is recorded as `completed` ;
- unanswered remaining targets are asked before daily closure ;
- action explanation stays local and does not mutate state ;
- coaching bridge reason is explicit and maps into parent bridge contract ;
- non-safety emotional fragility is passed to visible tone context ;
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
