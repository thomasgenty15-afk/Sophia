# demotivation_repair Local Flow Architecture

## Runtime Graph

```txt
message user
-> demotivation_repair.local_dispatcher
-> reduceDemotivationRepairLocalDispatcherOutput
-> visible_task.conversation_context
-> demotivation_repair.visible_agent stage prompt
-> visible message
```

When `demotivation_repair` is active, the normal global dispatcher is skipped.
The only exceptions are explicit local outputs:

- `exit_to_global_dispatcher`
- `safety_preempt`
- `handoff_to_local_flow`

Each exception carries `note_information`. The note is consumed by the target
dispatcher and is never sent directly to the visible prompt.

## Dispatcher Responsibilities

The local dispatcher decides:

- current repair stage;
- whether the answer is sufficient;
- confirmation or revision of a previous offer;
- repetition;
- product-help transfer;
- DB-status transfer;
- apply attempt acknowledgement;
- local stop without handoff;
- topic-change exit;
- safety transfer;
- local-flow handoff.

It returns structured JSON only. It never writes the user-visible answer.

## Reducer Responsibilities

The reducer:

- normalizes the dispatcher JSON;
- applies non-mutation invariants;
- preserves or clears active local state;
- creates `visible_task.conversation_context`;
- creates `note_information` for dispatcher changes;
- creates `potion_bridge_context` after consented potion handoff.

The reducer does not commit durable effects.

## Visible Agent Responsibilities

The visible agent writes one local answer from `conversation_context`. It does
not inspect raw state, raw memory, raw DB context, recent messages, or
dispatcher evidence.

Stage prompts exist for:

- `diagnose`
- `reduce_friction`
- `restore_meaning`
- `stabilize_energy`
- `smaller_step`
- `action_card_candidate`
- `potion_bridge_offer`
- `potion_bridge_choice`
- `potion_bridge_handoff`
- `ask_gentle_clarification`
- `inline_tool_return`
- `apply_attempt`
- `repeat_repair`
- `exit_or_cancel`
- `safety`

## Context Packs

`db_context_pack` is compact and product-oriented. It can include active plan
items, candidate actions, product surfaces, allowed potion targets, inbound
notes, and exclusions.

`micro_memory_context` is optional. For this flow it can help only when it links
the current demotivation to an active action, a recent block, or plan pressure.
It is capped at three items and excludes safety memory.

Only filtered summaries from those packs can reach `conversation_context`.

## Potion Bridge

`demotivation_repair` can bridge only to:

- `clarte`
- `courage`
- `rappel`

`rappel` is visible as `Potion anti-décrochage`.

The bridge sequence is:

```txt
diagnosed repair
-> potion_bridge_offer
-> user consent
-> confirm_potion_bridge or handoff_to_local_flow
-> note_information + potion_bridge_context
-> select_state_potion local dispatcher
```

Candidate fields:

- `clarte`: `plan_meaning_loss_reason`
- `courage`: `avoidance_target`, `blocker_kind`
- `rappel`: `drift_target`, `drift_style`

Candidate fields are not facts. The target subskill may lock, propose, or ask
depending on confidence and platform usability.

## Dispatcher Handoffs

`product_help`:
Used when the user asks how the product works while still inside
`demotivation_repair`. Parent flow context is preserved.

`status_recap`:
Used when the user asks for reliable DB state. Parent flow context is
preserved.

`select_state_potion`:
Used only after consented potion bridge.

`safety_crisis`:
Used when safety signals preempt the repair flow.

`global`:
Used only for a clear topic change.

## QA Invariants

- Active flow skips normal global routing.
- Local dispatcher returns JSON only.
- Visible agent receives only `conversation_context`.
- Every dispatcher change includes `note_information`.
- `stop_local_no_handoff` stays local.
- Safety does not pass through normal global routing.
- No product/DB status request is handled by keyword routing.
- No durable effect can be committed by this flow.
- Potion handoff carries `origin_flow=demotivation_repair`.
- The user is never asked to repeat an already collected demotivation episode
  unless the collected context is insufficient.
