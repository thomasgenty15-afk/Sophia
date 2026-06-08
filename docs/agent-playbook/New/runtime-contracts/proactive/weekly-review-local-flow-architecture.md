# weekly_adaptive_review Local Dispatcher Architecture

Document de cadrage pour migrer `weekly_adaptive_review_v1` vers une
architecture a dispatcher local, sans perdre son role actuel :

```txt
projection factuelle hebdo
-> reducer strategique weekly
-> conversation locale courte
-> optional platform_handoff Plan
-> no chat plan mutation
```

## Mental Model

`weekly_adaptive_review_v1` est un point de fin de semaine proactif. Il lit les
preuves daily et dashboard, produit une lecture strategique, clarifie si le
signal humain manque, puis recommande quoi faire pour la semaine suivante.

Le weekly n'est pas :

- un executor de plan ;
- un createur de patch applicable depuis le chat ;
- un status recap ;
- un product help ;
- un daily bis ;
- un coach conversationnel general.

Il peut recommander :

- garder la semaine ;
- avancer ;
- avancer avec prudence ;
- refaire la meme semaine ;
- creer une semaine plus legere ;
- ouvrir une revue du niveau ;
- preparer un handoff plateforme vers Plan.

Mais il ne doit jamais appliquer un ajustement durable de plan depuis le chat.

## Runtime Shape

Ouverture proactive :

```txt
process-checkins
  -> loadWeeklyProgressReview(...)
  -> buildWeeklyAdaptiveReview(...)
  -> generateWeeklyAdaptiveReviewOpening(...)
  -> send WhatsApp
  -> activateWeeklyAdaptiveReviewState(...)
       __active_skill_state.skill_id = weekly_adaptive_review_v1
       weekly_progress_review = projection
       weekly_adaptive_review = reducer decision
       validation_unlock = locked_until_weekly_complete
```

Reponse utilisateur :

```txt
weekly active state exists
  -> skip global dispatcher
  -> weekly_adaptive_review.local_dispatcher
  -> reducer/update weekly state
  -> visible prompt stage-specific
  -> optional platform_handoff.adjust_plan_item
  -> close / continue / exit_to_global_dispatcher
```

## What Stays

The following pieces stay conceptually valid :

- `weekly_progress_review.ts` remains the factual projection.
- `reduceWeeklyReview(...)` remains the strategic source of truth.
- `generateWeeklyAdaptiveReviewOpening(...)` can remain the opening generator,
  with its current guards.
- `weekly_adaptive_review` active state remains stored in temp memory.
- `adjust_plan_item` remains the owner of Plan handoff.
- `track_progress_plan_item` remains the owner of forgotten progress commits.
- EffectLedger/guards must still prevent false plan mutation claims.

## What Changes

The current followup path still depends on global routing, bridge guards,
confirmation helpers and deterministic renderer cleanup.

The target shape is :

```txt
weekly_adaptive_review.local_dispatcher
  -> JSON decision
  -> reducer/state update
  -> visible prompt stage-specific
  -> no deterministic visible renderer in nominal path
```

The renderer/guards may remain as fallback/final safety guards for:

- internal label cleanup ;
- no done language without commit ;
- no plan mutation claim.

But they should not own the main conversation wording.

## Multi-Plan / Multi-Transformation Support

The weekly can cover more than one plan, level or transformation in the same
week.

The weekly must reason from the factual projection, not from an assumption that
there is a single plan.

The current projection shape already supports this:

```txt
WeeklyProgressReviewV2
  -> transformations[]
  -> actions[]
```

When actions are flattened for strategy, every action must keep enough origin
context:

```json
{
  "transformation_id": "string|null",
  "plan_id": "string|null",
  "plan_title": "string|null",
  "plan_item_id": "string",
  "occurrence_id": "string",
  "title": "string",
  "family": "habit|mission|clarification|other"
}
```

Rules:

- A global weekly reading can summarize the whole week across plans.
- Item decisions must preserve original plan/level context.
- A Plan handoff must specify which plan/item it concerns.
- If user says "le deuxieme plan", "celui du sport", "l'autre plan" etc, local
  dispatcher must resolve scope or ask clarification.
- Never carry over/drop/lighten/repeat an item without preserving
  `plan_id`/`plan_title`/`plan_item_id`.
- If recommendation affects multiple plans, visible handoff groups changes by
  plan.
- If weekly recommendation is global but user asks to change only one plan,
  handoff scope becomes that plan only.

## Active Flow Rule

If active state exists :

```json
{
  "skill_id": "weekly_adaptive_review_v1",
  "status": "open"
}
```

then the weekly local dispatcher owns the next message.

The global dispatcher must not run.

Exception :

```txt
flow_action = exit_to_global_dispatcher
```

Then the same user message can be re-analysed by the global dispatcher with
`exit_memo`.

## State

Recommended active state shape, extending the current `__active_skill_state` :

```json
{
  "skill_id": "weekly_adaptive_review_v1",
  "status": "open|proposal_discussed|handoff_ready|completed|stopped|exit_to_global|safety",
  "weekly_progress_review": {},
  "weekly_adaptive_review": {},
  "weekly_flow_state": {
    "stage": "opening|collecting_human_signal|strategy_ready|plan_handoff|closing",
    "proposal_status": "none|discussed_not_applied|handoff_delivered|apply_attempt|cancelled",
    "validation_unlock_status": "locked_until_weekly_complete|available",
    "human_signals": {
      "objective_delta": "clear_progress|slight_progress|stable|regression|unclear|unknown",
      "felt_state": "energized|stable|tired_but_ok|frustrated|overloaded|lost|unknown"
    },
    "last_user_signal": "string|null",
    "last_visible_summary": "string|null",
    "last_handoff_summary": "string|null",
    "turn_count": 0,
    "max_turns": 6,
    "updated_at": "iso"
  },
  "validation_unlock": {
    "status": "locked_until_weekly_complete|available",
    "meaning": "string"
  }
}
```

Weekly can last longer than daily/status, but should still be bounded.
Default `max_turns=6`.

## Dispatcher Responsibilities

The local dispatcher decides what the user response does to the active weekly :

- answers the weekly question ;
- confirms or rejects the weekly reading ;
- gives missing human signal ;
- asks for a recap/explanation ;
- asks to prepare a Plan handoff ;
- revises a Plan handoff ;
- attempts to apply from chat ;
- reports forgotten progress ;
- stops weekly ;
- exits to global for a different task.

It does not recompute the factual projection.

It does not apply plan changes.

## Reducer Responsibilities

The reducer :

- validates dispatcher JSON ;
- updates human signals ;
- calls/reuses `reduceWeeklyReview(...)` when signals change ;
- keeps completed items from being carried over ;
- keeps habits as counted, not re-created tasks ;
- prepares handoff data for `adjust_plan_item` when needed ;
- blocks direct plan mutation ;
- emits platform_handoff only when handoff is ready ;
- unlocks next-week validation only when weekly is completed ;
- requires `exit_memo` for global exit.

## Platform Handoff Policy

Weekly may produce :

```txt
platform_handoff.adjust_plan_item
surface_id = plan
no_chat_mutation = true
executedTools = []
committed_effects = []
```

Weekly must not produce :

- `executedTools=["adjust_plan_item"]`;
- committed plan effects ;
- pending confirmation executable ;
- confirmation token ;
- "c'est applique" ;
- "j'ai modifie le plan" ;
- "j'ai reporte l'action".

`ok vas-y`, `applique`, `valide` during a Plan handoff is `apply_attempt`,
not execution.

## Forgotten Progress Exception

If the user says during weekly :

```txt
en fait j'avais fait cette action, j'ai oublie de le cocher
```

the weekly can route to the existing forgotten-progress path / 
`track_progress_plan_item`.

This is not a plan adjustment. It is a progress correction.

Success wording is allowed only if that dedicated effect commits.

If target is ambiguous, ask clarification or exit with memo.

## Opening Message

The current IA opening can stay.

Opening constraints remain :

- mention clearly this is the weekly point / end-of-week review ;
- one question max ;
- no ratios, percentages, internal labels ;
- no plan mutation claim ;
- no validation unlock claim ;
- no action-by-action audit ;
- no tool/card/potion suggestion.

The local dispatcher starts on the next user reply.

## Exit Memo Contract

`exit_memo` is mandatory when `flow_action=exit_to_global_dispatcher`.

```json
{
  "needed": true,
  "reason": "topic_change|explicit_tool_request|product_help|status_question|preference_update|normal_coaching|safety|unknown",
  "user_intent_summary": "string",
  "local_flow_context": {
    "skill_id": "weekly_adaptive_review_v1",
    "weekly_stage": "opening|collecting_human_signal|strategy_ready|plan_handoff|closing",
    "week_strategy": "advance|advance_with_caution|advance_with_watch|repeat_week|bridge_week|level_review|hold|null",
    "last_weekly_question": "string|null",
    "last_visible_summary": "string|null",
    "last_handoff_summary": "string|null",
    "validation_unlock_status": "locked_until_weekly_complete|available",
    "committed_effects": []
  },
  "handoff_hint_for_global_dispatcher": {
    "likely_intent": "prepare_attack_card|prepare_defense_card|select_state_potion|update_coach_preferences|status_recap|adjust_plan_item|product_help|normal_coaching|unknown",
    "why": "string",
    "constraints": [
      "Weekly did not apply a plan change from chat.",
      "If the user asks to adjust the plan, route to adjust_plan_item as platform_handoff, not execution."
    ]
  }
}
```

## Logs And Trace

Trace fields expected :

- `weekly_adaptive_review.local_dispatcher_called`;
- `flow_action`;
- `weekly_stage`;
- `human_signals`;
- `week_strategy.decision`;
- `visible_task.kind`;
- `platform_handoff_emitted`;
- `apply_attempt`;
- `validation_unlock_status`;
- `global_dispatcher_skipped_due_weekly`;
- `exit_to_global_dispatcher`;
- `exit_memo.reason`;
- `global_dispatcher_second_pass_after_weekly_exit`.

## Tests To Add

Architecture tests :

- active weekly skips global dispatcher ;
- weekly opening remains one question max ;
- answer weekly question updates human signals ;
- low evidence asks clarification before strategy ;
- completed mission is never carried over ;
- done habit is counted, not recreated ;
- weekly Plan adjustment is platform_handoff only ;
- `ok applique` is apply_attempt, no mutation ;
- handoff repeat is short ;
- handoff revision updates handoff content ;
- forgotten progress correction commits only via dedicated progress tool ;
- forgotten progress no commit has no success wording ;
- explicit potion/card/preference/status request exits with `exit_memo` ;
- next-week validation unlocks only after weekly completion ;
- no internal labels visible.

## Implementation Notes

Do not add weekly parsing to `router/run.ts`.

Do not add regex business routing. Existing regex guards should be retired as
the local dispatcher becomes reliable.

No Supabase destructive commands.
