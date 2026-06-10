# `demotivation_repair` Runtime Contract

## Purpose

`demotivation_repair` owns short local conversations where the user expresses
fatigue, loss of meaning, failure accumulation, avoidance, overwhelm, or asks
for a smaller next step.

The flow must not turn demotivation into execution too early. It first
stabilizes what broke the user's momentum, then can offer a structured handoff
only when the need is clear and the user consents.

The flow never commits durable effects. It does not create reminders, mutate
plans, activate potions, or prepare cards directly.

## Runtime Shape

Initial activation:

```txt
global dispatcher selects demotivation_repair with note_information
-> demotivation_repair.local_dispatcher
-> reducer
-> visible_task.conversation_context
-> stage-specific visible prompt
-> active demotivation_repair state
```

Active follow-up:

```txt
active demotivation_repair state exists
-> skip normal global dispatcher
-> demotivation_repair.local_dispatcher
-> reducer
-> visible_task.conversation_context
-> stage-specific visible prompt
```

The local dispatcher is the only brain while this flow is active. The visible
agent does not decide, route, read raw DB, read raw memory, or fill fields. It
writes only from `visible_task.conversation_context`.

## File Ownership

- `supabase/functions/sophia-brain/skills/demotivation_repair/contract.ts`:
  local JSON contract, enums, visible task context, note information typing.
- `supabase/functions/sophia-brain/skills/demotivation_repair/context_pack.ts`:
  compact DB pack and optional micro-memory pack.
- `supabase/functions/sophia-brain/skills/demotivation_repair/local_flow.ts`:
  local dispatcher call, JSON normalization, reducer, transition notes.
- `supabase/functions/sophia-brain/skills/demotivation_repair/visible_agent.ts`:
  stage-specific visible prompts using only `conversation_context`.
- `supabase/functions/sophia-brain/skills/demotivation_repair/skill.ts`:
  runtime facade, traces, local ownership, active state persistence.
- `supabase/functions/sophia-brain/skills/demotivation_repair/context_loader.ts`:
  standard context loading entrypoint.

No other demotivation-specific runtime file owns routing, visible wording, or
business classification.

## Local Actions

The local dispatcher may emit:

- `answer_repair`
- `ask_gentle_clarification`
- `reduce_friction`
- `restore_meaning`
- `stabilize_energy`
- `smaller_step`
- `action_card_candidate`
- `potion_bridge_offer`
- `confirm_potion_bridge`
- `revise_repair_context`
- `repeat_last_repair`
- `get_info_product`
- `get_info_db`
- `apply_attempt`
- `stop_local_no_handoff`
- `cancel_flow`
- `complete_flow`
- `defer_flow`
- `handoff_to_local_flow`
- `exit_to_global_dispatcher`
- `safety_preempt`

`risk_score` is kept as a numeric risk signal. It must not become keyword
routing.

## Transitions

`stop_local_no_handoff` closes or pauses locally. It produces a local visible
answer and does not call the global dispatcher on the same turn.

`exit_to_global_dispatcher` is only for a clear topic change. It must include
`note_information` for the global dispatcher.

`safety_preempt` transfers to the safety local dispatcher with
`note_information`. The normal global dispatcher does not run.

`handoff_to_local_flow` transfers to another local dispatcher with
`note_information`. For potion handoff, the target dispatcher is
`select_state_potion`.

`get_info_product` transfers context to `product_help` and preserves the parent
flow.

`get_info_db` transfers context to `status_recap` and preserves the parent
flow.

## Potion Bridge

The only bridgeable potion ids are:

- `clarte`
- `courage`
- `rappel`

The visible label for `rappel` is always `Potion anti-décrochage`.

The bridge requires:

- diagnosed motivation source;
- durable need clear enough for the selected potion;
- explicit user consent;
- no `no_potion` or `no_tool` blocking constraint;
- `note_information` for `select_state_potion`;
- `potion_bridge_context` with candidate fields, not forced facts.

Target candidates:

- `clarte`: `plan_meaning_loss_reason`
- `courage`: `avoidance_target`, `blocker_kind`
- `rappel`: `drift_target`, `drift_style`

High-confidence candidates may be locked by the target subskill if
platform-usable. Medium candidates should be proposed. Low or missing values
should lead to one clarification.

## Context Injection

`db_context_pack` may contain compact plan/action/card/reminder/product status
needed to reason about the user's demotivation. It must stay small and
source-labelled.

`micro_memory_context` is optional and capped at 0 to 3 items. It is useful only
when it links the demotivation to an active action, a recent block, or plan
pressure. It must not turn a possible cause into a locked fact.

Raw memory is never passed to the visible agent. The reducer filters it into
`visible_task.conversation_context.memory_context_summary` only when useful.

## Visible Prompts

The visible agent has stage-specific prompts for:

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

Every prompt receives only:

```json
{
  "task": "demotivation_repair_visible_reply",
  "stage": "stage_name",
  "conversation_context": {}
}
```

## Invariants

- Normal global dispatcher is skipped while the flow is active.
- No business regex or keyword routing in the demotivation path.
- No deterministic visible wording path.
- No single generalist visible agent for every stage.
- Every `flow_action` has an exact continuation.
- `stop_local_no_handoff` does not call global.
- `exit_to_global_dispatcher` includes `note_information`.
- `safety_preempt` routes to the safety local dispatcher.
- `handoff_to_local_flow` includes source, target, collected state, unresolved
  questions, confidence, evidence, and recommended next focus.
- The visible agent uses only `conversation_context`.
- `micro_memory_context` is minimal and is not leaked raw to the visible prompt.
- No durable effect is committed by this skill.
- The response never says an action was already applied.

## Verification

Recommended local checks:

```bash
deno check supabase/functions/sophia-brain/skills/demotivation_repair/contract.ts supabase/functions/sophia-brain/skills/demotivation_repair/context_pack.ts supabase/functions/sophia-brain/skills/demotivation_repair/local_flow.ts supabase/functions/sophia-brain/skills/demotivation_repair/visible_agent.ts supabase/functions/sophia-brain/skills/demotivation_repair/skill.ts
deno test --allow-read supabase/functions/sophia-brain/skills/demotivation_repair/local_flow_test.ts
deno test --allow-read supabase/functions/sophia-brain/skills/conversation_skills_contract_test.ts
```
