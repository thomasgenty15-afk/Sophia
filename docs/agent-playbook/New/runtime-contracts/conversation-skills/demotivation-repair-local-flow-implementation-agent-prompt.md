# Implementation Agent Prompt - demotivation_repair Local Flow

Mission: maintain `demotivation_repair` as a doctrine-compliant local flow.

Mandatory reference:

`/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/11-local-dispatcher-doctrine.md`

## Current Runtime Files

- `supabase/functions/sophia-brain/skills/demotivation_repair/contract.ts`
- `supabase/functions/sophia-brain/skills/demotivation_repair/context_pack.ts`
- `supabase/functions/sophia-brain/skills/demotivation_repair/local_flow.ts`
- `supabase/functions/sophia-brain/skills/demotivation_repair/visible_agent.ts`
- `supabase/functions/sophia-brain/skills/demotivation_repair/skill.ts`
- `supabase/functions/sophia-brain/skills/demotivation_repair/context_loader.ts`
- `supabase/functions/sophia-brain/skills/demotivation_repair/local_flow_test.ts`

## Required Runtime Order

```txt
message user
-> demotivation_repair.local_dispatcher
-> reducer
-> visible_task.conversation_context
-> stage-specific visible prompt
-> visible message
```

When the flow is active, the normal global dispatcher must not run.

## Non-Negotiables

- The local dispatcher is the active-flow brain.
- The local dispatcher returns structured output only.
- The visible agent writes only from `visible_task.conversation_context`.
- Every dispatcher change includes `note_information`.
- `exit_to_global_dispatcher` does not call global.
- `exit_to_global_dispatcher` is only for clear topic change.
- `safety_preempt` goes to the safety local dispatcher.
- `handoff_to_local_flow` explains origin, collected state, unresolved
  questions, evidence, confidence, and next focus.
- No business regex.
- No keyword routing.
- No deterministic visible wording path.
- No fixed visible template.
- No hidden second decision-maker.
- No durable DB write.
- No executable confirmation.
- No potion activation from chat.

## Expected Context

Inject `db_context_pack` only when it helps the dispatcher reason about an
active action, plan pressure, cards, reminders, product surfaces, or exclusions.

Inject `micro_memory_context` only when it is tightly linked to the current
demotivation. Cap it at three items. It must help generate candidates, not lock
causes as facts.

Never pass raw memory or raw DB context to the visible agent.

## Required Stage Prompts

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

Each prompt receives only `{ task, stage, conversation_context }`.

## QA Required Before Delivery

Run at minimum:

```bash
deno check supabase/functions/sophia-brain/skills/demotivation_repair/contract.ts supabase/functions/sophia-brain/skills/demotivation_repair/context_pack.ts supabase/functions/sophia-brain/skills/demotivation_repair/local_flow.ts supabase/functions/sophia-brain/skills/demotivation_repair/visible_agent.ts supabase/functions/sophia-brain/skills/demotivation_repair/skill.ts
deno test --allow-read supabase/functions/sophia-brain/skills/demotivation_repair/local_flow_test.ts
deno test --allow-read supabase/functions/sophia-brain/skills/conversation_skills_contract_test.ts
```

Also scan the demotivation runtime path for:

- business regex;
- keyword routing;
- deterministic visible wording;
- removed file references;
- raw memory leakage to visible prompts.
